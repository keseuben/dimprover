#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync("components/project-gate/DriveWorkspace.tsx", "utf8");
const css = readFileSync("components/project-gate/DriveWorkspace.module.css", "utf8");
let pass=0;
const check=(name,fn)=>{fn();pass+=1;console.log(`PASS ${name}`);};

check("Project Drop gate payload is typed",()=>assert.match(ui,/type ProjectDropGatePayload = \{/));
check("project-scoped API is used",()=>assert.match(ui,/\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/drop\/submission-gates/));
check("gate list uses same-origin credentials",()=>assert.match(ui,/loadProjectSubmissionGates[\s\S]*credentials: "same-origin"/));
check("create uses POST",()=>assert.match(ui,/submitProjectGate[\s\S]*method: "POST"/));
check("client sends no projectId",()=>assert.doesNotMatch(ui,/submitProjectGate[\s\S]{0,1800}projectId\s*:/));
check("single recipient name and email are sent",()=>assert.match(ui,/recipient:\s*\{[\s\S]*name: form\.get\("recipientName"\)[\s\S]*email: form\.get\("recipientEmail"\)/));
check("create is blocked when pilot is not ready",()=>assert.match(ui,/if \(!dropDriveIncomingReady\)[\s\S]*DROP → DRIVE fogadási lánc/));
check("project gate button is write-permission gated",()=>assert.match(ui,/canWrite && <button[\s\S]{0,500}toggleProjectGateForm/));
check("form shows forced incoming folder explanation",()=>assert.match(ui,/„Beérkező Drop” Drive-mappához kötődik/));
check("created public URL can be copied",()=>assert.match(ui,/copyProjectGateUrl\(createdGateUrl\)/));
check("existing project gates can be revoked",()=>assert.match(ui,/gate\.status === "active" \? "revoked" : "active"/));
check("reactivation is disabled when pipeline is not ready",()=>assert.match(ui,/gate\.status !== "active" && !dropDriveIncomingReady/));
check("gate form has stable marker",()=>assert.match(ui,/data-project-drop-gate="0\.1\.0"/));
check("gate form spans the forms row",()=>assert.match(css,/\.gateForm \{ grid-column: 1 \/ -1; \}/));
check("gate list is responsive",()=>assert.match(css,/@media \(max-width: 760px\)[\s\S]*\.gateList article/));

console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
