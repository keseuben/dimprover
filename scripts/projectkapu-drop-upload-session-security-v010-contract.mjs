#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const runtime=readFileSync("app/lib/drop/dropRuntime.ts","utf8");
const preflight=readFileSync("scripts/projectkapu-drop-drive-pilot-preflight.mjs","utf8");
const stage=readFileSync("scripts/projectkapu-drop-drive-stage-dev-candidate.mjs","utf8");
let pass=0; const check=(name,fn)=>{fn();pass++;console.log("PASS "+name);};
check("runtime requires upload-session secret",()=>assert.match(runtime,/DROP_UPLOAD_SESSION_SECRET/)&&assert.match(runtime,/DROP_TOKEN_PEPPER/));
check("runtime tokenSecurity includes upload-session readiness",()=>assert.match(runtime,/isDropTokenSecurityConfigured\(\) && uploadSessionTokenSecurityReady/));
check("runtime exposes uploadSessionTokenSecurity",()=>assert.match(runtime,/uploadSessionTokenSecurity: uploadSessionTokenSecurityReady/));
check("preflight has dedicated blocker",()=>assert.match(preflight,/DROP_UPLOAD_SESSION_TOKEN_NOT_CONFIGURED/));
check("candidate stages canonical upload-session secret",()=>assert.match(stage,/DROP_UPLOAD_SESSION_SECRET/));
check("no secret literal embedded",()=>assert.doesNotMatch(stage,/DROP_UPLOAD_SESSION_SECRET:\s*["'][^"']{16}/));
console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
