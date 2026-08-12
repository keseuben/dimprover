import fs from "node:fs";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
try { process.loadEnvFile?.(".env.local"); } catch {}
const adminKey=fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const apiBase=process.env.BENJADMIN_API_BASE||"http://127.0.0.1:3100"; const host=process.env.BENJADMIN_HOST||"admin.dev.dimpro.hu";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(), service=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(); if(!url||!service)throw new Error("DEV Supabase env missing");
const db=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
let taskId="",passed=0; const marker=`EXT-AI-V10-${Date.now()}`;
function check(name,ok,detail=""){if(!ok)throw new Error(`${name}: ${detail}`);passed+=1;console.log(`PASS ${name}${detail?` :: ${detail}`:""}`)}
async function api(path,init={}){const r=await fetch(`${apiBase}${path}`,{...init,headers:{host,"x-dimpro-license-admin-key":adminKey,...(init.headers||{})}});const p=await r.json().catch(()=>({}));return{r,p}}
async function cleanup(){if(!taskId)return;for(const q of [db.from("dev_center_scope_locks").delete().eq("task_id",taskId),db.from("dev_center_live_worklog").delete().eq("task_id",taskId),db.from("dev_center_audit_events").delete().eq("task_id",taskId),db.from("dev_center_task_dependencies").delete().eq("task_id",taskId)]){const x=await q;if(x.error)console.error(`CLEANUP WARN ${x.error.message}`);}const t=await db.from("dev_center_tasks").delete().eq("id",taskId);if(t.error)console.error(`CLEANUP WARN task ${t.error.message}`);}
try{
 const get=await api("/api/dev/ai-worker/tasks");
 check("AI Worker GET 200",get.r.status===200&&get.p?.ok===true,`status=${get.r.status}`);
 check("M.Forge és V.Guard profil elérhető",(get.p.workers||[]).some(w=>w.code==="MFORGE"&&w.personName==="Márk")&&(get.p.workers||[]).some(w=>w.code==="VGUARD"&&w.personName==="Viktória"),JSON.stringify(get.p.workers||[]));
 check("V1 alapkeretek a specifikáció szerintiek",get.p.defaults?.taskBudgetHuf===2500&&get.p.defaults?.forgeBudgetHuf===1500&&get.p.defaults?.guardBudgetHuf===1000&&get.p.defaults?.maxActiveMinutesPerWorker===45&&get.p.defaults?.maxFixRounds===2,JSON.stringify(get.p.defaults||{}));
 check("V1.0 mock adapter nem külső provider",get.p.adapter?.ready===true&&/mock adapter/i.test(get.p.adapter?.detail||""),JSON.stringify(get.p.adapter||{}));
 const forgeMeta=await sharp("public/benjadmin/team/06_M_ForgeAI.webp").metadata(); const guardMeta=await sharp("public/benjadmin/team/07_V_GuardAI.webp").metadata();
 check("M.Forge és V.Guard HQ forrásasset 768×768",forgeMeta.width===768&&forgeMeta.height===768&&guardMeta.width===768&&guardMeta.height===768,JSON.stringify({forge:[forgeMeta.width,forgeMeta.height],guard:[guardMeta.width,guardMeta.height]}));
 const created=await api("/api/dev/ai-worker/tasks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId:"project_dimprover",title:marker,goal:"A Projektkapuban legyen egy egyszerű, terméknyelvű tesztfunkció. Ez acceptance fixture, tényleges kódmódosítás nem indul.",moduleHint:"Projektkapu",launchMode:"WORKER",modelPreference:"AUTO",taskBudgetHuf:2500,maxActiveMinutesPerWorker:45})});
 taskId=created.p?.task?.id||"";
 check("Egyszerű terméknyelvű task fájl/mappa nélkül létrejön",created.r.status===201&&created.p?.ok===true&&Boolean(taskId),JSON.stringify({status:created.r.status,id:taskId}));
 const row=await db.from("dev_center_tasks").select("id,project_id,repository_id,status,scope,metadata").eq("id",taskId).single();
 check("Task közös repo_dimprover repositoryhoz kötött",!row.error&&row.data?.repository_id==="repo_dimprover"&&row.data?.project_id==="project_dimprover",JSON.stringify(row.data||{}));
 check("Technikai scope felhasználói kiválasztás nélkül AUTO",row.data?.metadata?.technicalScopeMode==="AUTO_BENJADMIN"&&row.data?.metadata?.scopeUserSelectionRequired===false&&Array.isArray(row.data?.scope)&&row.data.scope.length===0,JSON.stringify({scope:row.data?.scope,metadata:row.data?.metadata}));
 check("PROD hozzáférés metadata szinten DENY",row.data?.metadata?.productionAccess==="DENY"&&row.data?.metadata?.providerExecutionEnabled===false,JSON.stringify(row.data?.metadata||{}));
 check("Normatív V2 és avatar resource hash rögzített",row.data?.metadata?.sourceDocument?.sha256==="7d60b8a9a2930aa4e41e239d2df878ed6b3a5445a1bd51d0eae13e4c63b9e149"&&row.data?.metadata?.avatarResource?.sha256==="100032cd10a4664e85d8d36bd6b95aae92cab2ce40275119fb3791af968bd748",JSON.stringify(row.data?.metadata||{}));
 const ready=await api(`/api/dev/ai-worker/tasks/${encodeURIComponent(taskId)}/transition`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({state:"READY"})});
 check("DRAFT -> READY biztonságos V1.0 átmenet",ready.r.status===200&&ready.p?.to==="READY",JSON.stringify(ready.p));
 const preflight=await api(`/api/dev/ai-worker/tasks/${encodeURIComponent(taskId)}/transition`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({state:"PREFLIGHT"})});
 check("PREFLIGHT V1.1 előtt fail-closed",preflight.r.status===409&&/V1\.1\+/.test(preflight.p?.error||""),JSON.stringify(preflight.p));
 const paused=await api(`/api/dev/ai-worker/tasks/${encodeURIComponent(taskId)}/transition`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({state:"PAUSED"})});
 check("READY -> PAUSED V1.0 kontroll működik",paused.r.status===200&&paused.p?.to==="PAUSED",JSON.stringify(paused.p));

 const browser=await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-setuid-sandbox","--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"]});
 try{
  const page=await browser.newPage();await page.setBypassServiceWorker(true);await page.evaluateOnNewDocument(k=>{localStorage.setItem("dimproLicenseAdminKey",k);sessionStorage.setItem("dimproBenjadminSession","active");},adminKey);await page.setViewport({width:1366,height:768});await page.goto("http://admin.dev.dimpro.hu:3100/admin/dev-console",{waitUntil:"domcontentloaded",timeout:60000});await page.waitForSelector('[data-testid="benjadmin-developer-console"]',{timeout:30000});
  const buttons=await page.$$('button');let clicked=false;for(const b of buttons){const txt=await page.evaluate(el=>el.textContent||"",b);if(txt.includes("AI Workerek")){await b.click();clicked=true;break;}}
  check("AI Workerek topbar gomb látható",clicked);
  await page.waitForSelector('aside[aria-label="Külső AI Worker V1"]',{timeout:10000});await new Promise(r=>setTimeout(r,500));
  const ui=await page.evaluate(()=>({text:document.querySelector('aside[aria-label="Külső AI Worker V1"]')?.textContent||"",imgs:Array.from(document.querySelectorAll('aside[aria-label="Külső AI Worker V1"] img')).map(img=>({src:img.getAttribute('src')||'',nw:img.naturalWidth,nh:img.naturalHeight})),sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
  check("M.Forge és V.Guard UI név látható",ui.text.includes("M.Forge-AI")&&ui.text.includes("V.Guard-AI"),ui.text.slice(0,500));
  check("Két HQ worker avatar forrása renderelődik a drawerben",ui.imgs.some(x=>x.src.includes("06_M_ForgeAI"))&&ui.imgs.some(x=>x.src.includes("07_V_GuardAI")),JSON.stringify(ui.imgs));
  check("Felhasználói űrlap terméknyelvű és nincs kötelező fájl/mappa scope",ui.text.includes("Mit szeretnél elérni?")&&ui.text.toLocaleLowerCase("hu-HU").includes("technikai scope")&&!ui.text.includes("Megengedett fájlok/mappák"),ui.text.slice(0,900));
  check("Gyors / Worker / Párhuzamos mód jelen van",ui.text.includes("Gyors")&&ui.text.includes("Worker")&&ui.text.includes("Párhuzamos"),ui.text.slice(0,900));
  check("4 blokkos worker task összefoglaló jelen van",ui.text.includes("FELADAT")&&ui.text.includes("WORKER")&&ui.text.includes("ELLENŐRZÉS")&&ui.text.includes("EREDMÉNY"),ui.text.slice(-900));
  check("Laptop szélességen nincs full-page vízszintes overflow",ui.sw<=ui.cw+1,JSON.stringify({sw:ui.sw,cw:ui.cw}));
  await page.setViewport({width:390,height:844});await new Promise(r=>setTimeout(r,400));const mobile=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));check("Mobilon nincs full-page vízszintes overflow",mobile.sw<=mobile.cw+1,JSON.stringify(mobile));
 } finally { await browser.close(); }
 console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
} finally {await cleanup();}
