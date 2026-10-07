#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from typing import Any

SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$", re.I)
COMMIT = re.compile(r"^[0-9a-f]{40}$", re.I)
BUILD_ROOT_EXPECTED = Path("/srv/dimpro-build")
DEFAULT_CONFIG = Path("/srv/dimpro-build/config/retention-v1.json")
DEFAULT_REPORT = Path("/srv/dimpro-build/state/retention/latest.json")


class Deny(RuntimeError):
    pass


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


def parse_time(value: Any) -> dt.datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        out = dt.datetime.fromisoformat(text)
        if out.tzinfo is None:
            out = out.replace(tzinfo=dt.timezone.utc)
        return out.astimezone(dt.timezone.utc)
    except ValueError:
        return None


def age_hours(path: Path, timestamp: Any = None) -> float:
    parsed = parse_time(timestamp)
    when = parsed.timestamp() if parsed else path.stat().st_mtime
    return max(0.0, (time.time() - when) / 3600.0)


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def allocated_bytes(path: Path) -> int:
    if not path.exists() and not path.is_symlink():
        return 0
    total = 0
    seen: set[tuple[int, int]] = set()

    def add_stat(st: os.stat_result) -> None:
        nonlocal total
        key = (st.st_dev, st.st_ino)
        if key in seen:
            return
        seen.add(key)
        total += int(st.st_blocks) * 512

    if path.is_symlink() or path.is_file():
        add_stat(path.lstat())
        return total

    for root, dirs, files in os.walk(path, followlinks=False):
        for name in dirs + files:
            p = Path(root) / name
            try:
                add_stat(p.lstat())
            except FileNotFoundError:
                pass
    try:
        add_stat(path.lstat())
    except FileNotFoundError:
        pass
    return total


def ensure_within(path: Path, root: Path) -> Path:
    resolved = path.resolve(strict=False)
    rr = root.resolve(strict=True)
    if resolved == rr or rr not in resolved.parents:
        raise Deny(f"PATH_ESCAPE:{path}")
    return resolved


def run(args: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=check)


def git_commit_exists(repo: Path, commit: str) -> bool:
    if not COMMIT.fullmatch(commit):
        return False
    return run(["git", f"--git-dir={repo}", "cat-file", "-e", f"{commit}^{{commit}}"], check=False).returncode == 0


def git_worktree_map(repo: Path) -> dict[str, dict[str, str]]:
    cp = run(["git", f"--git-dir={repo}", "worktree", "list", "--porcelain"], check=False)
    if cp.returncode != 0:
        raise Deny("GIT_WORKTREE_LIST_UNAVAILABLE")
    out: dict[str, dict[str, str]] = {}
    current: dict[str, str] = {}
    for line in cp.stdout.splitlines() + [""]:
        if not line.strip():
            if current.get("worktree"):
                out[str(Path(current["worktree"]).resolve())] = dict(current)
            current = {}
            continue
        key, _, value = line.partition(" ")
        if key in {"worktree", "HEAD", "branch"}:
            current[key] = value.strip()
        elif key == "detached":
            current["detached"] = "true"
    return out


def process_refs(target: Path) -> list[dict[str, str]]:
    pref = str(target.resolve(strict=False))
    hits: list[dict[str, str]] = []
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            cwd = os.path.realpath(f"/proc/{pid}/cwd")
            if cwd == pref or cwd.startswith(pref + os.sep):
                hits.append({"pid": pid, "kind": "cwd", "value": cwd})
        except Exception:
            pass
        try:
            for fd in os.listdir(f"/proc/{pid}/fd"):
                try:
                    value = os.readlink(f"/proc/{pid}/fd/{fd}")
                except Exception:
                    continue
                if value == pref or value.startswith(pref + os.sep):
                    hits.append({"pid": pid, "kind": "fd", "value": value})
                    if len(hits) >= 20:
                        return hits
        except Exception:
            pass
    return hits


def disk_state(root: Path) -> dict[str, Any]:
    st = os.statvfs(root)
    total = st.f_blocks * st.f_frsize
    avail = st.f_bavail * st.f_frsize
    free = st.f_bfree * st.f_frsize
    used = total - free
    return {
        "totalBytes": total,
        "usedBytes": used,
        "availableBytes": avail,
        "usedPercent": round((used / total) * 100, 3) if total else 0,
    }


def load_config(path: Path) -> tuple[dict[str, Any], str]:
    raw = path.read_bytes()
    cfg = json.loads(raw)
    if not isinstance(cfg, dict):
        raise Deny("CONFIG_INVALID")
    if cfg.get("schemaVersion") != 1 or cfg.get("environment") != "DEV" or cfg.get("productionAccess") != "DENY":
        raise Deny("CONFIG_SCOPE_INVALID")
    if cfg.get("buildRoot") != str(BUILD_ROOT_EXPECTED):
        raise Deny("CONFIG_BUILD_ROOT_INVALID")
    return cfg, sha256_bytes(raw)


def validate_node_id(value: str) -> str:
    if value not in {"build01", "build02"}:
        raise Deny("NODE_ID_INVALID")
    if os.uname().nodename.split(".")[0] != value:
        raise Deny("HOSTNAME_MISMATCH")
    if os.getuid() == 0:
        raise Deny("ROOT_EXECUTION_DENY")
    return value


def current_run(state_root: Path) -> str | None:
    data = read_json(state_root / "current-run.json")
    value = data.get("runId") if data else None
    return value if isinstance(value, str) and SAFE_ID.fullmatch(value) else None


def verify_artifact(run_id: str, artifact_dir: Path, repo: Path) -> tuple[bool, list[str], dict[str, Any]]:
    reasons: list[str] = []
    metadata = read_json(artifact_dir / "metadata.json")
    tarball = artifact_dir / "build-artifact.tar.gz"
    detail: dict[str, Any] = {"artifactDir": str(artifact_dir), "tarball": str(tarball)}
    if not metadata:
        reasons.append("ARTIFACT_METADATA_MISSING")
        return False, reasons, detail
    if metadata.get("schemaVersion") != 1 or metadata.get("environment") != "DEV" or metadata.get("productionAccess") != "DENY":
        reasons.append("ARTIFACT_SCOPE_INVALID")
    if metadata.get("runId") != run_id:
        reasons.append("ARTIFACT_RUN_ID_MISMATCH")
    source_commit = str(metadata.get("sourceCommit") or "")
    artifact_sha = str(metadata.get("artifactSha256") or "")
    if not git_commit_exists(repo, source_commit):
        reasons.append("SOURCE_COMMIT_MISSING")
    if not tarball.is_file():
        reasons.append("ARTIFACT_TARBALL_MISSING")
    elif not SHA256.fullmatch(artifact_sha):
        reasons.append("ARTIFACT_SHA_INVALID")
    else:
        actual = sha256_file(tarball)
        detail["artifactSha256"] = actual
        if actual.lower() != artifact_sha.lower():
            reasons.append("ARTIFACT_SHA_MISMATCH")
    detail["sourceCommit"] = source_commit
    return not reasons, reasons, detail


def classify_manual_runs(root: Path, repo: Path, cfg: dict[str, Any], active_run: str | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    candidates: list[dict[str, Any]] = []
    denied: list[dict[str, Any]] = []
    section = cfg["manualRuns"]
    if not section.get("enabled"):
        return candidates, denied
    base = root / "manual-runs"
    if not base.is_dir():
        return candidates, denied

    for run_dir in sorted(p for p in base.iterdir() if p.is_dir()):
        run_id = run_dir.name
        reasons: list[str] = []
        if not SAFE_ID.fullmatch(run_id):
            reasons.append("RUN_ID_INVALID")
        if active_run == run_id:
            reasons.append("CURRENT_RUN_PROTECTED")
        result = read_json(run_dir / "result.json")
        metadata = read_json(run_dir / "metadata.json")
        source = run_dir / "source"
        if not result:
            reasons.append("RESULT_MISSING")
            status = None
        else:
            status = result.get("status")
            if result.get("schemaVersion") != 1 or result.get("environment") != "DEV" or result.get("productionAccess") != "DENY":
                reasons.append("RESULT_SCOPE_INVALID")
            if result.get("runId") != run_id:
                reasons.append("RESULT_RUN_ID_MISMATCH")
            if status not in {"PASS", "FAIL"}:
                reasons.append("RESULT_STATUS_INVALID")
        if not metadata:
            if status == "PASS":
                reasons.append("METADATA_MISSING")
        else:
            if metadata.get("schemaVersion") != 1 or metadata.get("environment") != "DEV" or metadata.get("productionAccess") != "DENY":
                reasons.append("METADATA_SCOPE_INVALID")
            if metadata.get("runId") != run_id:
                reasons.append("METADATA_RUN_ID_MISMATCH")

        min_age = float(section["passSourceMinAgeHours"] if status == "PASS" else section["failSourceMinAgeHours"])
        finished = result.get("finishedAt") if result else None
        age = age_hours(run_dir, finished)
        if age < min_age:
            reasons.append("TOO_YOUNG")
        if not source.is_dir():
            reasons.append("SOURCE_ALREADY_ABSENT")
        else:
            refs = process_refs(source)
            if refs:
                reasons.append("PROCESS_REFERENCE")
        if status == "PASS" and metadata:
            ok, artifact_reasons, _ = verify_artifact(run_id, run_dir, repo)
            if not ok:
                reasons.extend(artifact_reasons)
            source_commit = str(metadata.get("sourceCommit") or "")
            try:
                source_head = run(["git", "-C", str(source), "rev-parse", "HEAD"], check=False).stdout.strip() if source.is_dir() else ""
            except Exception:
                source_head = ""
            if source_head != source_commit:
                reasons.append("SOURCE_HEAD_MISMATCH")

        item = {
            "kind": "manual-source",
            "runId": run_id,
            "path": str(source),
            "status": status,
            "ageHours": round(age, 2),
            "allocatedBytes": allocated_bytes(source) if source.exists() else 0,
            "reasons": sorted(set(reasons)),
        }
        if not reasons:
            candidates.append(item)
        else:
            denied.append(item)
    return candidates, denied


def classify_worktrees(root: Path, repo: Path, cfg: dict[str, Any], active_run: str | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    candidates: list[dict[str, Any]] = []
    denied: list[dict[str, Any]] = []
    section = cfg["worktrees"]
    if not section.get("enabled"):
        return candidates, denied
    base = root / "worktrees"
    if not base.is_dir():
        return candidates, denied
    wt_map = git_worktree_map(repo)

    for wt in sorted(p for p in base.iterdir() if p.is_dir()):
        run_id = wt.name
        reasons: list[str] = []
        if not SAFE_ID.fullmatch(run_id):
            reasons.append("RUN_ID_INVALID")
        if active_run == run_id:
            reasons.append("CURRENT_RUN_PROTECTED")
        registered = wt_map.get(str(wt.resolve()))
        if not registered:
            reasons.append("GIT_WORKTREE_NOT_REGISTERED")
        elif registered.get("detached") != "true":
            reasons.append("WORKTREE_NOT_DETACHED")
        artifact_dir = root / "artifacts" / run_id
        metadata = read_json(artifact_dir / "metadata.json")
        created_at = metadata.get("createdAt") if metadata else None
        age = age_hours(wt, created_at)
        if age < float(section["minAgeHours"]):
            reasons.append("TOO_YOUNG")
        refs = process_refs(wt)
        if refs:
            reasons.append("PROCESS_REFERENCE")
        if section.get("requireArtifact"):
            ok, artifact_reasons, _ = verify_artifact(run_id, artifact_dir, repo)
            if not ok:
                reasons.extend(artifact_reasons)
        if metadata and registered:
            source_commit = str(metadata.get("sourceCommit") or "")
            if registered.get("HEAD") != source_commit:
                reasons.append("WORKTREE_HEAD_MISMATCH")

        item = {
            "kind": "worktree",
            "runId": run_id,
            "path": str(wt),
            "ageHours": round(age, 2),
            "allocatedBytes": allocated_bytes(wt),
            "reasons": sorted(set(reasons)),
        }
        if not reasons:
            candidates.append(item)
        else:
            denied.append(item)
    return candidates, denied


def classify_temp(root: Path, cfg: dict[str, Any], active_run: str | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    candidates: list[dict[str, Any]] = []
    denied: list[dict[str, Any]] = []
    section = cfg["temp"]
    if not section.get("enabled"):
        return candidates, denied
    base = root / "temp"
    if not base.is_dir():
        return candidates, denied
    for p in sorted(base.glob("*.bundle")):
        run_id = p.name[:-7]
        reasons: list[str] = []
        if not SAFE_ID.fullmatch(run_id):
            reasons.append("RUN_ID_INVALID")
        if active_run == run_id:
            reasons.append("CURRENT_RUN_PROTECTED")
        age = age_hours(p)
        if age < float(section["minAgeHours"]):
            reasons.append("TOO_YOUNG")
        refs = process_refs(p)
        if refs:
            reasons.append("PROCESS_REFERENCE")
        item = {
            "kind": "temp-bundle",
            "runId": run_id,
            "path": str(p),
            "ageHours": round(age, 2),
            "allocatedBytes": allocated_bytes(p),
            "reasons": sorted(set(reasons)),
        }
        if not reasons:
            candidates.append(item)
        else:
            denied.append(item)
    return candidates, denied


def classify_artifacts(root: Path, repo: Path, cfg: dict[str, Any], active_run: str | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    candidates: list[dict[str, Any]] = []
    denied: list[dict[str, Any]] = []
    section = cfg["artifacts"]
    if not section.get("enabled"):
        return candidates, denied
    base = root / "artifacts"
    if not base.is_dir():
        return candidates, denied

    eligible: list[dict[str, Any]] = []
    for artifact_dir in sorted(p for p in base.iterdir() if p.is_dir()):
        run_id = artifact_dir.name
        tarball = artifact_dir / "build-artifact.tar.gz"
        if not tarball.is_file():
            continue
        reasons: list[str] = []
        if not SAFE_ID.fullmatch(run_id):
            reasons.append("RUN_ID_INVALID")
        if active_run == run_id:
            reasons.append("CURRENT_RUN_PROTECTED")
        metadata = read_json(artifact_dir / "metadata.json")
        created_at = metadata.get("createdAt") if metadata else None
        age = age_hours(tarball, created_at)
        if age < float(section["minAgeHours"]):
            reasons.append("TOO_YOUNG")
        marker = read_json(artifact_dir / "DEV_COPY_VERIFIED.json")
        detail: dict[str, Any] = {}
        if section.get("requireDevCopyMarker") and not marker:
            reasons.append("DEV_COPY_MARKER_MISSING")
        else:
            ok, artifact_reasons, detail = verify_artifact(run_id, artifact_dir, repo)
            if not ok:
                reasons.extend(artifact_reasons)
            if section.get("requireDevCopyMarker"):
                expected_path = f"/srv/dimpro-dev/artifacts/build-runs/{run_id}/build-artifact.tar.gz"
                expected_sha = str((metadata or {}).get("artifactSha256") or "").lower()
                if marker.get("schemaVersion") != 1 or marker.get("environment") != "DEV" or marker.get("productionAccess") != "DENY":
                    reasons.append("DEV_COPY_MARKER_SCOPE_INVALID")
                if marker.get("runId") != run_id or marker.get("devPath") != expected_path:
                    reasons.append("DEV_COPY_MARKER_IDENTITY_MISMATCH")
                if str(marker.get("artifactSha256") or "").lower() != expected_sha:
                    reasons.append("DEV_COPY_MARKER_SHA_MISMATCH")
                if not parse_time(marker.get("verifiedAt")):
                    reasons.append("DEV_COPY_MARKER_TIME_INVALID")
        refs = process_refs(tarball)
        if refs:
            reasons.append("PROCESS_REFERENCE")
        item = {
            "kind": "artifact-tarball",
            "runId": run_id,
            "path": str(tarball),
            "ageHours": round(age, 2),
            "allocatedBytes": allocated_bytes(tarball),
            "artifactSha256": detail.get("artifactSha256"),
            "reasons": sorted(set(reasons)),
        }
        if not reasons:
            eligible.append(item)
        else:
            denied.append(item)

    keep = max(0, int(section.get("keepNewestVerified", 0)))
    eligible.sort(key=lambda x: Path(x["path"]).stat().st_mtime, reverse=True)
    for idx, item in enumerate(eligible):
        if idx < keep:
            item = dict(item)
            item["reasons"] = ["KEEP_NEWEST_VERIFIED"]
            denied.append(item)
        else:
            candidates.append(item)
    return candidates, denied


def classify_logs(root: Path, cfg: dict[str, Any], active_run: str | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    candidates: list[dict[str, Any]] = []
    denied: list[dict[str, Any]] = []
    section = cfg["logs"]
    if not section.get("enabled"):
        return candidates, denied
    base = root / "logs"
    if not base.is_dir():
        return candidates, denied
    for p in sorted(base.glob("*.log")):
        run_id = p.stem
        reasons: list[str] = []
        if active_run == run_id:
            reasons.append("CURRENT_RUN_PROTECTED")
        age = age_hours(p)
        if age < float(section["minAgeHours"]):
            reasons.append("TOO_YOUNG")
        refs = process_refs(p)
        if refs:
            reasons.append("PROCESS_REFERENCE")
        item = {
            "kind": "log",
            "runId": run_id,
            "path": str(p),
            "ageHours": round(age, 2),
            "allocatedBytes": allocated_bytes(p),
            "reasons": sorted(set(reasons)),
        }
        if not reasons:
            candidates.append(item)
        else:
            denied.append(item)
    return candidates, denied


def delete_candidate(item: dict[str, Any], root: Path, repo: Path) -> None:
    path = ensure_within(Path(item["path"]), root)
    kind = item["kind"]
    if kind == "manual-source":
        expected_parent = root / "manual-runs" / item["runId"]
        if path != (expected_parent / "source").resolve(strict=False):
            raise Deny("MANUAL_SOURCE_PATH_MISMATCH")
        shutil.rmtree(path)
    elif kind == "worktree":
        expected = (root / "worktrees" / item["runId"]).resolve(strict=False)
        if path != expected:
            raise Deny("WORKTREE_PATH_MISMATCH")
        cp = run(["git", f"--git-dir={repo}", "worktree", "remove", "--force", str(path)], check=False)
        if cp.returncode != 0:
            raise Deny(f"WORKTREE_REMOVE_FAILED:{item["runId"]}:{cp.stderr.strip()[:180]}")
    elif kind == "temp-bundle":
        expected = (root / "temp" / f"{item["runId"]}.bundle").resolve(strict=False)
        if path != expected:
            raise Deny("TEMP_PATH_MISMATCH")
        path.unlink()
    elif kind == "artifact-tarball":
        expected = (root / "artifacts" / item["runId"] / "build-artifact.tar.gz").resolve(strict=False)
        if path != expected:
            raise Deny("ARTIFACT_PATH_MISMATCH")
        path.unlink()
    elif kind == "log":
        expected = (root / "logs" / f"{item["runId"]}.log").resolve(strict=False)
        if path != expected:
            raise Deny("LOG_PATH_MISMATCH")
        path.unlink()
    else:
        raise Deny(f"UNKNOWN_KIND:{kind}")


def main() -> int:
    parser = argparse.ArgumentParser(description="DIMPRO Build Node Retention V1")
    parser.add_argument("--node-id", required=True, choices=["build01", "build02"])
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--report-file", default=str(DEFAULT_REPORT))
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm-token", default="")
    args = parser.parse_args()

    node_id = validate_node_id(args.node_id)
    config_path = Path(args.config)
    cfg, cfg_sha = load_config(config_path)
    root = BUILD_ROOT_EXPECTED
    repo = root / "repositories" / "dimprover.git"
    state_root = root / "state"
    lock_path = state_root / "full-build.lock"
    retention_lock_path = state_root / "retention-v1.lock"
    if not repo.is_dir():
        raise Deny("CANONICAL_REPOSITORY_MISSING")
    if not state_root.is_dir():
        raise Deny("STATE_ROOT_MISSING")

    expected_token = f"APPLY:{cfg_sha}"
    if args.apply and args.confirm_token != expected_token:
        raise Deny("CONFIRM_TOKEN_MISMATCH")

    retention_fd = os.open(retention_lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        try:
            fcntl.flock(retention_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Deny("RETENTION_LOCK_BUSY")

        build_fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o640)
        build_lock_held = False
        try:
            try:
                fcntl.flock(build_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Deny("FULL_BUILD_LOCK_BUSY")

            active = current_run(state_root)
            if active:
                raise Deny(f"CURRENT_RUN_ACTIVE:{active}")

            if args.apply:
                build_lock_held = True
            else:
                fcntl.flock(build_fd, fcntl.LOCK_UN)

            before = disk_state(root)
            groups: dict[str, list[dict[str, Any]]] = {}
            denied: list[dict[str, Any]] = []

            for name, fn in [
                ("manualSources", lambda: classify_manual_runs(root, repo, cfg, active)),
                ("worktrees", lambda: classify_worktrees(root, repo, cfg, active)),
                ("tempBundles", lambda: classify_temp(root, cfg, active)),
                ("artifacts", lambda: classify_artifacts(root, repo, cfg, active)),
                ("logs", lambda: classify_logs(root, cfg, active)),
            ]:
                cands, blocks = fn()
                groups[name] = cands
                denied.extend(blocks)

            candidates = [item for items in groups.values() for item in items]
            candidate_bytes = sum(int(x["allocatedBytes"]) for x in candidates)
            actions: list[dict[str, Any]] = []

            if not args.apply:
                try:
                    fcntl.flock(build_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    raise Deny("FULL_BUILD_STATE_CHANGED_DURING_DRY_RUN")
                try:
                    active_after = current_run(state_root)
                    if active_after:
                        raise Deny(f"CURRENT_RUN_APPEARED_DURING_DRY_RUN:{active_after}")
                finally:
                    fcntl.flock(build_fd, fcntl.LOCK_UN)

            if args.apply:
                for item in candidates:
                    path = Path(item["path"])
                    if not path.exists() and not path.is_symlink():
                        raise Deny(f"TARGET_CHANGED_MISSING:{path}")
                    if process_refs(path):
                        raise Deny(f"TARGET_GAINED_PROCESS_REFERENCE:{path}")
                    pre_bytes = allocated_bytes(path)
                    delete_candidate(item, root, repo)
                    actions.append({
                        "kind": item["kind"],
                        "runId": item["runId"],
                        "path": item["path"],
                        "reclaimedPlannedBytes": pre_bytes,
                    })

            after = disk_state(root)
            npm_cache = root / "cache" / "npm"
            npm_bytes = allocated_bytes(npm_cache) if npm_cache.exists() else 0
            report = {
                "schemaVersion": 1,
                "environment": "DEV",
                "productionAccess": "DENY",
                "tool": "DIMPRO_BUILD_NODE_RETENTION_V1",
                "nodeId": node_id,
                "mode": "APPLY" if args.apply else "DRY_RUN",
                "generatedAt": iso_now(),
                "configPath": str(config_path),
                "configSha256": cfg_sha,
                "diskBefore": before,
                "diskAfter": after,
                "candidateCount": len(candidates),
                "candidateBytes": candidate_bytes,
                "candidates": candidates,
                "candidateGroups": {k: len(v) for k, v in groups.items()},
                "deniedCount": len(denied),
                "denied": denied,
                "npmCache": {
                    "bytes": npm_bytes,
                    "maxBytes": int(cfg["npmCache"]["maxBytes"]),
                    "overLimit": npm_bytes > int(cfg["npmCache"]["maxBytes"]),
                    "autoPrune": bool(cfg["npmCache"].get("autoPrune")),
                },
                "actions": actions,
                "deletedCount": len(actions),
                "destructiveActionsPerformed": bool(actions),
                "actualAvailableBytesDelta": after["availableBytes"] - before["availableBytes"],
                "fullBuildLockHeldDuringScan": bool(args.apply),
            }
            report_path = Path(args.report_file)
            report_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = report_path.with_name(report_path.name + f".{os.getpid()}.tmp")
            tmp.write_text(json.dumps(report, indent=2) + "\n")
            os.chmod(tmp, 0o600)
            os.replace(tmp, report_path)
            print(json.dumps(report, indent=2))
            return 0
        finally:
            try:
                if build_lock_held:
                    fcntl.flock(build_fd, fcntl.LOCK_UN)
            finally:
                os.close(build_fd)
    finally:
        try:
            fcntl.flock(retention_fd, fcntl.LOCK_UN)
        finally:
            os.close(retention_fd)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Deny as exc:
        print(json.dumps({
            "schemaVersion": 1,
            "environment": "DEV",
            "productionAccess": "DENY",
            "tool": "DIMPRO_BUILD_NODE_RETENTION_V1",
            "status": "DENY",
            "code": "BUILD_RETENTION_PREFLIGHT_DENY",
            "reason": str(exc),
            "destructiveActionsPerformed": False,
        }, indent=2))
        raise SystemExit(2)
