#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime=readFileSync("app/lib/drop/dropRuntime.ts","utf8");
const health=readFileSync("app/api/projects/[projectId]/drive/health/route.ts","utf8");
const ui=readFileSync("components/project-gate/DriveWorkspace.tsx","utf8");
const preflight=readFileSync("scripts/projectkapu-drop-drive-pilot-preflight.mjs","utf8");
const candidate=readFileSync("scripts/projectkapu-drop-drive-stage-dev-candidate.mjs","utf8");
let pass=0;const check=(name,fn)=>{fn();pass+=1;console.log(`PASS ${name}`);};

check("delivery mode defaults to email",()=>assert.match(runtime,/=== "manual-link"[\s\S]*\? "manual-link"[\s\S]*: "email"/));
check("manual-link bypass is limited to submission gate delivery readiness",()=>assert.match(runtime,/submissionGateDeliveryReady = submissionGateDeliveryMode === "manual-link" \|\| emailNotificationsReady/));
check("submission gate uses delivery readiness",()=>assert.match(runtime,/submissionGate:[\s\S]*submissionGateDeliveryReady/));
check("DIMPRO Send still requires email readiness",()=>assert.match(runtime,/dimproSend:[\s\S]*emailNotificationsReady/));
check("runtime exposes delivery mode and email requirement",()=>assert.match(runtime,/submissionGateDeliveryMode/)&&assert.match(runtime,/submissionGateEmailRequired/));
check("Drive health exposes delivery mode",()=>assert.match(health,/deliveryMode: dropRuntime\?\.publicWorkflows\?\.submissionGateDeliveryMode/));
check("Drive UI types manual-link explicitly",()=>assert.match(ui,/deliveryMode: "email" \| "manual-link"/));
check("Drive UI explains manual link handoff",()=>assert.match(ui,/Pilot mód:[\s\S]*linket kézzel add át/));
check("pilot preflight defaults to email mode",()=>assert.match(preflight,/=== "manual-link" \? "manual-link" : "email"/));
check("manual-link makes mail optional not silently ready",()=>assert.match(preflight,/DROP_MAIL_PROFILE_OPTIONAL_IN_MANUAL_LINK_MODE/)&&assert.match(preflight,/required: false/));
check("candidate explicitly disables email notifications",()=>assert.match(candidate,/DROP_EMAIL_NOTIFICATIONS_ENABLED: "false"/));
check("candidate explicitly selects manual-link mode",()=>assert.match(candidate,/DROP_SUBMISSION_GATE_DELIVERY_MODE: "manual-link"/));

console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
