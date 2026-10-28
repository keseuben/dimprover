import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {toolchainIdentity,prepareToolchain,findPreparedToolchain} from './task-toolchain.mjs';

const fixtures=await fs.mkdtemp(path.join(os.tmpdir(),'grid-toolchain115-')),cache=path.join(fixtures,'cache'),target=path.join(fixtures,'target');
await fs.mkdir(target);const pkg={name:'toolchain-fixture',version:'1.0.0',devDependencies:{typescript:'5.0.0',eslint:'9.0.0'}};
const lock={lockfileVersion:3,packages:{'':pkg,'node_modules/typescript':{version:'5.0.0'},'node_modules/eslint':{version:'9.0.0'}}};
await fs.writeFile(path.join(target,'package.json'),JSON.stringify(pkg));await fs.writeFile(path.join(target,'package-lock.json'),JSON.stringify(lock));
let installs=0,tests=0;const pass=s=>{console.log('PASS '+(++tests)+' '+s);};
async function installer(root){installs++;for(const p of ['typescript/bin','eslint/bin','.bin'])await fs.mkdir(path.join(root,'node_modules',p),{recursive:true});await fs.writeFile(path.join(root,'node_modules/typescript/bin/tsc'),'fixture tsc');await fs.writeFile(path.join(root,'node_modules/eslint/bin/eslint.js'),'fixture lint');await fs.symlink('../typescript/bin/tsc',path.join(root,'node_modules/.bin/tsc'));await fs.symlink('../eslint/bin/eslint.js',path.join(root,'node_modules/.bin/eslint'));}
const options={cacheRoot:cache,installer,requireStorage:false};
assert.equal(await findPreparedToolchain(target,cache),null);pass('an unprepared lock has no usable cache');
const before=await toolchainIdentity(target),prepared=await prepareToolchain(target,options);assert.equal(prepared.reused,false);assert.deepEqual(await toolchainIdentity(target),before);pass('preparation preserves exact package and lock bytes');
assert.equal((await findPreparedToolchain(target,cache)).root,prepared.root);assert.equal((await prepareToolchain(target,options)).reused,true);assert.equal(installs,1);pass('verified cache reuses without another installation');
await fs.writeFile(path.join(target,'package.json'),JSON.stringify({...pkg,version:'2.0.0'}));assert.equal(await findPreparedToolchain(target,cache),null);await fs.writeFile(path.join(target,'package.json'),JSON.stringify(pkg));pass('package metadata changes cannot reuse another cache');
await fs.writeFile(path.join(target,'package-lock.json'),JSON.stringify({...lock,packages:{...lock.packages,'node_modules/typescript':{version:'5.1.0'}}}));assert.equal(await findPreparedToolchain(target,cache),null);await fs.writeFile(path.join(target,'package-lock.json'),JSON.stringify(lock));pass('different lock never borrows the Grid toolchain');
const tsc=path.join(prepared.root,'node_modules/typescript/bin/tsc');await fs.writeFile(tsc,'tampered');assert.equal(await findPreparedToolchain(target,cache),null);await assert.rejects(()=>prepareToolchain(target,options),{code:'TOOLCHAIN_CACHE_NOT_VERIFIED'});await fs.writeFile(tsc,'fixture tsc');pass('tampered tools block rather than overwrite the cache');
const bin=path.join(prepared.root,'node_modules/.bin/tsc');await fs.rename(bin,bin+'.saved');await fs.symlink(path.join(target,'package.json'),bin);assert.equal(await findPreparedToolchain(target,cache),null);await fs.rename(bin,bin+'.foreign');await fs.rename(bin+'.saved',bin);pass('external tool links are not accepted');
const localLock={...lock,packages:{...lock.packages,'node_modules/local':{version:'1',resolved:'file:../local'}}};await fs.writeFile(path.join(target,'package-lock.json'),JSON.stringify(localLock));await assert.rejects(()=>toolchainIdentity(target),{code:'TOOLCHAIN_LOCAL_DEPENDENCY_UNSUPPORTED'});await fs.writeFile(path.join(target,'package-lock.json'),JSON.stringify(lock));pass('local dependencies cannot escape the cache boundary');
const failureCache=path.join(fixtures,'failed');await assert.rejects(()=>prepareToolchain(target,{...options,cacheRoot:failureCache,installer:async()=>{throw Error('fixture install failure');}}),/fixture install failure/);assert.equal(await findPreparedToolchain(target,failureCache),null);assert.deepEqual(await toolchainIdentity(target),before);pass('failed installation leaves no READY cache and preserves source');

// Real Git integration: worker creation must use the storage helper and create
// real hardlinks rather than a cross-root node_modules symlink.
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),repo=path.join(fixtures,'canonical.git'),trees=path.join(fixtures,'worktrees'),operator=path.join(trees,'operator'),seed=path.join(fixtures,'seed');await fs.mkdir(trees);
const git=(...args)=>execFileSync('/usr/bin/git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
git('init','--bare','--initial-branch=main',repo);git('clone',repo,seed);git('-C',seed,'config','user.name','Grid fixture');git('-C',seed,'config','user.email','fixture@invalid.local');
await fs.mkdir(path.join(seed,'scripts'),{recursive:true});await fs.copyFile(path.join(sourceRoot,'scripts/dimpro-create-dev-worktree.sh'),path.join(seed,'scripts/dimpro-create-dev-worktree.sh'));await fs.copyFile(path.join(target,'package.json'),path.join(seed,'package.json'));await fs.copyFile(path.join(target,'package-lock.json'),path.join(seed,'package-lock.json'));await fs.writeFile(path.join(seed,'.gitignore'),'node_modules/\n');
git('-C',seed,'add','.');git('-C',seed,'commit','-m','Fixture baseline');const head=git('-C',seed,'rev-parse','HEAD');git('-C',seed,'push','origin','main');git('--git-dir',repo,'worktree','add',operator,'main');await installer(operator);
const original=await fs.readFile(path.join(sourceRoot,'app/lib/developer-grid/worker-workspace.ts'),'utf8');const fixtureModule=path.join(fixtures,'worker-workspace.ts');await fs.writeFile(fixtureModule,original.replace('"/srv/dimpro-dev/repositories/dimprover.git"',JSON.stringify(repo)).replace('"/srv/dimpro-dev/worktrees"',JSON.stringify(trees)));
const oldRoot=process.env.DIMPRO_DEVELOPER_GRID_SOURCE_WORKTREE;process.env.DIMPRO_DEVELOPER_GRID_SOURCE_WORKTREE=operator;
try{
 const api=await import(pathToFileURL(fixtureModule));const input={workerCode:'OUTMINAI',taskId:'dev-task-toolchain115-fixture',baseCommit:head};const workspace=await api.ensureDeveloperWorkerWorkspace(input),modules=path.join(workspace.worktreePath,'node_modules');
 assert.equal((await fs.lstat(modules)).isSymbolicLink(),false);assert.equal((await fs.stat(path.join(modules,'typescript/bin/tsc'))).ino,(await fs.stat(path.join(operator,'node_modules/typescript/bin/tsc'))).ino);assert.equal(git('-C',workspace.worktreePath,'status','--porcelain'),'');pass('real worker creation obtains exact-lock hardlinks through canonical helper');
 assert.equal((await api.ensureDeveloperWorkerWorkspace(input)).reused,true);pass('retry reuses the same clean task workspace');
 await fs.writeFile(path.join(workspace.worktreePath,'uncommitted.txt'),'preserve me');await assert.rejects(()=>api.ensureDeveloperWorkerWorkspace(input),{code:'DEVELOPER_WORKSPACE_EXISTING_MISMATCH'});assert.equal(await fs.readFile(path.join(workspace.worktreePath,'uncommitted.txt'),'utf8'),'preserve me');pass('dirty existing work is preserved without reset or dependency replacement');
}finally{if(oldRoot===undefined)delete process.env.DIMPRO_DEVELOPER_GRID_SOURCE_WORKTREE;else process.env.DIMPRO_DEVELOPER_GRID_SOURCE_WORKTREE=oldRoot;}
console.log(JSON.stringify({ok:true,tests,fixtures,scope:'isolated filesystem and real Git worktrees',liveTaskMutations:0}));
