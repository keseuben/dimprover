import { createClient } from "@supabase/supabase-js";
try{process.loadEnvFile?.(".env.local")}catch{}
const ledger=await import(`../app/lib/dev-center/ai-worker/run-ledger.ts?acceptance=${Date.now()}`);
const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();if(!url||!key)throw new Error("DEV Supabase env missing");const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const taskId=`ledger-fixture-${Date.now()}`,runId=ledger.newExternalAiRunId("MFORGE");let passed=0;const check=(n,o,d="")=>{if(!o)throw new Error(`${n}: ${d}`);passed+=1;console.log(`PASS ${n}${d?` :: ${d}`:""}`)};
try{
 const before=await ledger.summarizeExternalAiUsage();
 const rec=await ledger.recordExternalAiUsage({taskId,workerCode:"MFORGE",provider:"acceptance",model:null,runId,inputTokens:80,outputTokens:43,totalTokens:123,costHuf:12.34,wallTimeMs:4500,activeTimeMs:3200,retryIndex:0,changedFiles:2,testsPassed:3,testsFailed:0,reviewResult:null,stopReason:"ACCEPTANCE_FIXTURE",finishedAt:new Date().toISOString()});
 check("Usage ledger rekord létrejön",rec.ok&&Boolean(rec.id),rec.id||"");
 const after=await ledger.summarizeExternalAiUsage();
 check("Havi usage összegzés tartalmazza fixture költséget",after.monthlyCostHuf>=before.monthlyCostHuf+12.33,JSON.stringify({before:before.monthlyCostHuf,after:after.monthlyCostHuf}));
 check("Token összegzés tartalmazza fixture 123 tokent",after.totalTokens>=before.totalTokens+123,JSON.stringify({before:before.totalTokens,after:after.totalTokens}));
 check("M.Forge run számláló nő",after.workers.MFORGE.runs>=before.workers.MFORGE.runs+1,JSON.stringify({before:before.workers.MFORGE,after:after.workers.MFORGE}));
 console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
}finally{await db.from("dev_center_live_worklog").delete().eq("task_id",taskId)}
