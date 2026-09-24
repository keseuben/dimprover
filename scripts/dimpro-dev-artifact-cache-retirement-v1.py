#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
from datetime import datetime, timezone

CANONICAL_DEV_ROOT = pathlib.Path("/srv/dimpro-dev")
CANONICAL_WORKTREES_ROOT = CANONICAL_DEV_ROOT / "worktrees"
CANONICAL_ARTIFACTS_ROOT = CANONICAL_DEV_ROOT / "artifacts" / "benjadmin-developer-grid"
CANONICAL_COORDINATION_ROOT = CANONICAL_DEV_ROOT / "coordination"
CANONICAL_SKILL = CANONICAL_DEV_ROOT / "development-library" / "skills" / "dimpro-safe-delete" / "SKILL.md"
CANONICAL_DIRECTIVE = CANONICAL_COORDINATION_ROOT / "SAFE_DELETE_SKILL_REQUIRED.md"

CACHE_RELATIVE_PATHS = (
    "node_modules",
    "desktop/benjadmin-developer-grid/node_modules",
    "desktop/benjadmin-developer-grid/dist",
    "desktop/benjadmin-developer-grid/dist-dev",
)

def fail(message: str, code: int = 1) -> None:
    print("DENY · SAFE_DELETE_PREFLIGHT_FAILED · " + message, file=sys.stderr)
    raise SystemExit(code)

def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def read_json(path: pathlib.Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail("invalid JSON: " + str(path) + " · " + str(exc))

def run(args, cwd=None, check=True) -> str:
    p = subprocess.run(args, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and p.returncode != 0:
        fail("command failed: " + " ".join(map(str, args)) + " · " + p.stderr.strip())
    return p.stdout.strip()

def within(path: pathlib.Path, root: pathlib.Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except Exception:
        return False

def disk_state(path: pathlib.Path) -> dict:
    u = shutil.disk_usage(path)
    used = u.total - u.free
    return {
        "totalBytes": u.total,
        "usedBytes": used,
        "freeBytes": u.free,
        "usedPercent": round(used * 100 / u.total, 2) if u.total else 0,
    }

def dir_size(path: pathlib.Path) -> int:
    out = run(["du", "-sk", str(path)])
    return int(out.split()[0]) * 1024

def parse_required_hash(directive_text: str, label: str) -> str:
    lines = directive_text.splitlines()
    for idx, line in enumerate(lines):
        if line.strip() == label and idx + 1 < len(lines):
            value = lines[idx + 1].strip().lower()
            if len(value) == 64 and all(c in "0123456789abcdef" for c in value):
                return value
    fail("missing directive hash label: " + label)

def verify_safe_delete_guard(skill: pathlib.Path, directive: pathlib.Path, self_path: pathlib.Path, apply: bool) -> dict:
    if not skill.is_file():
        fail("missing Safe Delete skill: " + str(skill))
    if not directive.is_file():
        fail("missing Safe Delete directive: " + str(directive))
    directive_text = directive.read_text(encoding="utf-8")
    expected_skill = parse_required_hash(directive_text, "Required SHA-256:")
    actual_skill = sha256_file(skill)
    if expected_skill != actual_skill:
        fail("Safe Delete skill hash mismatch")

    expected_tool = ""
    label = "Artifact-cache retirement script SHA-256:"
    if label in directive_text:
        expected_tool = parse_required_hash(directive_text, label)
    actual_tool = sha256_file(self_path)
    if apply and expected_tool != actual_tool:
        fail("artifact-cache retirement tool is not approved by directive")
    return {
        "skillSha256": actual_skill,
        "toolSha256": actual_tool,
        "directiveApprovedToolSha256": expected_tool or None,
        "toolApproved": expected_tool == actual_tool,
    }

def git_head(worktree: pathlib.Path) -> str:
    return run(["git", "-C", str(worktree), "rev-parse", "HEAD"])

def git_clean(worktree: pathlib.Path) -> bool:
    return run(["git", "-C", str(worktree), "status", "--porcelain"]) == ""

def pm2_references() -> list[dict]:
    raw = run(["pm2", "jlist"])
    try:
        apps = json.loads(raw)
    except Exception:
        fail("cannot parse pm2 jlist")
    refs = []
    for app in apps:
        env = app.get("pm2_env") or {}
        nested = env.get("env") if isinstance(env.get("env"), dict) else {}
        values = [
            env.get("pm_cwd"),
            env.get("pm_exec_path"),
            env.get("DIMPRO_PROJECT_ROOT"),
            env.get("DIMPRO_DEVELOPER_GRID_SOURCE_WORKTREE"),
            nested.get("DIMPRO_PROJECT_ROOT"),
            nested.get("DIMPRO_DEVELOPER_GRID_SOURCE_WORKTREE"),
        ]
        refs.append({
            "name": app.get("name"),
            "status": env.get("status"),
            "values": [str(x) for x in values if x],
        })
    return refs

def active_session_worktrees(state_path: pathlib.Path) -> list[str]:
    if not state_path.is_file():
        fail("missing Central Core state: " + str(state_path))
    state = read_json(state_path)
    result = []
    for session in state.get("sessions", []):
        if session.get("endedAt"):
            continue
        sp = session.get("sourceProvenance") or {}
        wt = sp.get("worktree")
        if wt:
            result.append(str(wt))
    return result

def active_operation(coordination_root: pathlib.Path):
    p = coordination_root / "active-development.json"
    if not p.exists():
        return None
    return read_json(p)

def verify_apply_lock(coordination_root: pathlib.Path, self_path: pathlib.Path):
    state = active_operation(coordination_root)
    if not state:
        fail("apply requires coordinated maintenance lock")
    if state.get("operation") != "maintenance" or state.get("status") != "running":
        fail("apply requires running maintenance operation")
    command = str(state.get("command") or "")
    if self_path.name not in command:
        fail("maintenance lock does not belong to artifact-cache retirement tool")
    return state

def nginx_contains(value: str) -> bool:
    roots = [pathlib.Path("/etc/nginx/sites-enabled"), pathlib.Path("/etc/nginx/conf.d")]
    for root in roots:
        if not root.exists():
            continue
        for p in root.glob("*"):
            if not p.is_file():
                continue
            try:
                if value in p.read_text(encoding="utf-8", errors="ignore"):
                    return True
            except Exception:
                pass
    return False

def has_shared_hardlinks(path: pathlib.Path) -> bool:
    if not path.exists():
        return False
    p = subprocess.run(
        ["find", str(path), "-xdev", "-type", "f", "-links", "+1", "-print", "-quit"],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
    )
    return bool(p.stdout.strip())

def verify_artifact(manifest_path: pathlib.Path, expected_head: str, artifacts_root: pathlib.Path) -> dict:
    if not manifest_path.is_file():
        fail("missing artifact manifest: " + str(manifest_path))
    if not within(manifest_path, artifacts_root):
        fail("artifact manifest outside approved artifact root: " + str(manifest_path))
    sidecar = pathlib.Path(str(manifest_path) + ".sha256")
    if not sidecar.is_file():
        fail("missing manifest sidecar: " + str(sidecar))
    recorded_manifest_sha = sidecar.read_text(encoding="utf-8").split()[0].strip().lower()
    actual_manifest_sha = sha256_file(manifest_path)
    if recorded_manifest_sha != actual_manifest_sha:
        fail("manifest sidecar mismatch: " + str(manifest_path))

    m = read_json(manifest_path)
    required = {
        "product": "BENJADMIN Developer Grid",
        "gitCommit": expected_head,
        "environment": "DEV",
        "productionAccess": "DENY",
        "releaseMetadata": "VERIFIED",
        "standalone": "VERIFIED",
        "windowsArtifactProvenance": "VERIFIED",
        "packageSessionProvenance": "VERIFIED",
    }
    for key, expected in required.items():
        if m.get(key) != expected:
            fail("artifact manifest invariant mismatch: " + key + " · " + str(manifest_path))

    verified_files = {}
    for key in ("exe", "devZip"):
        meta = m.get(key) or {}
        name = meta.get("file")
        expected_sha = str(meta.get("sha256") or "").lower()
        expected_bytes = int(meta.get("bytes") or 0)
        if not name or len(expected_sha) != 64 or expected_bytes <= 0:
            fail("invalid artifact file metadata: " + key + " · " + str(manifest_path))
        artifact = manifest_path.parent / name
        if not artifact.is_file():
            fail("missing immutable artifact file: " + str(artifact))
        actual_bytes = artifact.stat().st_size
        actual_sha = sha256_file(artifact)
        if actual_bytes != expected_bytes or actual_sha != expected_sha:
            fail("immutable artifact hash/size mismatch: " + str(artifact))
        verified_files[key] = {
            "path": str(artifact),
            "sha256": actual_sha,
            "bytes": actual_bytes,
        }
    return {
        "manifest": str(manifest_path),
        "manifestSha256": actual_manifest_sha,
        "version": m.get("version"),
        "buildId": m.get("buildId"),
        "files": verified_files,
    }

def cache_paths(worktree: pathlib.Path) -> list[pathlib.Path]:
    result = []
    for p in sorted(worktree.glob(".next*")):
        if p.is_dir() and not p.is_symlink():
            result.append(p)
    for rel in CACHE_RELATIVE_PATHS:
        p = worktree / rel
        if p.exists():
            if p.is_symlink() or not p.is_dir():
                fail("cache target is not a normal directory: " + str(p))
            result.append(p)
    # de-duplicate exact paths
    seen = set()
    out = []
    for p in result:
        rp = str(p.resolve())
        if rp in seen:
            continue
        seen.add(rp)
        out.append(p)
    return out

def validate_entry(entry: dict, roots: dict, pm2: list[dict], active_wts: list[str], apply: bool) -> dict:
    wt = pathlib.Path(entry.get("worktree") or "").resolve()
    expected = str(entry.get("expectedHead") or "").lower()
    manifest = pathlib.Path(entry.get("manifest") or "").resolve()
    reasons = []

    if not within(wt, roots["worktrees"]):
        reasons.append("worktree-outside-approved-root")
    if not wt.is_dir():
        reasons.append("worktree-missing")
    if len(expected) != 40 or any(c not in "0123456789abcdef" for c in expected):
        reasons.append("invalid-expected-head")

    head = ""
    clean = False
    if not reasons:
        head = git_head(wt)
        clean = git_clean(wt)
        if head != expected:
            reasons.append("head-mismatch")
        if not clean:
            reasons.append("dirty-worktree")

    pm2_hits = []
    for proc in pm2:
        for value in proc["values"]:
            vp = pathlib.Path(value)
            try:
                if within(vp, wt) or within(wt, vp):
                    pm2_hits.append(proc["name"])
                    break
            except Exception:
                pass
    if pm2_hits:
        reasons.append("pm2-reference")

    if str(wt) in [str(pathlib.Path(x).resolve()) for x in active_wts]:
        reasons.append("active-central-core-session")

    if nginx_contains(str(wt)):
        reasons.append("nginx-reference")

    artifact = None
    if not reasons:
        try:
            artifact = verify_artifact(manifest, expected, roots["artifacts"])
        except SystemExit:
            raise

    caches = []
    if not reasons:
        for p in cache_paths(wt):
            if not within(p, wt):
                reasons.append("cache-outside-worktree")
                continue
            rel = p.relative_to(wt).as_posix()
            allowed = (
                rel.startswith(".next")
                or rel in CACHE_RELATIVE_PATHS
            )
            if not allowed:
                reasons.append("cache-path-not-whitelisted:" + rel)
                continue
            shared = False
            if rel.endswith("node_modules") or rel == "node_modules":
                shared = has_shared_hardlinks(p)
                if shared:
                    reasons.append("shared-hardlinks:" + rel)
            caches.append({
                "path": str(p),
                "relativePath": rel,
                "bytes": dir_size(p),
                "sharedHardlinks": shared,
            })

    return {
        "id": entry.get("id"),
        "worktree": str(wt),
        "expectedHead": expected,
        "actualHead": head or None,
        "clean": clean,
        "manifest": str(manifest),
        "artifact": artifact,
        "pm2References": sorted(set(pm2_hits)),
        "activeCentralCoreSession": str(wt) in [str(pathlib.Path(x).resolve()) for x in active_wts],
        "caches": caches,
        "candidateBytes": sum(x["bytes"] for x in caches),
        "eligible": len(reasons) == 0,
        "reasons": reasons,
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    parser.add_argument("--report-file", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--dev-root", default=str(CANONICAL_DEV_ROOT))
    parser.add_argument("--worktrees-root", default=str(CANONICAL_WORKTREES_ROOT))
    parser.add_argument("--artifacts-root", default=str(CANONICAL_ARTIFACTS_ROOT))
    parser.add_argument("--coordination-root", default=str(CANONICAL_COORDINATION_ROOT))
    parser.add_argument("--skill", default=str(CANONICAL_SKILL))
    parser.add_argument("--directive", default=str(CANONICAL_DIRECTIVE))
    args = parser.parse_args()

    self_path = pathlib.Path(__file__).resolve()
    roots = {
        "dev": pathlib.Path(args.dev_root).resolve(),
        "worktrees": pathlib.Path(args.worktrees_root).resolve(),
        "artifacts": pathlib.Path(args.artifacts_root).resolve(),
        "coordination": pathlib.Path(args.coordination_root).resolve(),
    }

    if args.apply and roots["dev"] != CANONICAL_DEV_ROOT:
        fail("apply allowed only on canonical DEV root")

    guard = verify_safe_delete_guard(
        pathlib.Path(args.skill).resolve(),
        pathlib.Path(args.directive).resolve(),
        self_path,
        args.apply,
    )

    maintenance = verify_apply_lock(roots["coordination"], self_path) if args.apply else active_operation(roots["coordination"])

    plan_path = pathlib.Path(args.plan).resolve()
    plan = read_json(plan_path)
    if plan.get("schemaVersion") != 1:
        fail("unsupported retirement plan schema")
    if plan.get("environment") != "DEV" or plan.get("productionAccess") != "DENY":
        fail("retirement plan environment invariant failed")
    entries = plan.get("entries")
    if not isinstance(entries, list) or not entries:
        fail("empty retirement plan")

    before = disk_state(roots["dev"])
    pm2 = pm2_references()
    active_wts = active_session_worktrees(roots["coordination"] / "developer-grid" / "state.json")

    validated = [validate_entry(x, roots, pm2, active_wts, args.apply) for x in entries]
    all_eligible = all(x["eligible"] for x in validated)
    total_candidate_bytes = sum(x["candidateBytes"] for x in validated)

    if args.apply and not all_eligible:
        fail("one or more plan entries are not eligible")

    deleted = []
    reclaimed = 0
    if args.apply:
        for item in validated:
            for cache in item["caches"]:
                p = pathlib.Path(cache["path"]).resolve()
                if not within(p, pathlib.Path(item["worktree"]).resolve()):
                    fail("apply target escaped worktree: " + str(p))
                if p.exists():
                    size = cache["bytes"]
                    shutil.rmtree(p)
                    if p.exists():
                        fail("cache deletion failed: " + str(p))
                    deleted.append(str(p))
                    reclaimed += size

    after = disk_state(roots["dev"])
    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "APPLY" if args.apply else "DRY_RUN",
        "productionAccess": "DENY",
        "plan": str(plan_path),
        "guard": guard,
        "maintenanceOperation": maintenance,
        "diskBefore": before,
        "diskAfter": after,
        "allEligible": all_eligible,
        "candidateBytes": total_candidate_bytes,
        "entries": validated,
        "actions": {
            "deletedCount": len(deleted),
            "deletedPaths": deleted,
            "reclaimedBytes": reclaimed,
        },
    }

    report_path = pathlib.Path(args.report_file).resolve()
    if not within(report_path, roots["coordination"]):
        fail("report file must remain under coordination root")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.chmod(report_path, 0o600)

    print(json.dumps({
        "ok": True,
        "mode": report["mode"],
        "allEligible": all_eligible,
        "candidateBytes": total_candidate_bytes,
        "deletedCount": len(deleted),
        "reclaimedBytes": reclaimed,
        "report": str(report_path),
    }, ensure_ascii=False))

if __name__ == "__main__":
    main()
