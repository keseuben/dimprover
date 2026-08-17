#!/usr/bin/env node
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
const marker=`V15-TEST-GATE-UI-${Date.now()}`;let taskId="";let browser;let passed=0;
function check(name,ok,detail=""){if(!ok)throw new Error(`${name}: ${detail}`);passed++;console.log(`PASS ${String(passed).padStart(2,"0")} ${name}${detail?` :: ${detail}`:""}`)}
async function api(path,method="GET",body){const r=await fetch(`${apiBase}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const payload=await r.json().catch(()=>({}));return{response:r,payload}}
async function cleanup(){if(browser)await browser.close().catch(()=>{});if(!taskId)return;const ss=await db.from("dev_center_worker_sessions").select("id").eq("task_id",taskId);for(const s of ss.data||[]){for(const q of [db.from("dev_center_scope_locks").delete().eq("session_id",s.id),db.from("dev_center_worktree_leases").delete().eq("session_id",s.id),db.from("dev_center_session_events").delete().eq("session_id",s.id)])await q;await db.from("dev_center_worker_sessions").delete().eq("id",s.id)}for(const q of [db.from("dev_center_scope_locks").delete().eq("task_id",taskId),db.from("dev_center_worktree_leases").delete().eq("task_id",taskId),db.from("dev_center_live_worklog").delete().eq("task_id",taskId),db.from("dev_center_audit_events").delete().eq("task_id",taskId),db.from("dev_center_task_dependencies").delete().eq("task_id",taskId),db.from("dev_center_conflicts").delete().eq("task_id",taskId)])await q;await db.from("dev_center_tasks").delete().eq("id",taskId);await db.from("dev_center_workers").update({status:"ready",updated_at:new Date().toISOString()}).in("id",["worker_arminai","worker_jazminai","worker_outminai"])}
function actions(page){return page.$eval(`#benjadmin-task-${taskId}`,node=>({status:node.getAttribute("data-status"),buttons:[...node.querySelectorAll("button")].map(b=>b.textContent?.trim()||""),text:node.textContent||"",overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}))}
try{
 let r=await api("/api/dev/console/messages","POST",{text:`${marker} testing gate browser`,target:"BENAI",projectId:"project_dimprover",createTask:true,kind:"INSTRUCTION"});taskId=r.payload?.task?.id||"";const workerCode=String(r.payload?.autoRouting?.worker?.code||"");check("Fixture command routed",r.response.status===201&&Boolean(taskId)&&Boolean(workerCode),`${taskId} -> ${workerCode}`);
 r=await api(`/api/dev/console/plus-bridge/${encodeURIComponent(workerCode)}/next`,"POST");check("Fixture pulled to RUNNING",r.response.status===200&&r.payload?.task?.id===taskId&&r.payload?.task?.metadata?.bridgeState==="RUNNING",`status=${r.response.status}`);
 browser=await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-setuid-sandbox","--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"]});const page=await browser.newPage();await page.setBypassServiceWorker(true);await page.evaluateOnNewDocument((k)=>{localStorage.setItem("dimproLicenseAdminKey",k);sessionStorage.setItem("dimproBenjadminSession","active");localStorage.setItem("benjadmin-developer-console-theme","light");localStorage.setItem("benjadmin-developer-console-project","project_dimprover")},key);await page.setViewport({width:1440,height:900,deviceScaleFactor:1});await page.goto(`${uiBase}/dev-console?task=${encodeURIComponent(taskId)}`,{waitUntil:"domcontentloaded",timeout:60000});await page.waitForSelector(`[data-task-id="${taskId}"]`,{timeout:30000});let state=await actions(page);
 check("RUNNING card exposes Hiba action",state.buttons.includes("Hiba"),JSON.stringify(state.buttons));
 check("RUNNING card hides Kész action",!state.buttons.includes("Kész"),JSON.stringify(state.buttons));
 check("RUNNING desktop overflow safe",state.overflow===false,JSON.stringify(state));
 r=await api(`/api/dev/console/tasks/${taskId}`,"PATCH",{action:"RESULT_TO_TESTING",summary:`${marker} ready`,commit:"abcdef1234567",buildId:`V15UI-${Date.now()}`,tests:"browser gate PASS",docs:"264_benjadmin_v15_command_plus_pull_testing_gate_20260817.md",nextStep:"COMPLETE"});check("Combined result enters TESTING",r.response.status===200&&r.payload?.result?.testing?.task?.status==="testing",`status=${r.response.status}`);
 await page.reload({waitUntil:"domcontentloaded",timeout:60000});await page.waitForSelector(`[data-task-id="${taskId}"][data-status="testing"]`,{timeout:30000});state=await actions(page);
 check("TESTING card exposes Kész action",state.buttons.includes("Kész"),JSON.stringify(state.buttons));
 check("TESTING card retains Hiba action",state.buttons.includes("Hiba"),JSON.stringify(state.buttons));
 await page.setViewport({width:390,height:844,deviceScaleFactor:1});await new Promise(resolve=>setTimeout(resolve,250));state=await actions(page);check("Mobile testing gate overflow safe",state.overflow===false,JSON.stringify(state));
 r=await api(`/api/dev/console/tasks/${taskId}`,"PATCH",{action:"COMPLETE",note:`${marker} complete`});check("TESTING fixture completes",r.response.status===200&&r.payload?.result?.task?.status==="completed",`status=${r.response.status}`);
 console.log(JSON.stringify({ok:true,passed,failed:0,taskId,workerCode},null,2));
}finally{await cleanup()}
