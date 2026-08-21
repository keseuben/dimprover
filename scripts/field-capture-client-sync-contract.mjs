import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const sync = read("app/lib/field-capture/clientSyncService.ts");
const shell = read("components/field-capture/FieldCaptureShell.tsx");
const queue = read("app/lib/field-capture/offlineQueue.ts");
const repo = read("app/lib/field-capture/serverRepository.ts");
const saveTargets = read("components/field-capture/CaptureSaveTargets.tsx");
const rulesRoute = read("app/api/field-capture/upload-rules/accept/route.ts");

const tests = [
  ["shared resumable Drop client reused", () => {
    assert.match(sync, /uploadDropInitialized/);
    assert.match(sync, /dropFetchWithRetry/);
    assert.doesNotMatch(sync, /XMLHttpRequest/);
    assert.doesNotMatch(sync, /CreateMultipartUpload/);
  }],
  ["private staging package resolved before item upload", () => {
    assert.match(sync, /\/staging-package/);
    assert.match(sync, /stagingPackageId/);
    assert.match(sync, /packageId: stagingPackageId/);
  }],
  ["server session and items use client ids for idempotent recovery", () => {
    assert.match(sync, /clientSessionId: input\.session\.id/);
    assert.match(sync, /clientItemId: item\.id/);
    assert.doesNotMatch(queue, /serverSessionId/);
    assert.doesNotMatch(queue, /dropUploadSessionId/);
  }],
  ["upload rules are centrally freshness gated", () => {
    assert.match(sync, /isDropUploadRulesAcceptanceFresh/);
    assert.match(shell, /uploadRulesAcceptanceCount >= 3/);
    assert.match(rulesRoute, /recordDimproUploadRulesAcceptance/);
    assert.match(rulesRoute, /DROP_UPLOAD_RULES_VERSION/);
  }],
  ["raw Send and upload tokens are not stored in IndexedDB", () => {
    assert.match(queue, /rawSessionTokenStored: false/);
    assert.match(queue, /uploadCapabilityStored: false/);
    assert.doesNotMatch(queue, /sessionToken/);
    assert.doesNotMatch(queue, /uploadToken/);
  }],
  ["upload capability remains ephemeral in client memory", () => {
    assert.match(sync, /initialized\.uploadToken/);
    assert.match(sync, /authorization: "Bearer " \+ initialized\.uploadToken/);
    assert.doesNotMatch(sync, /localStorage/);
    assert.doesNotMatch(sync, /indexedDB/);
  }],
  ["complete then reconcile server storage", () => {
    assert.match(sync, /initialized\.completeUrl/);
    assert.match(sync, /\/upload\/reconcile/);
    assert.match(sync, /status: "SERVER_STORED"/);
  }],
  ["user Drive runs only after server storage and scan can remain pending", () => {
    const reconcile = sync.indexOf("/upload/reconcile");
    const userDrive = sync.indexOf("/user-drive");
    assert.ok(reconcile >= 0 && userDrive > reconcile);
    assert.match(sync, /FIELD_CAPTURE_USER_DRIVE_SCAN_PENDING/);
    assert.match(sync, /status: "DESTINATION_PENDING"/);
  }],
  ["user Drive P8 is opt-in and enabled in client UI", () => {
    const userStart = saveTargets.indexOf('title="Saját DIMPRO Drive"');
    const projectStart = saveTargets.indexOf('title="Projektkapu Drive"');
    assert.ok(userStart >= 0 && projectStart > userStart);
    const userRow = saveTargets.slice(userStart, projectStart);
    assert.doesNotMatch(userRow, /disabled/);
    assert.match(userRow, /badge="P8 aktív"/);
    assert.match(sync, /\/user-drive/);
  }],
  ["project Drive stays disabled in client UI", () => {
    assert.match(saveTargets, /title="Projektkapu Drive"/);
    assert.match(saveTargets, /disabled badge="P9"/);
    assert.doesNotMatch(sync, /\/project-drive/);
  }],
  ["sync is manual, visible and offline safe", () => {
    assert.match(shell, /data-terep-sync-button/);
    assert.match(shell, /Szinkronizálás a DIMPRO szerverre/);
    assert.match(shell, /if \(!online\)/);
    assert.doesNotMatch(shell, /useEffect\(\(\) => \{\s*void runServerSync/);
  }],
  ["upload progress is persisted without abusing error field", () => {
    assert.match(sync, /status: "UPLOADING", progress, error: null/);
    assert.match(queue, /"status" \| "progress" \| "error"/);
  }],
  ["unchanged server item preserves advanced storage state", () => {
    assert.match(repo, /existingItem && !assetChanged/);
    assert.match(repo, /storageStatePreserved/);
    assert.match(repo, /if \(!existingQueueResult\.data \|\| assetChanged\)/);
  }],
  ["edited or replaced asset intentionally resets upload state", () => {
    assert.match(repo, /revisionChanged/);
    assert.match(repo, /storage_status: "PENDING"/);
    assert.match(repo, /status: assetChanged \? "PENDING"/);
  }],
  ["rules dialog does not block local capture when declined", () => {
    assert.match(shell, /onClose=\{\(\) => setRulesDialogOpen\(false\)\}/);
    assert.match(shell, /disabled=\{rulesSaving \|\| !rulesConsentChecked\}/);
    assert.match(shell, /!rulesAccepted \|\| !rulesAcceptedAt/);
  }],
];

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${passed}: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}
console.log(`FIELD_CAPTURE_CLIENT_SYNC_CONTRACT ${passed}/${tests.length} PASS`);
