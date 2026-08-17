#!/usr/bin/env node
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}
const key=fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const apiBase=process.env.BENJADMIN_API_BASE||"http://127.0.0.1:3100";
const host=process.env.BENJADMIN_HOST||"admin.dev.dimpro.hu";
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const marker=`CONTEXT-PROP-V1-${Date.now()}`; const taskId=`dev-task-context-prop-${Date.now().toString(36)}`; let passed=0;
const headers={host,"x-dimpro-license-admin-key":key,"content-type":"application/json"};
function check(name,ok,detail=""){if(!ok)throw new Error(`${name}${detail?` :: ${detail}`:""}`);passed++;console.log(`PASS ${String(passed).padStart(2,"0")} ${name}${detail?` :: ${detail}`:""}`)}
async function api(path,method="GET",body){const r=await fetch(`${apiBase}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const p=await r.json().catch(()=>({}));return{r,p}}
async function cleanup(){await db.from("dev_center_live_worklog").delete().like("summary",`${marker}%`);await db.from("dev_center_tasks").delete().eq("id",taskId)}
try{
 const ws=await api("/api/dev/terminal-hub/live-workspace"); check("Live Workspace list available",ws.r.status===200&&ws.p?.ok===true&&ws.p.workspaces?.length>0,`status=${ws.r.status}`);
 const workspace=ws.p.workspaces.find(x=>x.plane==="INTERNAL"&&x.path)||ws.p.workspaces.find(x=>x.path); check("Workspace fixture selected",Boolean(workspace?.id&&workspace?.path),JSON.stringify({id:workspace?.id,name:workspace?.name,plane:workspace?.plane}));
 const wr=await db.from("dev_center_workers").select("id,code,name").eq("code","JAZMINAI").maybeSingle(); check("Jazmin worker available",!wr.error&&Boolean(wr.data?.id),wr.error?.message||"");
 const insert=await db.from("dev_center_tasks").insert({id:taskId,project_id:"project_dimprover",repository_id:"repo_dimprover",title:`${marker} Worker Inbox + Live Workspace`,description:"A Worker Inbox és a Live Workspace ugyanazt a strukturált BENJADMIN fejlesztési kontextust és hatfokozatú állapotot mutassa.",status:"in_progress",priority:97,requested_worker_id:wr.data.id,assigned_worker_id:wr.data.id,branch_name:"feature/context-prop-acceptance",worktree_path:workspace.path,scope:[{type:"module",key:"Fejlesztői Konzol"}],acceptance:[],created_by:"ArminAI acceptance",metadata:{origin:"CONTEXT_PROPAGATION_ACCEPTANCE"}}).select("id").single(); check("Task fixture inserted",!insert.error&&insert.data?.id===taskId,insert.error?.message||"");
 const act=await api("/api/dev/console/activity","POST",{workerCode:"JAZMINAI",phase:"test",taskId,projectId:"project_dimprover",summary:`${marker} sync`,detail:"A task fejlesztési kontextusát a worker activity alapján szinkronizálja.",mainModule:"BENJADMIN",moduleName:"Fejlesztői Konzol",submoduleName:"Worker Inbox + Live Workspace",workItem:"Közös fejlesztési kontextus",activityAction:"A Worker Inbox és Live Workspace kontextusmegjelenítését ellenőrzi.",activityNarrative:"A kódmérnök ellenőrzi, hogy a worker activity után a task metadata ugyanazt a modulhierarchiát kapja meg. Ezután a Worker Inbox és a Live Workspace ugyanebből a tartós kontextusból jeleníti meg a 6/4 ELLENŐRZÉS / JAVÍTÁS fázist.",workStageIndex:4,progressPercent:78}); check("Worker activity accepted",act.r.status===201&&act.p?.ok===true,`status=${act.r.status}`);
 const tr=await db.from("dev_center_tasks").select("metadata,updated_at").eq("id",taskId).maybeSingle(); const ctx=tr.data?.metadata?.developmentContext||{}; check("Task metadata context synced",ctx.mainModule==="BENJADMIN"&&ctx.moduleName==="Fejlesztői Konzol"&&ctx.submoduleName==="Worker Inbox + Live Workspace",JSON.stringify(ctx));
 check("Task context stage is 6/4",ctx.workStageIndex===4&&ctx.workStageLabel==="ELLENŐRZÉS / JAVÍTÁS",JSON.stringify({i:ctx.workStageIndex,l:ctx.workStageLabel}));
 check("Task context remains PROD denied",ctx.productionAccess==="DENY",String(ctx.productionAccess));
 const live=await api("/api/dev/console/live"); const liveTask=live.p?.live?.tasks?.find(x=>x.id===taskId); check("Console live carries synced context",live.r.status===200&&liveTask?.metadata?.developmentContext?.workStageIndex===4,`status=${live.r.status}`);
 const wa=await api(`/api/dev/terminal-hub/live-workspace/activity?workspaceId=${encodeURIComponent(workspace.id)}`); check("Live Workspace activity API available",wa.r.status===200&&wa.p?.ok===true,`status=${wa.r.status} code=${wa.p?.code||""}`);
 const worker=wa.p?.activity?.workers?.find(x=>x.taskId===taskId); check("Live Workspace binds fixture task",Boolean(worker),JSON.stringify(wa.p?.activity?.workers?.filter(x=>x.taskId).map(x=>({code:x.code,taskId:x.taskId}))||[]));
 check("Live Workspace carries module hierarchy",worker?.mainModule==="BENJADMIN"&&worker?.moduleName==="Fejlesztői Konzol"&&worker?.submoduleName==="Worker Inbox + Live Workspace",JSON.stringify(worker));
 check("Live Workspace carries 6/4 stage",worker?.workStageIndex===4&&worker?.workStageLabel==="ELLENŐRZÉS / JAVÍTÁS",JSON.stringify({i:worker?.workStageIndex,l:worker?.workStageLabel}));
 console.log(JSON.stringify({ok:true,passed,failed:0,taskId,workspaceId:workspace.id,marker},null,2));
}finally{await cleanup()}
