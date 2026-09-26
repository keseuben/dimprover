#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const stage=readFileSync("scripts/projectkapu-drop-drive-stage-dev-candidate.mjs","utf8");
const dispatch=readFileSync("app/lib/drop/worker/dropScanDispatch.ts","utf8");
let pass=0; const check=(name,fn)=>{fn();pass++;console.log("PASS "+name);};
check("candidate pins DEV scan trigger directory",()=>assert.match(stage,/DIMPRO_DROP_SCAN_TRIGGER_DIR: "\/srv\/dimpro-dev\/runtime\/drop-worker-trigger"/));
check("dispatch reads configured trigger directory",()=>assert.match(dispatch,/process\.env\.DIMPRO_DROP_SCAN_TRIGGER_DIR/));
check("dispatch emits coalesced trigger file",()=>assert.match(dispatch,/scan-wakeup\.trigger/));
check("candidate trigger path is DEV-only runtime path",()=>assert.doesNotMatch(stage,/DIMPRO_DROP_SCAN_TRIGGER_DIR: "\/root\/dimprover/));
console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
