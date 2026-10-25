import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=fs.readFileSync('app/lib/dev-center/engine-repository.ts','utf8');
const fragment=source.slice(source.indexOf('export async function retireDevEngineTaskForReplacement('),source.indexOf('export async function finalizeDevEngineTask('));
const compiled=ts.transpileModule(fragment,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
 const data={task:{id:'task-old',status:'in_progress',requestedWorkerId:'worker-ben',claimedBySessionId:'engine-old'},sessions:[{id:'engine-old',task_id:'task-old',worker_id:'worker-ben',status:'closed'}],workers:[{id:'worker-ben',code:'BENAI'}],leases:[{session_id:'engine-old',status:'active'},{session_id:'unrelated',status:'active'}],locks:[{session_id:'engine-old',status:'active'},{session_id:'unrelated',status:'active'}],calls:[]};
 const tables={dev_center_worker_sessions:'sessions',dev_center_workers:'workers',dev_center_worktree_leases:'leases',dev_center_scope_locks:'locks'};
 const client={from(table){const filters=[];let update;const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},neq(k,v){filters.push(r=>r[k]!==v);return q;},update(v){update=v;return q;},async maybeSingle(){const result=await q;return {...result,data:result.data[0]||null};},then(resolve,reject){return Promise.resolve().then(()=>{const rows=data[tables[table]].filter(r=>filters.every(f=>f(r)));if(update){data.calls.push(['update',table,rows.map(r=>r.session_id||r.id)]);rows.forEach(r=>Object.assign(r,update));}return {data:rows,error:null};}).then(resolve,reject);}};return q;},async rpc(name,args){data.calls.push(['rpc',name,args]);data.sessions[0].status='closed';data.leases.filter(r=>r.session_id===args.p_session_id).forEach(r=>r.status='released');data.locks.filter(r=>r.session_id===args.p_session_id).forEach(r=>r.status='released');return {data:{},error:null};}};
 class DevCenterEngineError extends Error{constructor(message,code){super(message);this.code=code;}}
 const sandbox={exports:{},requireClient:async()=>client,getTaskForConsoleControl:async()=>data.task,text:v=>String(v||'').trim(),nowIso:()=>new Date().toISOString(),databaseError:message=>{throw Error(message);},DevCenterEngineError,finalizeDevEngineTask:async input=>{assert.equal(data.leases[0].status,'released');data.calls.push(['finalize',input]);return {ok:true};}};
 vm.runInNewContext(compiled,sandbox);return {data,run:()=>sandbox.exports.retireDevEngineTaskForReplacement({taskId:'task-old',sessionId:'engine-old',workerCode:'BENJAMINAI',nextTaskId:'task-new'})};
}
let count=0;async function test(name,fn){await fn();console.log('PASS',++count,name);}
await test('Closed-session orphan resources are released only for the verified old session',async()=>{const f=fixture();await f.run();assert.equal(f.data.leases[1].status,'active');assert.equal(f.data.locks[1].status,'active');assert(!f.data.calls.some(c=>c[0]==='rpc'));const finished=f.data.calls.at(-1)[1];assert.equal(finished.outcome,'failed');assert.equal(finished.rebalance,false);});
await test('Active-session atomic release runs before finalization',async()=>{const f=fixture();f.data.sessions[0].status='active';await f.run();assert.equal(f.data.calls[0][0],'rpc');assert.equal(f.data.calls[0][2].p_requeue_task,false);assert.equal(f.data.calls.at(-1)[0],'finalize');});
for(const [name,mutate]of [['different session task',d=>d.sessions[0].task_id='other'],['different worker',d=>d.workers[0].code='OUTMINAI'],['changed claim owner',d=>d.task.claimedBySessionId='other'],['completed task',d=>d.task.status='completed'],['another active task session',d=>d.sessions.push({id:'other',task_id:'task-old',status:'active'})]])await test(name+' blocks before mutations',async()=>{const f=fixture();mutate(f.data);await assert.rejects(f.run());assert.equal(f.data.calls.length,0);});
console.log(JSON.stringify({ok:true,tests:count,scope:'engine-retirement-query-simulation',liveMutation:false}));
