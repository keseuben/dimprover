#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const exec = promisify(execFile);
export const TOOLCHAIN_CACHE_ROOT='/srv/dimpro-dev/dependency-cache/grid-test-toolchains';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fail(code,message){throw Object.assign(new Error(message),{code});}
async function realDirectory(p){try{return (await fs.lstat(p)).isDirectory() && !(await fs.lstat(p)).isSymbolicLink();}catch{return false;}}
export async function toolchainIdentity(target){
 const packageBytes=await fs.readFile(path.join(target,'package.json')),lockBytes=await fs.readFile(path.join(target,'package-lock.json'));
 const pkg=JSON.parse(packageBytes),lock=JSON.parse(lockBytes);
 if(!lock.packages?.[''] || !lock.packages['node_modules/typescript']?.version)fail('TOOLCHAIN_LOCK_INVALID','A tesztkörnyezethez teljes npm lockfile és TypeScript szükséges.');
 if(pkg.workspaces || Object.values(lock.packages).some(p=>p.link || /^(file:|link:)/.test(String(p.resolved||''))))fail('TOOLCHAIN_LOCAL_DEPENDENCY_UNSUPPORTED','A megosztott tesztkörnyezet lokális függőséget nem helyezhet át.');
 const identity={schemaVersion:1,packageSha256:sha(packageBytes),lockSha256:sha(lockBytes),nodeAbi:process.versions.modules,platform:process.platform,arch:process.arch,typescriptVersion:lock.packages['node_modules/typescript'].version};
 return {...identity,key:sha(JSON.stringify(identity))};
}
async function toolchainFiles(root){
 const modules=path.join(root,'node_modules');
 if(!await realDirectory(modules))fail('TOOLCHAIN_MODULES_NOT_REAL','A node_modules nem valódi könyvtár.');
 const result={};
 for(const name of ['typescript/bin/tsc','eslint/bin/eslint.js']){
  const file=await fs.realpath(path.join(modules,name));
  if(!file.startsWith((await fs.realpath(modules))+path.sep))fail('TOOLCHAIN_FILE_ESCAPE','A teszteszköz kilép a függőségi könyvtárból.');
  result[name]=sha(await fs.readFile(file));
 }
 for(const name of ['tsc','eslint']){
  const file=await fs.realpath(path.join(modules,'.bin',name));
  if(!file.startsWith((await fs.realpath(modules))+path.sep))fail('TOOLCHAIN_BIN_ESCAPE','A teszteszköz linkje külső fájlra mutat.');
 }
 return result;
}
export async function findPreparedToolchain(target,cacheRoot=TOOLCHAIN_CACHE_ROOT){
 const identity=await toolchainIdentity(target),root=path.join(cacheRoot,identity.key);
 if(!await realDirectory(root))return null;
 let ready;try{ready=JSON.parse(await fs.readFile(path.join(root,'READY.json'),'utf8'));}catch{return null;}
 if(JSON.stringify(ready.identity)!==JSON.stringify(identity))return null;
 if(JSON.stringify(await toolchainIdentity(root))!==JSON.stringify(identity))return null;
 try{if(JSON.stringify(await toolchainFiles(root))!==JSON.stringify(ready.files))return null;}catch{return null;}
 return {root,identity,files:ready.files};
}
export async function prepareToolchain(target,{cacheRoot=TOOLCHAIN_CACHE_ROOT,installer=null,requireStorage=true}={}){
 const identity=await toolchainIdentity(target),existing=await findPreparedToolchain(target,cacheRoot);
 if(existing)return {...existing,reused:true};
 await fs.mkdir(cacheRoot,{recursive:true,mode:0o700});
 if(requireStorage){const disk=await fs.statfs(cacheRoot);const free=disk.bavail*disk.bsize,total=disk.blocks*disk.bsize;if(free<18*1024**3 || free/total<0.1)fail('TOOLCHAIN_STORAGE_BLOCKED','A tesztkörnyezet előkészítése után legalább 15 GiB szabad hely szükséges.');}
 const destination=path.join(cacheRoot,identity.key);
 try{await fs.lstat(destination);fail('TOOLCHAIN_CACHE_NOT_VERIFIED','A meglévő cache nem igazolt; automatikusan nem írható felül.');}catch(e){if(e.code!=='ENOENT')throw e;}
 const staging=await fs.mkdtemp(path.join(cacheRoot,identity.key+'.preparing-'));
 await fs.copyFile(path.join(target,'package.json'),path.join(staging,'package.json'));
 await fs.copyFile(path.join(target,'package-lock.json'),path.join(staging,'package-lock.json'));
 if(installer)await installer(staging);else await exec('/usr/bin/npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:staging,timeout:600000,maxBuffer:2*1024*1024,env:{...process.env,npm_config_ignore_scripts:'true',PUPPETEER_SKIP_DOWNLOAD:'true',DIMPRO_PRODUCTION_ACCESS:'DENY'}});
 if(JSON.stringify(await toolchainIdentity(staging))!==JSON.stringify(identity))fail('TOOLCHAIN_INSTALL_INPUT_CHANGED','A telepítés megváltoztatta a csomagazonosítást.');
 const files=await toolchainFiles(staging);
 await fs.writeFile(path.join(staging,'READY.json'),JSON.stringify({identity,files,preparedAt:new Date().toISOString(),lifecycleScripts:'DISABLED',productionAccess:'DENY'},null,2),{flag:'wx',mode:0o600});
 await fs.rename(staging,destination);
 const verified=await findPreparedToolchain(target,cacheRoot);if(!verified)fail('TOOLCHAIN_CACHE_VERIFY_FAILED','A tesztkörnyezet utóellenőrzése sikertelen.');
 return {...verified,reused:false};
}
async function main(){
 const [action,targetInput]=process.argv.slice(2);if(!['--find-only','--prepare','--prepare-locked'].includes(action)||!targetInput)fail('TOOLCHAIN_ARGUMENTS_INVALID','Használat: task-toolchain.mjs --find-only|--prepare <worktree>');
 const target=await fs.realpath(targetInput);
 if(action==='--find-only'){const result=await findPreparedToolchain(target);if(result)process.stdout.write(result.root+'\n');return;}
 if(os.hostname()!=='dimpro-dev'||!target.startsWith('/srv/dimpro-dev/worktrees/'))fail('TOOLCHAIN_DEV_ONLY','A tesztkörnyezet kizárólag a DEV worktree-khez készíthető elő.');
 if(action==='--prepare'){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const result=await exec('/bin/bash',[path.join(root,'scripts/dimpro-coordinated-operation.sh'),'maintenance','--','/usr/bin/node',fileURLToPath(import.meta.url),'--prepare-locked',target],{timeout:660000,maxBuffer:3*1024*1024,env:{...process.env,DIMPRO_OPERATION_OWNER:'CODEX',DIMPRO_OPERATION_TASK:'GRID_TEST_TOOLCHAIN_PREPARE',DIMPRO_WORKER_CODE:'DEVMINAI',DIMPRO_TASK_TOOLCHAIN_LOCKED:'1'}});
  process.stdout.write(result.stdout);return;
 }
 if(process.env.DIMPRO_TASK_TOOLCHAIN_LOCKED!=='1')fail('TOOLCHAIN_LOCK_REQUIRED','A központi maintenance zár kötelező.');
 const result=await prepareToolchain(target);console.log(JSON.stringify({ok:true,stage:'TASK_TOOLCHAIN_PREPARED',...result,productionAccess:'DENY'}));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(JSON.stringify({ok:false,code:e.code||'TOOLCHAIN_PREPARE_FAILED',error:e.message}));process.exitCode=1;});
