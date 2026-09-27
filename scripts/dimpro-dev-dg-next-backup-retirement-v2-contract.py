#!/usr/bin/env python3
import importlib.util, json, pathlib, tempfile
from unittest.mock import patch

P=pathlib.Path(__file__).with_name('dimpro-dev-dg-next-backup-retirement-v2.py')
spec=importlib.util.spec_from_file_location('m',P); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
passed=[]
def check(name,cond):
    if not cond: raise AssertionError(name)
    passed.append(name); print('PASS',name)

with tempfile.TemporaryDirectory(dir='/srv/dimpro-dev') as td:
    root=pathlib.Path(td); old=m.BACKUPS; m.BACKUPS=root
    bd=root/'developer-grid-vtest'; sd=bd/'.next'; sd.mkdir(parents=True)
    meta={'gitCommit':'a'*40,'gitBranch':'feature/benjadmin-grid-test','buildId':'B1'}
    (sd/'.dimpro-release.json').write_text(json.dumps(meta)); (sd/'BUILD_ID').write_text('B1')
    (sd/'standalone').mkdir(); (sd/'standalone'/'x').write_text('hello')
    tr=m.snapshot_tree(sd)
    entry={'id':'x','backupDir':str(bd),'snapshotDir':str(sd),'treeSha256':tr['treeSha256'],'snapshotBytes':tr['bytes'],'fileCount':tr['fileCount']}
    stats={'fileCount':tr['regularFileCount'],'bytes':tr['bytes']}
    with patch.object(m,'verify_git_commit',return_value=None), patch.object(m,'restic_recursive_stats',return_value=stats), patch.object(m,'restic_file_sha',side_effect=lambda snap,p:m.sha_file(pathlib.Path(p))):
        r=m.validate(entry,set(),'snap'); check('verified snapshot eligible',r['eligible'] and not r['reasons'])
        r=m.validate(entry,{'a'*40},'snap'); check('active source commit protected','protected-source-commit' in r['reasons'])
    bad=dict(entry); bad['treeSha256']='0'*64
    with patch.object(m,'verify_git_commit',return_value=None):
        r=m.validate(bad,set(),'snap'); check('tree hash mismatch denied','tree-sha-mismatch' in r['reasons'])
    (sd/'BUILD_ID').write_text('BAD')
    r=m.validate(entry,set(),'snap'); check('build id mismatch denied','build-id-mismatch' in r['reasons'])
    (sd/'BUILD_ID').write_text('B1')
    meta['gitBranch']='feature/not-grid'; (sd/'.dimpro-release.json').write_text(json.dumps(meta))
    r=m.validate(entry,set(),'snap'); check('non Developer Grid branch denied','not-developer-grid-branch' in r['reasons'])
    meta['gitBranch']='feature/benjadmin-grid-test'; (sd/'.dimpro-release.json').write_text(json.dumps(meta))
    tr=m.snapshot_tree(sd); entry.update(treeSha256=tr['treeSha256'],snapshotBytes=tr['bytes'],fileCount=tr['fileCount'])
    wrong={'fileCount':tr['regularFileCount']-1,'bytes':tr['bytes']}
    with patch.object(m,'verify_git_commit',return_value=None), patch.object(m,'restic_recursive_stats',return_value=wrong), patch.object(m,'restic_file_sha',side_effect=lambda snap,p:m.sha_file(pathlib.Path(p))):
        r=m.validate(entry,set(),'snap'); check('offsite recursive mismatch denied','offsite-tree-stats-mismatch' in r['reasons'])
    good={'fileCount':tr['regularFileCount'],'bytes':tr['bytes']}
    with patch.object(m,'verify_git_commit',return_value=None), patch.object(m,'restic_recursive_stats',return_value=good), patch.object(m,'restic_file_sha',return_value='0'*64):
        r=m.validate(entry,set(),'snap'); check('offsite metadata hash mismatch denied','offsite-release-metadata-hash-mismatch' in r['reasons'])
    outside=root.parent/'outside-next'; outside.mkdir(); (outside/'.dimpro-release.json').write_text(json.dumps(meta)); (outside/'BUILD_ID').write_text('B1')
    bad2=dict(entry,snapshotDir=str(outside)); r=m.validate(bad2,set(),'snap'); check('snapshot must stay in backup dir','snapshot-invalid' in r['reasons'])
    m.BACKUPS=old
print(f'PASS {len(passed)}/{len(passed)}')
