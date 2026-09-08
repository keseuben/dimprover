#!/usr/bin/env python3
"""Fail-closed retention for verified DEV runtime backups and build archives."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

DEV = Path("/srv/dimpro-dev")
DEFAULT_CONFIG = DEV / "worktrees/benjadmin-developer-grid-v013-outminai-20260905/config/local-backup-retention-v1.json"
SHA = re.compile(r"^[0-9a-f]{40}$")
ALLOWED_ROOTS = {"runtime": DEV / "backups/releases", "build": DEV / "artifacts/build-runs", "archive": DEV / "artifacts/benjadmin-developer-grid"}

def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()

def read_json(p):
    return json.loads(Path(p).read_text())

def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1048576), b""):
            h.update(chunk)
    return h.hexdigest()

def regular(p):
    return p.is_file() and not p.is_symlink()

def tree_safe(p, allow_links=False):
    if not p.is_dir() or p.is_symlink():
        return False
    for base, dirs, files in os.walk(p, followlinks=False):
        for name in dirs + files:
            child = Path(base) / name
            if child.is_symlink() and not allow_links:
                return False
            if not child.is_symlink() and child.is_dir() and os.path.ismount(child):
                return False
    return True

def ancestor(source, older, newer):
    if not SHA.fullmatch(str(older)) or not SHA.fullmatch(str(newer)):
        return False
    return subprocess.run(["git", "-C", str(source), "merge-base", "--is-ancestor", older, newer], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

def valid_release(m, branch):
    return isinstance(m, dict) and SHA.fullmatch(str(m.get("gitCommit", ""))) and m.get("gitBranch") in (branch if isinstance(branch, list) else [branch]) and isinstance(m.get("buildId"), str) and bool(m.get("buildId"))

def verify_archive_file(root, value):
    if not isinstance(value, dict):
        return False
    name = value.get("file")
    if not isinstance(name, str) or Path(name).name != name:
        return False
    p = root / name
    return regular(p) and p.stat().st_size == value.get("bytes") and sha256(p) == value.get("sha256")

def inspect_entry(p, family):
    try:
        if not tree_safe(p, family["kind"] == "runtime"):
            return None
        kind = family["kind"]
        if kind == "runtime":
            m = read_json(p / ".dimpro-release.json")
            if not p.name.startswith("health-") or not valid_release(m, family["branch"]) or (p / "BUILD_ID").read_text().strip() != m["buildId"] or not regular(p / "standalone/server.js"):
                return None
            metadata_digest = sha256(p / ".dimpro-release.json")
            commit, build = m["gitCommit"], m["buildId"]
            stamp = float(run("git", "-C", family["source"], "log", "-1", "--format=%ct", commit))
            age_stamp = max(stamp, p.stat().st_mtime)
            if m.get("generatedAt"):
                age_stamp = max(age_stamp, dt.datetime.fromisoformat(m["generatedAt"].replace("Z", "+00:00")).timestamp())
        elif kind == "build":
            r, m = read_json(p / "result.json"), read_json(p / "metadata.json")
            if r.get("status") != "PASS" or not SHA.fullmatch(str(m.get("sourceCommit", ""))) or m.get("sourceBranch") not in (family["branch"] if isinstance(family["branch"], list) else [family["branch"]]) or not isinstance(m.get("buildId"), str) or not m.get("buildId") or r.get("sourceCommit") != m["sourceCommit"] or r.get("buildId") != m["buildId"] or m.get("runId") != p.name or m.get("productionAccess") != "DENY":
                return None
            archive = p / "build-artifact.tar.gz"
            if not regular(archive) or sha256(archive) != m.get("artifactSha256") or r.get("artifactSha256") != m.get("artifactSha256"):
                return None
            commit, build = m["sourceCommit"], m["buildId"]
            metadata_digest = hashlib.sha256((sha256(p / "result.json") + sha256(p / "metadata.json")).encode()).hexdigest()
            stamp = dt.datetime.fromisoformat(r["finishedAt"].replace("Z", "+00:00")).timestamp()
        else:
            manifests = list(p.glob("ARTIFACT_MANIFEST_v*.json"))
            if not re.fullmatch(r"v0\.1\.\d+-[0-9a-f]{7}", p.name) or len(manifests) != 1 or not regular(manifests[0]):
                return None
            m = read_json(manifests[0])
            if m.get("gitCommit", "")[:7] != p.name.rsplit("-", 1)[-1] or m.get("product") != "BENJADMIN Developer Grid" or m.get("productionAccess") != "DENY" or m.get("releaseMetadata") != "VERIFIED" or not valid_release(m, family["branch"]) or not verify_archive_file(p, m.get("exe")) or not verify_archive_file(p, m.get("devZip")):
                return None
            commit, build = m["gitCommit"], m["buildId"]
            metadata_digest = sha256(manifests[0])
            stamp = dt.datetime.fromisoformat(m["generatedAt"].replace("Z", "+00:00")).timestamp() if m.get("generatedAt") else p.stat().st_mtime
        if not ancestor(family["source"], commit, run("git", "-C", family["source"], "rev-parse", "HEAD")):
            return None
        return {"path": str(p), "commit": commit, "buildId": build, "time": stamp, "ageTime": age_stamp if kind == "runtime" else stamp, "family": family["id"], "kind": kind, "metadataDigest": metadata_digest}
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError):
        return None

def select_entries(entries, keep, min_age_hours, now, protected_commits, protected_builds, protected_paths, source):
    ordered = sorted(entries, key=lambda x: (x["time"], x["buildId"]), reverse=True)
    selected = []
    for i, item in enumerate(ordered):
        p = Path(item["path"])
        if i < keep or now - item.get("ageTime", item["time"]) < min_age_hours * 3600 or item["commit"] in protected_commits or item["buildId"] in protected_builds:
            continue
        if any(p == q or p in q.parents or q in p.parents for q in protected_paths):
            continue
        newer = ordered[:i]
        if not any(ancestor(source, item["commit"], n["commit"]) for n in newer):
            continue
        selected.append(item)
    return selected

def runtime_protection(config):
    raw = json.loads(run("pm2", "jlist"))
    paths = {Path(p).resolve() for p in config["protectedPaths"]}
    builds = set()
    commits = set(config["protectedCommits"])
    for proc in raw:
        e = proc.get("pm2_env", {})
        if e.get("status") == "online":
            commits.add(e.get("DIMPRO_RELEASE_SOURCE_COMMIT"))
    for proc in raw:
        e = proc.get("pm2_env", {})
        if e.get("status") != "online":
            continue
        for key in ("pm_cwd", "pm_exec_path"):
            v = e.get(key)
            if isinstance(v, str) and v.startswith("/"):
                paths.add(Path(v).resolve())
        cwd = e.get("pm_cwd")
        if isinstance(cwd, str) and cwd.startswith("/"):
            for parent in [Path(cwd), *Path(cwd).parents]:
                mfile = parent / ".dimpro-release.json"
                if regular(mfile):
                    m = read_json(mfile)
                    builds.add(m.get("buildId"))
                    commits.add(m.get("gitCommit"))
                    break
    for family in config["families"]:
        source = Path(family["source"])
        commits.add(run("git", "-C", str(source), "rev-parse", "HEAD"))
        for name in ("active-next-release", "rollback-next-release", "previous-next-release"):
            pointer = source / ".dimprover" / name
            if regular(pointer):
                value = pointer.read_text().strip()
                if value and not Path(value).is_absolute() and ".." not in Path(value).parts:
                    target = (source / value).resolve()
                    paths.add(target)
                    mfile = target / ".dimpro-release.json"
                    if regular(mfile):
                        m = read_json(mfile)
                        builds.add(m.get("buildId"))
                        commits.add(m.get("gitCommit"))
    return commits, builds, paths

def backup_ready(config, now):
    marker = Path(config["backupMarker"]).read_text()
    values = dict(line.split("=", 1) for line in marker.splitlines() if "=" in line)
    stamp = dt.datetime.fromisoformat(values["FINISHED_AT"].replace("Z", "+00:00")).timestamp()
    if not re.fullmatch(r"[0-9a-f]{8,64}", values.get("SNAPSHOT_ID", "")) or not 0 <= now - stamp <= config["maxBackupAgeHours"] * 3600:
        raise RuntimeError("A legutobbi sikeres offsite backup nem eleg friss.")
    if run("systemctl", "show", "dimpro-dev-backup.service", "-p", "Result", "--value") != "success":
        raise RuntimeError("A napi backup szolgaltatas nem sikeres.")
    return {"snapshotId": values["SNAPSHOT_ID"], "finishedAt": values["FINISHED_AT"]}

def write_report(path, report):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".tmp")
    with open(tmp, "x") as f:
        os.chmod(tmp, 0o600)
        json.dump(report, f, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, p)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--report-file")
    a = parser.parse_args()
    if run("hostname") != "dimpro-dev":
        raise RuntimeError("DEV host required")
    config = read_json(a.config)
    if config.get("schemaVersion") != 1 or config.get("enabled") is not True:
        raise RuntimeError("Policy disabled or invalid")
    if a.apply and not shutil.rmtree.avoids_symlink_attacks:
        raise RuntimeError("Safe directory deletion unavailable")
    if a.apply and os.environ.get("DIMPRO_LOCAL_RETENTION_COORDINATED") != "1":
        raise RuntimeError("Coordinated maintenance required")
    now = dt.datetime.now(dt.timezone.utc).timestamp()
    backup = backup_ready(config, now)
    commits, builds, paths = runtime_protection(config)
    before = shutil.disk_usage("/").free
    report = {"schemaVersion": 1, "mode": "apply" if a.apply else "dry-run", "backup": backup, "candidates": [], "deleted": [], "skipped": [], "freeBeforeBytes": before}
    for family in config["families"]:
        root = Path(family["root"])
        if root != ALLOWED_ROOTS.get(family["kind"]) or not root.is_dir() or root.is_symlink():
            raise RuntimeError("Invalid allowlisted root")
        entries = []
        for p in root.iterdir():
            if not p.is_dir() or p.is_symlink():
                continue
            item = inspect_entry(p, family)
            if item is None:
                report["skipped"].append(str(p))
            else:
                entries.append(item)
        chosen = select_entries(entries, family["keepNewest"], family["minAgeHours"], now, commits, builds, paths, family["source"])
        for item in chosen:
            report["candidates"].append(item)
    report["candidateCount"] = len(report["candidates"])
    report["skippedCount"] = len(report["skipped"])
    report.pop("skipped")
    if a.apply:
        target = a.report_file or str(Path(config["auditRoot"]) / ("apply-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".json"))
        write_report(target, report)
        for item in report["candidates"]:
            family = next(f for f in config["families"] if f["id"] == item["family"])
            p = Path(item["path"])
            if p.parent != Path(family["root"]) or p.is_symlink() or not tree_safe(p, family["kind"] == "runtime"):
                raise RuntimeError("Path changed; refusing deletion")
            current = inspect_entry(p, family)
            if current is None or current["commit"] != item["commit"] or current["buildId"] != item["buildId"] or current["metadataDigest"] != item["metadataDigest"]:
                raise RuntimeError("Metadata changed; refusing deletion")
            commits, builds, paths = runtime_protection(config)
            remaining = [inspect_entry(q, family) for q in Path(family["root"]).iterdir() if q.is_dir() and not q.is_symlink()]
            remaining = [x for x in remaining if x is not None]
            eligible = select_entries(remaining, family["keepNewest"], family["minAgeHours"], dt.datetime.now(dt.timezone.utc).timestamp(), commits, builds, paths, family["source"])
            if item["path"] not in {x["path"] for x in eligible}:
                raise RuntimeError("Protected state changed; refusing deletion")
            backup_ready(config, dt.datetime.now(dt.timezone.utc).timestamp())
            shutil.rmtree(p)
            report["deleted"].append(item["path"])
            write_report(target, report)
    report["freeAfterBytes"] = shutil.disk_usage("/").free
    report["deletedCount"] = len(report["deleted"])
    print(json.dumps({k: v for k, v in report.items() if k not in ("candidates", "deleted")}, indent=2))
    print("CANDIDATES", json.dumps([x["path"] for x in report["candidates"]]))
    if a.apply:
        print("DELETED", json.dumps(report["deleted"]))
        write_report(target, report)

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("LOCAL_RETENTION_BLOCKED: " + str(exc), file=sys.stderr)
        sys.exit(1)
