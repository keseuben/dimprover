import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('app/lib/developer-grid/task-operation-lock.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const files=new Map(),sandbox={exports:{},process:{pid:100,env:{BENJADMIN_DEVELOPER_GRID_EXECUTION_ROOT:'/test'}},require:id=>id==='node:fs/promises'?{
 mkdir:async()=>{},open:async(file)=>{if(files.has(file))throw Object.assign(Error('busy'),{code:'EEXIST'});files.set(file,'');return {writeFile:async value=>files.set(file,value),close:async()=>{}};},unlink:async file=>files.delete(file)
}:require(id)};
vm.runInNewContext(code,sandbox);const lock=sandbox.exports.withDeveloperGridTaskOperation;
let release;const wait=new Promise(r=>release=r);
const first=lock('task-a',async()=>{await wait;return 42;});
await new Promise(r=>setImmediate(r));
await assert.rejects(lock('task-a',async()=>0),e=>e.code==='EXECUTION_TASK_OPERATION_BUSY');
assert.equal(await lock('task-b',async()=>7),7);release();assert.equal(await first,42);assert.equal(files.size,0);
await assert.rejects(lock('../escape',async()=>0),e=>e.code==='EXECUTION_IDENTITY_INVALID');
await assert.rejects(lock('task-a',async()=>{throw Error('failure');}));assert.equal(files.size,0);
console.log(JSON.stringify({ok:true,tests:5,scope:'shared-lock-runtime-simulation',liveMutation:false}));
