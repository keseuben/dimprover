#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, shutil, stat, subprocess, sys
from datetime import datetime, timezone

DEV_ROOT=pathlib.Path("/srv/dimpro-dev")
BACKUP_ROOT=DEV_ROOT/"backups"/"developer-grid"
RELEASE_ROOT=DEV_ROOT/"artifacts"/"benjadmin-developer-grid"
COORD_ROOT=DEV_ROOT/"coordination"
REPO=DEV_ROOT/"repositories"/"dimprover.git"
SKILL=DEV_ROOT/"development-library"/"skills"/"dimpro-safe-delete"/"SKILL.md"
DIRECTIVE=COORD_ROOT/"SAFE_DELETE_SKILL_REQUIRED.md"
EVIDENCE_FILE="RETIREMENT_EVIDENCE.json"

def fail(msg):
    print("DENY · SAFE_DELETE_PREFLIGHT_FAILED · "+msg,file=sys.stderr)
    raise SystemExit(1)

def sha_file(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for b in iter(lambda:f.read(1024*1024),b""): h.update(b)
    return h.hexdigest()

def read_json(path):
    try:return json.loads(path.read_text())
    except Exception as e: fail(f"invalid JSON {path}: {e}")

def within(path,root):
    try:path.resolve().relative_to(root.resolve()); return True
    except Exception:return False

def run(args):
    p=subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if p.returncode!=0: fail("command failed: "+" ".join(map(str,args))+" · "+p.stderr.strip())
    return p.stdout.strip()

def disk():
    u=shutil.disk_usage(DEV_ROOT); used=u.total-u.free
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
    actual_skill=sha_file(SKILL)
    if es!=actual_skill: fail("Safe Delete skill hash mismatch")
    label="Developer Grid pre-materialize backup retirement script SHA-256:"
    approved=directive_hash(label,txt) if label in txt else None
    actual=sha_file(self_path)
    if apply and approved!=actual: fail("backup retirement tool not approved by directive")
    return {"skillSha256":actual_skill,"toolSha256":actual,"directiveApprovedToolSha256":approved,"toolApproved":approved==actual}

def active_heads():
    heads=set()
    state=COORD_ROOT/"developer-grid"/"state.json"
    if not state.is_file(): fail("missing Central Core state")
    s=read_json(state)
    for x in s.get("sessions",[]):
        if not x.get("endedAt"):
            h=str((x.get("sourceProvenance") or {}).get("head") or "")
            if h: heads.add(h)
    apps=json.loads(run(["pm2","jlist"]))
    for a in apps:
        e=a.get("pm2_env") or {}; n=e.get("env") if isinstance(e.get("env"),dict) else {}
        for k in ("DIMPRO_RELEASE_SOURCE_COMMIT","DIMPRO_DEVELOPER_GRID_SOURCE_COMMIT"):
            v=n.get(k) or e.get(k)
            if v: heads.add(str(v))
    return heads

def verify_maintenance(self_path):
    p=COORD_ROOT/"active-development.json"
    if not p.is_file(): fail("apply requires maintenance lock")
    d=read_json(p)
    if d.get("status")!="running" or d.get("operation")!="maintenance": fail("apply requires running maintenance lock")
    if self_path.name not in str(d.get("command") or ""): fail("maintenance lock not owned by this tool")
    return d

def verify_git_commit(commit):
    p=subprocess.run(["git","--git-dir="+str(REPO),"cat-file","-e",commit+"^{commit}"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if p.returncode!=0: fail("source commit missing from canonical git repository: "+commit)

def verify_release_manifest(mp,commit,build_id,branch):
    if not mp.is_file() or not within(mp,RELEASE_ROOT): fail("invalid immutable release manifest")
    side=pathlib.Path(str(mp)+".sha256")
    if not side.is_file(): fail("missing manifest sidecar")
    actual_manifest_sha=sha_file(mp)
    if side.read_text().split()[0].lower()!=actual_manifest_sha: fail("manifest sidecar mismatch")
    m=read_json(mp)
    required={
      "gitCommit":commit,"buildId":build_id,"gitBranch":branch,
      "environment":"DEV","productionAccess":"DENY",
      "releaseMetadata":"VERIFIED","standalone":"VERIFIED",
      "windowsArtifactProvenance":"VERIFIED","packageSessionProvenance":"VERIFIED",
    }
    for k,v in required.items():
        if m.get(k)!=v: fail("immutable release invariant mismatch: "+k)
    files={}
    for k in ("exe","devZip"):
        info=m.get(k) or {}; fp=mp.parent/str(info.get("file") or "")
        if not fp.is_file(): fail("missing immutable release file: "+str(fp))
        if fp.stat().st_size!=int(info.get("bytes") or -1): fail("immutable release size mismatch: "+str(fp))
        h=sha_file(fp)
        if h!=str(info.get("sha256") or "").lower(): fail("immutable release hash mismatch: "+str(fp))
        files[k]={"path":str(fp),"sha256":h,"bytes":fp.stat().st_size}
    return {"manifest":str(mp),"manifestSha256":actual_manifest_sha,"version":m.get("version"),"files":files}

def snapshot_tree(snapshot):
    h=hashlib.sha256(); total=0; count=0
    files=[]
    for p in sorted(snapshot.rglob("*"),key=lambda x:x.relative_to(snapshot).as_posix()):
        rel=p.relative_to(snapshot).as_posix()
        if p.is_symlink():
            target=p.readlink()
            resolved=(p.parent/target).resolve()
            if not within(resolved,snapshot): fail("snapshot contains external symlink: "+str(p))
            rec=f"L\0{rel}\0{target.as_posix()}\n".encode()
            h.update(rec); count+=1
            files.append((rel,0,"SYMLINK:"+target.as_posix()))
            continue
        if p.is_dir(): continue
        if not p.is_file(): fail("snapshot contains unsupported object: "+str(p))
        st=p.stat()
        if st.st_nlink>1: fail("snapshot contains shared hardlink: "+str(p))
        fh=sha_file(p)
        rec=f"F\0{rel}\0{st.st_size}\0{fh}\n".encode()
        h.update(rec); total+=st.st_size; count+=1
        files.append((rel,st.st_size,fh))
    return {"treeSha256":h.hexdigest(),"fileCount":count,"bytes":total}

def validate(entry,protected):
    bd=pathlib.Path(entry.get("backupDir") or "").resolve()
    sd=pathlib.Path(entry.get("snapshotDir") or "").resolve()
    exp_commit=str(entry.get("sourceCommit") or "")
    exp_build=str(entry.get("buildId") or "")
    exp_branch=str(entry.get("sourceBranch") or "")
    exp_tree=str(entry.get("treeSha256") or "").lower()
    exp_bytes=int(entry.get("snapshotBytes") or 0)
    mp=pathlib.Path(entry.get("manifest") or "").resolve()
    reasons=[]
    if not within(bd,BACKUP_ROOT): reasons.append("backup-outside-approved-root")
    if not bd.is_dir(): reasons.append("backup-dir-missing")
    if not sd.is_dir() or not within(sd,bd): reasons.append("snapshot-invalid")
    if (bd/EVIDENCE_FILE).exists(): reasons.append("already-retired")
    rel=sd/".dimpro-release.json"; bid=sd/"BUILD_ID"
    if not rel.is_file(): reasons.append("release-metadata-missing")
    if not bid.is_file(): reasons.append("build-id-file-missing")
    meta=None; tree=None; release=None
    if not reasons:
        meta=read_json(rel)
        if str(meta.get("gitCommit") or "")!=exp_commit: reasons.append("source-commit-mismatch")
        if str(meta.get("buildId") or "")!=exp_build: reasons.append("release-build-id-mismatch")
        if str(meta.get("gitBranch") or "")!=exp_branch: reasons.append("source-branch-mismatch")
        if bid.read_text().strip()!=exp_build: reasons.append("build-id-file-mismatch")
        if exp_commit in protected: reasons.append("protected-source-commit")
    if not reasons:
        verify_git_commit(exp_commit)
        tree=snapshot_tree(sd)
        if tree["treeSha256"]!=exp_tree: reasons.append("snapshot-tree-sha-mismatch")
        if tree["bytes"]!=exp_bytes: reasons.append("snapshot-bytes-mismatch")
    if not reasons:
        release=verify_release_manifest(mp,exp_commit,exp_build,exp_branch)
    return {
      "id":entry.get("id"),"backupDir":str(bd),"snapshotDir":str(sd),
      "sourceCommit":exp_commit,"sourceBranch":exp_branch,"buildId":exp_build,
      "eligible":len(reasons)==0,"reasons":reasons,"tree":tree,"release":release
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
    pp=pathlib.Path(args.plan).resolve()
    if not within(pp,COORD_ROOT): fail("plan outside coordination root")
    plan=read_json(pp)
    if plan.get("schemaVersion")!=1 or plan.get("environment")!="DEV" or plan.get("productionAccess")!="DENY": fail("plan invariant failed")
    entries=plan.get("entries")
    if not isinstance(entries,list) or not entries: fail("empty plan")
    protected=active_heads()
    before=disk()
    vals=[validate(e,protected) for e in entries]
    all_ok=all(x["eligible"] for x in vals)
    if args.apply and not all_ok: fail("one or more entries not eligible")
    deleted=[]; reclaimed=0
    if args.apply:
        for x in vals:
            bd=pathlib.Path(x["backupDir"]); sd=pathlib.Path(x["snapshotDir"])
            ev={
              "schemaVersion":1,"status":"PENDING_DELETE","generatedAt":datetime.now(timezone.utc).isoformat(),
              "backupDir":str(bd),"snapshotDir":str(sd),"sourceCommit":x["sourceCommit"],
              "sourceBranch":x["sourceBranch"],"buildId":x["buildId"],"tree":x["tree"],"release":x["release"],
              "guard":{"toolSha256":guard["toolSha256"],"skillSha256":guard["skillSha256"]},
            }
            ep=bd/EVIDENCE_FILE
            ep.write_text(json.dumps(ev,indent=2,ensure_ascii=False)+"\n")
            os.chmod(ep,0o600)
            size=x["tree"]["bytes"]
            shutil.rmtree(sd)
            if sd.exists(): fail("snapshot deletion failed: "+str(sd))
            ev["status"]="RETIRED"
            ev["retiredAt"]=datetime.now(timezone.utc).isoformat()
            ep.write_text(json.dumps(ev,indent=2,ensure_ascii=False)+"\n")
            deleted.append(str(sd)); reclaimed+=size
    after=disk()
    report={
      "schemaVersion":1,"generatedAt":datetime.now(timezone.utc).isoformat(),
      "mode":"APPLY" if args.apply else "DRY_RUN","productionAccess":"DENY",
      "plan":str(pp),"guard":guard,"maintenanceOperation":maintenance,
      "protectedSourceCommits":sorted(protected),"diskBefore":before,"diskAfter":after,
      "allEligible":all_ok,"candidateBytes":sum((x["tree"] or {}).get("bytes",0) for x in vals if x["eligible"]),
      "entries":vals,"actions":{"deletedCount":len(deleted),"deletedPaths":deleted,"reclaimedBytes":reclaimed},
    }
    rp=pathlib.Path(args.report_file).resolve()
    if not within(rp,COORD_ROOT): fail("report outside coordination root")
    rp.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n"); os.chmod(rp,0o600)
    print(json.dumps({"ok":True,"mode":report["mode"],"allEligible":all_ok,"candidateBytes":report["candidateBytes"],"deletedCount":len(deleted),"reclaimedBytes":reclaimed,"report":str(rp)}))

if __name__=="__main__": main()
