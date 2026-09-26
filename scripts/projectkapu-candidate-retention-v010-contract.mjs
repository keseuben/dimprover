#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync("scripts/projectkapu-candidate-retention-v010.mjs","utf8");
let pass=0; const check=(name,fn)=>{fn();pass++;console.log("PASS "+name);};
check("canonical candidate root is pinned",()=>assert.match(source,/\/srv\/dimpro-dev\/candidates\/projectkapu-drop-drive-pilot/));
check("safe delete skill sha is pinned",()=>assert.match(source,/d4da2a3a0917d1046d1a9f397ea22a46d2d1cac2038d4ee6f1d8bf7ea084f3cb/));
check("apply is hard denied",()=>assert.match(source,/if \(has\("--apply"\)\)/)&&assert.match(source,/Apply nincs implementálva/));
check("current pointer is protected",()=>assert.match(source,/PROTECTED_CURRENT_RUNTIME/)&&assert.match(source,/latest-source-path/));
check("runtime port 3299 cwd is verified",()=>assert.match(source,/portPid\(3299\)/)&&assert.match(source,/runtime CWD/));
check("rollback candidate is protected",()=>assert.match(source,/PROTECTED_ROLLBACK_CANDIDATE/));
check("unknown is deny",()=>assert.match(source,/UNKNOWN_DENY/));
check("git commit and release metadata are required",()=>assert.match(source,/commitExists\(commit\)/)&&assert.match(source,/\.dimpro-release\.json/)&&assert.match(source,/standalone.*server\.js/));
check("git commit validation uses command exit status",()=>assert.match(source,/function commandOk/)&&assert.match(source,/return commandOk\("git"/));
check("future target is next only",()=>assert.match(source,/deleteTargetIfFutureApproved: "\.next only"/)&&assert.match(source,/sourceDeletionAllowed: false/));
check("separate directive approval is required",()=>assert.match(source,/requiresSeparateDirectiveApproval: true/)&&assert.match(source,/requiresExplicitHumanApproval: true/));
check("report path is constrained",()=>assert.match(source,/coordination\/checkpoints/));
console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
