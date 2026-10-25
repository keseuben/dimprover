import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const catalog=JSON.parse(fs.readFileSync('config/developer-grid-module-sources.json','utf8'));
const code=ts.transpileModule(fs.readFileSync('app/lib/developer-grid/module-source.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const sandbox={exports:{},require:id=>id==='@/config/developer-grid-module-sources.json'?catalog:id==='./worker-workspace'?{DEVELOPER_WORKER_REPOSITORY:'/test.git'}:require(id)};
vm.runInNewContext(code,sandbox);
const resolve=sandbox.exports.resolveDeveloperGridModuleSource;
const drive=catalog.sources[0],grid=catalog.sources[1],head='a'.repeat(40),old='b'.repeat(40);
let count=0;
async function test(name,fn){await fn();console.log('PASS',++count,name);}
const input={projectId:'project_dimprover',moduleName:'DIMPRO Drive',fallbackHead:old};
function gitFixture({missing=false,wrong=false,fileMissing=false}={}){const calls=[];return {calls,git:async args=>{calls.push(args);if(args[0]==='rev-parse'){if(missing)throw Error('missing');return head;}if(args[0]==='merge-base'){if(wrong)throw Error('not ancestor');return '';}if(args[0]==='cat-file'){if(fileMissing)throw Error('missing');return 'blob';}throw Error('Unexpected git operation '+args[0]);}};}
await test('Drive selects registered branch instead of runtime foundation',async()=>{const f=gitFixture();const r=await resolve(input,f.git);assert.equal(r.head,head);assert.equal(r.branch,drive.branch);assert.equal(r.authority,'MODULE_CATALOG');assert.deepEqual(Array.from(f.calls[0]),['rev-parse','--verify',`refs/heads/${drive.branch}^{commit}`]);});
await test('Existing valid baseline stays pinned when module branch advances',async()=>{const f=gitFixture(),r=await resolve({...input,pinnedHead:drive.minimumCommit},f.git);assert.equal(r.head,drive.minimumCommit);});
await test('Old wrong task cannot silently retarget source',async()=>{await assert.rejects(resolve({...input,pinnedHead:old},gitFixture({wrong:true}).git),e=>e.code==='MODULE_SOURCE_BASELINE_MISMATCH');});
await test('Missing branch blocks without foundation fallback',async()=>{await assert.rejects(resolve(input,gitFixture({missing:true}).git),e=>e.code==='MODULE_SOURCE_BRANCH_MISSING');});
await test('Required module source files must exist',async()=>{await assert.rejects(resolve(input,gitFixture({fileMissing:true}).git),e=>e.code==='MODULE_SOURCE_REQUIRED_FILE_MISSING');});
await test('Exact normalized module alias is accepted',async()=>{const r=await resolve({...input,moduleName:'  DRIVE  '},gitFixture().git);assert.equal(r.branch,drive.branch);});
await test('Prompt text cannot select a module source',async()=>{const r=await resolve({...input,moduleName:'Drive; rm -rf /'},gitFixture().git);assert.equal(r.authority,'GRID_FOUNDATION');assert.equal(r.head,old);});
await test('Other projects do not inherit registered module source',async()=>{const r=await resolve({...input,projectId:'other-project'},gitFixture().git);assert.equal(r.authority,'GRID_FOUNDATION');});
await test('Malformed pinned commit is denied',async()=>{await assert.rejects(resolve({...input,pinnedHead:'HEAD~1'},gitFixture().git),e=>e.code==='MODULE_SOURCE_HEAD_INVALID');});
await test('Grid has independent registered source',async()=>{const r=await resolve({...input,moduleName:'Developer Grid V1'},gitFixture().git);assert.equal(r.branch,grid.branch);});
await test('Source resolver performs read-only Git operations',async()=>{const f=gitFixture();await resolve(input,f.git);assert(f.calls.every(a=>['rev-parse','merge-base','cat-file'].includes(a[0])));});
console.log(JSON.stringify({ok:true,tests:count,scope:'module-source-runtime',productionAccess:'DENY'}));
