import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,"../..");
const main=fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/src/main.cjs"),"utf8");
const mod=require(path.join(root,"desktop/benjadmin-developer-grid/src/task-launch/draft-recovery.cjs"));
const task="dev-task-grid-c3e320247ef1e25df784";
const session="grid-work-dev-task-grid-c3e320247ef1e25df784-arminai";
const oldProof="28501805854172993f39053902f2293036887fc89c1a1873d7fa5c61d9f3a42f";
const newProof="35b98575be0d1ca58c83e36d7be6895c44b004f8322a74596498ed9fc2d01697";
const draft=[
"BENJADMIN_PROMPT_KIND: TASK_LAUNCH_V3",
"",
"BOOT ACKNOWLEDGEMENT",
"Task: "+task,
"Session: "+session,
"Source proof: "+oldProof,
"",
"CENTRAL CORE SOURCE PREFLIGHT PROOF",
"Proof SHA-256: "+oldProof
].join("\n");
const checks=[];
function check(name,ok){if(!ok){console.error("FAIL",name);process.exitCode=1;}else{checks.push(name);console.log("PASS",String(checks.length).padStart(2,"0"),name);}}
let d=mod.shouldReplaceStaleTaskLaunchDraft({draft,taskId:task,sessionId:session,currentSourceProofSha256:newProof});
check("same task/session stale proof is replaceable",d.replace===true && d.reason==="stale-source-proof");
d=mod.shouldReplaceStaleTaskLaunchDraft({draft,taskId:task,sessionId:session,currentSourceProofSha256:oldProof});
check("current proof draft is preserved",d.replace===false && d.reason==="current-proof");
d=mod.shouldReplaceStaleTaskLaunchDraft({draft,taskId:"other",sessionId:session,currentSourceProofSha256:newProof});
check("foreign task draft is protected",d.replace===false && d.reason==="task-mismatch");
d=mod.shouldReplaceStaleTaskLaunchDraft({draft,taskId:task,sessionId:"other",currentSourceProofSha256:newProof});
check("foreign session draft is protected",d.replace===false && d.reason==="session-mismatch");
d=mod.shouldReplaceStaleTaskLaunchDraft({draft:"user note",taskId:task,sessionId:session,currentSourceProofSha256:newProof});
check("non-launch user draft is protected",d.replace===false && d.reason==="not-task-launch");
check("resume path has stale owned draft recovery",main.includes("clearStaleOwnedTaskLaunchDraft(view") && main.includes("staleDraftPreviousSourceProofSha256"));
const launchFlightBlocks=[...main.matchAll(/const launchInFlight = Boolean\(launchRecord\.sentAt\)([\s\S]{0,220}?);/g)].map(x=>x[0]);
check("launch in-flight checks exist",launchFlightBlocks.length>=3);
check("ACK WAITING alone is not launch-send evidence",launchFlightBlocks.every(x=>!x.includes("ackState")));
check("pre-recovery generation is fail-closed without send evidence",main.includes('code:"CHATGPT_GENERATION_ACTIVE"') && main.includes("no launch send evidence exists"));
check("stale draft clearing verifies empty composer",main.includes("STALE_TASK_LAUNCH_DRAFT_CLEAR_FAILED") && main.includes("composer-clear-not-observed") && main.includes("composer-restored-after-clear"));
if(process.exitCode)process.exit(process.exitCode);
console.log("Developer Grid v0.1.82 launch draft recovery contract PASS - "+checks.length+"/"+checks.length);
