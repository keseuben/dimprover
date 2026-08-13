import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}
const adminKey=fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const api=process.env.BENJADMIN_API_BASE||"http://127.0.0.1:3100";
const host=process.env.BENJADMIN_HOST||"admin.dev.dimpro.hu";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),service=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if(!url||!service) throw new Error("DEV Supabase env missing");
const db=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
let passed=0,sessionId="";
function check(name,ok,details=""){if(!ok)throw new Error(`${name}: ${details}`);passed+=1;console.log(`PASS ${name}${details?` :: ${details}`:""}`)}
async function jsonFetch(path,options={}){const r=await fetch(`${api}${path}`,options);const p=await r.json().catch(()=>({}));return{r,p}}
async function cleanup(){
 if(!sessionId)return;
 await db.from("dev_center_session_events").delete().eq("session_id",sessionId);
 await db.from("dev_center_audit_events").delete().eq("session_id",sessionId);
 await db.from("dev_center_worker_sessions").delete().eq("id",sessionId);
 await db.from("dev_center_workers").update({status:"ready",updated_at:new Date().toISOString()}).eq("id","worker_vguard");
}
try{
 const unauth=await jsonFetch("/api/dev/ai-worker/tasks/dev-task-not-found/review-run",{method:"POST",headers:{host}});
 check("Review-run admin auth nélkül 401",unauth.r.status===401,`status=${unauth.r.status}`);
 const missing=await jsonFetch("/api/dev/ai-worker/tasks/dev-task-not-found/review-run",{method:"POST",headers:{host,"x-dimpro-license-admin-key":adminKey}});
 check("Hiányzó review task 404",missing.r.status===404&&missing.p?.code==="AI_WORKER_VGUARD_TASK_NOT_FOUND",JSON.stringify({status:missing.r.status,code:missing.p?.code}));

 const opened=await jsonFetch("/api/dev/engine/sessions",{method:"POST",headers:{host,"x-dimpro-license-admin-key":adminKey,"content-type":"application/json"},body:JSON.stringify({openedBy:"acceptance",environmentId:"env_dev",note:"V.Guard review-only acceptance",metadata:{origin:"VGUARD_REVIEW_V13_ACCEPTANCE"}})});
 sessionId=opened.p?.session?.id||"";
 check("Review acceptance session megnyílt",opened.r.status===201&&sessionId,sessionId);
 const assign=await jsonFetch(`/api/dev/engine/sessions/${sessionId}`,{method:"PATCH",headers:{host,"x-dimpro-license-admin-key":adminKey,"content-type":"application/json"},body:JSON.stringify({action:"assign_benai"})});
 check("Ben-AI session koordináció",assign.r.status===200&&assign.p?.session?.handshakeStage==="BENAI_ASSIGNED",JSON.stringify(assign.p?.session||{}));
 const bindWorker=await jsonFetch(`/api/dev/engine/sessions/${sessionId}`,{method:"PATCH",headers:{host,"x-dimpro-license-admin-key":adminKey,"content-type":"application/json"},body:JSON.stringify({action:"bind_worker",workerId:"worker_vguard"})});
 check("V.Guard review worker sessionhöz köthető",bindWorker.r.status===200&&bindWorker.p?.session?.handshakeStage==="WORKER_BOUND",JSON.stringify(bindWorker.p?.session||{}));

 const generic=await jsonFetch(`/api/dev/engine/sessions/${sessionId}`,{method:"PATCH",headers:{host,"x-dimpro-license-admin-key":adminKey,"content-type":"application/json"},body:JSON.stringify({action:"bind_task",taskId:"dev-task-not-found"})});
 check("V.Guard normál bind_task technikailag tiltott",generic.r.status===403&&generic.p?.code==="DEV_CENTER_REVIEW_BINDING_REQUIRED",JSON.stringify({status:generic.r.status,code:generic.p?.code}));
 const reviewBind=await jsonFetch(`/api/dev/engine/sessions/${sessionId}`,{method:"PATCH",headers:{host,"x-dimpro-license-admin-key":adminKey,"content-type":"application/json"},body:JSON.stringify({action:"bind_review_task",taskId:"dev-task-not-found",workerId:"worker_vguard"})});
 check("Review binding külön kapu és hiányzó tasknál 404",reviewBind.r.status===404&&reviewBind.p?.code==="DEV_CENTER_TASK_NOT_FOUND",JSON.stringify({status:reviewBind.r.status,code:reviewBind.p?.code}));
 const directClaim=await jsonFetch("/api/dev/engine/orchestration",{method:"POST",headers:{host,"x-dimpro-license-admin-key":adminKey,"content-type":"application/json"},body:JSON.stringify({action:"claim_task",sessionId,workerId:"worker_vguard",taskId:"dev-task-not-found"})});
 check("V.Guard normál orchestration task claim tiltott",directClaim.r.status===403&&directClaim.p?.code==="EXTERNAL_AI_VGUARD_DIRECT_CLAIM_DENIED",JSON.stringify({status:directClaim.r.status,code:directClaim.p?.code}));
 const close=await jsonFetch(`/api/dev/engine/sessions/${sessionId}`,{method:"PATCH",headers:{host,"x-dimpro-license-admin-key":adminKey,"content-type":"application/json"},body:JSON.stringify({action:"close",reason:"V.Guard acceptance cleanup"})});
 check("Review acceptance session szabályosan zárható",close.r.status===200&&close.p?.session?.status==="closed",JSON.stringify(close.p?.session||{}));
 console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
}finally{await cleanup()}
