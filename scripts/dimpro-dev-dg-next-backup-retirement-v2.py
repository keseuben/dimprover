#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, shutil, subprocess, sys
from datetime import datetime, timezone

DEV=pathlib.Path('/srv/dimpro-dev')
BACKUPS=DEV/'backups'
COORD=DEV/'coordination'
REPO=DEV/'repositories'/'dimprover.git'
SKILL=DEV/'development-library'/'skills'/'dimpro-safe-delete'/'SKILL.md'
DIRECTIVE=COORD/'SAFE_DELETE_SKILL_REQUIRED.md'
EVIDENCE='RETIREMENT_EVIDENCE.json'
APPROVAL_LABEL='Developer Grid offsite-backed next backup retirement V2 SHA-256:'


def fail(msg):
    print('DENY · SAFE_DELETE_PREFLIGHT_FAILED · '+msg,file=sys.stderr)
    raise SystemExit(1)

def sha_file(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()

def read_json(path):
    try:return json.loads(path.read_text())
    except Exception as e: fail(f'invalid JSON {path}: {e}')

def within(path,root):
    try:path.resolve().relative_to(root.resolve()); return True
    except Exception:return False

def run(args,check=True):
    p=subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if check and p.returncode!=0: fail('command failed: '+' '.join(map(str,args))+' · '+p.stderr.strip())
    return p

def restic(args):
    quoted=' '.join(subprocess.list2cmdline([str(x)]) for x in args)
    cmd='source /etc/dimpro-backup/backup.env; export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE RESTIC_CACHE_DIR; restic '+quoted
    return run(['/bin/bash','-lc',cmd]).stdout

def directive_hash(label,text):
    lines=text.splitlines()
    for i,line in enumerate(lines):
        if line.strip()==label and i+1<len(lines):
            value=lines[i+1].strip().lower()
            if len(value)==64 and all(c in '0123456789abcdef' for c in value): return value
    return None

def verify_guard(self_path,apply):
    if not SKILL.is_file() or not DIRECTIVE.is_file(): fail('missing Safe Delete guard')
    text=DIRECTIVE.read_text(); expected=directive_hash('Required SHA-256:',text); actual_skill=sha_file(SKILL)
    if expected!=actual_skill: fail('Safe Delete skill hash mismatch')
    approved=directive_hash(APPROVAL_LABEL,text); actual=sha_file(self_path)
    if apply and approved!=actual: fail('backup retirement tool not approved by directive')
    return {'skillSha256':actual_skill,'toolSha256':actual,'directiveApprovedToolSha256':approved,'toolApproved':approved==actual}

def verify_maintenance(self_path):
    p=COORD/'active-development.json'
    if not p.is_file(): fail('apply requires maintenance lock')
    d=read_json(p)
    if d.get('status')!='running' or d.get('operation')!='maintenance': fail('apply requires running maintenance lock')
    if self_path.name not in str(d.get('command') or ''): fail('maintenance lock not owned by this tool')
    return d

def active_heads():
    heads=set(); state=COORD/'developer-grid'/'state.json'
    if not state.is_file(): fail('missing Central Core state')
    d=read_json(state)
    for s in d.get('sessions',[]):
        if s.get('endedAt'): continue
        h=str((s.get('sourceProvenance') or {}).get('head') or '').strip()
        if h: heads.add(h)
    apps=json.loads(run(['pm2','jlist']).stdout or '[]')
    for a in apps:
        e=a.get('pm2_env') or {}; n=e.get('env') if isinstance(e.get('env'),dict) else {}
        for k in ('DIMPRO_RELEASE_SOURCE_COMMIT','DIMPRO_DEVELOPER_GRID_SOURCE_COMMIT'):
            v=e.get(k) or n.get(k)
            if v: heads.add(str(v))
    return heads

def verify_git_commit(commit):
    if len(commit)!=40 or run(['git','--git-dir='+str(REPO),'cat-file','-e',commit+'^{commit}'],False).returncode!=0:
        fail('source commit missing from canonical repository: '+commit)

def snapshot_tree(snapshot):
    h=hashlib.sha256(); total=0; count=0; regular=0
    for p in sorted(snapshot.rglob('*'),key=lambda x:x.relative_to(snapshot).as_posix()):
        rel=p.relative_to(snapshot).as_posix()
        if p.is_symlink():
            target=p.readlink(); resolved=(p.parent/target).resolve()
            if not within(resolved,snapshot): fail('snapshot contains external symlink: '+str(p))
            h.update(f'L\0{rel}\0{target.as_posix()}\n'.encode()); count+=1; continue
        if p.is_dir(): continue
        if not p.is_file(): fail('unsupported object in snapshot: '+str(p))
        st=p.stat()
        if st.st_nlink>1: fail('snapshot contains shared hardlink: '+str(p))
        fh=sha_file(p); h.update(f'F\0{rel}\0{st.st_size}\0{fh}\n'.encode()); total+=st.st_size; count+=1; regular+=1
    return {'treeSha256':h.hexdigest(),'fileCount':count,'regularFileCount':regular,'bytes':total}

def offsite_snapshot(snapshot_id):
    raw=restic(['snapshots',snapshot_id,'--json'])
    try: data=json.loads(raw)
    except Exception: fail('invalid restic snapshot metadata')
    if not data: fail('offsite snapshot missing')
    s=data[-1]
    if str(s.get('hostname') or '')!='dimpro-dev': fail('offsite snapshot hostname mismatch')
    paths=[str(x) for x in (s.get('paths') or [])]
    target=BACKUPS.resolve()
    covered=False
    for x in paths:
        b=pathlib.Path(x).resolve()
        if target==b or b in target.parents: covered=True
    if not covered: fail('offsite snapshot does not cover backups root')
    return {'id':str(s.get('short_id') or str(s.get('id') or '')[:8]),'time':s.get('time'),'hostname':s.get('hostname'),'tags':s.get('tags') or [],'paths':paths}

def restic_recursive_stats(snapshot_id,path):
    raw=restic(['ls','--recursive','--json',snapshot_id,str(path)])
    files=0; total=0
    for line in raw.splitlines():
        if not line.strip(): continue
        d=json.loads(line)
        if d.get('struct_type')=='node' and d.get('type')=='file':
            files+=1; total+=int(d.get('size') or 0)
    return {'fileCount':files,'bytes':total}

def restic_file_sha(snapshot_id,path):
    cmd='source /etc/dimpro-backup/backup.env; export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE RESTIC_CACHE_DIR; restic dump '+subprocess.list2cmdline([snapshot_id])+ ' ' + subprocess.list2cmdline([str(path)])
    p=subprocess.Popen(['/bin/bash','-lc',cmd],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    h=hashlib.sha256()
    while True:
        b=p.stdout.read(1024*1024)
        if not b: break
        h.update(b)
    err=p.stderr.read().decode(errors='replace'); rc=p.wait()
    if rc!=0: fail('restic dump failed: '+err.strip())
    return h.hexdigest()

def validate(entry,protected,snapshot_id):
    bd=pathlib.Path(entry.get('backupDir') or '').resolve(); sd=pathlib.Path(entry.get('snapshotDir') or '').resolve()
    reasons=[]; exp_tree=str(entry.get('treeSha256') or '').lower(); exp_bytes=int(entry.get('snapshotBytes') or 0); exp_files=int(entry.get('fileCount') or 0)
    if not within(bd,BACKUPS): reasons.append('backup-outside-root')
    if not bd.is_dir(): reasons.append('backup-dir-missing')
    if not sd.is_dir() or not within(sd,bd): reasons.append('snapshot-invalid')
    if not sd.name.startswith('.next'): reasons.append('snapshot-not-next')
    if (bd/EVIDENCE).exists(): reasons.append('already-retired')
    meta_path=sd/'.dimpro-release.json'; build_path=sd/'BUILD_ID'
    if not meta_path.is_file(): reasons.append('release-metadata-missing')
    if not build_path.is_file(): reasons.append('build-id-missing')
    meta=None; tree=None; offsite=None
    if not reasons:
        meta=read_json(meta_path); commit=str(meta.get('gitCommit') or ''); branch=str(meta.get('gitBranch') or ''); build=str(meta.get('buildId') or '')
        if not branch.startswith('feature/benjadmin-grid-'): reasons.append('not-developer-grid-branch')
        if not build or build_path.read_text().strip()!=build: reasons.append('build-id-mismatch')
        if commit in protected: reasons.append('protected-source-commit')
        if not reasons: verify_git_commit(commit)
    if not reasons:
        tree=snapshot_tree(sd)
        if tree['treeSha256']!=exp_tree: reasons.append('tree-sha-mismatch')
        if tree['bytes']!=exp_bytes: reasons.append('snapshot-bytes-mismatch')
        if tree['fileCount']!=exp_files: reasons.append('file-count-mismatch')
    if not reasons:
        stats=restic_recursive_stats(snapshot_id,sd)
        if stats['fileCount']!=tree['regularFileCount'] or stats['bytes']!=tree['bytes']: reasons.append('offsite-tree-stats-mismatch')
        local_meta=sha_file(meta_path); remote_meta=restic_file_sha(snapshot_id,meta_path)
        local_build=sha_file(build_path); remote_build=restic_file_sha(snapshot_id,build_path)
        if local_meta!=remote_meta: reasons.append('offsite-release-metadata-hash-mismatch')
        if local_build!=remote_build: reasons.append('offsite-build-id-hash-mismatch')
        offsite={'recursiveStats':stats,'releaseMetadataSha256':remote_meta,'buildIdSha256':remote_build}
    return {'id':entry.get('id'),'backupDir':str(bd),'snapshotDir':str(sd),'eligible':not reasons,'reasons':reasons,'releaseMetadata':meta,'tree':tree,'offsiteProof':offsite}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--plan',required=True); ap.add_argument('--report-file',required=True); ap.add_argument('--apply',action='store_true'); a=ap.parse_args()
    self_path=pathlib.Path(__file__).resolve(); guard=verify_guard(self_path,a.apply); maintenance=verify_maintenance(self_path) if a.apply else None
    pp=pathlib.Path(a.plan).resolve()
    if not within(pp,COORD): fail('plan outside coordination root')
    plan=read_json(pp)
    if plan.get('schemaVersion')!=2 or plan.get('environment')!='DEV' or plan.get('productionAccess')!='DENY': fail('plan invariant failed')
    snapshot_id=str(plan.get('offsiteSnapshotId') or '').strip()
    if not snapshot_id: fail('offsite snapshot id missing')
    offsite=offsite_snapshot(snapshot_id); protected=active_heads(); entries=plan.get('entries')
    if not isinstance(entries,list) or not entries: fail('empty plan')
    vals=[validate(x,protected,snapshot_id) for x in entries]; all_ok=all(x['eligible'] for x in vals)
    if a.apply and not all_ok: fail('one or more entries not eligible')
    before=shutil.disk_usage(DEV); deleted=[]; reclaimed=0
    if a.apply:
        for x in vals:
            bd=pathlib.Path(x['backupDir']); sd=pathlib.Path(x['snapshotDir'])
            ev={'schemaVersion':2,'status':'PENDING_DELETE','generatedAt':datetime.now(timezone.utc).isoformat(),'snapshotDir':str(sd),'releaseMetadata':x['releaseMetadata'],'tree':x['tree'],'offsiteSnapshot':offsite,'offsiteProof':x['offsiteProof'],'guard':guard}
            ep=bd/EVIDENCE; ep.write_text(json.dumps(ev,indent=2,ensure_ascii=False)+'\n'); os.chmod(ep,0o600)
            size=x['tree']['bytes']; shutil.rmtree(sd)
            if sd.exists(): fail('snapshot deletion failed: '+str(sd))
            ev['status']='RETIRED'; ev['retiredAt']=datetime.now(timezone.utc).isoformat(); ep.write_text(json.dumps(ev,indent=2,ensure_ascii=False)+'\n')
            deleted.append(str(sd)); reclaimed+=size
    after=shutil.disk_usage(DEV)
    report={'schemaVersion':2,'generatedAt':datetime.now(timezone.utc).isoformat(),'mode':'APPLY' if a.apply else 'DRY_RUN','productionAccess':'DENY','plan':str(pp),'guard':guard,'maintenanceOperation':maintenance,'offsiteSnapshot':offsite,'protectedSourceCommits':sorted(protected),'allEligible':all_ok,'candidateBytes':sum((x['tree'] or {}).get('bytes',0) for x in vals if x['eligible']),'entries':vals,'diskBefore':{'freeBytes':before.free},'diskAfter':{'freeBytes':after.free},'actions':{'deletedCount':len(deleted),'deletedPaths':deleted,'reclaimedBytes':reclaimed}}
    rp=pathlib.Path(a.report_file).resolve()
    if not within(rp,COORD): fail('report outside coordination root')
    rp.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n'); os.chmod(rp,0o600)
    print(json.dumps({'ok':True,'mode':report['mode'],'allEligible':all_ok,'candidateBytes':report['candidateBytes'],'deletedCount':len(deleted),'reclaimedBytes':reclaimed,'report':str(rp)}))

if __name__=='__main__': main()
