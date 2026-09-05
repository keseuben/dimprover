#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DIMPRO_BUILD_GATEWAY_PORT || 8791);
const HOST = process.env.DIMPRO_BUILD_GATEWAY_HOST || "127.0.0.1";
const TOKEN_FILE = process.env.DIMPRO_BUILD_GATEWAY_TOKEN_FILE || "/etc/dimpro-build-gateway/token";
const RUN_ROOT = process.env.DIMPRO_BUILD_GATEWAY_RUN_ROOT || "/srv/dimpro-build-gateway/runs";
const WORKER = process.env.DIMPRO_BUILD_GATEWAY_WORKER || path.join(HERE, "worker.mjs");
const MAX_BUNDLE_BYTES = Number(process.env.DIMPRO_BUILD_GATEWAY_MAX_BUNDLE_BYTES || 512 * 1024 * 1024);
const GIT_BIN = "/usr/bin/git";
const VERIFY_REPO = process.env.DIMPRO_BUILD_GATEWAY_VERIFY_REPO || "/srv/dimpro-build-gateway/verify.git";
const SSH_BIN = "/usr/bin/ssh";
const RUNNERS = {
  build01: { id: "build01", hostname: "build01.dimpro.hu", sshAlias: "dimpro-build01" },
  build02: { id: "build02", hostname: "build02.dimpro.hu", sshAlias: "dimpro-build02" },
};

function fail(code, message, status = 400) {
  const error = new Error(message);
  Object.assign(error, { code, status });
  throw error;
}
function safeId(value, label, pattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,219}$/) {
  if (typeof value !== "string" || !pattern.test(value)) fail(`${label.toUpperCase()}_INVALID`, `${label} érvénytelen.`);
  return value;
}
function safeWorker(value) {
  return safeId(value, "workerCode", /^(ARMINAI|OUTMINAI|BENJAMINAI|JAZMINAI|DEVMINAI)$/);
}
function safeCommit(value) {
  return safeId(value, "sourceCommit", /^[0-9a-f]{40}$/i).toLowerCase();
}
function safeBranch(value) {
  const branch = safeId(value, "sourceBranch", /^[A-Za-z0-9._/-]{1,220}$/);
  if (branch.startsWith("-") || branch.includes("..")) fail("SOURCE_BRANCH_INVALID", "sourceBranch érvénytelen.");
  const result = spawnSync(GIT_BIN, ["check-ref-format", "--branch", branch], { stdio: "ignore" });
  if (result.status !== 0) fail("SOURCE_BRANCH_INVALID", "sourceBranch nem érvényes Git branch.");
  return branch;
}
function safeRunner(value) {
  if (!Object.hasOwn(RUNNERS, value)) fail("RUNNER_ID_INVALID", "runnerId csak build01 vagy build02 lehet.");
  return value;
}
function readToken() {
  const value = fs.readFileSync(TOKEN_FILE, "utf8").trim();
  if (value.length < 32 || value.length > 256) throw new Error("Build gateway token konfiguráció érvénytelen.");
  return value;
}
function authorized(req) {
  const remote = String(req.socket.remoteAddress || "");
  const trustedProxy = (remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1") && String(req.headers["x-dimpro-build-gateway-proxy"] || "") === "1";
  if (trustedProxy) return true;
  const raw = String(req.headers.authorization || "");
  if (!raw.startsWith("Bearer ")) return false;
  let expected;
  try { expected = readToken(); } catch { return false; }
  const provided = raw.slice(7);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function json(res, status, payload) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": body.length, "cache-control": "no-store" });
  res.end(body);
}
function atomicJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  const temp = `${file}.${process.pid}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}
function safeRunDir(runId) {
  return path.join(RUN_ROOT, safeId(runId, "runId", /^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/));
}
function readRun(runId) {
  const file = path.join(safeRunDir(runId), "status.json");
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
function sanitizeHealth(raw, def) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const m = raw.metrics;
  if (raw.schemaVersion !== 1 || raw.id !== def.id || raw.hostname !== def.hostname || raw.source !== "DIMPRO_MCP_SSH_GATEWAY" || raw.quality !== "LIVE" || !m || typeof m !== "object") return null;
  const metrics = {
    cpuPercent: Number(m.cpuPercent), load1: Number(m.load1), cores: Number(m.cores),
    memoryTotalBytes: Number(m.memoryTotalBytes), memoryUsedBytes: Number(m.memoryUsedBytes), memoryAvailableBytes: Number(m.memoryAvailableBytes), memoryPercent: Number(m.memoryPercent),
    swapTotalBytes: Number(m.swapTotalBytes), swapUsedBytes: Number(m.swapUsedBytes), swapMinimumBytes: Number(m.swapMinimumBytes), swapPercent: Number(m.swapPercent),
    diskTotalBytes: Number(m.diskTotalBytes), diskUsedBytes: Number(m.diskUsedBytes), diskAvailableBytes: Number(m.diskAvailableBytes), diskPercent: Number(m.diskPercent),
    uptimeSeconds: Number(m.uptimeSeconds), buildLockHeld: m.buildLockHeld, currentRunId: m.currentRunId ?? null, queueDepth: m.queueDepth ?? null,
    storageGovernor: String(m.storageGovernor || ""), toolchainReady: m.toolchainReady,
    nodeVersion: String(m.nodeVersion || ""), npmVersion: String(m.npmVersion || ""), gitVersion: String(m.gitVersion || ""), architecture: String(m.architecture || ""), kernel: String(m.kernel || ""),
  };
  const numerics = ["cpuPercent","load1","cores","memoryTotalBytes","memoryUsedBytes","memoryAvailableBytes","memoryPercent","swapTotalBytes","swapUsedBytes","swapMinimumBytes","swapPercent","diskTotalBytes","diskUsedBytes","diskAvailableBytes","diskPercent","uptimeSeconds"];
  if (numerics.some((key) => !Number.isFinite(metrics[key]) || metrics[key] < 0)) return null;
  if (typeof metrics.buildLockHeld !== "boolean" || typeof metrics.toolchainReady !== "boolean") return null;
  return { schemaVersion:1, id:def.id, hostname:def.hostname, state:["READY","BUSY","BLOCKED","NOT_CONNECTED"].includes(raw.state) ? raw.state : "BLOCKED", reason:String(raw.reason || "MCP SSH gateway health." ).slice(0,240), lastVerifiedAt:String(raw.lastVerifiedAt || ""), source:"DIMPRO_MCP_SSH_GATEWAY", quality:"LIVE", metrics };
}
function queryRunner(def) {
  try {
    const stdout = execFileSync(SSH_BIN, ["-o","BatchMode=yes","-o","ConnectTimeout=8","-o","ConnectionAttempts=1","-o","StrictHostKeyChecking=yes",def.sshAlias,`/srv/dimpro-build/bin/dimpro-build-node-health-v1 ${def.id}`], { encoding:"utf8", timeout:12_000, maxBuffer:512*1024, stdio:["ignore","pipe","ignore"], env:{...process.env,LC_ALL:"C"} });
    const node = sanitizeHealth(JSON.parse(stdout), def);
    if (node) return node;
  } catch {}
  return { schemaVersion:1, id:def.id, hostname:def.hostname, state:"NOT_CONNECTED", reason:"Az MCP Build Transport Gateway nem kapott érvényes health választ.", lastVerifiedAt:new Date().toISOString(), source:"DIMPRO_MCP_SSH_GATEWAY", quality:"UNKNOWN", metrics:null };
}
function snapshot() {
  return { schemaVersion:1, environment:"DEV", productionAccess:"DENY", source:"DIMPRO_MCP_SSH_GATEWAY", sampledAt:new Date().toISOString(), nodes:Object.values(RUNNERS).map(queryRunner) };
}
function usable(node) {
  const m = node?.metrics;
  return node?.quality === "LIVE" && node?.state === "READY" && m?.toolchainReady === true && m?.buildLockHeld === false && m?.currentRunId === null && m?.swapTotalBytes >= m?.swapMinimumBytes && ["SAFE","WATCH"].includes(String(m?.storageGovernor || "").toUpperCase());
}
function ensureVerifyRepo() {
  if (!fs.existsSync(path.join(VERIFY_REPO, "HEAD"))) {
    fs.mkdirSync(path.dirname(VERIFY_REPO), { recursive:true, mode:0o750 });
    execFileSync(GIT_BIN, ["init", "--bare", VERIFY_REPO], { stdio:["ignore","ignore","ignore"], timeout:30_000 });
  }
}
function verifyBundle(bundle, sourceBranch, sourceCommit) {
  ensureVerifyRepo();
  execFileSync(GIT_BIN, [`--git-dir=${VERIFY_REPO}`, "bundle", "verify", bundle], { stdio:["ignore","ignore","ignore"], timeout:60_000 });
  const ref = `refs/heads/${sourceBranch}`;
  const out = execFileSync(GIT_BIN, ["bundle", "list-heads", bundle, ref], { encoding:"utf8", timeout:30_000 }).trim();
  const head = out.split(/\s+/)[0] || "";
  if (head !== sourceCommit) fail("SOURCE_BUNDLE_HEAD_MISMATCH", "A feltöltött Git bundle HEAD eltér a kért sourceCommit értéktől.", 409);
}
async function receiveBundle(req, file) {
  let bytes = 0;
  const temp = `${file}.${process.pid}.upload`;
  const stream = fs.createWriteStream(temp, { flags:"wx", mode:0o600 });
  try {
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > MAX_BUNDLE_BYTES) fail("SOURCE_BUNDLE_TOO_LARGE", "A source bundle meghaladja az engedélyezett méretet.", 413);
      if (!stream.write(chunk)) await new Promise((resolve) => stream.once("drain", resolve));
    }
    await new Promise((resolve, reject) => stream.end((error) => error ? reject(error) : resolve()));
    if (bytes < 128) fail("SOURCE_BUNDLE_INVALID", "A source bundle üres vagy túl rövid.");
    fs.renameSync(temp, file);
    return bytes;
  } catch (error) {
    stream.destroy();
    try { fs.unlinkSync(temp); } catch {}
    throw error;
  }
}

fs.mkdirSync(RUN_ROOT, { recursive:true, mode:0o750 });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/health" && req.method === "GET") return json(res, 200, { ok:true, service:"DIMPRO_BUILD_TRANSPORT_GATEWAY_V1", environment:"DEV", productionAccess:"DENY" });
    if (!authorized(req)) return json(res, 401, { ok:false, code:"BUILD_GATEWAY_UNAUTHORIZED", error:"Unauthorized." });
    if (url.pathname === "/nodes" && req.method === "GET") return json(res, 200, { ok:true, snapshot:snapshot() });
    const runMatch = url.pathname.match(/^\/runs\/([A-Za-z0-9][A-Za-z0-9._:-]{2,159})$/);
    if (runMatch && req.method === "GET") {
      const record = readRun(runMatch[1]);
      return record ? json(res, 200, { ok:true, run:record }) : json(res, 404, { ok:false, code:"BUILD_GATEWAY_RUN_NOT_FOUND", error:"A run nem található." });
    }
    if (url.pathname === "/dispatch" && req.method === "POST") {
      const runId = safeId(url.searchParams.get("runId"), "runId", /^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/);
      const taskId = safeId(url.searchParams.get("taskId"), "taskId");
      const sessionId = safeId(url.searchParams.get("sessionId"), "sessionId");
      const workerCode = safeWorker(url.searchParams.get("workerCode"));
      const sourceCommit = safeCommit(url.searchParams.get("sourceCommit"));
      const sourceBranch = safeBranch(url.searchParams.get("sourceBranch"));
      const runnerId = safeRunner(url.searchParams.get("runnerId"));
      const runDir = safeRunDir(runId);
      try { fs.mkdirSync(runDir, { recursive:false, mode:0o750 }); }
      catch (error) { if (error?.code === "EEXIST") fail("BUILD_GATEWAY_RUN_EXISTS", "Ehhez a runId-hez már létezik gateway run.", 409); throw error; }
      try {
        const bundle = path.join(runDir, "source.bundle");
        const bundleBytes = await receiveBundle(req, bundle);
        verifyBundle(bundle, sourceBranch, sourceCommit);
        const nodes = snapshot();
        const assigned = nodes.nodes.find((node) => node.id === runnerId);
        if (!usable(assigned)) fail("ASSIGNED_BUILD_RUNNER_NOT_READY", `A kijelölt ${runnerId} runner nem READY/FREE.`, 409);
        const record = { schemaVersion:1, environment:"DEV", productionAccess:"DENY", runId, taskId, sessionId, workerCode, sourceCommit, sourceBranch, runnerId, status:"QUEUED", code:null, buildId:null, artifactSha256:null, outputSha256:null, bundleBytes, createdAt:new Date().toISOString(), startedAt:null, finishedAt:null };
        atomicJson(path.join(runDir, "status.json"), record);
        const child = spawn(process.execPath, [WORKER, runId], { detached:true, stdio:["ignore","ignore","ignore"], env:{...process.env,DIMPRO_BUILD_GATEWAY_RUN_ROOT:RUN_ROOT,DIMPRO_BUILD_GATEWAY_TOKEN_FILE:TOKEN_FILE} });
        child.unref();
        return json(res, 202, { ok:true, run:record });
      } catch (error) {
        try { fs.rmSync(runDir, { recursive:true, force:true }); } catch {}
        throw error;
      }
    }
    return json(res, 404, { ok:false, code:"BUILD_GATEWAY_NOT_FOUND", error:"Not found." });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code || "BUILD_GATEWAY_ERROR") : "BUILD_GATEWAY_ERROR";
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) || 500 : 500;
    return json(res, status, { ok:false, code, error:error instanceof Error ? error.message.slice(0,400) : "Build gateway hiba." });
  }
});

server.listen(PORT, HOST, () => console.log(`DIMPRO Build Transport Gateway V1 listening on ${HOST}:${PORT} · DEV ONLY · PROD DENY`));
