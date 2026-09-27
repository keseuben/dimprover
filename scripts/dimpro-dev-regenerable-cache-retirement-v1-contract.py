#!/usr/bin/env python3
import importlib.util, pathlib, tempfile
from unittest.mock import patch

MODULE=pathlib.Path(__file__).with_name('dimpro-dev-regenerable-cache-retirement-v1.py')
spec=importlib.util.spec_from_file_location('regen',MODULE)
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
checks=[]
def check(name,cond):
    if not cond: raise AssertionError(name)
    checks.append(name); print('PASS',name)

with tempfile.TemporaryDirectory(dir='/srv/dimpro-dev') as td:
    root=pathlib.Path(td)/'worktrees'; root.mkdir()
    wt=root/'candidate'; wt.mkdir(); (wt/'.next').mkdir(); (wt/'.next'/'a').write_text('x'); (wt/'package-lock.json').write_text('{}')
    old=m.WORKTREES; m.WORKTREES=root
    class P:
        def __init__(self,out='',rc=0): self.stdout=out; self.stderr=''; self.returncode=rc
    def fake_run(args,check=True):
        s=' '.join(map(str,args))
        if 'rev-parse HEAD' in s:return P('a'*40+'\n')
        if 'branch --show-current' in s:return P('feature/test\n')
        if 'status --porcelain' in s:return P('')
        if 'cat-file -e' in s:return P('',0)
        if args and args[0]=='du':return P('4096 '+str(args[-1])+'\n')
        return P('')
    entry={'id':'x','worktree':str(wt),'paths':['.next']}
    with patch.object(m,'run',side_effect=fake_run), patch.object(m,'running_process_in',return_value=False), patch.object(m,'has_shared_hardlinks',return_value=False):
        r=m.validate(entry,'',set())
        check('clean inactive cache eligible',r['entrySafe'] and r['eligible'] and r['eligibleCacheCount']==1)
        r=m.validate(entry,str(wt),set()); check('pm2 reference blocks whole worktree','pm2-reference' in r['reasons'] and not r['entrySafe'])
        r=m.validate(entry,'',{str(wt.resolve())}); check('Central active worktree blocks','central-active-session' in r['reasons'] and not r['entrySafe'])
    with patch.object(m,'run',side_effect=fake_run), patch.object(m,'running_process_in',return_value=True), patch.object(m,'has_shared_hardlinks',return_value=False):
        r=m.validate(entry,'',set()); check('running process blocks','running-process' in r['reasons'])
    with patch.object(m,'run',side_effect=fake_run), patch.object(m,'running_process_in',return_value=False), patch.object(m,'nginx_references',return_value=['/etc/nginx/test']):
        r=m.validate(entry,'',set()); check('nginx reference blocks','nginx-reference' in r['reasons'])
    with patch.object(m,'run',side_effect=fake_run), patch.object(m,'running_process_in',return_value=False), patch.object(m,'nginx_references',return_value=[]), patch.object(m,'pointer_references',return_value=['pointer']), patch.object(m,'has_shared_hardlinks',return_value=False):
        r=m.validate(entry,'',set()); check('active rollback pointer blocks cache only',r['entrySafe'] and not r['eligible'] and 'active-or-rollback-pointer' in r['caches'][0]['reasons'])
    with patch.object(m,'run',side_effect=fake_run), patch.object(m,'running_process_in',return_value=False), patch.object(m,'has_shared_hardlinks',return_value=True):
        r=m.validate(entry,'',set()); check('shared hardlink blocks cache only',r['entrySafe'] and not r['eligible'] and r['blockedCacheCount']==1 and 'shared-hardlinks' in r['caches'][0]['reasons'])
    bad={'id':'bad','worktree':str(wt),'paths':['node_modules']}
    with patch.object(m,'run',side_effect=fake_run), patch.object(m,'running_process_in',return_value=False), patch.object(m,'has_shared_hardlinks',return_value=False):
        (wt/'node_modules').mkdir(); r=m.validate(bad,'',set()); check('node_modules never allowlisted',r['entrySafe'] and not r['eligible'] and 'cache-path-not-allowlisted' in r['caches'][0]['reasons'])
    def dirty_run(args,check=True):
        p=fake_run(args,check)
        if 'status --porcelain' in ' '.join(map(str,args)): return P(' M app/x\n')
        return p
    with patch.object(m,'run',side_effect=dirty_run), patch.object(m,'running_process_in',return_value=False):
        r=m.validate(entry,'',set()); check('dirty worktree blocks','dirty-worktree' in r['reasons'] and not r['entrySafe'])
    m.WORKTREES=old
print(f'PASS {len(checks)}/{len(checks)}')
