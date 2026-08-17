#!/usr/bin/env node
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}

const key = fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{autoRefreshToken:false,persistSession:false}});
const marker = `DEV-MAP-V1-${Date.now()}`;
const taskId = `dev-task-map-${Date.now().toString(36)}`;
let passed=0;
function check(name,ok,detail=""){if(!ok)throw new Error(`${name}${detail?` :: ${detail}`:""}`);passed++;console.log(`PASS ${String(passed).padStart(2,"0")} ${name}${detail?` :: ${detail}`:""}`);}
const authHeaders={host,"x-dimpro-license-admin-key":key,"content-type":"application/json"};
async function api(path,method="GET",body,auth=true){
  const headers=auth?authHeaders:{host,"content-type":"application/json"};
  const response=await fetch(`${apiBase}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:"no-store"});
  const payload=await response.json().catch(()=>({}));
  return {response,payload};
}
async function cleanup(){
  await db.from("dev_center_audit_events").delete().eq("task_id",taskId);
  await db.from("dev_center_tasks").delete().eq("id",taskId);
}
try{
  const inserted=await db.from("dev_center_tasks").insert({
    id:taskId,project_id:"project_dimprover",repository_id:"repo_dimprover",
    title:`${marker} BENJADMIN Fejlesztési Térkép átsorolási acceptance`,
    description:"A fejlesztési térkép metadata alapú drag and drop besorolását ellenőrzi.",
    status:"queued",priority:50,requested_worker_id:null,assigned_worker_id:null,
    branch_name:"feature/map-fixture",worktree_path:"/srv/dimpro-dev/worktrees/map-fixture",
    scope:[],acceptance:[],created_by:"BENJADMIN development map acceptance",
    metadata:{origin:"DEVELOPMENT_MAP_ACCEPTANCE",productionAccess:"DENY"}
  }).select("*").single();
  check("Task fixture created",!inserted.error&&inserted.data?.id===taskId,inserted.error?.message||taskId);
  const beforeBranch=inserted.data.branch_name,beforeWorktree=inserted.data.worktree_path,beforeProject=inserted.data.project_id;

  let r=await api(`/api/dev/console/development-map/${taskId}`,"PATCH",{nodeId:"benjadmin-console-chat"},false);
  check("Unauthenticated map mutation denied",r.response.status===401,`status=${r.response.status}`);

  r=await api(`/api/dev/console/development-map/${taskId}`,"PATCH",{nodeId:"benjadmin-console-chat",workItem:"Fejlesztési Térkép drag & drop"});
  check("Valid map move succeeds",r.response.status===200&&r.payload?.ok===true,`status=${r.response.status}`);
  check("Placement returns requested node",r.payload?.placement?.nodeId==="benjadmin-console-chat",JSON.stringify(r.payload?.placement));
  check("Physical Git move is false",r.payload?.physicalGitMove===false&&r.payload?.placement?.physicalGitMove===false,JSON.stringify(r.payload));

  const stored=await db.from("dev_center_tasks").select("*").eq("id",taskId).single();
  check("Task metadata persisted",!stored.error&&stored.data?.metadata?.developmentMap?.nodeId==="benjadmin-console-chat",stored.error?.message||JSON.stringify(stored.data?.metadata));
  check("Development context synchronized",stored.data?.metadata?.developmentContext?.mainModule==="BENJADMIN"&&stored.data?.metadata?.developmentContext?.moduleName==="Fejlesztői Konzol"&&stored.data?.metadata?.developmentContext?.submoduleName==="Közös fejlesztői csevegés",JSON.stringify(stored.data?.metadata?.developmentContext));
  check("Work item persisted",stored.data?.metadata?.developmentMap?.workItem==="Fejlesztési Térkép drag & drop");
  check("Project row is not physically moved",stored.data?.project_id===beforeProject,stored.data?.project_id);
  check("Git branch remains unchanged",stored.data?.branch_name===beforeBranch,stored.data?.branch_name);
  check("Worktree remains unchanged",stored.data?.worktree_path===beforeWorktree,stored.data?.worktree_path);

  const audit=await db.from("dev_center_audit_events").select("action,metadata,summary").eq("task_id",taskId).eq("action","TASK_DEVELOPMENT_MAP_MOVED").order("created_at",{ascending:false}).limit(1).maybeSingle();
  check("Map move audit exists",!audit.error&&audit.data?.action==="TASK_DEVELOPMENT_MAP_MOVED",audit.error?.message||JSON.stringify(audit.data));
  check("Map audit denies PROD",audit.data?.metadata?.productionAccess==="DENY",JSON.stringify(audit.data?.metadata));
  check("Map audit records no physical Git move",audit.data?.metadata?.physicalGitMove===false,JSON.stringify(audit.data?.metadata));

  r=await api(`/api/dev/console/development-map/${taskId}`,"PATCH",{nodeId:"does-not-exist"});
  check("Invalid map node fails closed",r.response.status===404,`status=${r.response.status}`);

  r=await api("/api/dev/console/live");
  const liveTask=(r.payload?.live?.tasks||[]).find((item)=>item.id===taskId);
  check("Live snapshot exposes moved task",r.response.status===200&&liveTask?.metadata?.developmentMap?.nodeId==="benjadmin-console-chat",`status=${r.response.status}`);

  console.log(JSON.stringify({ok:true,passed,failed:0,taskId,marker},null,2));
}finally{await cleanup();}
