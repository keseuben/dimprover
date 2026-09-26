#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("app/api/projects/[projectId]/drop/submission-gates/route.ts", "utf8");
let pass=0;
const check=(name,fn)=>{fn();pass+=1;console.log(`PASS ${name}`);};

check("project write permission is mandatory",()=>assert.match(source,/requireProjectPermission\(request, projectId, "document\.write"\)/));
check("client projectId is never forwarded",()=>assert.doesNotMatch(source,/projectId:\s*body\.projectId/));
check("server forces route projectId",()=>assert.match(source,/createDropSubmissionGate\(\{[\s\S]*projectId,[\s\S]*projectName: access\.access\.project\.name/));
check("gate type is forced to project",()=>assert.match(source,/type:\s*"project"/));
check("single recipient is server wrapped",()=>assert.match(source,/recipients:\s*\[recipient\]/));
check("Drive target is forced to Beérkező Drop",()=>assert.match(source,/targetFolder:\s*"Beérkező Drop"/) && assert.doesNotMatch(source,/targetFolder:\s*body\.targetFolder/));
check("link PIN protection is forced",()=>assert.match(source,/downloadProtection:\s*"link_pin"/));
check("creation requires submission gate feature",()=>assert.match(source,/assertDropFeatureEnabled\("submissionGateEnabled"\)/));
check("creation requires drive incoming feature",()=>assert.match(source,/assertDropFeatureEnabled\("driveIncomingEnabled"\)/));
check("creation gates Document Flow readiness",()=>assert.match(source,/DRIVE_DOCUMENT_FLOW_SCHEMA_NOT_READY/));
check("creation gates DROP source schema readiness",()=>assert.match(source,/DRIVE_DROP_INCOMING_SOURCE_SCHEMA_NOT_READY/) && assert.match(source,/getDriveDropIncomingSourceDatabaseHealth/));
check("creation gates Drive review readiness",()=>assert.match(source,/DRIVE_REVIEW_NOT_READY/));
check("creation gates Drive storage readiness",()=>assert.match(source,/DRIVE_OBJECT_STORAGE_NOT_READY/));
check("GET filters gates by project scope",()=>assert.match(source,/gate\.type === "project" && gate\.projectId === projectId/));
check("PATCH checks project ownership",()=>assert.match(source,/current\.type !== "project" \|\| current\.projectId !== projectId/));
check("revocation does not require pipeline readiness",()=>assert.match(source,/if \(status === "active"\) await assertProjectIncomingGateReady\(projectId\)/));
check("public URL is generated server side",()=>assert.match(source,/DROP_PUBLIC_BASE_URL/) && assert.match(source,/encodeURIComponent\(slug\)/));

console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
