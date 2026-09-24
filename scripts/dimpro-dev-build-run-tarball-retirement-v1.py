#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, shutil, subprocess, sys
from datetime import datetime, timezone

DEV_ROOT=pathlib.Path("/srv/dimpro-dev")
RUNS_ROOT=DEV_ROOT/"artifacts"/"build-runs"
RELEASE_ROOT=DEV_ROOT/"artifacts"/"benjadmin-developer-grid"
COORD_ROOT=DEV_ROOT/"coordination"
SKILL=DEV_ROOT/"development-library"/"skills"/"dimpro-safe-delete"/"SKILL.md"
DIRECTIVE=COORD_ROOT/"SAFE_DELETE_SKILL_REQUIRED.md"
TARBALL="build-artifact.tar.gz"

def fail(msg):
    print("DENY · SAFE_DELETE_PREFLIGHT_FAILED · "+msg,file=sys.stderr)
    raise SystemExit(1)

def sha(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for b in iter(lambda:f.read(1024*1024),b""):
            h.update(b)
    return h.hexdigest()

def read_json(p):
    try:return json.loads(p.read_text())
    except Exception as e: fail(f"invalid JSON {p}: {e}")

def within(p,root):
    try:p.resolve().relative_to(root.resolve()); return True
    except Exception:return False

def run(args):
    p=subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if p.returncode!=0: fail("command failed: "+" ".join(map(str,args))+" · "+p.stderr.strip())
    return p.stdout.strip()

def disk():
    u=shutil.disk_usage(DEV_ROOT)
    used=u.total-u.free
    return {"totalBytes":u.total,"usedBytes":used,"freeBytes":u.free,"usedPercent":round(used*100/u.total,2)}

def directive_hash(label,text):
    lines=text.splitlines()
    for i,line in enumerate(lines):
        if line.strip()==label and i+1<len(lines):
            v=lines[i+1].strip().lower()
            if len(v)==64 and all(c in "0123456789abcdef" for c in v): return v
    fail("missing directive hash label: "+label)

def verify_guard(self_path,apply):
    if not SKILL.is_file() or not DIRECTIVE.is_file(): fail("missing Safe Delete guard")
    txt=DIRECTIVE.read_text()
    es=directive_hash("Required SHA-256:",txt)
    asha=sha(SKILL)
    if es!=asha: fail("Safe Delete skill hash mismatch")
    label="Build-run tarball retirement script SHA-256:"
    approved=None
    if label in txt: approved=directive_hash(label,txt)
    actual=sha(self_path)
    if apply and approved!=actual: fail("build-run retirement tool not approved by directive")
    return {"skillSha256":asha,"toolSha256":actual,"directiveApprovedToolSha256":approved,"toolApproved":approved==actual}

def active_session_heads():
    p=COORD_ROOT/"developer-grid"/"state.json"
    if not p.is_file(): fail("missing Central Core state")
    s=read_json(p)
    return {str((x.get("sourceProvenance") or {}).get("head") or "") for x in s.get("sessions",[]) if not x.get("endedAt")}

def pm2_release_commits():
    apps=json.loads(run(["pm2","jlist"]))
    commits=set()
    for a in apps:
        e=a.get("pm2_env") or {}; n=e.get("env") if isinstance(e.get("env"),dict) else {}
        for key in ("DIMPRO_RELEASE_SOURCE_COMMIT","DIMPRO_DEVELOPER_GRID_SOURCE_COMMIT"):
            v=n.get(key) or e.get(key)
            if v: commits.add(str(v))
    return commits

def active_build_run_ids():
    ids=set()
    p=COORD_ROOT/"health-snapshots"/"build-nodes.json"
    if p.is_file():
        d=read_json(p)
        for n in d.get("nodes",[]):
            m=n.get("metrics") or {}
            rid=m.get("currentRunId")
            if rid: ids.add(str(rid))
    return ids

def verify_maintenance(self_path):
    p=COORD_ROOT/"active-development.json"
    if not p.is_file(): fail("apply requires maintenance lock")
    d=read_json(p)
    if d.get("status")!="running" or d.get("operation")!="maintenance": fail("apply requires running maintenance lock")
    if self_path.name not in str(d.get("command") or ""): fail("maintenance lock not owned by this tool")
    return d

def verify_release_manifest(mp,source_commit,build_id):
    if not mp.is_file() or not within(mp,RELEASE_ROOT): fail("invalid release manifest path")
    side=pathlib.Path(str(mp)+".sha256")
    if not side.is_file(): fail("missing release manifest sidecar")
    recorded=side.read_text().split()[0].lower()
    actual=sha(mp)
    if recorded!=actual: fail("release manifest sidecar mismatch")
    m=read_json(mp)
    required={
      "gitCommit":source_commit,
      "buildId":build_id,
      "environment":"DEV",
      "productionAccess":"DENY",
      "releaseMetadata":"VERIFIED",
      "standalone":"VERIFIED",
      "windowsArtifactProvenance":"VERIFIED",
      "packageSessionProvenance":"VERIFIED",
    }
    for k,v in required.items():
        if m.get(k)!=v: fail(f"release manifest invariant mismatch: {k}")
    files={}
    for k in ("exe","devZip"):
        info=m.get(k) or {}
        fp=mp.parent/str(info.get("file") or "")
        if not fp.is_file(): fail("missing immutable release file: "+str(fp))
        if fp.stat().st_size!=int(info.get("bytes") or -1): fail("release file size mismatch: "+str(fp))
        h=sha(fp)
        if h!=str(info.get("sha256") or "").lower(): fail("release file hash mismatch: "+str(fp))
        files[k]={"path":str(fp),"sha256":h,"bytes":fp.stat().st_size}
    return {"manifest":str(mp),"manifestSha256":actual,"version":m.get("version"),"files":files}

def validate(entry,protected_heads,active_run_ids):
    rd=pathlib.Path(entry.get("runDir") or "").resolve()
    exp_commit=str(entry.get("sourceCommit") or "")
    exp_build=str(entry.get("buildId") or "")
    mp=pathlib.Path(entry.get("manifest") or "").resolve()
    reasons=[]
    if not within(rd,RUNS_ROOT): reasons.append("run-outside-approved-root")
    if not rd.is_dir(): reasons.append("run-dir-missing")
    if rd.name in active_run_ids: reasons.append("active-build-run")
    tar=rd/TARBALL; meta=rd/"metadata.json"; result=rd/"result.json"
    if not meta.is_file(): reasons.append("metadata-missing")
    if not result.is_file(): reasons.append("result-missing")
    if not tar.is_file(): reasons.append("tarball-missing")
    md=rr=None
    if not reasons:
        md=read_json(meta); rr=read_json(result)
        if md.get("environment")!="DEV" or md.get("productionAccess")!="DENY": reasons.append("metadata-env-invariant")
        if rr.get("environment")!="DEV" or rr.get("productionAccess")!="DENY": reasons.append("result-env-invariant")
        if rr.get("status")!="PASS": reasons.append("result-not-pass")
        for k in ("sourceCommit","buildId","artifactSha256"):
            if str(md.get(k) or "")!=str(rr.get(k) or ""): reasons.append("metadata-result-"+k+"-mismatch")
        if str(md.get("sourceCommit") or "")!=exp_commit: reasons.append("source-commit-mismatch")
        if str(md.get("buildId") or "")!=exp_build: reasons.append("build-id-mismatch")
        actual_tar=sha(tar)
        if actual_tar!=str(md.get("artifactSha256") or "").lower(): reasons.append("tarball-hash-mismatch")
        if exp_commit in protected_heads: reasons.append("protected-source-commit")
    release=None
    if not reasons:
        release=verify_release_manifest(mp,exp_commit,exp_build)
    return {
      "id":entry.get("id"),"runDir":str(rd),"sourceCommit":exp_commit,"buildId":exp_build,
      "tarball":str(tar),"tarballBytes":tar.stat().st_size if tar.is_file() else 0,
      "eligible":len(reasons)==0,"reasons":reasons,"release":release,
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--plan",required=True)
    ap.add_argument("--report-file",required=True)
    ap.add_argument("--apply",action="store_true")
    args=ap.parse_args()
    self_path=pathlib.Path(__file__).resolve()
    guard=verify_guard(self_path,args.apply)
    maintenance=verify_maintenance(self_path) if args.apply else None
    planp=pathlib.Path(args.plan).resolve()
    if not within(planp,COORD_ROOT): fail("plan must be under coordination root")
    plan=read_json(planp)
    if plan.get("schemaVersion")!=1 or plan.get("environment")!="DEV" or plan.get("productionAccess")!="DENY": fail("plan invariant failed")
    entries=plan.get("entries")
    if not isinstance(entries,list) or not entries: fail("empty plan")
    protected=active_session_heads()|pm2_release_commits()
    active_runs=active_build_run_ids()
    before=disk()
    vals=[validate(x,protected,active_runs) for x in entries]
    all_ok=all(x["eligible"] for x in vals)
    if args.apply and not all_ok: fail("one or more entries not eligible")
    deleted=[]; reclaimed=0
    if args.apply:
        for x in vals:
            p=pathlib.Path(x["tarball"]).resolve()
            if not within(p,pathlib.Path(x["runDir"]).resolve()): fail("tarball escaped run dir")
            size=x["tarballBytes"]
            p.unlink()
            if p.exists(): fail("tarball deletion failed: "+str(p))
            deleted.append(str(p)); reclaimed+=size
    after=disk()
    report={
      "schemaVersion":1,"generatedAt":datetime.now(timezone.utc).isoformat(),
      "mode":"APPLY" if args.apply else "DRY_RUN","productionAccess":"DENY",
      "plan":str(planp),"guard":guard,"maintenanceOperation":maintenance,
      "protectedSourceCommits":sorted(x for x in protected if x),
      "activeBuildRunIds":sorted(active_runs),
      "diskBefore":before,"diskAfter":after,"allEligible":all_ok,
      "candidateBytes":sum(x["tarballBytes"] for x in vals if x["eligible"]),
      "entries":vals,
      "actions":{"deletedCount":len(deleted),"deletedPaths":deleted,"reclaimedBytes":reclaimed},
    }
    rp=pathlib.Path(args.report_file).resolve()
    if not within(rp,COORD_ROOT): fail("report outside coordination root")
    rp.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
    os.chmod(rp,0o600)
    print(json.dumps({"ok":True,"mode":report["mode"],"allEligible":all_ok,"candidateBytes":report["candidateBytes"],"deletedCount":len(deleted),"reclaimedBytes":reclaimed,"report":str(rp)}))

if __name__=="__main__": main()
