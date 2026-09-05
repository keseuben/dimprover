#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DISPATCH = path.join(SCRIPT_DIR, "remote-build-dispatch.mjs");
const ROOT = process.env.BENJADMIN_DEVELOPER_GRID_STATE_ROOT?.trim() || "/srv/dimpro-dev/coordination/developer-grid";
const JOB_DIR = path.join(ROOT, "build-runs");

function safeId(value, label, pattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,219}$/) {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(`${label} invalid`);
  return value;
}
function atomic(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${crypto.randomUUID().slice(0,8)}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}
function sha(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }

const [runIdRaw, taskIdRaw, sessionIdRaw, workerRaw, commitRaw, branchRaw, nodeRaw] = process.argv.slice(2);
const runId = safeId(runIdRaw, "runId", /^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/);
const taskId = safeId(taskIdRaw, "taskId");
const sessionId = safeId(sessionIdRaw, "sessionId");
const workerCode = safeId(workerRaw, "workerCode", /^(ARMINAI|OUTMINAI|BENJAMINAI|JAZMINAI|DEVMINAI)$/);
const sourceCommit = safeId(commitRaw, "sourceCommit", /^[0-9a-f]{40}$/i).toLowerCase();
const sourceBranch = safeId(branchRaw, "sourceBranch", /^[A-Za-z0-9._/-]{1,220}$/);
const nodeId = safeId(nodeRaw, "nodeId", /^(build01|build02)$/);
const resultFile = path.join(JOB_DIR, `${runId}.result.json`);
const logFile = path.join(JOB_DIR, `${runId}.log`);
const startedAt = new Date().toISOString();
const base = { schemaVersion:1, environment:"DEV", productionAccess:"DENY", runId, nodeId, startedAt, finishedAt:null, exitCode:null, code:null, buildId:null, artifactSha256:null, artifactDir:null, evidenceRef:logFile, outputSha256:null };
atomic(resultFile, { ...base, status:"RUNNING" });

const args = [DISPATCH, "--run-id", runId, "--task-id", taskId, "--session-id", sessionId, "--worker-code", workerCode, "--source-commit", sourceCommit, "--source-branch", sourceBranch, "--runner-id", nodeId];
const child = spawnSync(process.execPath, args, { encoding:"utf8", maxBuffer:4*1024*1024, timeout:65*60*1000 });
const output = `${child.stdout || ""}\n${child.stderr || ""}`;
fs.writeFileSync(logFile, output, { mode:0o600 });
const outputSha256 = sha(output);
const finishedAt = new Date().toISOString();
let payload = null;
try { payload = JSON.parse(String(child.stdout || "").trim()); } catch {}
if (child.status === 0 && payload?.ok === true && payload?.runner === nodeId) {
  atomic(resultFile, { ...base, status:"PASS", finishedAt, exitCode:0, code:null, buildId:String(payload.buildId||""), artifactSha256:String(payload.artifactSha256||""), artifactDir:String(payload.artifactDir||""), outputSha256 });
  process.exit(0);
}
let runnerResult = null;
try { runnerResult = JSON.parse(fs.readFileSync(`/srv/dimpro-dev/artifacts/build-runs/${runId}/result.json`, "utf8")); } catch {}
atomic(resultFile, { ...base, status: runnerResult?.status === "BLOCKED" ? "BLOCKED" : "FAIL", finishedAt, exitCode:Number.isInteger(child.status)?child.status:1, code:String(runnerResult?.code || "REMOTE_BUILD_DISPATCH_FAILED").slice(0,160), buildId:runnerResult?.buildId ? String(runnerResult.buildId).slice(0,180) : null, artifactSha256:null, artifactDir:null, outputSha256 });
process.exit(Number.isInteger(child.status) && child.status !== 0 ? child.status : 1);
