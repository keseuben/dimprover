#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const RUN_ROOT = process.env.DIMPRO_BUILD_GATEWAY_RUN_ROOT || "/srv/dimpro-build-gateway/runs";
const SSH_BIN = "/usr/bin/ssh";
const SCP_BIN = "/usr/bin/scp";
const REMOTE_EXECUTOR = "/srv/dimpro-build/bin/dimpro-build-runner-executor-v1";
const DEV_ALIAS = process.env.DIMPRO_BUILD_GATEWAY_DEV_ALIAS || "dimpro-dev";
const DEV_ARTIFACT_ROOT = "/srv/dimpro-dev/artifacts/build-runs";
const RUNNERS = {
  build01: { hostname:"build01.dimpro.hu", sshAlias:"dimpro-build01" },
  build02: { hostname:"build02.dimpro.hu", sshAlias:"dimpro-build02" },
};

function safeId(value, label, pattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,219}$/) {
  if (typeof value !== "string" || !pattern.test(value)) throw Object.assign(new Error(`${label} invalid`), { code:`${label.toUpperCase()}_INVALID` });
  return value;
}
function q(value) { return `'${String(value).replace(/'/g, `'\\''`)}'`; }
function atomic(file, payload) {
  const temp = `${file}.${process.pid}.${crypto.randomUUID().slice(0,8)}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, { mode:0o600 });
  fs.renameSync(temp, file);
}
function sha256(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  try { const buffer=Buffer.allocUnsafe(1024*1024); let bytes; while((bytes=fs.readSync(fd,buffer,0,buffer.length,null))>0) hash.update(buffer.subarray(0,bytes)); }
  finally { fs.closeSync(fd); }
  return hash.digest("hex");
}
function sshArgs(alias, command) { return ["-o","BatchMode=yes","-o","ConnectTimeout=8","-o","ConnectionAttempts=1","-o","StrictHostKeyChecking=yes",alias,command]; }
function scpArgs(source, target) { return ["-o","BatchMode=yes","-o","ConnectTimeout=8","-o","ConnectionAttempts=1","-o","StrictHostKeyChecking=yes",source,target]; }
function readJson(file) { return JSON.parse(fs.readFileSync(file,"utf8")); }
function safeCode(value, fallback) { const text=String(value||fallback).toUpperCase(); return /^[A-Z0-9_:-]{2,160}$/.test(text) ? text : fallback; }
function queryRunner(id) {
  const def = RUNNERS[id];
  const raw = execFileSync(SSH_BIN, sshArgs(def.sshAlias, `/srv/dimpro-build/bin/dimpro-build-node-health-v1 ${id}`), { encoding:"utf8", timeout:12_000, maxBuffer:512*1024, stdio:["ignore","pipe","ignore"] });
  return JSON.parse(raw);
}
function runnerReady(raw, id) {
  const m=raw?.metrics; return raw?.schemaVersion===1 && raw?.id===id && raw?.hostname===RUNNERS[id].hostname && raw?.source==="DIMPRO_MCP_SSH_GATEWAY" && raw?.quality==="LIVE" && raw?.state==="READY" && m?.toolchainReady===true && m?.buildLockHeld===false && m?.currentRunId===null && m?.swapTotalBytes>=m?.swapMinimumBytes && ["SAFE","WATCH"].includes(String(m?.storageGovernor||"").toUpperCase());
}
function copyToDev(runId, files) {
  const targetDir = `${DEV_ARTIFACT_ROOT}/${runId}`;
  execFileSync(SSH_BIN, sshArgs(DEV_ALIAS, `mkdir -p ${q(targetDir)} && chmod 750 ${q(targetDir)}`), { stdio:["ignore","ignore","ignore"], timeout:30_000 });
  for (const [local, name] of files) {
    const remoteTmp = `${targetDir}/.${name}.${process.pid}.tmp`;
    const remoteFinal = `${targetDir}/${name}`;
    execFileSync(SCP_BIN, scpArgs(local, `${DEV_ALIAS}:${remoteTmp}`), { stdio:["ignore","ignore","ignore"], timeout:180_000 });
    execFileSync(SSH_BIN, sshArgs(DEV_ALIAS, `chmod 640 ${q(remoteTmp)} && mv -f ${q(remoteTmp)} ${q(remoteFinal)}`), { stdio:["ignore","ignore","ignore"], timeout:30_000 });
  }
}

const runId = safeId(process.argv[2], "runId", /^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/);
const runDir = path.join(RUN_ROOT, runId);
const statusFile = path.join(runDir, "status.json");
let record = readJson(statusFile);
const logFile = path.join(runDir, "worker.log");
const writeLog = (text) => fs.appendFileSync(logFile, `${new Date().toISOString()} ${String(text).slice(0,1200)}\n`, { mode:0o600 });

try {
  const runnerId = safeId(record.runnerId, "runnerId", /^(build01|build02)$/);
  const def = RUNNERS[runnerId];
  const health = queryRunner(runnerId);
  if (!runnerReady(health, runnerId)) throw Object.assign(new Error(`A kijelölt ${runnerId} runner már nem READY/FREE.`), { code:"ASSIGNED_BUILD_RUNNER_NOT_READY" });
  record = { ...record, status:"RUNNING", startedAt:new Date().toISOString() };
  atomic(statusFile, record);
  const bundle = path.join(runDir, "source.bundle");
  execFileSync(SCP_BIN, scpArgs(bundle, `${def.sshAlias}:/srv/dimpro-build/temp/${runId}.bundle`), { stdio:["ignore","ignore","ignore"], timeout:180_000 });
  const remoteCommand = [REMOTE_EXECUTOR,q(runnerId),q(record.runId),q(record.taskId),q(record.sessionId),q(record.workerCode),q(record.sourceCommit),q(record.sourceBranch)].join(" ");
  const remote = spawnSync(SSH_BIN, sshArgs(def.sshAlias, remoteCommand), { encoding:"utf8", maxBuffer:4*1024*1024, timeout:65*60*1000, stdio:["ignore","pipe","pipe"] });
  const output = `${remote.stdout||""}\n${remote.stderr||""}`;
  const outputSha256 = crypto.createHash("sha256").update(output).digest("hex");
  fs.writeFileSync(path.join(runDir,"runner-output.log"), output, { mode:0o600 });
  const runnerResultFile = path.join(runDir,"runner-result.json");
  execFileSync(SCP_BIN, scpArgs(`${def.sshAlias}:/srv/dimpro-build/state/results/${runId}.json`, runnerResultFile), { stdio:["ignore","ignore","ignore"], timeout:60_000 });
  const runnerResult = readJson(runnerResultFile);
  if (remote.status !== 0 || runnerResult?.status !== "PASS" || runnerResult?.runId !== runId || runnerResult?.nodeId !== runnerId) throw Object.assign(new Error(`Remote build FAIL · ${runnerId}.`), { code:safeCode(runnerResult?.code,"REMOTE_BUILD_FAILED") });
  const artifact = path.join(runDir,"build-artifact.tar.gz");
  const metadataFile = path.join(runDir,"metadata.json");
  execFileSync(SCP_BIN, scpArgs(`${def.sshAlias}:/srv/dimpro-build/artifacts/${runId}/build-artifact.tar.gz`, artifact), { stdio:["ignore","ignore","ignore"], timeout:240_000 });
  execFileSync(SCP_BIN, scpArgs(`${def.sshAlias}:/srv/dimpro-build/artifacts/${runId}/metadata.json`, metadataFile), { stdio:["ignore","ignore","ignore"], timeout:60_000 });
  const metadata = readJson(metadataFile);
  const expected = { schemaVersion:1,environment:"DEV",productionAccess:"DENY",runId,taskId:record.taskId,sessionId:record.sessionId,workerCode:record.workerCode,sourceCommit:record.sourceCommit,sourceBranch:record.sourceBranch };
  for (const [key,value] of Object.entries(expected)) if (metadata?.[key] !== value) throw Object.assign(new Error(`Artifact metadata eltérés: ${key}.`), { code:"ARTIFACT_METADATA_MISMATCH" });
  if (metadata?.runner?.id !== runnerId || metadata?.runner?.hostname !== def.hostname) throw Object.assign(new Error("Artifact runner metadata eltér."), { code:"ARTIFACT_RUNNER_MISMATCH" });
  const artifactSha256 = sha256(artifact);
  if (!/^[0-9a-f]{64}$/i.test(String(metadata?.artifactSha256||"")) || metadata.artifactSha256 !== artifactSha256) throw Object.assign(new Error("Artifact SHA-256 eltér."), { code:"ARTIFACT_SHA256_MISMATCH" });
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(String(metadata?.buildId||""))) throw Object.assign(new Error("BUILD_ID érvénytelen."), { code:"BUILD_ID_INVALID" });
  const devResult = path.join(runDir,"result.json");
  atomic(devResult, { schemaVersion:1,environment:"DEV",productionAccess:"DENY",runId,nodeId:runnerId,status:"PASS",code:null,buildId:metadata.buildId,artifactSha256,outputSha256,sourceCommit:record.sourceCommit,sourceBranch:record.sourceBranch,startedAt:record.startedAt,finishedAt:new Date().toISOString() });
  copyToDev(runId, [[artifact,"build-artifact.tar.gz"],[metadataFile,"metadata.json"],[devResult,"result.json"]]);
  record = { ...record, status:"PASS", code:null, buildId:metadata.buildId, artifactSha256, outputSha256, finishedAt:new Date().toISOString() };
  atomic(statusFile, record);
  writeLog(`PASS ${runnerId} ${metadata.buildId} ${artifactSha256}`);
  process.exit(0);
} catch (error) {
  const code = safeCode(error?.code, "BUILD_GATEWAY_WORKER_FAILED");
  writeLog(`${code} ${error instanceof Error ? error.message : "worker error"}`);
  record = { ...record, status:code === "ASSIGNED_BUILD_RUNNER_NOT_READY" ? "BLOCKED" : "FAIL", code, finishedAt:new Date().toISOString() };
  atomic(statusFile, record);
  process.exit(1);
}
