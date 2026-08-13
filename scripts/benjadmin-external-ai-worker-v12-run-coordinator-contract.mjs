import assert from "node:assert/strict";
const mod=await import(`../app/lib/dev-center/ai-worker/run-launch-plan.ts?contract=${Date.now()}`);
let passed=0;
function check(name,fn){fn();passed+=1;console.log(`PASS ${name}`)}
check("Run launch plan M.Forge DEV-only",()=>{const p=mod.getExternalAiRunLaunchPlan("task-x");assert.equal(p.workerId,"worker_mforge");assert.equal(p.environmentId,"env_dev");assert.equal(p.productionAccess,"DENY")});
check("Workspace JIT és cleanup kötelező",()=>{const p=mod.getExternalAiRunLaunchPlan("task-x");assert.equal(p.justInTimeWorkspace,true);assert.equal(p.cleanupGuaranteed,true)});
check("Readiness az első lépés",()=>assert.equal(mod.EXTERNAL_AI_RUN_LAUNCH_STEPS[0],"RUN_READINESS"));
check("Provider csak write authorization után indulhat",()=>assert.ok(mod.EXTERNAL_AI_RUN_LAUNCH_STEPS.indexOf("PROVIDER_START")>mod.EXTERNAL_AI_RUN_LAUNCH_STEPS.indexOf("WRITE_AUTHORIZATION")));
check("Usage és artifact provider után",()=>{assert.ok(mod.EXTERNAL_AI_RUN_LAUNCH_STEPS.indexOf("USAGE_STREAM")>mod.EXTERNAL_AI_RUN_LAUNCH_STEPS.indexOf("PROVIDER_START"));assert.ok(mod.EXTERNAL_AI_RUN_LAUNCH_STEPS.indexOf("OUTPUT_ARTIFACT")>mod.EXTERNAL_AI_RUN_LAUNCH_STEPS.indexOf("PROVIDER_START"))});
check("Cleanup a workflow vége",()=>assert.equal(mod.EXTERNAL_AI_RUN_LAUNCH_STEPS.at(-1),"SESSION_CLEANUP"));
console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
