import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isForbiddenZipEntry,
  assertPathWithin,
  validateReleaseMetadata,
  validateWindowsArtifactMarker,
  validatePackageSessionMarker,
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

const pathTmp = fs.mkdtempSync(path.join(os.tmpdir(), "developer-grid-path-contract-"));
try {
  const allowed = path.join(pathTmp, "allowed");
  const outside = path.join(pathTmp, "outside");
  fs.mkdirSync(allowed);
  fs.mkdirSync(outside);
  check(assertPathWithin(path.join(allowed, "release", "file.zip"), allowed, "ARTIFACT_ROOT_DENIED").startsWith(allowed), "artifact path inside root accepted");
  check(throwsCode(() => assertPathWithin(path.join(outside, "file.zip"), allowed, "ARTIFACT_ROOT_DENIED"), "ARTIFACT_ROOT_DENIED"), "artifact lexical root escape blocked");
  fs.symlinkSync(outside, path.join(allowed, "escape"));
  check(throwsCode(() => assertPathWithin(path.join(allowed, "escape", "file.zip"), allowed, "ARTIFACT_ROOT_DENIED"), "ARTIFACT_ROOT_DENIED_SYMLINK_ESCAPE"), "artifact symlink escape blocked");
} finally {
  fs.rmSync(pathTmp, { recursive: true, force: true });
}

const matching = { buildId: "build-1", head: "a".repeat(40), branch: "feature/test", releaseMeta: { buildId: "build-1", gitCommit: "a".repeat(40), gitBranch: "feature/test" } };
check(validateReleaseMetadata(matching) === true, "matching release metadata accepted");
check(throwsCode(() => validateReleaseMetadata({ ...matching, releaseMeta: { ...matching.releaseMeta, buildId: "build-2" } }), "RELEASE_STATE_MISMATCH"), "build id mismatch blocked");
check(throwsCode(() => validateReleaseMetadata({ ...matching, releaseMeta: { ...matching.releaseMeta, gitCommit: "b".repeat(40) } }), "RELEASE_STATE_MISMATCH"), "commit mismatch blocked");
check(throwsCode(() => validateReleaseMetadata({ ...matching, releaseMeta: { ...matching.releaseMeta, gitBranch: "other" } }), "RELEASE_STATE_MISMATCH"), "branch mismatch blocked");

const windowsMarkerBase = {
  schemaVersion: 1,
  product: "BENJADMIN Developer Grid",
  version: "0.1.12",
  gitCommit: "c".repeat(40),
  gitBranch: "feature/test",
  buildId: "build-win",
  environment: "DEV",
  productionAccess: "DENY",
  exe: { file: "BENJADMIN-Developer-Grid-0.1.12-Windows-x64.exe", sha256: "d".repeat(64), bytes: 1234, signed: false },
};
const windowsMarkerArgs = { marker: windowsMarkerBase, version: "0.1.12", head: "c".repeat(40), branch: "feature/test", buildId: "build-win", exeFile: "/tmp/BENJADMIN-Developer-Grid-0.1.12-Windows-x64.exe", exeHash: "d".repeat(64), exeBytes: 1234 };
check(validateWindowsArtifactMarker(windowsMarkerArgs) === true, "matching Windows artifact marker accepted");
check(throwsCode(() => validateWindowsArtifactMarker({ ...windowsMarkerArgs, marker: null }), "WINDOWS_ARTIFACT_MARKER_MISSING"), "missing Windows artifact marker blocked");
check(throwsCode(() => validateWindowsArtifactMarker({ ...windowsMarkerArgs, marker: { ...windowsMarkerBase, gitCommit: "e".repeat(40) } }), "WINDOWS_ARTIFACT_MARKER_MISMATCH"), "Windows marker commit mismatch blocked");
check(throwsCode(() => validateWindowsArtifactMarker({ ...windowsMarkerArgs, marker: { ...windowsMarkerBase, buildId: "other" } }), "WINDOWS_ARTIFACT_MARKER_MISMATCH"), "Windows marker Build ID mismatch blocked");
check(throwsCode(() => validateWindowsArtifactMarker({ ...windowsMarkerArgs, marker: { ...windowsMarkerBase, exe: { ...windowsMarkerBase.exe, sha256: "f".repeat(64) } } }), "WINDOWS_ARTIFACT_MARKER_MISMATCH"), "Windows marker EXE hash mismatch blocked");
check(throwsCode(() => validateWindowsArtifactMarker({ ...windowsMarkerArgs, marker: { ...windowsMarkerBase, productionAccess: "ALLOW" } }), "WINDOWS_ARTIFACT_MARKER_MISMATCH"), "Windows marker PROD access mismatch blocked");

const packageSessionBase = {
  schemaVersion: 1,
  product: "BENJADMIN Developer Grid",
  packageSessionId: "a".repeat(64),
  version: "0.1.12",
  gitCommit: "c".repeat(40),
  gitBranch: "feature/test",
  buildId: "build-win",
  environment: "DEV",
  productionAccess: "DENY",
  exe: { file: "BENJADMIN-Developer-Grid-0.1.12-Windows-x64.exe", sha256: "d".repeat(64), bytes: 1234 },
  devZip: { file: "BENJADMIN-Developer-Grid-v0.1.12-DEV.zip", sha256: "e".repeat(64), bytes: 5678 },
};
const packageSessionArgs = { marker: packageSessionBase, version: "0.1.12", head: "c".repeat(40), branch: "feature/test", buildId: "build-win", exeFile: "/tmp/BENJADMIN-Developer-Grid-0.1.12-Windows-x64.exe", exeHash: "d".repeat(64), exeBytes: 1234, zipFile: "/tmp/BENJADMIN-Developer-Grid-v0.1.12-DEV.zip", zipHash: "e".repeat(64), zipBytes: 5678 };
check(validatePackageSessionMarker(packageSessionArgs) === true, "matching package session marker accepted");
check(throwsCode(() => validatePackageSessionMarker({ ...packageSessionArgs, marker: null }), "PACKAGE_SESSION_MARKER_INVALID"), "missing package session marker blocked");
check(throwsCode(() => validatePackageSessionMarker({ ...packageSessionArgs, marker: { ...packageSessionBase, gitCommit: "f".repeat(40) } }), "PACKAGE_SESSION_MARKER_MISMATCH"), "package session commit mismatch blocked");
check(throwsCode(() => validatePackageSessionMarker({ ...packageSessionArgs, marker: { ...packageSessionBase, buildId: "other" } }), "PACKAGE_SESSION_MARKER_MISMATCH"), "package session Build ID mismatch blocked");
check(throwsCode(() => validatePackageSessionMarker({ ...packageSessionArgs, marker: { ...packageSessionBase, exe: { ...packageSessionBase.exe, sha256: "0".repeat(64) } } }), "PACKAGE_SESSION_MARKER_MISMATCH"), "package session EXE hash mismatch blocked");
check(throwsCode(() => validatePackageSessionMarker({ ...packageSessionArgs, marker: { ...packageSessionBase, devZip: { ...packageSessionBase.devZip, sha256: "0".repeat(64) } } }), "PACKAGE_SESSION_MARKER_MISMATCH"), "package session ZIP hash mismatch blocked");
check(throwsCode(() => validatePackageSessionMarker({ ...packageSessionArgs, marker: { ...packageSessionBase, packageSessionId: "bad" } }), "PACKAGE_SESSION_MARKER_INVALID"), "invalid package session id blocked");
check(throwsCode(() => validatePackageSessionMarker({ ...packageSessionArgs, marker: { ...packageSessionBase, productionAccess: "ALLOW" } }), "PACKAGE_SESSION_MARKER_MISMATCH"), "package session PROD access mismatch blocked");

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
check(engine.includes("WINDOWS_ARTIFACT_MARKER_MISSING") && engine.includes("WINDOWS_ARTIFACT_MARKER_MISMATCH") && engine.includes('windowsArtifactProvenance: "VERIFIED"'), "release engine requires exact Windows artifact provenance marker");
check(engine.includes("PACKAGE_SESSION_MARKER_MISSING") && engine.includes("PACKAGE_SESSION_MARKER_MISMATCH") && engine.includes('packageSessionProvenance: "VERIFIED"'), "release engine requires exact EXE + DEV ZIP package session marker");

console.log(`Developer Grid release artifact contract PASS · ${n}/${n}`);
