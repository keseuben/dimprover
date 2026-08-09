import assert from "node:assert/strict";
import {
  assertDropPackageStatusTransition,
  canTransitionDropPackageStatus,
  getAllowedDropStatusTransitions,
  getAutomatedDropStatusTarget,
  isDropPackagePubliclyAccessible,
  isDropPackageTerminal,
  isDropPackageUploadWindowOpen,
  DropLifecycleError,
} from "../app/lib/drop/dropPackageLifecycle";

assert.equal(canTransitionDropPackageStatus("draft", "active"), true);
assert.equal(canTransitionDropPackageStatus("active", "upload_closed"), true);
assert.equal(canTransitionDropPackageStatus("active", "deleted"), false);
assert.equal(canTransitionDropPackageStatus("deleted", "active"), false);
assert.deepEqual(getAllowedDropStatusTransitions("deleted"), []);
assert.equal(isDropPackageTerminal("deleted"), true);
assert.equal(isDropPackageTerminal("expired"), false);
assert.equal(isDropPackagePubliclyAccessible("active"), true);
assert.equal(isDropPackagePubliclyAccessible("upload_closed"), true);

assert.throws(
  () => assertDropPackageStatusTransition("active", "deleted"),
  (error) => error instanceof DropLifecycleError && error.code === "DROP_INVALID_STATUS_TRANSITION",
);

const base = Date.parse("2026-08-01T08:00:00.000Z");
const lifecycleShape = {
  status: "active" as const,
  upload_opens_at: new Date(base - 60_000).toISOString(),
  upload_closes_at: new Date(base + 60_000).toISOString(),
  expires_at: new Date(base + 3_600_000).toISOString(),
  grace_expires_at: new Date(base + 7_200_000).toISOString(),
};

assert.equal(isDropPackageUploadWindowOpen(lifecycleShape, new Date(base)), true);
assert.equal(isDropPackageUploadWindowOpen(lifecycleShape, new Date(base + 120_000)), false);
assert.equal(
  getAutomatedDropStatusTarget(lifecycleShape, new Date(base + 120_000)),
  "upload_closed",
);
assert.equal(
  getAutomatedDropStatusTarget(
    { ...lifecycleShape, status: "upload_closed" },
    new Date(base + 3_600_001),
  ),
  "expiring",
);
assert.equal(
  getAutomatedDropStatusTarget(
    { ...lifecycleShape, status: "expiring" },
    new Date(base + 7_200_001),
  ),
  "deleting",
);
assert.equal(
  getAutomatedDropStatusTarget(
    { ...lifecycleShape, status: "active" },
    new Date(base),
  ),
  null,
);

console.log("DROP 0.2.0 package lifecycle tests: PASS");
