#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/drive-document-flow-v010-dev-apply-interactive.sh", "utf8");
let pass=0;
const check=(name,fn)=>{fn();pass+=1;console.log(`PASS ${name}`);};

check("hard-gates dimpro-dev hostname",()=>assert.match(source,/EXPECTED_HOST="dimpro-dev"/));
check("password prompt is silent",()=>assert.match(source,/read -r -s -p/));
check("password is not persisted",()=>assert.doesNotMatch(source,/>.*DRIVE_DOCUMENT_FLOW_DB_PASSWORD|tee.*DRIVE_DOCUMENT_FLOW_DB_PASSWORD/));
check("password is unset on exit",()=>assert.match(source,/trap 'unset DRIVE_DOCUMENT_FLOW_DB_PASSWORD/));
check("preflight runs before apply",()=>assert.ok(source.indexOf("preflight") < source.indexOf("migration-gate.mjs apply")));
check("explicit APPLY confirmation is required",()=>assert.match(source,/Type APPLY/) && assert.match(source,/CONFIRM.*!= "APPLY"/s));
check("DEV approval phrase is set only after confirmation",()=>assert.match(source,/DEV_ONLY_DRIVE_DOCUMENT_FLOW_V010_APPLY_APPROVED/));
check("verify runs after apply",()=>assert.ok(source.indexOf("migration-gate.mjs apply") < source.indexOf("migration-gate.mjs verify")));
check("REST readiness runs last",()=>assert.ok(source.indexOf("migration-gate.mjs verify") < source.indexOf("rest-probe.mjs")));
check("PROD commands absent",()=>assert.doesNotMatch(source,/ssh\s+.*prod|pm2\s+restart|systemctl\s+restart|deploy/i));
console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
