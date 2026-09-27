#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, shutil, subprocess, sys
from datetime import datetime, timezone

DEV=pathlib.Path('/srv/dimpro-dev')
WORKTREES=DEV/'worktrees'
REPO=DEV/'repositories'/'dimprover.git'
COORD=DEV/'coordination'
SKILL=DEV/'development-library'/'skills'/'dimpro-safe-delete'/'SKILL.md'
DIRECTIVE=COORD/'SAFE_DELETE_SKILL_REQUIRED.md'
APPROVAL_LABEL='Regenerable cache retirement script SHA-256:'


def fail(msg):
    print('DENY · SAFE_DELETE_PREFLIGHT_FAILED · '+msg,file=sys.stderr)
    raise SystemExit(1)

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):
            h.update(b)
    return h.hexdigest()

def read_json(path):
    try:return json.loads(path.read_text())
    except Exception as e: fail(f'invalid JSON {path}: {e}')

def run(args,check=True):
    p=subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if check and p.returncode!=0: fail('command failed: '+' '.join(map(str,args))+' · '+p.stderr.strip())
    return p

def within(path,root):
    try:path.resolve().relative_to(root.resolve()); return True
    except Exception:return False

def dir_size(path):
    p=run(['du','-sx','-B1',str(path)]).stdout.strip().split()
    return int(p[0]) if p else 0

def has_shared_hardlinks(path):
    for base,dirs,files in os.walk(path):
        for name in files:
            try:
                if os.lstat(os.path.join(base,name)).st_nlink>1:return True
            except FileNotFoundError: pass
    return False

def directive_hash(label,text):
    lines=text.splitlines()
    for i,line in enumerate(lines):
        if line.strip()==label and i+1<len(lines):
            value=lines[i+1].strip().lower()
            if len(value)==64 and all(c in '0123456789abcdef' for c in value): return value
    return None

def verify_guard(self_path,apply):
    if not SKILL.is_file() or not DIRECTIVE.is_file(): fail('missing Safe Delete guard')
    txt=DIRECTIVE.read_text()
    expected=directive_hash('Required SHA-256:',txt)
    actual_skill=sha(SKILL)
    if expected!=actual_skill: fail('Safe Delete skill hash mismatch')
    approved=directive_hash(APPROVAL_LABEL,txt)
    actual=sha(self_path)
    if apply and approved!=actual: fail('regenerable-cache tool not approved by directive')
    return {'skillSha256':actual_skill,'toolSha256':actual,'directiveApprovedToolSha256':approved,'toolApproved':approved==actual}

def verify_maintenance(self_path):
    p=COORD/'active-development.json'
    if not p.is_file(): fail('apply requires maintenance lock')
    d=read_json(p)
    if d.get('status')!='running' or d.get('operation')!='maintenance': fail('apply requires running maintenance lock')
    if self_path.name not in str(d.get('command') or ''): fail('maintenance lock not owned by this tool')
    return d

def active_worktrees():
    state=COORD/'developer-grid'/'state.json'
    if not state.is_file(): fail('missing Central Core state')
    d=read_json(state)
    result=set()
    for s in d.get('sessions',[]):
        if s.get('endedAt'): continue
        wt=str((s.get('sourceProvenance') or {}).get('worktree') or '').strip()
        if wt: result.add(str(pathlib.Path(wt).resolve()))
    return result

def pm2_text():
    return run(['pm2','jlist']).stdout

def running_process_in(wt):
    target=str(wt.resolve())
    for cwd in pathlib.Path('/proc').glob('[0-9]*/cwd'):
        try:
            real=str(cwd.resolve())
        except Exception:
            continue
        if real==target or real.startswith(target+os.sep): return True
    return False

def path_covered(required,roots):
    target=pathlib.Path(required).resolve()
    for raw in roots:
        base=pathlib.Path(raw).resolve()
        if target==base or base in target.parents:return True
    return False

def latest_source_backup():
    marker=pathlib.Path('/var/log/dimpro-backup/latest-status.env')
    if not marker.is_file(): fail('missing daily backup marker')
    values={}
    for line in marker.read_text().splitlines():
        if '=' in line:
            k,v=line.split('=',1); values[k]=v
    if not values.get('SNAPSHOT_ID') or not values.get('FINISHED_AT'): fail('invalid daily backup marker')
    try:
        stamp=datetime.fromisoformat(values['FINISHED_AT'].replace('Z','+00:00'))
    except Exception: fail('invalid backup timestamp')
    age=(datetime.now(timezone.utc)-stamp).total_seconds()
    if age<0 or age>36*3600: fail('daily source backup is stale')
    snapid=values['SNAPSHOT_ID']
    cmd='source /etc/dimpro-backup/backup.env; export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE RESTIC_CACHE_DIR; restic snapshots '+snapid+' --json'
    raw=run(['/bin/bash','-lc',cmd]).stdout
    try: snaps=json.loads(raw)
    except Exception: fail('cannot read source-backup snapshot metadata')
    if not snaps: fail('source-backup snapshot not found')
    paths=[str(x) for x in (snaps[-1].get('paths') or [])]
    if not path_covered(WORKTREES,paths): fail('daily source backup does not cover worktrees')
    return {'snapshotId':snapid,'finishedAt':values['FINISHED_AT'],'paths':paths}

def nginx_references(wt):
    root=pathlib.Path('/etc/nginx')
    if not root.exists(): return []
    target=str(wt.resolve()); hits=[]
    for p in root.rglob('*'):
        if not p.is_file() or p.is_symlink(): continue
        try:
            if target in p.read_text(errors='ignore'): hits.append(str(p))
        except Exception: pass
    return hits

def pointer_references(wt,cache):
    names={'active-next-release','rollback-next-release','previous-next-release'}
    hits=[]; target=cache.resolve()
    for p in wt.rglob('*'):
        if p.name not in names or not p.is_file(): continue
        try:
            raw=p.read_text().strip()
            if not raw: continue
            q=pathlib.Path(raw)
            if not q.is_absolute(): q=(p.parent.parent/q).resolve()
            else: q=q.resolve()
            if q==target or q in target.parents or target in q.parents: hits.append(str(p))
        except Exception: pass
    return hits

def allowed_cache(wt,path):
    rel=path.relative_to(wt).as_posix()
    if rel=='.next' or rel.startswith('.next-'): return True
    parts=path.relative_to(wt).parts
    return len(parts)>=3 and parts[0]=='desktop' and parts[-1] in {'dist','dist-dev'}

def validate(entry,pm2,central):
    wt=pathlib.Path(entry.get('worktree') or '').resolve()
    requested=[str(x) for x in (entry.get('paths') or [])]
    reasons=[]
    if not within(wt,WORKTREES) or not wt.is_dir(): reasons.append('invalid-worktree')
    head=''; branch=''; clean=False
    if not reasons:
        head=run(['git','-C',str(wt),'rev-parse','HEAD'],False).stdout.strip()
        branch=run(['git','-C',str(wt),'branch','--show-current'],False).stdout.strip()
        clean=run(['git','-C',str(wt),'status','--porcelain'],False).stdout.strip()==''
        if len(head)!=40: reasons.append('git-head-missing')
        if not branch: reasons.append('detached-head')
        if not clean: reasons.append('dirty-worktree')
        if head and run(['git','--git-dir='+str(REPO),'cat-file','-e',head+'^{commit}'],False).returncode!=0: reasons.append('head-missing-from-canonical-repo')
        if str(wt) in pm2: reasons.append('pm2-reference')
        if str(wt) in central: reasons.append('central-active-session')
        if running_process_in(wt): reasons.append('running-process')
        if nginx_references(wt): reasons.append('nginx-reference')
        active=COORD/'active-development.json'
        if active.is_file():
            op=read_json(active); command=str(op.get('command') or '')
            if str(wt) in command: reasons.append('active-operation')
        if not any((wt/x).is_file() for x in ('package-lock.json','pnpm-lock.yaml','yarn.lock')): reasons.append('lockfile-missing')
    caches=[]
    if not reasons:
        for rel in requested:
            p=(wt/rel).resolve()
            creasons=[]
            if not within(p,wt): creasons.append('cache-outside-worktree')
            elif not allowed_cache(wt,p): creasons.append('cache-path-not-allowlisted')
            elif not p.is_dir(): creasons.append('cache-missing')
            shared=False
            if not creasons:
                refs=pointer_references(wt,p)
                if refs: creasons.append('active-or-rollback-pointer')
            if not creasons:
                shared=has_shared_hardlinks(p)
                if shared: creasons.append('shared-hardlinks')
            caches.append({'path':str(p),'relativePath':rel,'bytes':dir_size(p) if p.is_dir() else 0,'sharedHardlinks':shared,'eligible':not creasons,'reasons':creasons})
    eligible=[x for x in caches if x['eligible']]
    blocked=[x for x in caches if not x['eligible']]
    return {'id':entry.get('id'),'worktree':str(wt),'head':head,'branch':branch,'clean':clean,'entrySafe':not reasons,'eligible':not reasons and bool(eligible),'fullyEligible':not reasons and not blocked,'eligibleCacheCount':len(eligible),'blockedCacheCount':len(blocked),'candidateBytes':sum(x['bytes'] for x in eligible),'blockedBytes':sum(x['bytes'] for x in blocked),'caches':caches,'reasons':reasons}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--plan',required=True)
    ap.add_argument('--report-file',required=True)
    ap.add_argument('--apply',action='store_true')
    args=ap.parse_args()
    self_path=pathlib.Path(__file__).resolve()
    guard=verify_guard(self_path,args.apply)
    maintenance=verify_maintenance(self_path) if args.apply else None
    planp=pathlib.Path(args.plan).resolve()
    if not within(planp,COORD): fail('plan outside coordination root')
    plan=read_json(planp)
    if plan.get('schemaVersion')!=1 or plan.get('environment')!='DEV' or plan.get('productionAccess')!='DENY': fail('plan invariant failed')
    entries=plan.get('entries')
    if not isinstance(entries,list) or not entries: fail('empty plan')
    backup=latest_source_backup()
    pm2=pm2_text(); central=active_worktrees()
    vals=[validate(x,pm2,central) for x in entries]
    entries_safe=all(x['entrySafe'] for x in vals)
    eligible_count=sum(x['eligibleCacheCount'] for x in vals)
    apply_allowed=entries_safe and eligible_count>0
    before=shutil.disk_usage(DEV)
    if args.apply and not entries_safe: fail('one or more worktrees have blockers')
    if args.apply and eligible_count==0: fail('no eligible cache paths')
    deleted=[]; preserved=[]; reclaimed=0
    if args.apply:
        for item in vals:
            for cache in item['caches']:
                p=pathlib.Path(cache['path']).resolve()
                if not cache['eligible']:
                    preserved.append({'path':str(p),'reasons':cache['reasons']}); continue
                if not within(p,pathlib.Path(item['worktree'])): fail('apply target escaped worktree')
                size=cache['bytes']; shutil.rmtree(p)
                if p.exists(): fail('cache deletion failed: '+str(p))
                deleted.append(str(p)); reclaimed+=size
    after=shutil.disk_usage(DEV)
    report={'schemaVersion':1,'generatedAt':datetime.now(timezone.utc).isoformat(),'mode':'APPLY' if args.apply else 'DRY_RUN','productionAccess':'DENY','plan':str(planp),'guard':guard,'maintenanceOperation':maintenance,'sourceBackup':backup,'entriesSafe':entries_safe,'applyAllowed':apply_allowed,'eligibleCacheCount':eligible_count,'blockedCacheCount':sum(x['blockedCacheCount'] for x in vals),'candidateBytes':sum(x['candidateBytes'] for x in vals),'blockedBytes':sum(x['blockedBytes'] for x in vals),'entries':vals,'diskBefore':{'freeBytes':before.free},'diskAfter':{'freeBytes':after.free},'actions':{'deletedCount':len(deleted),'deletedPaths':deleted,'preservedCount':len(preserved),'preserved':preserved,'reclaimedBytes':reclaimed}}
    rp=pathlib.Path(args.report_file).resolve()
    if not within(rp,COORD): fail('report outside coordination root')
    rp.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n'); os.chmod(rp,0o600)
    print(json.dumps({'ok':True,'mode':report['mode'],'entriesSafe':entries_safe,'applyAllowed':apply_allowed,'candidateBytes':report['candidateBytes'],'deletedCount':len(deleted),'reclaimedBytes':reclaimed,'report':str(rp)}))

if __name__=='__main__': main()
