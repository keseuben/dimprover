#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
try{process.loadEnvFile?.(".env.local")}catch{}
const {updateDevEngineTaskDevelopmentMap:move,undoDevEngineTaskDevelopmentMap:undo}=await import("../app/lib/dev-center/engine-repository.ts");
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const id=`map-v2-${Date.now().toString(36)}`;let p=0;
const ok=(n,v)=>{if(!v)throw Error(n);console.log(`PASS ${++p} ${n}`)};
async function clean(){await db.from("dev_center_audit_events").delete().eq("task_id",id);await db.from("dev_center_tasks").delete().eq("id",id)}
try{
 const i=await db.from("dev_center_tasks").insert({id,project_id:"project_dimprover",repository_id:"repo_dimprover",title:"MAP V2 acceptance",description:"DEV-only",status:"testing",priority:50,branch_name:"feature/map-v2",worktree_path:"/srv/dimpro-dev/worktrees/map-v2",scope:[],acceptance:[],created_by:"ARMINAI",metadata:{productionAccess:"DENY"}}).select("*").single();
 ok("fixture",!i.error);
 const physical=[i.data.project_id,i.data.branch_name,i.data.worktree_path].join("|");
 ok("move1",(await move({taskId:id,nodeId:"benjadmin-console-chat",workItem:"first",updatedBy:"ARMINAI"})).placement.nodeId==="benjadmin-console-chat");
 ok("move2",(await move({taskId:id,nodeId:"drive-web",workItem:"second",updatedBy:"ARMINAI"})).placement.nodeId==="drive-web");
 let r=await db.from("dev_center_tasks").select("*").eq("id",id).single();
 ok("history",(r.data.metadata.developmentMapHistory||[]).at(-1)?.nodeId==="benjadmin-console-chat");
 ok("physical unchanged",[r.data.project_id,r.data.branch_name,r.data.worktree_path].join("|")===physical);
 const u=await undo({taskId:id,updatedBy:"ARMINAI"});
 ok("undo",u.undone===true&&u.placement?.nodeId==="benjadmin-console-chat"&&u.physicalGitMove===false);
 r=await db.from("dev_center_tasks").select("metadata").eq("id",id).single();
 ok("history popped",(r.data.metadata.developmentMapHistory||[]).length===1);
 const a=await db.from("dev_center_audit_events").select("metadata").eq("task_id",id).eq("action","TASK_DEVELOPMENT_MAP_UNDONE").limit(1).maybeSingle();
 ok("audit",!a.error&&a.data?.metadata?.productionAccess==="DENY"&&a.data?.metadata?.physicalGitMove===false);
 const bad={...r.data.metadata,developmentMapHistory:[...(r.data.metadata.developmentMapHistory||[]),{nodeId:"removed-node-v2"}]};
 await db.from("dev_center_tasks").update({metadata:bad}).eq("id",id);
 let blocked=false;try{await undo({taskId:id})}catch(e){blocked=e?.code==="DEV_CENTER_DEVELOPMENT_MAP_UNDO_TARGET_INVALID"}ok("invalid target fail closed",blocked);
 await db.from("dev_center_tasks").update({metadata:{...bad,developmentMapHistory:[]}}).eq("id",id);
 blocked=false;try{await undo({taskId:id})}catch(e){blocked=e?.code==="DEV_CENTER_DEVELOPMENT_MAP_UNDO_EMPTY"}ok("empty history fail closed",blocked);
 console.log(JSON.stringify({ok:true,passed:p,failed:0}));
}finally{await clean()}
