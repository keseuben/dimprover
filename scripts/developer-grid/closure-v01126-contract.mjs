import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const main=fs.readFileSync(new URL('../../desktop/benjadmin-developer-grid/src/main.cjs',import.meta.url),'utf8');
const start=main.indexOf('async function continueDeveloperGridAutopilot('),end=main.indexOf('\nasync function syncConversationMemoryOnce()',start);
assert(start>=0&&end>start);
let tests=0;
async function check(name,fn){await fn();console.log('PASS',++tests,name);}
function fixture({stage=6,manual=false,pending=false,blocked=false,delivery='PASS_ASSISTED',closeError=false}={}){
 const calls=[],patches=[];
 const task={id:'task',sessionId:'session',bootAckState:'VALIDATED',bootAckCodingAllowed:true,sourceHead:'a'.repeat(40)};
 const context={task,presence:{workStageIndex:stage},session:{id:'session',developmentContext:{devDeliveryTarget:'DRIVE_DEV'}}};
 const box={Error,config:{},workflowControl:{isManual:()=>manual,worker:x=>x,executionPending:()=>pending},unlocked:true,readDeviceToken:()=>true,developerGridAutopilotKeys:new Set(),
 fetchDeveloperGridActiveWork:async()=>({}),authoritativeAutopilotContext:()=>context,
 loadTaskLaunchRecords:()=>({task:{executionPreflightProofSha256:'old-proof',executionWorkflowBlocked:blocked}}),resolvedExecutionProofSha256:()=> 'renewed-proof',
 prepareAutomaticExecutionPreflight:async()=>{calls.push('preflight');return {state:'PREFLIGHT'};},
 syncConversationMemoryForWorker:async()=>{calls.push('memory');},
 developerGridDevDelivery:async({input})=>{assert.equal(input.action,'ADVANCE');assert.equal(input.taskId,'task');assert.equal(input.sessionId,'session');calls.push('delivery');return {status:delivery};},
 closeDeveloperGridWork:async()=>{calls.push('close');if(closeError)throw Error('closure gate denied');return {task:{status:'COMPLETED'},session:{endedAt:'now'}};},
 publishTaskLaunchPatch:(_t,_w,p)=>patches.push(p),send:()=>{},Date};
 vm.createContext(box);vm.runInContext(main.slice(start,end)+';globalThis.run=continueDeveloperGridAutopilot',box);
 return {run:()=>box.run('OUTMINAI','task'),calls,patches};
}
await check('stage 6 with renewed source proof reaches exact delivery and closure without new worker preflight',async()=>{const f=fixture();assert.equal((await f.run()).state,'COMPLETED');assert.deepEqual(f.calls,['memory','delivery','close']);assert.equal(f.patches.at(-1).autopilotError,null);});
await check('every non-PASS delivery blocks closure',async()=>{for(const delivery of ['ROLLED_BACK','BLOCKED','PUBLIC_PENDING_BROWSER','STAGING']){const f=fixture({delivery});assert.equal((await f.run()).state,'DEV_DELIVERY_WAIT');assert(!f.calls.includes('close'));}});
await check('backend closure rejection is retained rather than reporting success',async()=>{const f=fixture({closeError:true});assert.equal((await f.run()).state,'CLOSURE_WAIT');assert.equal(f.patches.at(-1).autopilotError,'closure gate denied');});
await check('manual, pending and blocked execution retain their stop guards',async()=>{for(const opt of [{manual:true},{pending:true},{blocked:true}]){const f=fixture(opt);await f.run();assert.deepEqual(f.calls,[]);}});
await check('source work still requires a preflight after proof renewal',async()=>{for(const stage of [1,2,3,4,5]){const f=fixture({stage});await f.run();assert.deepEqual(f.calls,['preflight']);}});
await check('historical review replay cannot overwrite stage 5/6 state or unknown stage',async()=>{
 const begin=main.indexOf('  const bodyWithInternalReview =',main.indexOf('async function syncConversationMemoryForWorker('));
 const finish=main.indexOf('\n\n  let memory',begin);assert(begin>0&&finish>begin);
 for(const stage of [undefined,0,1,2,3,4,5,6]){let calls=0;const box={capture:{messages:[{role:'ASSISTANT',text:'REVIEW'}]},INTERNAL_REVIEW_REPORT_START:'REVIEW',live:{task:{id:'task'},presence:{workStageIndex:stage}},code:'OUTMINAI',processCapturedInternalReviewReport:async()=>{calls++;}};vm.createContext(box);await vm.runInContext('(async()=>{'+main.slice(begin,finish)+'})()',box);assert.equal(calls,stage===4?1:0);}
});
console.log('CLOSURE_RECOVERY_RUNTIME_PASS',tests);
