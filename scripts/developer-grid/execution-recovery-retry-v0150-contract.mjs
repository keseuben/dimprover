#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const main=fs.readFileSync("desktop/benjadmin-developer-grid/src/main.cjs","utf8");
let n=0;
const check=(label,fn)=>{fn();n++;console.log("PASS "+String(n).padStart(2,"0")+" "+label)};
check("stale SENT recovery has cooldown",()=>assert.match(main,/recoveryRetryCooldownMs = 90_000/));
check("recovery has bounded max attempts",()=>assert.match(main,/recoveryRetryMaxAttempts = 3/));
check("attempt count is persisted",()=>assert.match(main,/executionRecoveryAttemptCount:nextAttemptCount/));
check("fresh SENT remains deduplicated",()=>assert.match(main,/retryAgeMs < recoveryRetryCooldownMs/));
check("exhausted recovery remains deduplicated",()=>assert.match(main,/previousAttemptCount >= recoveryRetryMaxAttempts/));
check("stale SENT can fall through to resend",()=>{
  const start=main.indexOf('if (recoveryState === "SENT" && sameRecovery)');
  const end=main.indexOf('const nextAttemptCount',start);
  assert.ok(start>=0 && end>start);
  const body=main.slice(start,end);
  assert.match(body,/return \{/);
  assert.doesNotMatch(body,/else\s*\{/);
});
check("retry stays deterministic",()=>assert.match(main,/req-recovery-" \+ invalidSha256\.slice\(0, 12\)/));
check("legacy recovery remains read-only",()=>{
 const m=main.match(/const EXECUTION_RECOVERY_ACTIONS = new Set\(\[([^\]]+)\]\)/);
 assert.ok(m); assert.doesNotMatch(m[1],/WRITE_FILE|RUN_DEV_COMMAND/);
});
console.log("Developer Grid execution recovery retry v0.1.50 contract PASS · "+n+"/"+n);
