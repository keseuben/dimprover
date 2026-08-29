import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { reconcileOperation } from "./operation-reconcile.mjs";

let n = 0;
function check(label, fn) { fn(); n += 1; console.log(`PASS ${String(n).padStart(2, "0")} ${label}`); }
function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), "dg-reconcile-")); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function hash(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
const commit = "a".repeat(40);
const branch = "feature/benjadmin-developer-grid-v1-20260827";

check("matching live operation returns RUNNING", () => {
  const base = temp(); const coordination = path.join(base, "coord"); fs.mkdirSync(coordination);
  writeJson(path.join(coordination, "active-development.json"), { status: "running", operation: "build", task: "build-x", pid: 123, command: "SECRET_VALUE" });
  const r = reconcileOperation({ kind: "build", expectedCommit: commit, expectedBranch: branch, task: "build-x", root: base, coordinationRoot: coordination, processAliveFn: () => true });
  assert.equal(r.state, "RUNNING"); assert.equal(r.decision, "WAIT"); assert.equal("command" in r.active, false);
});

check("other live exclusive operation blocks", () => {
  const base = temp(); const coordination = path.join(base, "coord"); fs.mkdirSync(coordination);
  writeJson(path.join(coordination, "active-development.json"), { status: "running", operation: "release", task: "other", pid: 321 });
  const r = reconcileOperation({ kind: "build", expectedCommit: commit, expectedBranch: branch, task: "build-x", root: base, coordinationRoot: coordination, processAliveFn: () => true });
  assert.equal(r.state, "BLOCKED"); assert.equal(r.reason, "OTHER_EXCLUSIVE_OPERATION_ACTIVE");
});

check("exact build provenance returns COMPLETED", () => {
  const base = temp(); const next = path.join(base, ".next"); fs.mkdirSync(path.join(next, "standalone"), { recursive: true });
  fs.writeFileSync(path.join(next, "BUILD_ID"), "build-x\n"); fs.writeFileSync(path.join(next, "standalone", "server.js"), "ok");
  writeJson(path.join(next, ".dimpro-release.json"), { buildId: "build-x", gitCommit: commit, gitBranch: branch });
  const r = reconcileOperation({ kind: "build", expectedCommit: commit, expectedBranch: branch, root: base, coordinationRoot: path.join(base, "coord") });
  assert.equal(r.state, "COMPLETED"); assert.equal(r.decision, "DO_NOT_REPEAT"); assert.equal(r.proof.buildId, "build-x");
});

check("build provenance mismatch does not claim completion", () => {
  const base = temp(); const next = path.join(base, ".next"); fs.mkdirSync(path.join(next, "standalone"), { recursive: true });
  fs.writeFileSync(path.join(next, "BUILD_ID"), "build-x\n"); fs.writeFileSync(path.join(next, "standalone", "server.js"), "ok");
  writeJson(path.join(next, ".dimpro-release.json"), { buildId: "build-x", gitCommit: "b".repeat(40), gitBranch: branch });
  const r = reconcileOperation({ kind: "build", expectedCommit: commit, expectedBranch: branch, root: base, coordinationRoot: path.join(base, "coord") });
  assert.notEqual(r.state, "COMPLETED");
});

check("successful Windows history plus EXE prevents duplicate packaging", () => {
  const base = temp(); const coordination = path.join(base, "coord"); fs.mkdirSync(coordination, { recursive: true });
  const dist = path.join(base, "desktop", "benjadmin-developer-grid", "dist"); fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, "BENJADMIN-Developer-Grid-0.1.5-Windows-x64.exe"), "exe");
  fs.writeFileSync(path.join(coordination, "development-operations.jsonl"), `${JSON.stringify({ status: "completed", event: "finished", operation: "build", task: "win-x", pid: 2, exitCode: 0, command: "SECRET_VALUE" })}\n`);
  const r = reconcileOperation({ kind: "windows", version: "0.1.5", expectedCommit: commit, expectedBranch: branch, task: "win-x", root: base, coordinationRoot: coordination, artifactRoot: path.join(base, "artifacts") });
  assert.equal(r.state, "COMPLETED"); assert.equal(r.reason, "WINDOWS_OPERATION_HISTORY_AND_EXE_VERIFIED"); assert.equal("command" in r.history, false); assert.match(r.proof.sha256, /^[0-9a-f]{64}$/);
});

check("failed prior operation blocks blind retry", () => {
  const base = temp(); const coordination = path.join(base, "coord"); fs.mkdirSync(coordination, { recursive: true });
  fs.writeFileSync(path.join(coordination, "development-operations.jsonl"), `${JSON.stringify({ status: "failed", event: "finished", operation: "build", task: "win-x", exitCode: 1 })}\n`);
  const r = reconcileOperation({ kind: "windows", version: "0.1.5", expectedCommit: commit, expectedBranch: branch, task: "win-x", root: base, coordinationRoot: coordination, artifactRoot: path.join(base, "artifacts") });
  assert.equal(r.state, "BLOCKED"); assert.equal(r.decision, "REVIEW_FAILURE");
});

check("release manifest and hashes prove completion", () => {
  const base = temp(); const artifactRoot = path.join(base, "artifacts"); const dir = path.join(artifactRoot, `v0.1.5-${commit.slice(0, 7)}`); fs.mkdirSync(dir, { recursive: true });
  const exe = path.join(dir, "x.exe"); const zip = path.join(dir, "x.zip"); fs.writeFileSync(exe, "exe"); fs.writeFileSync(zip, "zip");
  writeJson(path.join(dir, "ARTIFACT_MANIFEST_v0.1.5.json"), { gitCommit: commit, gitBranch: branch, buildId: "B", environment: "DEV", productionAccess: "DENY", exe: { file: "x.exe", sha256: hash(exe), bytes: 3 }, devZip: { file: "x.zip", sha256: hash(zip), bytes: 3 } });
  const r = reconcileOperation({ kind: "release", version: "0.1.5", expectedCommit: commit, expectedBranch: branch, root: base, coordinationRoot: path.join(base, "coord"), artifactRoot });
  assert.equal(r.state, "COMPLETED"); assert.equal(r.reason, "RELEASE_ARTIFACT_MANIFEST_VERIFIED");
});

check("release hash mismatch blocks completion", () => {
  const base = temp(); const artifactRoot = path.join(base, "artifacts"); const dir = path.join(artifactRoot, `v0.1.5-${commit.slice(0, 7)}`); fs.mkdirSync(dir, { recursive: true });
  const exe = path.join(dir, "x.exe"); const zip = path.join(dir, "x.zip"); fs.writeFileSync(exe, "exe"); fs.writeFileSync(zip, "zip");
  writeJson(path.join(dir, "ARTIFACT_MANIFEST_v0.1.5.json"), { gitCommit: commit, gitBranch: branch, environment: "DEV", productionAccess: "DENY", exe: { file: "x.exe", sha256: "0".repeat(64) }, devZip: { file: "x.zip", sha256: hash(zip) } });
  const r = reconcileOperation({ kind: "release", version: "0.1.5", expectedCommit: commit, expectedBranch: branch, root: base, coordinationRoot: path.join(base, "coord"), artifactRoot });
  assert.notEqual(r.state, "COMPLETED");
});

check("completed release history without valid manifest stays blocked", () => {
  const base = temp(); const coordination = path.join(base, "coord"); fs.mkdirSync(coordination, { recursive: true });
  fs.writeFileSync(path.join(coordination, "development-operations.jsonl"), `${JSON.stringify({ status: "completed", event: "finished", operation: "release", task: "release-x", exitCode: 0 })}\n`);
  const r = reconcileOperation({ kind: "release", version: "0.1.5", expectedCommit: commit, expectedBranch: branch, task: "release-x", root: base, coordinationRoot: coordination, artifactRoot: path.join(base, "artifacts") });
  assert.equal(r.state, "BLOCKED"); assert.equal(r.decision, "VERIFY_ARTIFACT");
});

check("secret command fields never leave history sanitization", () => {
  const base = temp(); const coordination = path.join(base, "coord"); fs.mkdirSync(coordination, { recursive: true });
  fs.writeFileSync(path.join(coordination, "development-operations.jsonl"), `${JSON.stringify({ status: "failed", event: "finished", operation: "build", task: "x", exitCode: 1, command: "SUPER_SECRET" })}\n`);
  const r = reconcileOperation({ kind: "build", expectedCommit: commit, expectedBranch: branch, task: "x", root: base, coordinationRoot: coordination });
  assert.equal(JSON.stringify(r).includes("SUPER_SECRET"), false);
});

console.log(`Developer Grid operation reconcile contract PASS · ${n}/${n}`);
