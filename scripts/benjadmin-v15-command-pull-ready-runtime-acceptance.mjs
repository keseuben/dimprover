import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}
const key=fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const apiBase=process.env.BENJADMIN_API_BASE||"http://127.0.0.1:3100";
const host=process.env.BENJADMIN_HOST||"admin.dev.dimpro.hu";
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const headers={host,"x-dimpro-license-admin-key":key,"content-type":"application/json"};
const marker=`V15-COMMAND-PULL-${Date.now()}`;let taskId="";let passed=0;
function check(name,ok,detail=""){if(!ok)throw new Error(`${name}: ${detail}`);passed++;console.log(`PASS ${String(passed).padStart(2,"0")} ${name}${detail?` :: ${detail}`:""}`)}
async function api(path,method="GET",body){const r=await fetch(`${apiBase}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const payload=await r.json().catch(()=>({}));return{response:r,payload}}
async function cleanup(){if(!taskId)return;const ss=await db.from("dev_center_worker_sessions").select("id").eq("task_id",taskId);for(const s of ss.data||[]){for(const q of [db.from("dev_center_scope_locks").delete().eq("session_id",s.id),db.from("dev_center_worktree_leases").delete().eq("session_id",s.id),db.from("dev_center_session_events").delete().eq("session_id",s.id)])await q;await db.from("dev_center_worker_sessions").delete().eq("id",s.id)}for(const q of [db.from("dev_center_scope_locks").delete().eq("task_id",taskId),db.from("dev_center_worktree_leases").delete().eq("task_id",taskId),db.from("dev_center_live_worklog").delete().eq("task_id",taskId),db.from("dev_center_audit_events").delete().eq("task_id",taskId),db.from("dev_center_task_dependencies").delete().eq("task_id",taskId),db.from("dev_center_conflicts").delete().eq("task_id",taskId)])await q;await db.from("dev_center_tasks").delete().eq("id",taskId)}
try{
 let r=await api("/api/dev/console/messages","POST",{text:`${marker} BENJADMIN command to Plus pull`,target:"BENAI",projectId:"project_dimprover",createTask:true,kind:"INSTRUCTION"});
 taskId=r.payload?.task?.id||"";const workerCode=String(r.payload?.autoRouting?.worker?.code||"");const metadata=r.payload?.task?.metadata||{};
 check("Command creates routed task",r.response.status===201&&Boolean(taskId)&&r.payload?.autoRouting?.routed===true,`${taskId} -> ${workerCode}`);
 check("Dispatch is TASK_ASSIGNED",r.payload?.dispatch?.stage==="TASK_ASSIGNED",String(r.payload?.dispatch?.stage));
 check("Dispatch selects routed worker",r.payload?.dispatch?.selectedWorkerCode===workerCode,JSON.stringify({dispatch:r.payload?.dispatch?.selectedWorkerCode,workerCode}));
 check("Dispatch explicitly asks only Folytasd",String(r.payload?.dispatch?.nextStep||"").includes("Folytasd."),String(r.payload?.dispatch?.nextStep||""));
 check("Initial task is READY_FOR_PLUS_PULL",metadata.coordinatorChainState==="READY_FOR_PLUS_PULL"&&metadata.coordinatorChainSource==="BENJADMIN_COMMAND",JSON.stringify({state:metadata.coordinatorChainState,source:metadata.coordinatorChainSource}));
 check("Initial task stores pull-ready timestamp",/^\d{4}-\d{2}-\d{2}T/.test(String(metadata.coordinatorChainPreparedAt||"")),String(metadata.coordinatorChainPreparedAt||""));
 check("Initial task stores routed worker",metadata.coordinatorChainWorkerCode===workerCode&&Boolean(metadata.coordinatorChainWorkerName),JSON.stringify({code:metadata.coordinatorChainWorkerCode,name:metadata.coordinatorChainWorkerName}));
 check("Coordinator worklog exposes plusPullReady",r.payload?.coordinatorMessage?.metadata?.plusPullReady===true&&r.payload?.coordinatorMessage?.metadata?.coordinatorChainState==="READY_FOR_PLUS_PULL",JSON.stringify(r.payload?.coordinatorMessage?.metadata||{}));
 const audit=await db.from("dev_center_audit_events").select("action,metadata").eq("task_id",taskId).eq("action","TASK_BENAI_CHAIN_PREPARED");
 check("Pull-ready audit exists",(audit.data||[]).length===1,`count=${(audit.data||[]).length}`);
 check("Pull-ready audit denies PROD",audit.data?.[0]?.metadata?.productionAccess==="DENY",JSON.stringify(audit.data?.[0]?.metadata||{}));
 r=await api(`/api/dev/console/plus-bridge/${encodeURIComponent(workerCode)}/next`,"POST");const pulled=r.payload?.task?.metadata||{};
 check("Single Folytasd pull gets same task",r.response.status===200&&r.payload?.found===true&&r.payload?.task?.id===taskId,`status=${r.response.status}`);
 check("Single pull auto-starts RUNNING",pulled.bridgeState==="RUNNING"&&pulled.plusBridgePullState==="RUNNING",JSON.stringify({bridge:pulled.bridgeState,pull:pulled.plusBridgePullState}));
 check("Prepared state transitions to PULLED",pulled.coordinatorChainState==="PULLED"&&/^\d{4}-\d{2}-\d{2}T/.test(String(pulled.coordinatorChainPulledAt||"")),JSON.stringify({state:pulled.coordinatorChainState,at:pulled.coordinatorChainPulledAt}));
 check("Plus pull session is created",Boolean(pulled.plusBridgeSessionId)&&pulled.plusBridgeSessionId===r.payload?.session?.id,String(pulled.plusBridgeSessionId||""));
 check("Handoff remains SANITIZED contract",typeof r.payload?.handoff?.prompt==="string"&&r.payload.handoff.prompt.includes("PROD módosítás nincs"),String(r.payload?.handoff?.prompt||"").slice(0,120));
 r=await api(`/api/dev/console/tasks/${taskId}`,"PATCH",{action:"COMPLETE",note:`${marker} premature complete`});
 check("Direct COMPLETE before TESTING denied",r.response.status===409&&r.payload?.code==="DEV_CENTER_TASK_COMPLETE_TESTING_REQUIRED",JSON.stringify({status:r.response.status,code:r.payload?.code}));
 r=await api(`/api/dev/console/tasks/${taskId}`,"PATCH",{action:"RESULT_TO_TESTING",summary:`${marker} implementation ready`,commit:"abcdef1234567",buildId:`V15-${Date.now()}`,tests:"V15 targeted acceptance PASS",docs:"264_benjadmin_v15_command_pull_chain.md",nextStep:"COMPLETE after TESTING"});
 check("Result-to-testing combined action succeeds",r.response.status===200&&r.payload?.result?.testing?.task?.status==="testing",JSON.stringify({status:r.response.status,taskStatus:r.payload?.result?.testing?.task?.status}));
 check("Structured result is preserved in combined action",r.payload?.result?.result?.commit==="abcdef1234567"&&String(r.payload?.result?.result?.tests||"").includes("PASS"),JSON.stringify(r.payload?.result?.result||{}));
 r=await api(`/api/dev/console/tasks/${taskId}`,"PATCH",{action:"COMPLETE",note:`${marker} verified complete`});
 check("COMPLETE succeeds after TESTING",r.response.status===200&&r.payload?.result?.task?.status==="completed",JSON.stringify({status:r.response.status,taskStatus:r.payload?.result?.task?.status}));
 const finalAudit=await db.from("dev_center_audit_events").select("action").eq("task_id",taskId);
 const actions=(finalAudit.data||[]).map((row)=>row.action);
 check("Audit contains result testing and completion",actions.includes("TASK_BRIDGE_RESULT_RECORDED")&&actions.includes("TASK_TESTING")&&actions.includes("TASK_COMPLETED"),JSON.stringify(actions));
 console.log(JSON.stringify({ok:true,passed,failed:0,taskId,workerCode},null,2));
}finally{await cleanup()}
