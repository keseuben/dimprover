import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=rel=>fs.readFileSync(path.join(root,rel),"utf8");
let n=0;
const config=read("app/lib/developer-grid/supabase-monitoring-config.ts");
const facade=read("app/lib/developer-grid/system-health.ts");
const renderer=read("desktop/benjadmin-developer-grid/src/renderer/renderer.js");
const setup=read("app/api/dev/grid/supabase-monitoring/setup/route.ts");
const route=read("app/api/dev/grid/supabase-monitoring/route.ts");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"benjadmin-supabase-dual-"));
const envKeys=["BENJADMIN_SUPABASE_ANALYTICS_TOKEN","BENJADMIN_SUPABASE_ANALYTICS_TOKEN_FILE","BENJADMIN_SUPABASE_ANALYTICS_STATUS_FILE","BENJADMIN_SUPABASE_MONITORING_PROJECTS_FILE","SUPABASE_PROJECT_REF"];
const oldEnv=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
for(const k of envKeys)delete process.env[k];
process.env.SUPABASE_PROJECT_REF="devproject123456";
process.env.BENJADMIN_SUPABASE_ANALYTICS_TOKEN_FILE=path.join(tmp,"token");
process.env.BENJADMIN_SUPABASE_ANALYTICS_STATUS_FILE=path.join(tmp,"status.json");
process.env.BENJADMIN_SUPABASE_MONITORING_PROJECTS_FILE=path.join(tmp,"projects.json");
const scoped="sbp_fc_TEST_ONLY_FAKE_TOKEN_123456789";
const calls=[];let denyProd=false;let overprivileged=false;
const fakeFetch=async(url,options={})=>{
  const u=new URL(url);const ref=u.pathname.split("/")[3];calls.push({ref,path:u.pathname,method:options.method||"GET"});
  const status=options.headers?.authorization===`Bearer ${scoped}`?200:401;
  if(status!==200)return {ok:false,status,json:async()=>({})};
  if(ref==="prodproject123456"&&denyProd)return {ok:false,status:403,json:async()=>({})};
  if(u.pathname.endsWith(`/projects/${ref}`))return {ok:overprivileged,status:overprivileged?200:403,json:async()=>({})};
  const counts=u.pathname.endsWith("usage.api-counts");
  return {ok:true,status:200,json:async()=>counts?{result:[{total_rest_requests:ref.startsWith("dev")?11:22,total_auth_requests:1,total_storage_requests:0,total_realtime_requests:0}]}:{result:[{count:ref.startsWith("dev")?111:222}]}};
};
function loadModule(source,bindings={}){const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const testModule={exports:{}};new Function("exports","module","require","fetch","process",...Object.keys(bindings),js)(testModule.exports,testModule,(id)=>id==="server-only"?{}:require(id),fakeFetch,process,...Object.values(bindings));return testModule.exports;}
const api=loadModule(config);
try{
  const initial=await api.getSupabaseMonitoringProjects();assert.equal(initial[1].projectRef,null);n++;console.log(`PASS ${String(n).padStart(2,"0")} no inferred PROD identity`);
  await assert.rejects(api.validateSupabaseAnalyticsToken("classic-token-12345678901234567890"),{code:"SUPABASE_CLASSIC_TOKEN_REJECTED"});n++;console.log(`PASS ${String(n).padStart(2,"0")} classic token rejected`);
  await api.saveSupabaseAnalyticsToken(scoped);assert.equal(fs.readFileSync(process.env.BENJADMIN_SUPABASE_ANALYTICS_TOKEN_FILE,"utf8").trim(),scoped);assert.equal(fs.statSync(process.env.BENJADMIN_SUPABASE_ANALYTICS_TOKEN_FILE).mode&0o777,0o600);n++;console.log(`PASS ${String(n).padStart(2,"0")} existing token securely saved`);
  await assert.rejects(api.configureSupabaseMonitoringProject({environment:"PROD",projectRef:"devproject123456",confirmProjectName:"dimprover"}),{code:"SUPABASE_PROJECT_REF_INVALID"});n++;console.log(`PASS ${String(n).padStart(2,"0")} duplicate DEV ref rejected`);
  denyProd=true;await assert.rejects(api.configureSupabaseMonitoringProject({environment:"PROD",projectRef:"prodproject123456",confirmProjectName:"dimprover"}));assert.equal(fs.existsSync(process.env.BENJADMIN_SUPABASE_MONITORING_PROJECTS_FILE),false);denyProd=false;n++;console.log(`PASS ${String(n).padStart(2,"0")} unauthorized mapping does not persist`);
  await assert.rejects(api.configureSupabaseMonitoringProject({environment:"PROD",projectRef:"prodproject123456",confirmProjectName:"wrong"}),{code:"SUPABASE_PROJECT_CONFIRMATION_REQUIRED"});n++;console.log(`PASS ${String(n).padStart(2,"0")} project name confirmation required`);
  const configured=await api.configureSupabaseMonitoringProject({environment:"PROD",projectRef:"prodproject123456",confirmProjectName:"dimprover"});assert.equal(configured.projectRef,"prodproject123456");assert.equal(fs.statSync(process.env.BENJADMIN_SUPABASE_MONITORING_PROJECTS_FILE).mode&0o777,0o600);assert.equal(fs.readFileSync(process.env.BENJADMIN_SUPABASE_ANALYTICS_TOKEN_FILE,"utf8").trim(),scoped);n++;console.log(`PASS ${String(n).padStart(2,"0")} PROD mapping atomic and original token unchanged`);
  const p=await api.getSupabaseMonitoringProjects();assert.deepEqual(p.map(x=>x.projectRef),["devproject123456","prodproject123456"]);n++;console.log(`PASS ${String(n).padStart(2,"0")} distinct project mapping`);
  await api.saveSupabaseAnalyticsToken(scoped);const saved=JSON.parse(fs.readFileSync(process.env.BENJADMIN_SUPABASE_ANALYTICS_STATUS_FILE));assert.deepEqual(saved.projectRefs,["devproject123456","prodproject123456"]);n++;console.log(`PASS ${String(n).padStart(2,"0")} token replacement validates both projects`);
  overprivileged=true;await assert.rejects(api.validateSupabaseAnalyticsToken(scoped),{code:"SUPABASE_TOKEN_OVERPRIVILEGED"});overprivileged=false;n++;console.log(`PASS ${String(n).padStart(2,"0")} unrelated settings permission remains forbidden`);
  assert.match(route,/isDeveloperGridAdminAuthorized/);assert.match(route,/export async function PUT/);assert.match(setup,/confirmProjectName:'dimprover'/);assert.doesNotMatch(route,/SUPABASE_SERVICE_ROLE_KEY/);n++;console.log(`PASS ${String(n).padStart(2,"0")} admin-only mapping and no service-role fallback`);
  const start=facade.indexOf("function sumUsageRows(");const end=facade.indexOf("async function inspectSupabaseTraffic()",start);const sum=loadModule(`export ${facade.slice(start,end)}`).sumUsageRows;assert.equal(sum([],"count"),null);assert.equal(sum([{count:0}],"count"),0);assert.equal(sum([{count:3},{count:4}],"count"),7);assert.equal(sum([{other:1}],"count"),null);n++;console.log(`PASS ${String(n).padStart(2,"0")} missing metrics are null, explicit zero remains zero`);
  const a=facade.indexOf("async function inspectSupabaseTraffic()");const b=facade.indexOf("export async function getDeveloperGridSystemHealth",a);const trafficSource=facade.slice(a,b);const traffic=loadModule(`export ${trafficSource}`,{
    getSupabaseMonitoringProjects:api.getSupabaseMonitoringProjects,
    readSupabaseAnalyticsToken:api.readSupabaseAnalyticsToken,
    supabaseManagementJson:async(pathname,token)=>{const response=await fakeFetch(`https://api.supabase.com${pathname}`,{headers:{authorization:`Bearer ${token}`}});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json()},
    sumUsageRows:sum,
  });
  const result=await traffic.inspectSupabaseTraffic();assert.deepEqual(result.map(x=>x.apiRequests),[111,222]);assert.deepEqual(result.map(x=>x.restRequests),[11,22]);assert.deepEqual(result.map(x=>x.id),["supabase-traffic","supabase-traffic-prod"]);assert.equal(result[0].egressBytes,null);n++;console.log(`PASS ${String(n).padStart(2,"0")} independent DEV and PROD values`);
  denyProd=true;const failed=await traffic.inspectSupabaseTraffic();denyProd=false;assert.equal(failed[0].state,"READY");assert.equal(failed[0].apiRequests,111);assert.equal(failed[1].state,"DEGRADED");assert.equal(failed[1].apiRequests,null);n++;console.log(`PASS ${String(n).padStart(2,"0")} PROD failure does not erase DEV metrics`);
  // The production adapter is also checked structurally: independent promises, no shared total, no database access.
  assert.match(trafficSource,/Promise\.all\(projects\.map/);assert.match(trafficSource,/supabase-traffic-prod/);assert.match(trafficSource,/egressBytes: null/);assert.doesNotMatch(trafficSource,/restRequests \+ authRequests/);assert.doesNotMatch(trafficSource,/createClient\(|\.from\(/);n++;console.log(`PASS ${String(n).padStart(2,"0")} per-project adapter with no synthetic billing total`);
  assert.match(renderer,/trafficByEnvironment/);assert.doesNotMatch(renderer,/health\.traffic\[0\]/);assert.match(renderer,/health-table--supabase/);n++;console.log(`PASS ${String(n).padStart(2,"0")} renderer does not collapse PROD into DEV`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});for(const [k,v]of Object.entries(oldEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
console.log(`Developer Grid Supabase dual monitoring contract PASS · ${n}/${n}`);
