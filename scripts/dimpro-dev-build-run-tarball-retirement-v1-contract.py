#!/usr/bin/env python3
import pathlib, subprocess, tempfile, json, hashlib
SCRIPT=pathlib.Path(__file__).with_name("dimpro-dev-build-run-tarball-retirement-v1.py").resolve()
passed=0
def check(label,cond,detail=""):
    global passed
    if not cond: raise AssertionError(label+(" :: "+detail if detail else ""))
    passed+=1; print("PASS "+str(passed).zfill(2)+" "+label)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
# Static contract checks for the canonical-only apply boundary and evidence preservation.
s=SCRIPT.read_text()
check("deletes only build-artifact tarball", 'TARBALL="build-artifact.tar.gz"' in s and "p.unlink()" in s)
check("metadata is required", '"metadata.json"' in s)
check("result evidence is required", '"result.json"' in s)
check("PASS result required", 'rr.get("status")!="PASS"' in s)
check("metadata/result source build artifact equality enforced", 'for k in ("sourceCommit","buildId","artifactSha256")' in s)
check("tarball hash verified", "tarball-hash-mismatch" in s)
check("immutable manifest sidecar required", "release manifest sidecar mismatch" in s)
check("immutable EXE and ZIP verified", 'for k in ("exe","devZip")' in s)
check("active Central Core and PM2 source commits protected", "active_session_heads()|pm2_release_commits()" in s)
check("active build run ids protected", "active_build_run_ids()" in s)
check("apply requires maintenance lock", "verify_maintenance(self_path)" in s)
check("apply requires directive-approved tool hash", "build-run retirement tool not approved by directive" in s)
check("coordination-only plan/report", "plan must be under coordination root" in s and "report outside coordination root" in s)
print(json.dumps({"ok":True,"passed":passed,"contract":"DIMPRO build-run tarball retirement V1"}))
