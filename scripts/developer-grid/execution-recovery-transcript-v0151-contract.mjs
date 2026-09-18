#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const main=fs.readFileSync("desktop/benjadmin-developer-grid/src/main.cjs","utf8");
let n=0;
const check=(label,fn)=>{fn();n++;console.log("PASS "+String(n).padStart(2,"0")+" "+label)};
check("transcript verifier exists",()=>assert.match(main,/async function verifyPromptMarkerInTranscript/));
check("verifier requires USER role",()=>assert.match(main,/item\?\.role === "USER"/));
check("verifier requires marker",()=>assert.match(main,/includes\(marker\)/));
check("recovery waits for transcript evidence",()=>assert.match(main,/verifyPromptMarkerInTranscript\(view, marker, 12000\)/));
check("confirmed state explicit",()=>assert.match(main,/executionRecoveryState:"SENT_CONFIRMED"/));
check("confirmed stores evidence",()=>assert.match(main,/executionRecoveryTranscriptVerified:true/));
check("unconfirmed remains pending",()=>assert.match(main,/executionRecoveryTranscriptVerified:false/));
check("retry state versioned",()=>assert.match(main,/executionRecoveryRetryVersion:"V0151"/));
check("legacy attempts reset",()=>assert.match(main,/retryVersion === "V0151"/));
check("pending retry bounded",()=>{assert.match(main,/recoveryRetryMaxAttempts = 3/);assert.match(main,/recoveryRetryCooldownMs = 20_000/)});
check("confirmed recovery deduped",()=>assert.match(main,/recoveryState === "SENT_CONFIRMED"/));
check("legacy recovery read-only",()=>{
 const m=main.match(/const EXECUTION_RECOVERY_ACTIONS = new Set\(\[([^\]]+)\]\)/);
 assert.ok(m);assert.doesNotMatch(m[1],/WRITE_FILE|RUN_DEV_COMMAND/);
});
console.log("Developer Grid execution recovery transcript confirmation v0.1.51 contract PASS · "+n+"/"+n);
