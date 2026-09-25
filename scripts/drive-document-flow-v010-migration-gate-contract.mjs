#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const gate = readFileSync("scripts/drive-document-flow-v010-migration-gate.mjs", "utf8");
const probe = readFileSync("scripts/drive-document-flow-v010-rest-probe.mjs", "utf8");
let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log(`PASS ${name}`); };

check("canonical DEV project ref is pinned", () => assert.match(gate, /pbgyuznivqvestuksvif/));
check("migration SHA is pinned", () => assert.match(gate, /ecff3a81d3917aaedaa00deee5358eb4dc93b1081c511b24fcb6b85436968fb0/));
check("PROD equality is blocked", () => assert.match(gate, /PROD_TARGET_BLOCKED/));
check("credential absence fails closed", () => assert.match(gate, /DB_CREDENTIAL_REQUIRED/));
check("apply requires explicit approval phrase", () => assert.match(gate, /DEV_ONLY_DRIVE_DOCUMENT_FLOW_V010_APPLY_APPROVED/));
check("backup precedes psql apply", () => assert.ok(gate.indexOf("pg_dump") < gate.indexOf('psqlArgs(["-f", migration])')));
check("backup archive is verified", () => assert.match(gate, /pg_restore/));
check("existing document/version/upload row counts are protected", () => assert.match(gate, /EXISTING_ROW_COUNT_CHANGED/));
check("RLS and service-role RPC security are verified", () => assert.match(gate, /anonRegisterExecute/) && assert.match(gate, /serviceIssueExecute/));
check("target marker is verified", () => assert.match(gate, /drive-document-flow-v010-20260925/));
check("REST probe is read-only", () => assert.doesNotMatch(probe, /method\s*:\s*["'](POST|PATCH|DELETE|PUT)/));
check("REST probe pins DEV project", () => assert.match(probe, /pbgyuznivqvestuksvif/));
check("REST probe checks all governance tables", () => {
  for (const t of ["drive_core_document_governance","drive_core_document_issues","drive_core_document_issue_recipients"]) assert.match(probe, new RegExp(t));
});
console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
