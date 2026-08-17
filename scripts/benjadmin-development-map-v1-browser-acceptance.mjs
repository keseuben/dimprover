#!/usr/bin/env node
import fs from "node:fs";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}

const key=fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const uiBase=process.env.BENJADMIN_UI_BASE||"http://admin.dev.dimpro.hu:3100/admin";
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const marker=`DEV-MAP-BROWSER-${Date.now()}`;
const normalTaskId=`dev-task-map-ui-${Date.now().toString(36)}`;
const techTaskId=`dev-task-map-tech-${Date.now().toString(36)}`;
let browser,passed=0;
function check(name,ok,detail=""){if(!ok)throw new Error(`${name}${detail?` :: ${detail}`:""}`);passed++;console.log(`PASS ${String(passed).padStart(2,"0")} ${name}${detail?` :: ${detail}`:""}`);}
async function cleanup(){
  if(browser)await browser.close().catch(()=>{});
  await db.from("dev_center_audit_events").delete().in("task_id",[normalTaskId,techTaskId]);
  await db.from("dev_center_tasks").delete().in("id",[normalTaskId,techTaskId]);
}
try{
  const ins=await db.from("dev_center_tasks").insert([
    {id:normalTaskId,project_id:"project_dimprover",repository_id:"repo_dimprover",title:`${marker} BENJADMIN közös fejlesztői csevegés térkép`,description:"Vezetői szintű térképkártya drag and drop átsorolás.",status:"testing",priority:88,requested_worker_id:"worker_arminai",assigned_worker_id:"worker_arminai",branch_name:"feature/map-browser",worktree_path:"/srv/dimpro-dev/worktrees/map-browser",scope:[],acceptance:[],created_by:"map browser acceptance",metadata:{origin:"DEVELOPMENT_MAP_BROWSER",productionAccess:"DENY"}},
    {id:techTaskId,project_id:"project_dimprover",repository_id:"repo_dimprover",title:`${marker} M3 acceptance atomic claim race`,description:"Technikai acceptance fixture.",status:"queued",priority:99,requested_worker_id:null,assigned_worker_id:null,branch_name:null,worktree_path:null,scope:[],acceptance:[],created_by:"map browser acceptance",metadata:{origin:"DEVELOPMENT_MAP_BROWSER",productionAccess:"DENY"}}
  ]).select("id");
  check("Browser fixtures created",!ins.error&&(ins.data||[]).length===2,ins.error?.message||"");

  browser=await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-setuid-sandbox","--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"]});
  const page=await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((adminKey)=>{localStorage.setItem("dimproLicenseAdminKey",adminKey);sessionStorage.setItem("dimproBenjadminSession","active");localStorage.setItem("benjadmin-developer-console-theme","light");localStorage.setItem("benjadmin-developer-console-project","project_dimprover");},key);
  await page.setViewport({width:1536,height:900,deviceScaleFactor:1});
  await page.goto(`${uiBase}/dev-console`,{waitUntil:"domcontentloaded",timeout:60000});
  await page.waitForSelector('[data-testid="benjadmin-developer-console"]',{timeout:30000});
  await page.waitForFunction((m)=>document.body.textContent?.includes(m),{timeout:30000},marker);

  const rail=await page.evaluate((m,normalId,techId)=>{
    const compact=document.querySelector('[data-testid="benjadmin-compact-development-map"]');
    return {text:compact?.textContent||"",heading:document.body.textContent?.includes("AKTÍV FEJLESZTÉSEK")||false,normal:Boolean(compact?.querySelector(`[data-map-task="${normalId}"]`)),tech:Boolean(compact?.querySelector(`[data-map-task="${techId}"]`)),mapButton:Boolean(document.querySelector('[data-testid="benjadmin-open-development-map"]')),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};
  },marker,normalTaskId,techTaskId);
  check("Compact development map replaces raw task rail",rail.heading&&rail.mapButton,JSON.stringify(rail));
  check("Normal development appears in compact rail",rail.normal,JSON.stringify(rail));
  check("Technical acceptance task hidden from compact rail",!rail.tech,JSON.stringify(rail));
  check("Compact rail shows six-stage status",rail.text.includes("6/3")&&rail.text.includes("TESZTELÉS"),rail.text);
  check("Console desktop has no horizontal overflow",rail.overflow===false,JSON.stringify(rail));

  const mapPage=await browser.newPage();
  await mapPage.setBypassServiceWorker(true);
  await mapPage.evaluateOnNewDocument((adminKey)=>{localStorage.setItem("dimproLicenseAdminKey",adminKey);sessionStorage.setItem("dimproBenjadminSession","active");},key);
  await mapPage.setViewport({width:1536,height:900,deviceScaleFactor:1});
  await mapPage.goto(`${uiBase}/dev-map`,{waitUntil:"domcontentloaded",timeout:60000});
  await mapPage.waitForSelector('[data-testid="benjadmin-development-map"]',{timeout:30000});
  await mapPage.waitForFunction((id)=>Boolean(document.querySelector(`[data-development-map-task="${id}"]`)),{timeout:30000},normalTaskId);
  const desktop=await mapPage.evaluate((id)=>({
    columns:Boolean(document.querySelector('[data-testid="benjadmin-development-map-columns"]')),
    source:Boolean(document.querySelector('[data-testid="benjadmin-development-map-source"]')),
    targets:Boolean(document.querySelector('[data-testid="benjadmin-development-map-targets"]')),
    draggable:(document.querySelector(`[data-development-map-task="${id}"]`)?.getAttribute("draggable")||"")!=="false",
    target:Boolean(document.querySelector('[data-development-map-node="drive-web"]')),
    hierarchy:(document.body.textContent||"").includes("Belső fejlesztési platform")&&(document.body.textContent||"").includes("DIMPRO Drive")&&(document.body.textContent||"").includes("DIMPRO Drop"),
    overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
  }),normalTaskId);
  check("Full map renders two-column source and targets",desktop.columns&&desktop.source&&desktop.targets,JSON.stringify(desktop));
  check("Full map renders project hierarchy",desktop.hierarchy&&desktop.target,JSON.stringify(desktop));
  check("Development card is draggable",desktop.draggable,JSON.stringify(desktop));
  check("Full map desktop overflow safe",desktop.overflow===false,JSON.stringify(desktop));

  await mapPage.evaluate((taskId)=>{
    const source=document.querySelector(`[data-development-map-task="${taskId}"]`);
    const target=document.querySelector('[data-development-map-node="drive-web"]');
    if(!source||!target)throw new Error("drag fixture missing");
    const dt=new DataTransfer();
    dt.setData("text/benjadmin-task-id",taskId);
    source.dispatchEvent(new DragEvent("dragstart",{bubbles:true,cancelable:true,dataTransfer:dt}));
    target.dispatchEvent(new DragEvent("dragover",{bubbles:true,cancelable:true,dataTransfer:dt}));
    target.dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:dt}));
  },normalTaskId);
  await mapPage.waitForFunction((id)=>{const n=document.querySelector('[data-development-map-node="drive-web"]');return Boolean(n?.querySelector(`[data-development-map-task="${id}"]`));},{timeout:15000},normalTaskId);
  check("Drag and drop moves card to target module",true);

  const stored=await db.from("dev_center_tasks").select("project_id,branch_name,worktree_path,metadata").eq("id",normalTaskId).single();
  check("Drag persists Drive map placement",!stored.error&&stored.data?.metadata?.developmentMap?.nodeId==="drive-web",stored.error?.message||JSON.stringify(stored.data?.metadata));
  check("Drag does not move physical project/branch/worktree",stored.data?.project_id==="project_dimprover"&&stored.data?.branch_name==="feature/map-browser"&&stored.data?.worktree_path==="/srv/dimpro-dev/worktrees/map-browser",JSON.stringify(stored.data));

  await mapPage.setViewport({width:390,height:844,deviceScaleFactor:1});
  await new Promise(r=>setTimeout(r,300));
  const mobile=await mapPage.evaluate(()=>({visible:Boolean(document.querySelector("[data-testid=\"benjadmin-development-map\"]")),source:Boolean(document.querySelector("[data-testid=\"benjadmin-development-map-source\"]")),targets:Boolean(document.querySelector("[data-testid=\"benjadmin-development-map-targets\"]")),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}));
  check("Mobile map keeps both logical columns available",mobile.visible&&mobile.source&&mobile.targets,JSON.stringify(mobile));
  check("Mobile map has no horizontal overflow",mobile.overflow===false,JSON.stringify(mobile));

  console.log(JSON.stringify({ok:true,passed,failed:0,normalTaskId,techTaskId,marker},null,2));
}finally{await cleanup();}
