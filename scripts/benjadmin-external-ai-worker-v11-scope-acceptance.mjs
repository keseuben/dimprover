import fs from "node:fs";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}
const adminKey=fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const apiBase=process.env.BENJADMIN_API_BASE||"http://127.0.0.1:3100"; const host=process.env.BENJADMIN_HOST||"admin.dev.dimpro.hu";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(), service=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(); if(!url||!service)throw new Error("DEV Supabase env missing");
const db=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
const taskIds=[];let passed=0;
function check(name,ok,detail=""){if(!ok)throw new Error(`${name}: ${detail}`);passed+=1;console.log(`PASS ${name}${detail?` :: ${detail}`:""}`)}
async function api(path,init={}){const r=await fetch(`${apiBase}${path}`,{...init,headers:{host,"x-dimpro-license-admin-key":adminKey,...(init.headers||{})}});const p=await r.json().catch(()=>({}));return{r,p}}
async function create(title,goal,moduleHint){const x=await api("/api/dev/ai-worker/tasks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId:"project_dimprover",title,goal,moduleHint,launchMode:"WORKER",modelPreference:"AUTO"})});if(x.p?.task?.id)taskIds.push(x.p.task.id);return x;}
async function cleanup(){for(const taskId of taskIds){for(const q of [db.from("dev_center_scope_locks").delete().eq("task_id",taskId),db.from("dev_center_live_worklog").delete().eq("task_id",taskId),db.from("dev_center_audit_events").delete().eq("task_id",taskId),db.from("dev_center_task_dependencies").delete().eq("task_id",taskId)]){const x=await q;if(x.error)console.error(`CLEANUP WARN ${x.error.message}`);}const t=await db.from("dev_center_tasks").delete().eq("id",taskId);if(t.error)console.error(`CLEANUP WARN task ${t.error.message}`);}}
try{
 const normal=await create(`SCOPE-PROJEKTKAPU-${Date.now()}`,"A Projektkapuban a dokumentumverziók mellett lehessen megnyitni és összehasonlítani az előző verziót.","Projektkapu");
 const normalId=normal.p?.task?.id||"";check("Normál scope fixture task létrejön",normal.r.status===201&&Boolean(normalId),normalId);
 const analyzed=await api(`/api/dev/ai-worker/tasks/${normalId}/analyze`,{method:"POST",headers:{"content-type":"application/json"}});
 check("Automatikus scope analyzer 200",analyzed.r.status===200&&analyzed.p?.ok===true,JSON.stringify({status:analyzed.r.status,state:analyzed.p?.scopeAnalysisState}));
 const analysis=analyzed.p?.analysis||{}; const candidates=analysis.candidates||[];
 check("Projektkapu/Drive releváns fájlok felismerve",candidates.some(x=>x.path.startsWith("app/projektkapu/"))&&candidates.some(x=>x.path.includes("drive/documents")||x.path.includes("versions")),JSON.stringify(candidates.slice(0,12).map(x=>x.path)));
 check("Adatbázis/Supabase fájl nem GREEN",candidates.filter(x=>x.path.startsWith("supabase/")).every(x=>x.riskLevel!=="GREEN"),JSON.stringify(candidates.filter(x=>x.path.startsWith("supabase/")).slice(0,8)));
 check("Checksum és backup fájl nincs scope-jelöltben",!candidates.some(x=>/\.sha256$|\.bak(?:[-_]|$)/i.test(x.path)),JSON.stringify(candidates.map(x=>x.path)));
 check("Approved scope csak GREEN",(analysis.approvedScope||[]).every(scope=>candidates.some(x=>x.path===scope.key&&x.riskLevel==="GREEN"&&x.decision==="AUTO_APPROVED")),JSON.stringify(analysis.approvedScope||[]));
 check("Érzékeny path nem kerül auto-approved scope-ba",!(analysis.approvedScope||[]).some(scope=>/\.env|secret|credential|private[-_]?key|admin-auth|worker-auth|next\.config|production|deploy/i.test(scope.key)),JSON.stringify(analysis.approvedScope||[]));
 check("YELLOW eset BENJADMIN review állapotot ad, nem automatikus preflightot",analysis.reviewCount>0&&analyzed.p?.scopeAnalysisState==="NEEDS_REVIEW"&&analysis.safeToPreflight===false,JSON.stringify({risk:analysis.overallRisk,review:analysis.reviewCount,denied:analysis.deniedCount,safe:analysis.safeToPreflight}));
 const row=await db.from("dev_center_tasks").select("scope,metadata,status,blocked_reason").eq("id",normalId).single();
 check("DB task scope csak automatikusan engedett GREEN pathokat kap",!row.error&&Array.isArray(row.data?.scope)&&(row.data?.scope||[]).length===(analysis.approvedScope||[]).length&&row.data?.metadata?.scopeAnalysisState==="NEEDS_REVIEW",JSON.stringify({scopeCount:row.data?.scope?.length,state:row.data?.metadata?.scopeAnalysisState}));

 const danger=await create(`SCOPE-DANGER-${Date.now()}`,"Módosítsd a BENJADMIN admin-auth és worker-auth hitelesítési core fájlokat, valamint az .env beállításokat.","BENJADMIN");
 const dangerId=danger.p?.task?.id||"";check("Veszélyes scope fixture task létrejön elemzésre",danger.r.status===201&&Boolean(dangerId),dangerId);
 const dangerAnalysis=await api(`/api/dev/ai-worker/tasks/${dangerId}/analyze`,{method:"POST",headers:{"content-type":"application/json"}}); const da=dangerAnalysis.p?.analysis||{};
 check("Auth/secret jelölt PIROS és DENIED",(da.candidates||[]).some(x=>x.riskLevel==="RED"&&x.decision==="DENIED"&&/auth|secret|env/i.test(`${x.path} ${(x.reasons||[]).join(" ")}`)),JSON.stringify((da.candidates||[]).filter(x=>x.riskLevel==="RED").slice(0,10)));
 check("PIROS scope task fail-closed blokkolt",dangerAnalysis.p?.scopeAnalysisState==="BLOCKED_RED"&&dangerAnalysis.p?.workflowState==="DRAFT"&&da.deniedCount>0,JSON.stringify({state:dangerAnalysis.p?.scopeAnalysisState,workflow:dangerAnalysis.p?.workflowState,denied:da.deniedCount}));
 const dangerRow=await db.from("dev_center_tasks").select("status,blocked_reason,scope").eq("id",dangerId).single();
 check("PIROS task engine státusza blocked és végrehajtható scope-ja üres",!dangerRow.error&&dangerRow.data?.status==="blocked"&&/PIROS|tiltott/i.test(dangerRow.data?.blocked_reason||"")&&Array.isArray(dangerRow.data?.scope)&&dangerRow.data.scope.length===0,JSON.stringify(dangerRow.data||{}));

 const browser=await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-setuid-sandbox","--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"]});
 try{
  const page=await browser.newPage();await page.setBypassServiceWorker(true);await page.evaluateOnNewDocument(k=>{localStorage.setItem("dimproLicenseAdminKey",k);sessionStorage.setItem("dimproBenjadminSession","active");},adminKey);await page.setViewport({width:1366,height:768});await page.goto("http://admin.dev.dimpro.hu:3100/admin/dev-console",{waitUntil:"domcontentloaded",timeout:60000});await page.waitForSelector('[data-testid="benjadmin-developer-console"]',{timeout:30000});
  const buttons=await page.$$('button');for(const b of buttons){const txt=await page.evaluate(el=>el.textContent||"",b);if(txt.includes("AI Workerek")){await b.click();break;}}
  await page.waitForSelector('aside[aria-label="Külső AI Worker V1"]',{timeout:10000});
  await page.waitForFunction(() => {
    const aside=document.querySelector('aside[aria-label="Külső AI Worker V1"]');
    return Boolean(aside && aside.querySelector('details') && ((aside.textContent||'').includes('NEEDS_REVIEW') || (aside.textContent||'').includes('BLOCKED_RED')));
  }, { timeout: 15000 });
  const ui=await page.evaluate(()=>({text:document.querySelector('aside[aria-label="Külső AI Worker V1"]')?.textContent||"",details:Array.from(document.querySelectorAll('aside[aria-label="Külső AI Worker V1"] details')).map(x=>x.textContent||""),sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
  check("Scope megtekintése valós elemzési eredményt mutat",ui.details.some(x=>x.includes("Scope megtekintése")&&(x.includes("GREEN")||x.includes("YELLOW"))),ui.details.slice(0,2).join(" | ").slice(0,1000));
  check("UI jelzi review és tiltott scope állapotot",ui.text.includes("NEEDS_REVIEW")&&ui.text.includes("BLOCKED_RED"),ui.text.slice(-1400));
  check("V1.1 drawer laptopon overflow nélkül",ui.sw<=ui.cw+1,JSON.stringify({sw:ui.sw,cw:ui.cw}));
 }finally{await browser.close();}
 console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
}finally{await cleanup();}
