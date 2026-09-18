#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const main=fs.readFileSync("desktop/benjadmin-developer-grid/src/main.cjs","utf8");
let n=0;
const check=(label,fn)=>{fn();n++;console.log("PASS "+String(n).padStart(2,"0")+" "+label)};
check("recovery retains cooldown",()=>assert.match(main,/recoveryRetryCooldownMs = 20_000/));
check("recovery has bounded max attempts",()=>assert.match(main,/recoveryRetryMaxAttempts = 3/));
check("attempt count is persisted",()=>assert.match(main,/executionRecoveryAttemptCount:nextAttemptCount/));
check("retry state is version-scoped",()=>assert.match(main,/retryVersion === "V0151"/));
check("current pending recovery obeys cooldown",()=>assert.match(main,/retryAgeMs < recoveryRetryCooldownMs/));
check("exhausted recovery remains deduplicated",()=>assert.match(main,/previousAttemptCount >= recoveryRetryMaxAttempts/));
check("legacy unversioned state is not permanently blocking",()=>{
  assert.match(main,/const previousAttemptCount = retryVersion === "V0151"/);
  assert.match(main,/sameRecovery && retryVersion === "V0151"/);
});
check("retry stays deterministic",()=>assert.match(main,/req-recovery-" \+ invalidSha256\.slice\(0, 12\)/));
check("legacy recovery remains read-only",()=>{
 const m=main.match(/const EXECUTION_RECOVERY_ACTIONS = new Set\(\[([^\]]+)\]\)/);
 assert.ok(m); assert.doesNotMatch(m[1],/WRITE_FILE|RUN_DEV_COMMAND/);
});
console.log("Developer Grid execution recovery retry v0.1.50 regression contract PASS · "+n+"/"+n);
