import assert from "node:assert/strict";
import {
  DRIVE_BUSINESS_LIFECYCLE_STATUSES,
  canTransitionDriveBusinessLifecycle,
  projectLegacyDriveVersionStatus,
} from "../app/lib/drive-core/lifecycle.ts";

let pass = 0;
function check(label, fn) {
  fn();
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`);
}

check("business lifecycle statuses are exact", () => {
  assert.deepEqual(DRIVE_BUSINESS_LIFECYCLE_STATUSES, [
    "BEJOVO",
    "ELLENORZES_ALATT",
    "ERVENYES",
    "KIADOTT",
    "ARCHIV",
  ]);
});

check("incoming can move to review", () => {
  assert.equal(canTransitionDriveBusinessLifecycle("BEJOVO", "ELLENORZES_ALATT"), true);
});

check("review can move to valid", () => {
  assert.equal(canTransitionDriveBusinessLifecycle("ELLENORZES_ALATT", "ERVENYES"), true);
});

check("valid can move to issued", () => {
  assert.equal(canTransitionDriveBusinessLifecycle("ERVENYES", "KIADOTT"), true);
});

check("issued can move to archive", () => {
  assert.equal(canTransitionDriveBusinessLifecycle("KIADOTT", "ARCHIV"), true);
});

check("technical AVAILABLE cannot skip explicit issue", () => {
  const projected = projectLegacyDriveVersionStatus("AVAILABLE");
  assert.equal(projected.businessStatus, null);
  assert.equal(projected.issueStatus, "NOT_ISSUED");
  assert.equal(projected.requiresExplicitIssueRecord, true);
  assert.match(projected.reason, /nem bizonyít ERVENYES vagy KIADOTT/);
});

check("quarantine projects to review only", () => {
  const projected = projectLegacyDriveVersionStatus("QUARANTINED");
  assert.equal(projected.businessStatus, "ELLENORZES_ALATT");
  assert.equal(projected.reviewDecision, "PENDING");
  assert.equal(projected.technicalAvailability, "BLOCKED");
});

check("rejected remains decision result", () => {
  const projected = projectLegacyDriveVersionStatus("REJECTED");
  assert.equal(projected.businessStatus, null);
  assert.equal(projected.reviewDecision, "REJECTED");
  assert.equal(projected.technicalAvailability, "BLOCKED");
});

check("backward direct lifecycle jump is denied", () => {
  assert.equal(canTransitionDriveBusinessLifecycle("KIADOTT", "ERVENYES"), false);
  assert.equal(canTransitionDriveBusinessLifecycle("ERVENYES", "BEJOVO"), false);
});

console.log(`DIMPRO DRIVE lifecycle v0.1.0 contract PASS · ${pass}/${pass}`);
