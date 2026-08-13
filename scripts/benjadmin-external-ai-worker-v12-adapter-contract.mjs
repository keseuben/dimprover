import assert from "node:assert/strict";
const saved={openai:process.env.OPENAI_API_KEY,anthropic:process.env.ANTHROPIC_API_KEY,openaiModel:process.env.DIMPRO_EXTERNAL_AI_OPENAI_MODEL,claudeModel:process.env.DIMPRO_EXTERNAL_AI_CLAUDE_MODEL,gate:process.env.DIMPRO_EXTERNAL_AI_PROVIDER_EXECUTION_ENABLED,daily:process.env.DIMPRO_EXTERNAL_AI_DAILY_BUDGET_HUF,monthly:process.env.DIMPRO_EXTERNAL_AI_MONTHLY_BUDGET_HUF};
for(const key of ["OPENAI_API_KEY","ANTHROPIC_API_KEY","DIMPRO_EXTERNAL_AI_OPENAI_MODEL","DIMPRO_EXTERNAL_AI_CLAUDE_MODEL","DIMPRO_EXTERNAL_AI_PROVIDER_EXECUTION_ENABLED","DIMPRO_EXTERNAL_AI_DAILY_BUDGET_HUF","DIMPRO_EXTERNAL_AI_MONTHLY_BUDGET_HUF"])delete process.env[key];
const adapters=await import(`../app/lib/dev-center/ai-worker/model-adapter.ts?contract=${Date.now()}`);
const budget=await import(`../app/lib/dev-center/ai-worker/budget-policy.ts?contract=${Date.now()}`);
let passed=0;const check=(name,fn)=>{fn();passed+=1;console.log(`PASS ${name}`)};const checkAsync=async(name,fn)=>{await fn();passed+=1;console.log(`PASS ${name}`)};
try{
 const probes=await adapters.probeWorkerModelAdapters();
 check("Mock adapter kompatibilis és ready",()=>assert.equal(probes.find(x=>x.provider==="mock")?.ready,true));
 check("OpenAI secret/model nélkül fail-closed",()=>assert.equal(probes.find(x=>x.provider==="openai")?.ready,false));
 check("Claude secret/model nélkül fail-closed",()=>assert.equal(probes.find(x=>x.provider==="anthropic")?.ready,false));
 await checkAsync("AUTO nem választ mockot valódi provider helyett",async()=>assert.equal(await adapters.resolveWorkerModelAdapter("AUTO","MFORGE"),null));
 const cfg=budget.externalAiBudgetConfiguration();
 check("Napi/havi limit konfiguráció nélkül null",()=>assert.equal(cfg.dailyLimitHuf===null&&cfg.monthlyLimitHuf===null,true));
 check("74 százalék még OK",()=>assert.equal(budget.evaluateExternalAiBudget({taskCostHuf:740,workerCostHuf:0,dailyCostHuf:0,monthlyCostHuf:0,activeMinutes:0,retryCount:0,taskLimitHuf:1000,workerLimitHuf:1000}).state,"OK"));
 check("75 százalék warning",()=>assert.equal(budget.evaluateExternalAiBudget({taskCostHuf:750,workerCostHuf:0,dailyCostHuf:0,monthlyCostHuf:0,activeMinutes:0,retryCount:0,taskLimitHuf:1000,workerLimitHuf:1000}).state,"WARNING_75"));
 check("90 százalék erős warning",()=>assert.equal(budget.evaluateExternalAiBudget({taskCostHuf:900,workerCostHuf:0,dailyCostHuf:0,monthlyCostHuf:0,activeMinutes:0,retryCount:0,taskLimitHuf:1000,workerLimitHuf:1000}).state,"WARNING_90"));
 check("100 százalék hard stop",()=>assert.equal(budget.evaluateExternalAiBudget({taskCostHuf:1000,workerCostHuf:0,dailyCostHuf:0,monthlyCostHuf:0,activeMinutes:0,retryCount:0,taskLimitHuf:1000,workerLimitHuf:1000}).hardStop,true));
 check("Max retry hard stop",()=>assert.equal(budget.evaluateExternalAiBudget({taskCostHuf:0,workerCostHuf:0,dailyCostHuf:0,monthlyCostHuf:0,activeMinutes:0,retryCount:2,taskLimitHuf:1000,workerLimitHuf:1000,maxRetries:2}).hardStop,true));
 console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
}finally{
 const map={OPENAI_API_KEY:saved.openai,ANTHROPIC_API_KEY:saved.anthropic,DIMPRO_EXTERNAL_AI_OPENAI_MODEL:saved.openaiModel,DIMPRO_EXTERNAL_AI_CLAUDE_MODEL:saved.claudeModel,DIMPRO_EXTERNAL_AI_PROVIDER_EXECUTION_ENABLED:saved.gate,DIMPRO_EXTERNAL_AI_DAILY_BUDGET_HUF:saved.daily,DIMPRO_EXTERNAL_AI_MONTHLY_BUDGET_HUF:saved.monthly};for(const [k,v] of Object.entries(map)){if(v==null)delete process.env[k];else process.env[k]=v}
}
