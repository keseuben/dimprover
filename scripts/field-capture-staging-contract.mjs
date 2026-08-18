#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=(p)=>readFileSync(p,"utf8");
const service=read("app/lib/field-capture/stagingPackageService.ts");
const route=read("app/api/field-capture/sessions/[sessionId]/staging-package/route.ts");
const upload=read("app/lib/field-capture/dropUploadAdapter.ts");
const health=read("app/api/field-capture/health/route.ts");
const migration=read("supabase/migrations/20260818221500_field_capture_staging_package_v010.sql");
const tests=[
 ["private staging uses existing Drop create engine",()=>{assert.match(service,/createDropPackage/);assert.doesNotMatch(service,/drop_create_package_atomic/)}],
 ["zero recipients",()=>{assert.match(service,/recipients: \[\]/);assert.match(service,/recipientCount: 0/)}],
 ["no notification or report delivery",()=>{for(const key of ["notify_on_first_open","notify_on_download","notify_on_comment","notify_on_upload_complete","send_final_report_to_uploader","send_final_report_to_invitees"])assert.match(service,new RegExp(`${key}: false`))}],
 ["raw package capabilities never persisted or returned",()=>{assert.match(migration,/raw_capabilities_persisted.*check \(raw_capabilities_persisted = false\)/);assert.match(service,/raw_capabilitiesPersisted|rawCapabilitiesPersisted: false/);assert.doesNotMatch(route,/rawTokens|uploadToken|downloadToken|reportToken|\bpin\b/)}],
 ["staging is not public workflow",()=>{assert.match(service,/publicDeliveryWorkflow: false/);assert.doesNotMatch(service,/saveDropPackageWorkflow|bindDropPublicSessionPackage/)}],
 ["retention is configurable approved set with 7 day fallback",()=>{assert.match(service,/ALLOWED_RETENTION_DAYS = \[1, 3, 5, 7, 14, 30\]/);assert.match(service,/DEFAULT_RETENTION_DAYS = 7/);assert.match(service,/FIELD_CAPTURE_STAGING_RETENTION_DAYS/)}],
 ["session user entitlement project mapping enforced",()=>{assert.match(service,/row\.user_id !== input\.session\.userId/);assert.match(service,/row\.entitlement_id !== input\.entitlementId/);assert.match(service,/sameNullable\(row\.project_id, input\.session\.projectId\)/)}],
 ["concurrent create has winner recovery",()=>{assert.match(service,/mapping\.error\?\.code === "23505"/);assert.match(service,/deleteTechnicalPackage\(created\.package\.id\)/);assert.match(service,/reused: true/)}],
 ["creation failure compensates package",()=>{assert.match(service,/compensatePackage/);assert.match(service,/deleteTechnicalPackage/)}],
 ["route bearer and session owner gated",()=>{assert.match(route,/authorizeFieldCaptureRequest/);assert.match(route,/assertFieldCaptureSessionOwner/)}],
 ["P7.1 keeps normal Send workflow",()=>{assert.match(upload,/workflow\?\.workflowType === "send"/);assert.match(upload,/bindingMode: "SEND_WORKFLOW"/)}],
 ["P7.1 accepts only mapped staging alternative",()=>{assert.match(upload,/assertFieldCaptureStagingPackageBinding/);assert.match(upload,/bindingMode: "FIELD_CAPTURE_STAGING"/)}],
 ["health reports staging separately",()=>{assert.match(health,/stagingPackageBinding: schema\.ready && staging\.ready/);assert.match(health,/stagingPublicDeliveryWorkflow: false/);assert.match(health,/stagingRawCapabilitiesPersisted: false/)}],
 ["schema is server-only",()=>{assert.match(migration,/enable row level security/);assert.match(migration,/revoke all.*authenticated/);assert.match(migration,/grant all.*service_role/)}],
];
let passed=0;for(const [name,fn] of tests){try{fn();passed++;console.log(`PASS ${passed}: ${name}`)}catch(e){console.error(`FAIL: ${name}`);throw e}}
console.log(`FIELD_CAPTURE_STAGING_CONTRACT ${passed}/${tests.length} PASS`);
