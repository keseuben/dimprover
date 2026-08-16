import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}
const adminKey=fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const apiBase=process.env.BENJADMIN_API_BASE||"http://127.0.0.1:3100";
const host=process.env.BENJADMIN_HOST||"admin.dev.dimpro.hu";
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const marker=`V13-PULL-${Date.now()}`;
const headers={host,"x-dimpro-license-admin-key":adminKey,"content-type":"application/json"};
let taskId=""; let passed=0;
function check(name,ok,detail=""){if(!ok)throw new Error(`${name}: ${detail}`);passed+=1;console.log(`PASS ${name}${detail?` :: ${detail}`:""}`)}
async function api(path,method="GET",body){const response=await fetch(`${apiBase}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const payload=await response.json().catch(()=>({}));return{response,payload}}
async function cleanup(){
  if(!taskId)return;
  const sessions=await db.from("dev_center_worker_sessions").select("id").eq("task_id",taskId);
  for(const s of sessions.data||[]){
    for(const q of [db.from("dev_center_scope_locks").delete().eq("session_id",s.id),db.from("dev_center_worktree_leases").delete().eq("session_id",s.id),db.from("dev_center_session_events").delete().eq("session_id",s.id)]) await q;
    await db.from("dev_center_worker_sessions").delete().eq("id",s.id);
  }
  for(const q of [db.from("dev_center_scope_locks").delete().eq("task_id",taskId),db.from("dev_center_worktree_leases").delete().eq("task_id",taskId),db.from("dev_center_live_worklog").delete().eq("task_id",taskId),db.from("dev_center_audit_events").delete().eq("task_id",taskId),db.from("dev_center_task_dependencies").delete().eq("task_id",taskId),db.from("dev_center_conflicts").delete().eq("task_id",taskId)]) await q;
  await db.from("dev_center_tasks").delete().eq("id",taskId);
  await db.from("dev_center_workers").update({status:"ready",updated_at:new Date().toISOString()}).in("id",["worker_arminai","worker_jazminai","worker_outminai"]);
}
try{
  let r=await api("/api/dev/console/messages","POST",{text:`${marker} live pull feedback acceptance`,target:"BENAI",projectId:"project_dimprover",createTask:true,kind:"INSTRUCTION"});
  taskId=r.payload?.task?.id||""; const workerCode=String(r.payload?.autoRouting?.worker?.code||"");
  check("AUTO task created and routed",r.response.status===201&&Boolean(taskId)&&Boolean(workerCode),`${taskId} -> ${workerCode}`);
  r=await api(`/api/dev/console/plus-bridge/${workerCode}/next`,"POST");
  const first=r.payload?.task?.metadata||{}; const firstAt=String(first.plusBridgePulledAt||""); const firstSession=String(first.plusBridgeSessionId||"");
  check("First Plus pull succeeds",r.response.status===200&&r.payload?.found===true&&r.payload?.task?.id===taskId,`status=${r.response.status}`);
  check("First pull timestamp persisted in response",/^\d{4}-\d{2}-\d{2}T/.test(firstAt),firstAt);
  check("First pull worker persisted",first.plusBridgeWorkerCode===workerCode&&Boolean(first.plusBridgeWorkerName),JSON.stringify({code:first.plusBridgeWorkerCode,name:first.plusBridgeWorkerName}));
  check("First pull session persisted",Boolean(firstSession)&&firstSession===r.payload?.session?.id,String(firstSession));
  check("First pull count is one",Number(first.plusBridgePullCount)===1,String(first.plusBridgePullCount));
  check("First pull bridge is running",first.plusBridgePullState==="RUNNING"&&first.bridgeState==="RUNNING",JSON.stringify({pull:first.plusBridgePullState,bridge:first.bridgeState}));
  const firstDb=await db.from("dev_center_tasks").select("metadata").eq("id",taskId).single();
  check("DB contains pull metadata",firstDb.data?.metadata?.plusBridgePulledAt===firstAt&&firstDb.data?.metadata?.plusBridgeSessionId===firstSession,JSON.stringify(firstDb.data?.metadata||{}));
  await new Promise((resolve)=>setTimeout(resolve,20));
  r=await api(`/api/dev/console/plus-bridge/${workerCode}/next`,"POST");
  const second=r.payload?.task?.metadata||{}; const secondAt=String(second.plusBridgePulledAt||"");
  check("Repeated Folytasd returns same active task",r.response.status===200&&r.payload?.task?.id===taskId,`status=${r.response.status}`);
  check("Repeated pull count increments",Number(second.plusBridgePullCount)===2,String(second.plusBridgePullCount));
  check("First pull timestamp remains stable",second.plusBridgeFirstPulledAt===first.plusBridgeFirstPulledAt,String(second.plusBridgeFirstPulledAt||""));
  check("Latest pull timestamp advances",Date.parse(secondAt)>=Date.parse(firstAt),`${firstAt} -> ${secondAt}`);
  check("Session remains same on repeated pull",second.plusBridgeSessionId===firstSession,String(second.plusBridgeSessionId||""));
  const audit=await db.from("dev_center_audit_events").select("action,metadata").eq("task_id",taskId).eq("action","TASK_PLUS_BRIDGE_PULLED");
  check("Two pull audits exist",(audit.data||[]).length===2,`count=${(audit.data||[]).length}`);
  check("Pull audits deny PROD",(audit.data||[]).every((x)=>x.metadata?.productionAccess==="DENY"),"");
  const log=await db.from("dev_center_live_worklog").select("metadata").eq("task_id",taskId);
  check("Console worklog carries PLUS_PULL metadata",(log.data||[]).filter((x)=>x.metadata?.action==="PLUS_PULL").length===2,JSON.stringify((log.data||[]).map((x)=>x.metadata?.action)));
  console.log(JSON.stringify({ok:true,passed,failed:0,taskId,workerCode,firstAt,secondAt,sessionId:firstSession},null,2));
}finally{await cleanup()}
