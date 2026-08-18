import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(path, "utf8");
const adapter = read("app/lib/field-capture/dropUploadAdapter.ts");
const dropUpload = read("app/lib/drop/storage/dropUploadService.ts");
const repo = read("app/lib/field-capture/serverRepository.ts");
const initRoute = read("app/api/field-capture/sessions/[sessionId]/items/[itemId]/upload/route.ts");
const reconcileRoute = read("app/api/field-capture/sessions/[sessionId]/items/[itemId]/upload/reconcile/route.ts");
const health = read("app/api/field-capture/health/route.ts");
const tests = [
  ["shared Drop upload core reused", () => { assert.match(adapter, /initializeDropServerUpload/); assert.match(dropUpload, /return initializeDropUploadCore\(/); assert.doesNotMatch(adapter, /initializeDropUploadAtomic/); }],
  ["server internal entry still requires upload rules", () => { assert.match(dropUpload, /const normalized = validateUploadInput\(input\.body\)/); assert.match(adapter, /rulesAccepted/); assert.match(adapter, /rulesVersion/); assert.match(adapter, /rulesAcceptedAt/); }],
  ["existing package only", () => { assert.match(adapter, /findDropPackageById/); assert.match(adapter, /getDropPackageWorkflow/); assert.doesNotMatch(adapter, /createDropPackage/); assert.doesNotMatch(initRoute, /createDropPackage/); }],
  ["Send entitlement package binding enforced", () => { assert.match(adapter, /workflow\.dimproSendEntitlementId !== input\.entitlementId/); assert.match(adapter, /FIELD_CAPTURE_DROP_PACKAGE_ENTITLEMENT_MISMATCH/); }],
  ["project context binding enforced", () => { assert.match(adapter, /getFieldCaptureProjectDimproId/); assert.match(adapter, /workflow\.dimproProjectId !== dimproProjectId/); assert.match(adapter, /FIELD_CAPTURE_DROP_PACKAGE_PROJECT_MISMATCH/); }],
  ["raw upload token never persisted", () => { assert.match(repo, /rawTokenPersisted: false/); assert.doesNotMatch(repo, /uploadToken\s*:/); assert.doesNotMatch(repo, /rawToken\s*:/); }],
  ["deterministic resume key", () => { assert.match(adapter, /clientUploadId: `field-capture:\$\{context\.itemId\}:\$\{context\.asset\.variant\}`/); }],
  ["init state is uploading", () => { assert.match(repo, /storage_status: "UPLOADING"/); assert.match(repo, /status: "RUNNING"/); assert.match(repo, /status: "UPLOADING"/); }],
  ["reconcile requires completion", () => { assert.match(adapter, /snapshot\.session\.status !== "completed"/); assert.match(adapter, /markFieldCaptureDropUploadStored/); }],
  ["server stored differs from Drive synced", () => { assert.match(repo, /status: "SERVER_STORED"/); assert.match(adapter, /driveSynced: false/); }],
  ["routes are bearer and owner gated", () => { assert.match(initRoute, /authorizeFieldCaptureRequest/); assert.match(initRoute, /assertFieldCaptureSessionOwner/); assert.match(reconcileRoute, /authorizeFieldCaptureRequest/); assert.match(reconcileRoute, /assertFieldCaptureSessionOwner/); }],
  ["health reports actual adapter readiness", () => { assert.match(health, /getFieldCaptureDropUploadReadiness/); assert.match(health, /serverUploadBinding: schema\.ready && upload\.ready/); assert.match(health, /EXISTING_ENTITLEMENT_PACKAGE/); assert.match(health, /serverUploadRawTokenPersistence: false/); }],
];
let passed = 0;
for (const [name, fn] of tests) { try { fn(); passed += 1; console.log(`PASS ${passed}: ${name}`); } catch (error) { console.error(`FAIL: ${name}`); throw error; } }
console.log(`FIELD_CAPTURE_P71_UPLOAD_BINDING_CONTRACT ${passed}/${tests.length} PASS`);
