import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isForbiddenZipEntry,
  validateReleaseMetadata,
  validatePublicHeaders,
  validateSha256Sidecar,
  writeImmutableBuffer,
} from "./release-artifact-engine.mjs";

let n = 0;
function check(ok, label) {
  n += 1;
  if (!ok) throw new Error(`FAIL ${String(n).padStart(2, "0")} ${label}`);
  console.log(`PASS ${String(n).padStart(2, "0")} ${label}`);
}
function throwsCode(fn, code) {
  try { fn(); } catch (error) { return error?.code === code || String(error?.message || "").startsWith(`${code}:`); }
  return false;
}

check(isForbiddenZipEntry("x/.env"), ".env forbidden");
check(isForbiddenZipEntry("x/.env.local"), ".env.local forbidden");
check(isForbiddenZipEntry("x/node_modules/a.js"), "node_modules forbidden");
check(isForbiddenZipEntry("x/.next/BUILD_ID"), ".next forbidden");
check(isForbiddenZipEntry("x/.git/config"), ".git forbidden");
check(isForbiddenZipEntry("x/admin-key.txt"), "admin key forbidden");
check(isForbiddenZipEntry("x/SUPABASE_SERVICE_ROLE_KEY.txt"), "service role marker forbidden");
check(isForbiddenZipEntry("x/.npmrc"), ".npmrc forbidden");
check(isForbiddenZipEntry("x/.netrc"), ".netrc forbidden");
check(isForbiddenZipEntry("x/.ssh/id_ed25519"), ".ssh private key path forbidden");
check(isForbiddenZipEntry("x/config/client.pem"), "PEM credential material forbidden");
check(isForbiddenZipEntry("x/certs/signing.key"), "private key file forbidden");
check(isForbiddenZipEntry("x/config/service-account.json"), "service account file forbidden");
check(isForbiddenZipEntry("x/config/credentials.json"), "credentials file forbidden");
check(!isForbiddenZipEntry("x/app/lib/developer-grid/types.ts"), "normal source allowed");

const matching = { buildId: "build-1", head: "a".repeat(40), branch: "feature/test", releaseMeta: { buildId: "build-1", gitCommit: "a".repeat(40), gitBranch: "feature/test" } };
check(validateReleaseMetadata(matching) === true, "matching release metadata accepted");
check(throwsCode(() => validateReleaseMetadata({ ...matching, releaseMeta: { ...matching.releaseMeta, buildId: "build-2" } }), "RELEASE_STATE_MISMATCH"), "build id mismatch blocked");
check(throwsCode(() => validateReleaseMetadata({ ...matching, releaseMeta: { ...matching.releaseMeta, gitCommit: "b".repeat(40) } }), "RELEASE_STATE_MISMATCH"), "commit mismatch blocked");
check(throwsCode(() => validateReleaseMetadata({ ...matching, releaseMeta: { ...matching.releaseMeta, gitBranch: "other" } }), "RELEASE_STATE_MISMATCH"), "branch mismatch blocked");

const goodHeaders = new Headers({ "x-dimpro-environment": "DEV", "x-dimpro-production-access": "DENY" });
check(validatePublicHeaders(goodHeaders) === true, "public DEV DENY headers accepted");
check(throwsCode(() => validatePublicHeaders(new Headers({ "x-dimpro-environment": "PROD", "x-dimpro-production-access": "DENY" })), "PUBLIC_ENVIRONMENT_MISMATCH"), "public PROD header rejected");
check(throwsCode(() => validatePublicHeaders(new Headers({ "x-dimpro-environment": "DEV", "x-dimpro-production-access": "ALLOW" })), "PUBLIC_PRODUCTION_ACCESS_MISMATCH"), "public production access rejected");
check(validateSha256Sidecar(`${"a".repeat(64)}  artifact.zip`, "artifact.zip", "a".repeat(64)) === true, "matching public sha256 sidecar accepted");
check(throwsCode(() => validateSha256Sidecar(`${"b".repeat(64)}  artifact.zip`, "artifact.zip", "a".repeat(64)), "PUBLIC_SHA256_SIDECAR_HASH_MISMATCH"), "public sha256 sidecar hash mismatch blocked");
check(throwsCode(() => validateSha256Sidecar(`${"a".repeat(64)}  other.zip`, "artifact.zip", "a".repeat(64)), "PUBLIC_SHA256_SIDECAR_FILE_MISMATCH"), "public sha256 sidecar filename mismatch blocked");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "developer-grid-release-contract-"));
try {
  const file = path.join(tmp, "immutable.txt");
  check(writeImmutableBuffer(file, "same\n") === "CREATED", "immutable file created");
  check(writeImmutableBuffer(file, "same\n") === "EXISTS_SAME", "same immutable content idempotent");
  check(throwsCode(() => writeImmutableBuffer(file, "different\n"), "ARTIFACT_IMMUTABILITY_VIOLATION"), "immutable overwrite rejected");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wrapper = fs.readFileSync(path.join(root, "scripts/developer-grid/release-artifacts.sh"), "utf8");
const engine = fs.readFileSync(path.join(root, "scripts/developer-grid/release-artifact-engine.mjs"), "utf8");
check(wrapper.includes("dimpro-coordinated-operation.sh\" release"), "release wrapper uses exclusive release lock");
check(wrapper.includes("DIMPRO_RELEASE_COORDINATED=1"), "release wrapper marks coordinated execution");
check(wrapper.includes("PROD_DENY"), "release wrapper denies PROD");
check(engine.includes("ARTIFACT_IMMUTABILITY_VIOLATION"), "engine is immutable fail-closed");
check(engine.includes("PUBLIC_ARTIFACT_HASH_MISMATCH"), "public full-download hash mismatch blocks");
check(engine.includes("PUBLIC_MANIFEST_HASH_MISMATCH"), "public manifest full-download hash mismatch blocks");
check(engine.includes("PUBLIC_SHA256_SIDECAR_HASH_MISMATCH"), "public sha256 sidecar mismatch blocks");
check(engine.includes("SOURCE_BASELINE_MISMATCH") && engine.includes("SOURCE_WORKTREE_DIRTY"), "source provenance gates present");

console.log(`Developer Grid release artifact contract PASS · ${n}/${n}`);
