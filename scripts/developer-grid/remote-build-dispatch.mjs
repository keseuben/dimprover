#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO = "/srv/dimpro-dev/repositories/dimprover.git";
const SNAPSHOT_FILE = process.env.BENJADMIN_BUILD_NODE_SNAPSHOT_FILE?.trim() || "/srv/dimpro-dev/coordination/health-snapshots/build-nodes.json";
const LOCAL_ROOT = "/srv/dimpro-dev/artifacts/build-runs";
const TEMP_ROOT = "/srv/dimpro-dev/coordination/build-dispatch";
const REFRESH_SCRIPT = path.join(ROOT, "refresh-build-gateway-snapshot.mjs");
const SSH_BIN = process.env.DIMPRO_REMOTE_BUILD_SSH_BIN?.trim() || "/usr/bin/ssh";
const SCP_BIN = process.env.DIMPRO_REMOTE_BUILD_SCP_BIN?.trim() || "/usr/bin/scp";
const GIT_BIN = process.env.DIMPRO_REMOTE_BUILD_GIT_BIN?.trim() || "/usr/bin/git";
const REMOTE_EXECUTOR = "/srv/dimpro-build/bin/dimpro-build-runner-executor-v1";
const RUNNER_PRIORITY = ["build01", "build02"];
const MAX_AGE_MS = 60_000;

function fail(code, message) {
  const error = new Error(message);
  Object.assign(error, { code });
  throw error;
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail("ARGUMENTS_INVALID", "A dispatcher argumentumai --key value formátumúak.");
    out[key.slice(2)] = value;
  }
  return out;
}

function safeId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(value)) fail(`${label.toUpperCase()}_INVALID`, `${label} érvénytelen.`);
  return value;
}

function safeWorker(value) {
  if (!["ARMINAI","OUTMINAI","BENJAMINAI","JAZMINAI","DEVMINAI"].includes(value)) fail("WORKER_CODE_INVALID", "workerCode érvénytelen.");
  return value;
}

function safeCommit(value) {
  if (!/^[0-9a-f]{40}$/i.test(value || "")) fail("SOURCE_COMMIT_INVALID", "sourceCommit nem teljes Git SHA.");
  return value.toLowerCase();
}

function safeBranch(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 220 || !/^[A-Za-z0-9._/-]+$/.test(value) || value.startsWith("-") || value.includes("..")) {
    fail("SOURCE_BRANCH_INVALID", "sourceBranch érvénytelen.");
  }
  const check = spawnSync(GIT_BIN, ["check-ref-format", "--branch", value], { stdio: "ignore" });
  if (check.status !== 0) fail("SOURCE_BRANCH_INVALID", "sourceBranch nem érvényes Git branch.");
  return value;
}

function execText(bin, args, options = {}) {
  return execFileSync(bin, args, {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    ...options,
  }).trim();
}

function sha256(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytes;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function loadSnapshot() {
  execText(process.execPath, [REFRESH_SCRIPT], { timeout: 30_000, stdio: ["ignore", "pipe", "inherit"] });
  const parsed = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
  if (
    parsed?.schemaVersion !== 1 ||
    parsed?.environment !== "DEV" ||
    parsed?.productionAccess !== "DENY" ||
    parsed?.source !== "DIMPRO_MCP_SSH_GATEWAY" ||
    !Array.isArray(parsed.nodes) ||
    !Number.isFinite(Date.parse(parsed.sampledAt))
  ) fail("BUILD_SNAPSHOT_INVALID", "A BUILD gateway snapshot szerződése érvénytelen.");
  if (Math.abs(Date.now() - Date.parse(parsed.sampledAt)) > MAX_AGE_MS) fail("BUILD_SNAPSHOT_STALE", "A BUILD gateway snapshot elavult.");
  return parsed;
}

function usable(node) {
  if (!node || node.quality !== "LIVE" || node.state !== "READY") return false;
  const m = node.metrics;
  if (!m || m.toolchainReady !== true || m.buildLockHeld !== false || m.currentRunId !== null) return false;
  if (!(m.swapTotalBytes >= m.swapMinimumBytes)) return false;
  if (!["SAFE","WATCH"].includes(String(m.storageGovernor || "").toUpperCase())) return false;
  if (!Number.isFinite(Date.parse(node.lastVerifiedAt)) || Math.abs(Date.now() - Date.parse(node.lastVerifiedAt)) > MAX_AGE_MS) return false;
  return true;
}

function chooseNode(snapshot) {
  for (const id of RUNNER_PRIORITY) {
    const node = snapshot.nodes.find((item) => item?.id === id);
    if (usable(node)) return node;
  }
  fail("NO_READY_BUILD_RUNNER", "Nincs READY és FREE BUILD-01/BUILD-02 runner.");
}

function sshArgs(nodeId, command) {
  return [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    "-o", "ConnectionAttempts=1",
    "-o", "StrictHostKeyChecking=yes",
    nodeId,
    command,
  ];
}

function scpArgs(source, target) {
  return [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    "-o", "ConnectionAttempts=1",
    "-o", "StrictHostKeyChecking=yes",
    source,
    target,
  ];
}

function q(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const args = parseArgs(process.argv.slice(2));
const runId = safeId(args["run-id"], "runId");
const taskId = safeId(args["task-id"], "taskId");
const sessionId = safeId(args["session-id"], "sessionId");
const workerCode = safeWorker(args["worker-code"]);
const sourceCommit = safeCommit(args["source-commit"]);
const sourceBranch = safeBranch(args["source-branch"]);

const branchRef = `refs/heads/${sourceBranch}`;
const actualHead = execText(GIT_BIN, [`--git-dir=${REPO}`, "rev-parse", `${branchRef}^{commit}`]);
if (actualHead !== sourceCommit) fail("SOURCE_BASELINE_MISMATCH", `Canonical branch HEAD ${actualHead} != ${sourceCommit}.`);

fs.mkdirSync(LOCAL_ROOT, { recursive: true, mode: 0o750 });
fs.chmodSync(LOCAL_ROOT, 0o750);
const localDir = path.join(LOCAL_ROOT, runId);
if (fs.existsSync(localDir)) fail("LOCAL_RUN_ALREADY_EXISTS", "Ehhez a runId-hez már létezik lokális build run könyvtár.");
fs.mkdirSync(localDir, { recursive: false, mode: 0o750 });
fs.mkdirSync(TEMP_ROOT, { recursive: true, mode: 0o750 });

const bundle = path.join(TEMP_ROOT, `${runId}.bundle`);
try {
  execFileSync(GIT_BIN, [`--git-dir=${REPO}`, "bundle", "create", bundle, branchRef], { stdio: ["ignore", "ignore", "inherit"], timeout: 120_000 });
  execFileSync(GIT_BIN, [`--git-dir=${REPO}`, "bundle", "verify", bundle], { stdio: ["ignore", "ignore", "inherit"], timeout: 60_000 });
  const bundleHead = execText(GIT_BIN, [`--git-dir=${REPO}`, "bundle", "list-heads", bundle, branchRef]).split(/\s+/)[0];
  if (bundleHead !== sourceCommit) fail("SOURCE_BUNDLE_HEAD_MISMATCH", "A létrehozott bundle HEAD eltér a kért sourceCommit értéktől.");

  const snapshot = loadSnapshot();
  const node = chooseNode(snapshot);
  const nodeId = node.id;

  execFileSync(SCP_BIN, scpArgs(bundle, `${nodeId}:/srv/dimpro-build/temp/${runId}.bundle`), {
    stdio: ["ignore", "ignore", "inherit"],
    timeout: 120_000,
  });

  const remoteCommand = [
    REMOTE_EXECUTOR,
    q(nodeId), q(runId), q(taskId), q(sessionId), q(workerCode), q(sourceCommit), q(sourceBranch),
  ].join(" ");
  const remote = spawnSync(SSH_BIN, sshArgs(nodeId, remoteCommand), {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    timeout: 60 * 60 * 1000,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const resultLocal = path.join(localDir, "result.json");
  try {
    execFileSync(SCP_BIN, scpArgs(`${nodeId}:/srv/dimpro-build/state/results/${runId}.json`, resultLocal), {
      stdio: ["ignore", "ignore", "inherit"],
      timeout: 60_000,
    });
  } catch {
    fail("RUNNER_RESULT_MISSING", `A runner nem adott vissza result JSON-t; sshExit=${remote.status ?? "null"}.`);
  }

  const result = JSON.parse(fs.readFileSync(resultLocal, "utf8"));
  if (remote.status !== 0 || result?.status !== "PASS" || result?.runId !== runId || result?.nodeId !== nodeId) {
    fail(String(result?.code || "REMOTE_BUILD_FAILED"), `Remote build FAIL · runner=${nodeId} · sshExit=${remote.status ?? "null"}.`);
  }

  const artifactLocal = path.join(localDir, "build-artifact.tar.gz");
  const metadataLocal = path.join(localDir, "metadata.json");
  execFileSync(SCP_BIN, scpArgs(`${nodeId}:/srv/dimpro-build/artifacts/${runId}/build-artifact.tar.gz`, artifactLocal), {
    stdio: ["ignore", "ignore", "inherit"],
    timeout: 180_000,
  });
  execFileSync(SCP_BIN, scpArgs(`${nodeId}:/srv/dimpro-build/artifacts/${runId}/metadata.json`, metadataLocal), {
    stdio: ["ignore", "ignore", "inherit"],
    timeout: 60_000,
  });

  const metadata = JSON.parse(fs.readFileSync(metadataLocal, "utf8"));
  const localSha = sha256(artifactLocal);
  const expected = {
    schemaVersion: 1,
    environment: "DEV",
    productionAccess: "DENY",
    runId,
    taskId,
    sessionId,
    workerCode,
    sourceCommit,
    sourceBranch,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (metadata?.[key] !== value) fail("ARTIFACT_METADATA_MISMATCH", `Artifact metadata eltérés: ${key}.`);
  }
  if (metadata?.runner?.id !== nodeId || metadata?.runner?.hostname !== `${nodeId}.dimpro.hu`) fail("ARTIFACT_RUNNER_MISMATCH", "Artifact runner metadata eltér.");
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(String(metadata?.buildId || ""))) fail("BUILD_ID_INVALID", "Artifact BUILD_ID érvénytelen.");
  if (!/^[0-9a-f]{64}$/i.test(String(metadata?.artifactSha256 || "")) || metadata.artifactSha256 !== localSha) fail("ARTIFACT_SHA256_MISMATCH", "Artifact SHA-256 eltér.");

  console.log(JSON.stringify({
    ok: true,
    environment: "DEV",
    productionAccess: "DENY",
    runId,
    runner: nodeId,
    buildId: metadata.buildId,
    sourceCommit,
    sourceBranch,
    artifactSha256: localSha,
    artifactDir: localDir,
  }, null, 2));
} finally {
  try { fs.unlinkSync(bundle); } catch {}
}
