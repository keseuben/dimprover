import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink,open,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createScopedSourceCheckpoint} from '../../app/lib/developer-grid/source-checkpoint-git.ts';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(){const root=await mkdtemp(path.join(tmpdir(),'grid113-checkpoint-')),repo=path.join(root,'repo.git'),seed=path.join(root,'seed'),worktree=path.join(root,'task');
 const g=(dir,...args)=>execFileSync('/usr/bin/git',['-C',dir,...args],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 await mkdir(seed);g(seed,'init','-q');g(seed,'config','user.name','Test');g(seed,'config','user.email','test@local');await mkdir(path.join(seed,'components'));await writeFile(path.join(seed,'components/a.ts'),'export const a=1;\r\n');await writeFile(path.join(seed,'components/b.ts'),'export const b=1;\n');g(seed,'add','.');g(seed,'commit','-qm','baseline');g(root,'clone','--bare',seed,repo);g(repo,'worktree','add','-b','worker/outminai/test',worktree,'HEAD');
 const identity={taskId:'task-test',sessionId:'session-test',workerCode:'OUTMINAI',repository:repo,worktree,branch:'worker/outminai/test',head:g(worktree,'rev-parse','HEAD'),reportSha256:'a'.repeat(64),approvalSha256:'b'.repeat(64),paths:['components/a.ts']};
 const options={journalRoot:path.join(root,'journal')};return {root,repo,worktree,identity,options,g,change:()=>writeFile(path.join(worktree,'components/a.ts'),'export const a=2;\r\n')};}
test('scoped checkpoint preserves raw CRLF bytes, adds exactly one commit and replays after index refresh',async()=>{const f=await fixture();await f.change();const before=await readFile(path.join(f.worktree,'components/a.ts'));const a=await createScopedSourceCheckpoint(f.identity,f.options);assert.equal(a.changed,true);assert.equal(a.files[0].sha256,hash(before));assert.equal(f.g(f.worktree,'show','HEAD:components/a.ts'),'export const a=2;');assert.equal(f.g(f.worktree,'rev-list','--count',f.identity.head+'..HEAD'),'1');f.g(f.worktree,'update-index','--refresh');const b=await createScopedSourceCheckpoint(f.identity,f.options);assert.equal(a.head,b.head);assert.deepEqual(await readFile(path.join(f.worktree,'components/a.ts')),before);assert.equal(f.g(f.worktree,'status','--porcelain'),'');});
for(const phase of ['PREPARED','COMMIT_CREATED','REF_UPDATED','INDEX_UPDATED','COMPLETED'])test('interruption at '+phase+' resumes the same commit',async()=>{const f=await fixture();await f.change();let hit=false;await assert.rejects(createScopedSourceCheckpoint(f.identity,{...f.options,afterPhase:p=>{if(p===phase){hit=true;throw Error('simulated interruption');}}}),/simulated interruption/);assert.equal(hit,true);const result=await createScopedSourceCheckpoint(f.identity,f.options);assert.equal(f.g(f.worktree,'rev-list','--count',f.identity.head+'..HEAD'),'1');assert.equal(f.g(f.worktree,'status','--porcelain'),'');assert.equal(result.gitClean,true);});
test('clean task does not create an empty commit',async()=>{const f=await fixture();const r=await createScopedSourceCheckpoint(f.identity,f.options);assert.equal(r.changed,false);assert.equal(f.g(f.worktree,'rev-parse','HEAD'),f.identity.head);});
for(const kind of ['scope','staged','deleted','symlink','whitespace','foreign-lock','authorization'])test('rejects '+kind+' without advancing branch or overwriting content',async()=>{const f=await fixture();await f.change();let opts=f.options;
 if(kind==='scope')await writeFile(path.join(f.worktree,'components/b.ts'),'changed\n');
 if(kind==='staged')f.g(f.worktree,'add','components/a.ts');
 if(kind==='deleted')await rename(path.join(f.worktree,'components/a.ts'),path.join(f.root,'retained-a.ts'));
 if(kind==='symlink'){await symlink(path.join(f.worktree,'components/a.ts'),path.join(f.worktree,'components/link.ts'));f.identity.paths.push('components/link.ts');}
 if(kind==='whitespace')await writeFile(path.join(f.worktree,'components/a.ts'),'bad trailing whitespace  \n');
 if(kind==='foreign-lock'){const lock=f.g(f.worktree,'rev-parse','--git-path','index')+'.lock';await writeFile(path.resolve(f.worktree,lock),'foreign');}
 if(kind==='authorization')opts={...opts,beforeCommit:async()=>{throw Error('lease expired');}};
 await assert.rejects(createScopedSourceCheckpoint(f.identity,opts));assert.equal(f.g(f.worktree,'rev-parse','HEAD'),f.identity.head);
 if(kind==='authorization'){const r=await createScopedSourceCheckpoint(f.identity,f.options);assert.equal(r.changed,true);}
});
test('changed bytes after durable intent cannot be committed by retry',async()=>{const f=await fixture();await f.change();await assert.rejects(createScopedSourceCheckpoint(f.identity,{...f.options,afterPhase:p=>{if(p==='PREPARED')throw Error('stop');}}));await writeFile(path.join(f.worktree,'components/a.ts'),'different\n');await assert.rejects(createScopedSourceCheckpoint(f.identity,f.options),{code:'CHECKPOINT_CONTENT_CHANGED'});assert.equal(f.g(f.worktree,'rev-parse','HEAD'),f.identity.head);});
test('report hash must be SHA256, not a Git hash',async()=>{const f=await fixture();f.identity.reportSha256='a'.repeat(40);await assert.rejects(createScopedSourceCheckpoint(f.identity,f.options),{code:'CHECKPOINT_IDENTITY_INVALID'});});
