#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dispatchBuildGatewayRun, getBuildGatewayRun } from "./build-gateway-client.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.DIMPRO_DEVELOPER_GRID_REPOSITORY?.trim() || "/srv/dimpro-dev/repositories/dimprover.git";
const SNAPSHOT_FILE = process.env.BENJADMIN_BUILD_NODE_SNAPSHOT_FILE?.trim() || "/srv/dimpro-dev/coordination/health-snapshots/build-nodes.json";
const LOCAL_ROOT = process.env.DIMPRO_BUILD_ARTIFACT_ROOT?.trim() || "/srv/dimpro-dev/artifacts/build-runs";
const TEMP_ROOT = process.env.DIMPRO_BUILD_DISPATCH_TEMP_ROOT?.trim() || "/srv/dimpro-dev/coordination/build-dispatch";
const REFRESH_SCRIPT = path.join(ROOT, "refresh-build-gateway-snapshot.mjs");
const GIT_BIN = process.env.DIMPRO_REMOTE_BUILD_GIT_BIN?.trim() || "/usr/bin/git";
const RUNNER_PRIORITY = ["build01", "build02"];
const MAX_AGE_MS = 60_000;
const POLL_INTERVAL_MS = Number(process.env.DIMPRO_BUILD_GATEWAY_POLL_INTERVAL_MS || 3_000);
const RUN_TIMEOUT_MS = Number(process.env.DIMPRO_BUILD_GATEWAY_RUN_TIMEOUT_MS || 65 * 60 * 1000);

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
function safeRunner(value) {
  if (value === undefined || value === null || value === "") return null;
  if (!RUNNER_PRIORITY.includes(value)) fail("RUNNER_ID_INVALID", "runnerId érvénytelen.");
  return value;
}
function safeCommit(value) {
  if (!/^[0-9a-f]{40}$/i.test(value || "")) fail("SOURCE_COMMIT_INVALID", "sourceCommit nem teljes Git SHA.");
  return value.toLowerCase();
}
function safeBranch(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 220 || !/^[A-Za-z0-9._/-]+$/.test(value) || value.startsWith("-") || value.includes("..")) fail("SOURCE_BRANCH_INVALID", "sourceBranch érvénytelen.");
  const check = spawnSync(GIT_BIN, ["check-ref-format", "--branch", value], { stdio:"ignore" });
  if (check.status !== 0) fail("SOURCE_BRANCH_INVALID", "sourceBranch nem érvényes Git branch.");
  return value;
}
function execText(bin,args,options={}) { return execFileSync(bin,args,{encoding:"utf8",maxBuffer:2*1024*1024,...options}).trim(); }
function sha256(file) {
  const hash=crypto.createHash("sha256"); const fd=fs.openSync(file,"r");
  try { const buffer=Buffer.allocUnsafe(1024*1024); let bytes; while((bytes=fs.readSync(fd,buffer,0,buffer.length,null))>0) hash.update(buffer.subarray(0,bytes)); }
  finally { fs.closeSync(fd); }
  return hash.digest("hex");
}
function loadSnapshot() {
  try { execFileSync(process.execPath,[REFRESH_SCRIPT],{timeout:45_000,stdio:["ignore","ignore","inherit"]}); }
  catch (error) { fail("BUILD_GATEWAY_HEALTH_REFRESH_FAILED", `A Build Transport Gateway health refresh sikertelen: ${error?.code || "UNKNOWN"}.`); }
  const parsed=JSON.parse(fs.readFileSync(SNAPSHOT_FILE,"utf8"));
  if (parsed?.schemaVersion!==1 || parsed?.environment!=="DEV" || parsed?.productionAccess!=="DENY" || parsed?.source!=="DIMPRO_MCP_SSH_GATEWAY" || !Array.isArray(parsed.nodes) || !Number.isFinite(Date.parse(parsed.sampledAt))) fail("BUILD_SNAPSHOT_INVALID","A BUILD gateway snapshot szerződése érvénytelen.");
  if (Math.abs(Date.now()-Date.parse(parsed.sampledAt))>MAX_AGE_MS) fail("BUILD_SNAPSHOT_STALE","A BUILD gateway snapshot elavult.");
  return parsed;
}
function usable(node) {
  if (!node || node.quality!=="LIVE" || node.state!=="READY") return false;
  const m=node.metrics;
  if (!m || m.toolchainReady!==true || m.buildLockHeld!==false || m.currentRunId!==null) return false;
  if (!(m.swapTotalBytes>=m.swapMinimumBytes)) return false;
  if (!["SAFE","WATCH"].includes(String(m.storageGovernor||"").toUpperCase())) return false;
  if (!Number.isFinite(Date.parse(node.lastVerifiedAt)) || Math.abs(Date.now()-Date.parse(node.lastVerifiedAt))>MAX_AGE_MS) return false;
  return true;
}
function chooseNode(snapshot, requestedRunnerId=null) {
  const ids=requestedRunnerId?[requestedRunnerId]:RUNNER_PRIORITY;
  for (const id of ids) { const node=snapshot.nodes.find((item)=>item?.id===id); if(usable(node)) return node; }
  if (requestedRunnerId) fail("ASSIGNED_BUILD_RUNNER_NOT_READY",`A kijelölt ${requestedRunnerId} runner már nem READY/FREE.`);
  fail("NO_READY_BUILD_RUNNER","Nincs READY és FREE BUILD-01/BUILD-02 runner.");
}
function sleep(ms) { return new Promise((resolve)=>setTimeout(resolve,ms)); }
async function waitForGatewayRun(runId) {
  const started=Date.now();
  while (Date.now()-started<RUN_TIMEOUT_MS) {
    const response=await getBuildGatewayRun(runId);
    const run=response?.run;
    if (run?.status==="PASS") return run;
    if (["FAIL","BLOCKED"].includes(run?.status)) fail(String(run?.code||"REMOTE_BUILD_FAILED"),`MCP Build Transport Gateway ${run.status} · ${run?.runnerId||"runner"}.`);
    await sleep(POLL_INTERVAL_MS);
  }
  fail("BUILD_GATEWAY_RUN_TIMEOUT","Az MCP Build Transport Gateway run túllépte az időkorlátot.");
}
async function waitForFile(file, timeoutMs=30_000) {
  const started=Date.now();
  while(Date.now()-started<timeoutMs) { if(fs.existsSync(file)) return; await sleep(500); }
  fail("BUILD_GATEWAY_ARTIFACT_SYNC_TIMEOUT",`A gateway által visszaszinkronizált fájl nem érkezett meg: ${path.basename(file)}.`);
}

const args=parseArgs(process.argv.slice(2));
const runId=safeId(args["run-id"],"runId");
const taskId=safeId(args["task-id"],"taskId");
const sessionId=safeId(args["session-id"],"sessionId");
const workerCode=safeWorker(args["worker-code"]);
const sourceCommit=safeCommit(args["source-commit"]);
const sourceBranch=safeBranch(args["source-branch"]);
const requestedRunnerId=safeRunner(args["runner-id"]);

const branchRef=`refs/heads/${sourceBranch}`;
const actualHead=execText(GIT_BIN,[`--git-dir=${REPO}`,"rev-parse",`${branchRef}^{commit}`]);
if(actualHead!==sourceCommit) fail("SOURCE_BASELINE_MISMATCH",`Canonical branch HEAD ${actualHead} != ${sourceCommit}.`);

fs.mkdirSync(LOCAL_ROOT,{recursive:true,mode:0o750}); fs.chmodSync(LOCAL_ROOT,0o750);
const localDir=path.join(LOCAL_ROOT,runId);
if(fs.existsSync(localDir)) fail("LOCAL_RUN_ALREADY_EXISTS","Ehhez a runId-hez már létezik lokális build run könyvtár.");
fs.mkdirSync(localDir,{recursive:false,mode:0o750});
fs.mkdirSync(TEMP_ROOT,{recursive:true,mode:0o750});
const bundle=path.join(TEMP_ROOT,`${runId}.bundle`);
try {
  execFileSync(GIT_BIN,[`--git-dir=${REPO}`,"bundle","create",bundle,branchRef],{stdio:["ignore","ignore","inherit"],timeout:120_000});
  execFileSync(GIT_BIN,[`--git-dir=${REPO}`,"bundle","verify",bundle],{stdio:["ignore","ignore","inherit"],timeout:60_000});
  const bundleHead=execText(GIT_BIN,[`--git-dir=${REPO}`,"bundle","list-heads",bundle,branchRef]).split(/\s+/)[0];
  if(bundleHead!==sourceCommit) fail("SOURCE_BUNDLE_HEAD_MISMATCH","A létrehozott bundle HEAD eltér a kért sourceCommit értéktől.");
  const snapshot=loadSnapshot();
  const node=chooseNode(snapshot,requestedRunnerId);
  const nodeId=node.id;
  const accepted=await dispatchBuildGatewayRun({runId,taskId,sessionId,workerCode,sourceCommit,sourceBranch,runnerId:nodeId,bundleFile:bundle});
  if (accepted?.run?.runId!==runId || accepted?.run?.runnerId!==nodeId || accepted?.run?.productionAccess!=="DENY") fail("BUILD_GATEWAY_DISPATCH_MISMATCH","A Build Transport Gateway dispatch visszaigazolása eltér az authoritative run-tól.");
  const gatewayRun=await waitForGatewayRun(runId);
  const resultLocal=path.join(localDir,"result.json");
  const artifactLocal=path.join(localDir,"build-artifact.tar.gz");
  const metadataLocal=path.join(localDir,"metadata.json");
  await Promise.all([waitForFile(resultLocal),waitForFile(artifactLocal),waitForFile(metadataLocal)]);
  const result=JSON.parse(fs.readFileSync(resultLocal,"utf8"));
  if(result?.status!=="PASS" || result?.runId!==runId || result?.nodeId!==nodeId) fail(String(result?.code||"REMOTE_BUILD_FAILED"),`Gateway-szinkronizált remote build eredmény eltér · runner=${nodeId}.`);
  const metadata=JSON.parse(fs.readFileSync(metadataLocal,"utf8"));
  const localSha=sha256(artifactLocal);
  const expected={schemaVersion:1,environment:"DEV",productionAccess:"DENY",runId,taskId,sessionId,workerCode,sourceCommit,sourceBranch};
  for(const [key,value] of Object.entries(expected)) if(metadata?.[key]!==value) fail("ARTIFACT_METADATA_MISMATCH",`Artifact metadata eltérés: ${key}.`);
  if(metadata?.runner?.id!==nodeId || metadata?.runner?.hostname!==`${nodeId}.dimpro.hu`) fail("ARTIFACT_RUNNER_MISMATCH","Artifact runner metadata eltér.");
  if(!/^[A-Za-z0-9_-]{1,180}$/.test(String(metadata?.buildId||""))) fail("BUILD_ID_INVALID","Artifact BUILD_ID érvénytelen.");
  if(!/^[0-9a-f]{64}$/i.test(String(metadata?.artifactSha256||"")) || metadata.artifactSha256!==localSha) fail("ARTIFACT_SHA256_MISMATCH","Artifact SHA-256 eltér.");
  if(gatewayRun.buildId!==metadata.buildId || gatewayRun.artifactSha256!==localSha) fail("BUILD_GATEWAY_RESULT_MISMATCH","Gateway run státusz és artifact metadata eltér.");
  console.log(JSON.stringify({ok:true,environment:"DEV",productionAccess:"DENY",transport:"MCP_BUILD_TRANSPORT_GATEWAY_V1",runId,runner:nodeId,buildId:metadata.buildId,sourceCommit,sourceBranch,artifactSha256:localSha,artifactDir:localDir},null,2));
} finally {
  try{fs.unlinkSync(bundle);}catch{}
}
