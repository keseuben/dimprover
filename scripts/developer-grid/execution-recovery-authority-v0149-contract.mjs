#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const main=fs.readFileSync("desktop/benjadmin-developer-grid/src/main.cjs","utf8");
const pkg=JSON.parse(fs.readFileSync("desktop/benjadmin-developer-grid/package.json","utf8"));
const types=fs.readFileSync("app/lib/developer-grid/types.ts","utf8");
let n=0;
const check=(label,fn)=>{fn();n++;console.log("PASS "+String(n).padStart(2,"0")+" "+label)};

check("desktop version v0.1.57",()=>assert.equal(pkg.version,"0.1.57"));
check("backend version v0.1.57-dev",()=>assert.match(types,/DEVELOPER_GRID_VERSION = "0\.1\.57-dev"/));
check("recovery authority resolver exists",()=>assert.match(main,/async function resolveExecutionRecoveryAuthority/));
check("resolver uses read-only active work fetch",()=>assert.match(main,/fetchDeveloperGridActiveWork\(\{/));
check("resolver requires exact task id",()=>assert.match(main,/String\(item\?\.taskId \|\| ""\) === taskId/));
check("resolver requires exact session id",()=>assert.match(main,/String\(item\?\.id \|\| ""\) === sessionId/));
check("resolver requires exact worker",()=>assert.match(main,/String\(item\?\.workerCode \|\| ""\)\.toUpperCase\(\)/));
check("resolver reads session developmentContext",()=>assert.match(main,/const context = session\?\.developmentContext \|\| \{\}/));
check("resolver requires validated ack",()=>assert.match(main,/ackState !== "VALIDATED"/));
check("resolver requires codingAllowed true",()=>assert.match(main,/codingAllowed !== true/));
check("resolver requires CENTRAL_CORE verified proof",()=>{
  assert.match(main,/proof\?\.state === "VERIFIED"/);
  assert.match(main,/proof\?\.authority === "CENTRAL_CORE"/);
  assert.match(main,/proof\?\.handshakeStage === "READY"/);
});
check("resolver requires scope lock and worktree lease",()=>{
  assert.match(main,/activeScopeLockCount/);
  assert.match(main,/activeWorktreeLeaseCount/);
});
check("resolver requires PROD DENY",()=>assert.match(main,/proof\?\.productionAccess === "DENY"/));
check("resolver requires verified source provenance",()=>assert.match(main,/provenance\?\.sourceState === "VERIFIED" && !provenance\?\.blockCode/));
check("resolved proof is persisted locally",()=>assert.match(main,/sourceProofSha256:proofSha256/));
check("legacy recovery still read-only",()=>{
  const m=main.match(/const EXECUTION_RECOVERY_ACTIONS = new Set\(\[([^\]]+)\]\)/);
  assert.ok(m);
  assert.doesNotMatch(m[1],/WRITE_FILE|RUN_DEV_COMMAND/);
});
check("new Task Launch remains forbidden",()=>assert.match(main,/új TASK_LAUNCH küldése TILOS/));
check("authority source diagnostics persisted",()=>assert.match(main,/executionRecoveryAuthoritySource/));

console.log("Developer Grid execution recovery authority v0.1.57 contract PASS · "+n+"/"+n);
