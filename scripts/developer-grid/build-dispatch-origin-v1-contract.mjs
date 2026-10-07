#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const file=path.join(here,"remote-build-dispatch.mjs");
const source=fs.readFileSync(file,"utf8");
const checks=[
  [source.includes('import os from "node:os";'),"NODE_OS_IMPORT"],
  [source.includes("BUILD_DISPATCH_WRONG_HOST"),"WRONG_HOST_CODE"],
  [source.includes("DIMPRO_BUILD_DISPATCH_EXPECTED_HOST"),"EXPECTED_HOST_OVERRIDE"],
  [source.includes('|| "dimpro-dev"'),"DEV_DEFAULT_HOST"],
  [source.includes("automatikus manual fallback TILOS"),"MANUAL_FALLBACK_DENY"],
  [source.indexOf("assertDispatchHost();") < source.indexOf("const args=parseArgs"),"GUARD_BEFORE_DISPATCH_ARGS"],
];
const failed=checks.filter(([ok])=>!ok).map(([,name])=>name);
if(failed.length){
  console.error(JSON.stringify({ok:false,code:"BUILD_DISPATCH_ORIGIN_V1_CONTRACT_FAIL",failed},null,2));
  process.exit(1);
}
console.log(JSON.stringify({ok:true,code:"BUILD_DISPATCH_ORIGIN_V1_CONTRACT_PASS",checks:checks.length},null,2));
