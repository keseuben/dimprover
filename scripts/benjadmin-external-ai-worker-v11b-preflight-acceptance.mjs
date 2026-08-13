import { createHash } from "node:crypto";
import fs from "node:fs";
import { rm } from "node:fs/promises";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}
const adminKey=fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const apiBase=process.env.BENJADMIN_API_BASE||"http://127.0.0.1:3100",host=process.env.BENJADMIN_HOST||"admin.dev.dimpro.hu";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),service=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();if(!url||!service)throw new Error("DEV Supabase env missing");
const db=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});const taskIds=[];const checkpointDirs=[];let passed=0;
function check(name,ok,detail=""){if(!ok)throw new Error(`${name}: ${detail}`);passed+=1;console.log(`PASS ${name}${detail?` :: ${detail}`:""}`)}
async function api(path,init={}){const r=await fetch(apiBase+path,{...init,headers:{host,"x-dimpro-license-admin-key":adminKey,...(init.headers||{})}});return{r,p:await r.json().catch(()=>({}))}}
async function cleanup(){for(const taskId of taskIds){for(const q of [db.from("dev_center_scope_locks").delete().eq("task_id",taskId),db.from("dev_center_worktree_leases").delete().eq("task_id",taskId),db.from("dev_center_live_worklog").delete().eq("task_id",taskId),db.from("dev_center_audit_events").delete().eq("task_id",taskId),db.from("dev_center_task_dependencies").delete().eq("task_id",taskId)])await q;await db.from("dev_center_tasks").delete().eq("id",taskId)}for(const dir of checkpointDirs)await rm(dir,{recursive:true,force:true})}
try{
 const workers=await db.from("dev_center_workers").select("id,code,status,metadata").in("id",["worker_mforge","worker_vguard"]).order("code");
 check("M.Forge és V.Guard valós Development Center worker",!workers.error&&(workers.data||[]).length===2,JSON.stringify(workers.data||[]));
 check("Mindkét külső worker PROD DENY",(workers.data||[]).every(x=>x.metadata?.productionAccess==="DENY"&&x.metadata?.layer==="EXTERNAL_AI"),JSON.stringify(workers.data||[]));
 check("V.Guard review-only, M.Forge DEV write policy",workers.data?.find(x=>x.code==="VGUARD")?.metadata?.reviewOnly===true&&workers.data?.find(x=>x.code==="MFORGE")?.metadata?.allowedOperations?.includes("write"),JSON.stringify(workers.data||[]));
 const create=await api("/api/dev/ai-worker/tasks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId:"project_dimprover",title:`V11B-PREFLIGHT-${Date.now()}`,goal:"A Projektkapuban a dokumentumverziók mellett lehessen megnyitni és összehasonlítani az előző verziót.",moduleHint:"Projektkapu",launchMode:"WORKER",modelPreference:"AUTO"})});
 const taskId=create.p?.task?.id||"";if(taskId)taskIds.push(taskId);check("Preflight fixture task létrejön",create.r.status===201&&Boolean(taskId),taskId);
 const analyze=await api(`/api/dev/ai-worker/tasks/${taskId}/analyze`,{method:"POST",headers:{"content-type":"application/json"}});
 check("YELLOW elemzés ScopeExpansionRequestet hoz létre",analyze.r.status===200&&analyze.p?.scopeAnalysisState==="NEEDS_REVIEW"&&analyze.p?.analysis?.reviewCount>0,JSON.stringify({state:analyze.p?.scopeAnalysisState,review:analyze.p?.analysis?.reviewCount}));
 const beforePreflight=await api(`/api/dev/ai-worker/tasks/${taskId}/preflight`,{method:"POST",headers:{"content-type":"application/json"}});
 check("YELLOW review nélkül preflight fail-closed",beforePreflight.r.status===400&&beforePreflight.p?.code==="AI_WORKER_SCOPE_REVIEW_REQUIRED",JSON.stringify(beforePreflight.p));
 const review=await api(`/api/dev/ai-worker/tasks/${taskId}/scope-review`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"EXCLUDE_YELLOW"})});
 check("Biztonságos scope döntés YELLOW-t kizár",review.r.status===200&&review.p?.scopeAnalysisState==="REVIEW_RESOLVED_SAFE"&&review.p?.scopeExpansionRequest?.status==="RESOLVED_EXCLUDED",JSON.stringify(review.p));
 const preflight=await api(`/api/dev/ai-worker/tasks/${taskId}/preflight`,{method:"POST",headers:{"content-type":"application/json"}});
 check("V1.1 preflight PASS",preflight.r.status===200&&preflight.p?.workflowState==="PREFLIGHT"&&preflight.p?.preflight?.state==="PASS",JSON.stringify({status:preflight.r.status,workflow:preflight.p?.workflowState,preflight:preflight.p?.preflight}));
 check("Workspace terv M.Forge és DEV root",preflight.p?.workspacePlan?.workerId==="worker_mforge"&&String(preflight.p?.workspacePlan?.branchName||"").startsWith("worker/mforge/")&&String(preflight.p?.workspacePlan?.worktreePath||"").startsWith("/srv/dimpro-dev/worktrees/"),JSON.stringify(preflight.p?.workspacePlan||{}));
 check("Context Pack meta nem tartalmaz secret contentet",preflight.p?.contextPack?.secretContentIncluded===false&&preflight.p?.contextPack?.fileCount>0,JSON.stringify({fileCount:preflight.p?.contextPack?.fileCount,secret:preflight.p?.contextPack?.secretContentIncluded}));
 const row=await db.from("dev_center_tasks").select("status,requested_worker_id,scope,metadata").eq("id",taskId).single();
 const checkpointPath=row.data?.metadata?.checkpoint?.path||"",checkpointSha=row.data?.metadata?.checkpoint?.sha256||"";
 if(checkpointPath)checkpointDirs.push(checkpointPath.slice(0,checkpointPath.lastIndexOf("/")));
 check("Task M.Forge-ra előirányozva, provider még nem indul",!row.error&&row.data?.requested_worker_id==="worker_mforge"&&row.data?.status==="ready"&&row.data?.metadata?.workflowState==="PREFLIGHT"&&row.data?.metadata?.providerExecutionEnabled===false,JSON.stringify({worker:row.data?.requested_worker_id,status:row.data?.status,workflow:row.data?.metadata?.workflowState}));
 const bytes=checkpointPath&&fs.existsSync(checkpointPath)?fs.readFileSync(checkpointPath):null;
 check("Task rollback checkpoint létezik és SHA ellenőrzött",Boolean(bytes)&&createHash("sha256").update(bytes).digest("hex")===checkpointSha,JSON.stringify({checkpointPath,checkpointSha}));
 check("Context pack baseline meta és GREEN scope darabszám rögzített",row.data?.metadata?.contextPack?.baselineCommit&&row.data?.metadata?.contextPack?.scopeCount===(row.data?.scope||[]).length&&row.data?.metadata?.contextPack?.yellowExcluded===true,JSON.stringify(row.data?.metadata?.contextPack||{}));

 const browser=await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-setuid-sandbox","--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"]});
 try{const page=await browser.newPage();await page.setBypassServiceWorker(true);await page.evaluateOnNewDocument(k=>{localStorage.setItem("dimproLicenseAdminKey",k);sessionStorage.setItem("dimproBenjadminSession","active")},adminKey);await page.setViewport({width:1366,height:768});await page.goto("http://admin.dev.dimpro.hu:3100/admin/dev-console",{waitUntil:"domcontentloaded",timeout:60000});await page.waitForSelector('[data-testid="benjadmin-developer-console"]',{timeout:30000});for(const b of await page.$$('button')){const t=await page.evaluate(el=>el.textContent||"",b);if(t.includes("AI Workerek")){await b.click();break}}await page.waitForSelector('aside[aria-label="Külső AI Worker V1"]',{timeout:10000});await page.waitForFunction(()=>{const a=document.querySelector('aside[aria-label="Külső AI Worker V1"]');return Boolean(a&&(a.textContent||"").includes("PREFLIGHT PASS"))},{timeout:15000});const ui=await page.evaluate(()=>({text:document.querySelector('aside[aria-label="Külső AI Worker V1"]')?.textContent||"",sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));check("UI mutat preflight/context/workspace állapotot",ui.text.includes("PREFLIGHT PASS")&&ui.text.includes("WORKSPACE TERV KÉSZ")&&ui.text.includes("M.Forge terv:"),ui.text.slice(-1600));check("V1.1b laptop overflow nélkül",ui.sw<=ui.cw+1,JSON.stringify({sw:ui.sw,cw:ui.cw}));}finally{await browser.close()}
 console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
}finally{await cleanup()}
