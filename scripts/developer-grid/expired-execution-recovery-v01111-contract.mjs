import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const control=require('../../desktop/benjadmin-developer-grid/src/workflow/control.cjs');
const queued={key:'task:session:read:hash',request:{taskId:'task',sessionId:'session',requestId:'read',action:'READ_FILE'}};
const failed={executionRequest:queued,executionBridgeState:'TRANSPORT_RETRY'};
assert.equal(control.executionPending(failed),true);
assert.equal(control.recoverableReadFailure(failed),true,'expired-session read can be abandoned for explicit recovery');
assert.equal(control.recoverableReadFailure({...failed,executionBridgeState:'WAITING_MANUAL_EXECUTION'}),true,'pausing does not trap the operator');
assert.equal(control.recoverableReadFailure(failed,true),false,'in-flight request cannot be discarded');
assert.equal(control.recoverableReadFailure({...failed,pendingExecutionResult:{phase:'EXECUTED'}}),false,'executed result must be reconciled first');
for(const action of ['WRITE_FILE','RUN_DEV_COMMAND'])assert.equal(control.recoverableReadFailure({...failed,executionRequest:{...queued,request:{...queued.request,action}}}),false,'unknown mutation must retain lookup/ACK protection');
assert.equal(control.recoverableReadFailure({...failed,executionBridgeState:'REQUEST_RUNNING'}),false);
assert.equal(control.recoverableReadFailure({...failed,executionHistory:[{key:queued.key,completedAt:'now'}]}),false);
assert.equal(control.executionAllowed({workflowControlModes:{OUTMINAI:'MANUAL'}},'OUTMINAI',{id:'task',sessionId:'session'},failed,'proof','chat','WRITE_FILE'),false,'recovery eligibility does not grant write permission');
const ts=require('typescript');
class GridError extends Error{constructor(message,code,status=500,details){super(message);Object.assign(this,{code,status,details});}}
class EngineError extends Error{constructor(message,code,status=500,details){super(message);Object.assign(this,{code,status,details});}}
assert.equal(new EngineError('expired','DEV_CENTER_SESSION_NOT_READY',403) instanceof GridError,false,'engine and bridge errors have distinct class identities');
let thrown,authorized=true;
const module={exports:{}};
const route=fs.readFileSync(new URL('../../app/api/dev/grid/execution/route.ts',import.meta.url),'utf8');
vm.runInNewContext(ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module.exports,module,Error,require:id=>{
 if(id==='next/server')return {NextResponse:{json:(data,{status})=>Response.json(data,{status})}};
 if(id.endsWith('/chatgrid-device-auth'))return {isChatGridDeviceAuthorized:async()=>authorized};
 if(id.endsWith('/engine-repository'))return {DevCenterEngineError:EngineError};
 if(id.endsWith('/execution-bridge'))return {DeveloperGridExecutionError:GridError,executeDeveloperGridRequest:async()=>{throw thrown;}};
 throw Error(id);
}});
const request={headers:new Headers(),json:async()=>({})};
for(const code of ['DEV_CENTER_SESSION_NOT_READY','DEV_CENTER_SESSION_LEASE_EXPIRED','DEV_CENTER_SCOPE_LOCK_REQUIRED','DEV_CENTER_WORKTREE_LEASE_REQUIRED']){
 thrown=new EngineError('Kapcsolat-helyreállítás szükséges.',code,403);
 const response=await module.exports.POST(request),body=await response.json();assert.equal(response.status,403);assert.equal(body.code,code);assert.equal(body.ok,false);
}
thrown=new Error('unexpected');assert.equal((await module.exports.POST(request)).status,500);
authorized=false;assert.equal((await module.exports.POST(request)).status,401);
console.log('PASS expired-session recovery: readonly abandonment, mutation/result/running guards, no permission escalation, typed engine HTTP errors, auth denial');
