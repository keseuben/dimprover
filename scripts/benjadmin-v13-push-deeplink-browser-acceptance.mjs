import fs from "node:fs";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}
const key=fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const apiBase=process.env.BENJADMIN_API_BASE||"http://127.0.0.1:3100";
const uiBase=process.env.BENJADMIN_UI_BASE||"http://admin.dev.dimpro.hu:3100/admin";
const host=process.env.BENJADMIN_HOST||"admin.dev.dimpro.hu";
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const headers={host,"x-dimpro-license-admin-key":key,"content-type":"application/json"};
const marker=`V13-DEEPLINK-${Date.now()}`; let taskId=""; let browser; let passed=0;
function check(name,ok,detail=""){if(!ok)throw new Error(`${name}: ${detail}`);passed++;console.log(`PASS ${name}${detail?` :: ${detail}`:""}`)}
async function api(path,method="GET",body){const r=await fetch(`${apiBase}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const payload=await r.json().catch(()=>({}));return{response:r,payload}}
async function cleanup(){
  if(browser)await browser.close().catch(()=>{});
  if(!taskId)return;
  const sessions=await db.from("dev_center_worker_sessions").select("id").eq("task_id",taskId);
  for(const s of sessions.data||[]){
    for(const q of [db.from("dev_center_scope_locks").delete().eq("session_id",s.id),db.from("dev_center_worktree_leases").delete().eq("session_id",s.id),db.from("dev_center_session_events").delete().eq("session_id",s.id)])await q;
    await db.from("dev_center_worker_sessions").delete().eq("id",s.id);
  }
  for(const q of [db.from("dev_center_scope_locks").delete().eq("task_id",taskId),db.from("dev_center_worktree_leases").delete().eq("task_id",taskId),db.from("dev_center_live_worklog").delete().eq("task_id",taskId),db.from("dev_center_audit_events").delete().eq("task_id",taskId),db.from("dev_center_task_dependencies").delete().eq("task_id",taskId),db.from("dev_center_conflicts").delete().eq("task_id",taskId)])await q;
  await db.from("dev_center_tasks").delete().eq("id",taskId);
  await db.from("dev_center_workers").update({status:"ready",updated_at:new Date().toISOString()}).in("id",["worker_arminai","worker_jazminai","worker_outminai"]);
}
async function openTask(page){
  await page.goto(`${uiBase}/dev-console?task=${encodeURIComponent(taskId)}`,{waitUntil:"domcontentloaded",timeout:60000});
  await page.waitForSelector(`[data-task-id="${taskId}"][data-focused="true"] [data-testid="benjadmin-task-focus"]`,{timeout:30000});
  await new Promise((resolve)=>setTimeout(resolve,500));
  return page.$eval(`[data-task-id="${taskId}"]`,(node)=>{const r=node.getBoundingClientRect();return{status:node.getAttribute("data-status"),focused:node.getAttribute("data-focused"),text:node.textContent||"",top:r.top,bottom:r.bottom,height:window.innerHeight,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,url:location.href,storedProject:localStorage.getItem("benjadmin-developer-console-project")||""}});
}
try{
  let r=await api("/api/dev/console/messages","POST",{text:`${marker} completed push deep link`,target:"ARMINAI",projectId:"project_dimprover",createTask:true,kind:"INSTRUCTION"});
  taskId=r.payload?.task?.id||""; check("Deep-link fixture task created",r.response.status===201&&Boolean(taskId),taskId);
  r=await api("/api/dev/console/plus-bridge/ARMINAI/next","POST"); check("Deep-link fixture task started",r.response.status===200&&r.payload?.task?.id===taskId,`status=${r.response.status}`);
  r=await api(`/api/dev/console/tasks/${taskId}`,"PATCH",{action:"TESTING"}); check("Deep-link fixture enters TESTING",r.response.status===200&&r.payload?.result?.task?.status==="testing",`status=${r.response.status}`);
  r=await api(`/api/dev/console/tasks/${taskId}`,"PATCH",{action:"COMPLETE",note:`${marker} completed`}); check("Deep-link fixture task completed",r.response.status===200&&r.payload?.result?.task?.status==="completed",`status=${r.response.status}`);

  browser=await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-setuid-sandbox","--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"]});
  const page=await browser.newPage(); await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((k)=>{localStorage.setItem("dimproLicenseAdminKey",k);sessionStorage.setItem("dimproBenjadminSession","active");localStorage.setItem("benjadmin-developer-console-theme","dark");localStorage.setItem("benjadmin-developer-console-project","project_nonexistent")},key);
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  let card=await openTask(page);
  check("Completed task visible from deep link",card.status==="completed"&&card.focused==="true",JSON.stringify(card));
  check("Deep-link focus badge visible",card.text.includes("Értesítésből megnyitva"),card.text);
  check("Deep-link overrides stored project",card.storedProject==="project_dimprover",card.storedProject);
  check("Deep-link query remains in URL",new URL(card.url).searchParams.get("task")===taskId,card.url);
  check("Focused card scrolled into viewport",card.bottom>0&&card.top<card.height,JSON.stringify({top:card.top,bottom:card.bottom,height:card.height}));
  check("Desktop deep-link overflow safe",card.overflow===false,JSON.stringify(card));

  await page.evaluate(()=>{const b=[...document.querySelectorAll("button")].find((node)=>node.textContent?.includes("Összes fejlesztés")); if(!(b instanceof HTMLElement))throw new Error("all projects button missing"); b.click();});
  await page.waitForFunction((id)=>!new URL(location.href).searchParams.has("task")&&!document.querySelector(`[data-task-id="${id}"][data-focused="true"]`),{},taskId);
  const cleared=await page.evaluate(()=>({url:location.href,project:localStorage.getItem("benjadmin-developer-console-project")||"",focused:document.querySelectorAll('[data-focused="true"]').length}));
  check("Manual project navigation clears deep-link query",!new URL(cleared.url).searchParams.has("task")&&cleared.focused===0,JSON.stringify(cleared));

  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  card=await openTask(page);
  check("Mobile deep-link completed task visible",card.status==="completed"&&card.focused==="true",JSON.stringify(card));
  check("Mobile deep-link overflow safe",card.overflow===false,JSON.stringify(card));
  console.log(JSON.stringify({ok:true,passed,failed:0,taskId},null,2));
}finally{await cleanup()}
