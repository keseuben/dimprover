import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}
const key=fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const apiBase=process.env.BENJADMIN_API_BASE||"http://127.0.0.1:3100";
const host=process.env.BENJADMIN_HOST||"admin.dev.dimpro.hu";
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const headers={host,"x-dimpro-license-admin-key":key,"content-type":"application/json"};
const marker=`V13-PUSH-${Date.now()}`; const taskIds=[]; let passed=0;
function check(name,ok,detail=""){if(!ok)throw new Error(`${name}: ${detail}`);passed++;console.log(`PASS ${name}${detail?` :: ${detail}`:""}`)}
async function api(path,method="GET",body){const r=await fetch(`${apiBase}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const payload=await r.json().catch(()=>({}));return{response:r,payload}}
async function cleanTask(id){if(!id)return;const ss=await db.from("dev_center_worker_sessions").select("id").eq("task_id",id);for(const s of ss.data||[]){for(const q of [db.from("dev_center_scope_locks").delete().eq("session_id",s.id),db.from("dev_center_worktree_leases").delete().eq("session_id",s.id),db.from("dev_center_session_events").delete().eq("session_id",s.id)])await q;await db.from("dev_center_worker_sessions").delete().eq("id",s.id)}for(const q of [db.from("dev_center_scope_locks").delete().eq("task_id",id),db.from("dev_center_worktree_leases").delete().eq("task_id",id),db.from("dev_center_live_worklog").delete().eq("task_id",id),db.from("dev_center_audit_events").delete().eq("task_id",id),db.from("dev_center_task_dependencies").delete().eq("task_id",id),db.from("dev_center_conflicts").delete().eq("task_id",id)])await q;await db.from("dev_center_tasks").delete().eq("id",id)}
async function cleanup(){for(const id of [...taskIds].reverse())await cleanTask(id);await db.from("dev_center_workers").update({status:"ready",updated_at:new Date().toISOString()}).in("id",["worker_arminai","worker_jazminai","worker_outminai"])}
async function createStarted(label){let r=await api("/api/dev/console/messages","POST",{text:`${marker} ${label}`,target:"ARMINAI",projectId:"project_dimprover",createTask:true,kind:"INSTRUCTION"});const id=r.payload?.task?.id||"";if(id)taskIds.push(id);check(`${label} task created`,r.response.status===201&&Boolean(id),id);r=await api(`/api/dev/console/plus-bridge/ARMINAI/next`,"POST");check(`${label} task started`,r.response.status===200&&r.payload?.task?.id===id,`status=${r.response.status}`);return id}
async function setEta(id,minutes){const row=await db.from("dev_center_tasks").select("metadata").eq("id",id).single();const metadata={...(row.data?.metadata||{}),expectedFinishAt:new Date(Date.now()+minutes*60000).toISOString()};const u=await db.from("dev_center_tasks").update({metadata,updated_at:new Date().toISOString()}).eq("id",id);if(u.error)throw u.error;return metadata.expectedFinishAt}
try{
  const etaTask=await createStarted("ETA");
  const dueAt=await setEta(etaTask,10);
  let r=await api("/api/dev/console/eta-alerts/run","POST",{dryRun:true});
  const dueDetail=(r.payload?.details||[]).find((x)=>x.taskId===etaTask);
  check("ETA endpoint dry-run authorized",r.response.status===200&&r.payload?.ok===true&&r.payload?.dryRun===true,`status=${r.response.status}`);
  check("Due-soon task classified",dueDetail?.kind==="due-soon"&&dueDetail?.result==="DRY_RUN",JSON.stringify(dueDetail));
  let row=await db.from("dev_center_tasks").select("metadata").eq("id",etaTask).single();
  check("Dry-run does not burn due-soon marker",!row.data?.metadata?.etaAlertDueSoonFor,JSON.stringify(row.data?.metadata?.etaAlertDueSoonFor||null));
  await setEta(etaTask,-5);
  r=await api("/api/dev/console/eta-alerts/run","POST",{dryRun:true});
  const overdueDetail=(r.payload?.details||[]).find((x)=>x.taskId===etaTask);
  check("Overdue task classified",overdueDetail?.kind==="overdue"&&overdueDetail?.result==="DRY_RUN",JSON.stringify(overdueDetail));
  row=await db.from("dev_center_tasks").select("metadata").eq("id",etaTask).single();
  check("Dry-run does not burn overdue marker",!row.data?.metadata?.etaAlertOverdueFor,JSON.stringify(row.data?.metadata?.etaAlertOverdueFor||null));
  const push=await api("/api/dev/push/public-key");
  if(Number(push.payload?.subscriptionCount||0)===0){
    r=await api("/api/dev/console/eta-alerts/run","POST",{});
    const noSub=(r.payload?.details||[]).find((x)=>x.taskId===etaTask);
    check("No subscriber path skips delivery",noSub?.result==="NO_SUBSCRIBERS"&&r.payload?.sentTasks===0,JSON.stringify(noSub));
    row=await db.from("dev_center_tasks").select("metadata").eq("id",etaTask).single();
    check("No subscriber path preserves future alert",!row.data?.metadata?.etaAlertOverdueFor,JSON.stringify(row.data?.metadata?.etaAlertOverdueFor||null));
  } else {
    console.log(`PASS Live subscribers present; non-dry send intentionally skipped in acceptance :: count=${push.payload.subscriptionCount}`);passed++;
  }
  r=await api(`/api/dev/console/tasks/${etaTask}`,"PATCH",{action:"COMPLETE",note:`${marker} done`});
  check("First COMPLETE succeeds",r.response.status===200&&r.payload?.result?.alreadyFinalized===false,JSON.stringify(r.payload?.notification||null));
  r=await api(`/api/dev/console/tasks/${etaTask}`,"PATCH",{action:"COMPLETE",note:`${marker} repeat`});
  check("Repeated COMPLETE is idempotent",r.response.status===200&&r.payload?.result?.alreadyFinalized===true,JSON.stringify(r.payload?.result||null));
  check("Repeated COMPLETE push skipped",r.payload?.notification?.skipped===true&&r.payload?.notification?.reason==="ALREADY_FINALIZED",JSON.stringify(r.payload?.notification||null));

  const failTask=await createStarted("FAIL");
  r=await api(`/api/dev/console/tasks/${failTask}`,"PATCH",{action:"FAIL",note:`${marker} failure`});
  check("First FAIL succeeds",r.response.status===200&&r.payload?.result?.alreadyFinalized===false,JSON.stringify(r.payload?.notification||null));
  r=await api(`/api/dev/console/tasks/${failTask}`,"PATCH",{action:"FAIL",note:`${marker} repeat failure`});
  check("Repeated FAIL is idempotent",r.response.status===200&&r.payload?.result?.alreadyFinalized===true,JSON.stringify(r.payload?.result||null));
  check("Repeated FAIL push skipped",r.payload?.notification?.skipped===true&&r.payload?.notification?.reason==="ALREADY_FINALIZED",JSON.stringify(r.payload?.notification||null));
  console.log(JSON.stringify({ok:true,passed,failed:0,etaTask,failTask,dueAt},null,2));
}finally{await cleanup()}
