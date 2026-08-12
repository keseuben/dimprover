import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}
delete process.env.OPENAI_API_KEY;
delete process.env.DIMPRO_BENJADMIN_WORKER_EXECUTOR_URL;
const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(); const key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if(!url||!key) throw new Error("DEV Supabase env missing");
const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
const mod=await import(`../app/lib/dev-center/internal-executor-readiness.ts?runtime=${Date.now()}`);
const state=await mod.getInternalExecutorReadiness(db);
let passed=0; const check=(name,ok,details="")=>{if(!ok)throw new Error(`${name}: ${details}`);passed+=1;console.log(`PASS ${name}${details?` :: ${details}`:""}`)};
check("Közös repository READY",state.repositoryReady===true,JSON.stringify(state));
check("Trusted baseline READY",state.baselineReady===true,JSON.stringify({ref:state.baselineRef,commit:state.baselineCommit}));
check("Baseline ref kanonikus",state.baselineRef==="refs/heads/integration/benjadmin-dev",state.baselineRef);
check("Baseline commit rögzített",/^[0-9a-f]{40}$/.test(state.baselineCommit||""),state.baselineCommit||"");
check("Provider hiánya fail-closed",state.providerConfigured===false&&state.ready===false,JSON.stringify(state.blockers));
check("Executor hiánya fail-closed",state.executorConfigured===false&&state.ready===false,JSON.stringify(state.blockers));
check("Blockerek emberileg olvashatók",state.blockers.some(x=>x.includes("AI provider"))&&state.blockers.some(x=>x.includes("worker executor")),JSON.stringify(state.blockers));
console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
