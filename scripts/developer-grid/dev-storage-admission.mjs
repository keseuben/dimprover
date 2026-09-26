#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const GIB = 1024 ** 3;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "../..");
const DEV_ROOT = path.resolve(process.env.DIMPRO_DEV_ROOT?.trim() || "/srv/dimpro-dev");
const CONFIG = path.resolve(process.env.DIMPRO_RETENTION_CONFIG?.trim() || path.join(PROJECT_ROOT, "config/dimpro-dev-storage-retention.json"));

export function evaluateStorageAdmission({ freeBytes, totalBytes, hardMinGiB, reserveGiB, emergencyUsedPercent }) {
  for (const [label,value] of Object.entries({ freeBytes,totalBytes,hardMinGiB,reserveGiB,emergencyUsedPercent })) {
    if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error("STORAGE_ADMISSION_INVALID_" + label.toUpperCase());
  }
  const free = Number(freeBytes);
  const total = Number(totalBytes);
  if (!(total > 0) || free > total) throw new Error("STORAGE_ADMISSION_INVALID_DISK_STATE");
  const hardMinBytes = Number(hardMinGiB) * GIB;
  const reserveBytes = Number(reserveGiB) * GIB;
  const requiredFreeBeforeBytes = hardMinBytes + reserveBytes;
  const projectedFreeBytes = Math.max(0, free - reserveBytes);
  const usedPercent = ((total - free) / total) * 100;
  const reasons = [];
  if (free < requiredFreeBeforeBytes) reasons.push("PROJECTED_FREE_BELOW_HARD_MIN");
  if (usedPercent >= Number(emergencyUsedPercent)) reasons.push("EMERGENCY_USED_PERCENT");
  return {
    ok: reasons.length === 0,
    reasons,
    freeBytes: free,
    totalBytes: total,
    usedPercent: Number(usedPercent.toFixed(2)),
    hardMinGiB: Number(hardMinGiB),
    reserveGiB: Number(reserveGiB),
    hardMinBytes,
    reserveBytes,
    requiredFreeBeforeBytes,
    projectedFreeBytes,
    projectedFreeGiB: Number((projectedFreeBytes / GIB).toFixed(2)),
  };
}

export function evaluateRuntimeRetention({ onlineCount, maxOnline }) {
  const count = Number(onlineCount);
  const limit = Number(maxOnline);
  if (!Number.isInteger(count) || count < 0 || !Number.isInteger(limit) || limit < 1) throw new Error("RUNTIME_RETENTION_CONFIG_INVALID");
  return { ok:count <= limit, onlineCount:count, maxOnline:limit, reason:count <= limit ? null : "RUNTIME_RETENTION_LIMIT" };
}

function onlineDeveloperGridRuntimeCandidates() {
  const result = spawnSync("pm2", ["jlist"], { encoding:"utf8", maxBuffer:4*1024*1024 });
  if (result.status !== 0) throw new Error("RUNTIME_RETENTION_PM2_UNAVAILABLE");
  let rows;
  try { rows = JSON.parse(result.stdout || "[]"); } catch { throw new Error("RUNTIME_RETENTION_PM2_INVALID"); }
  return rows.filter((row) => {
    const name = String(row?.name || "");
    const status = String(row?.pm2_env?.status || "").toLowerCase();
    return status === "online" && /^dimpro-developer-grid-v\d{4}-.*-candidate$/.test(name);
  }).map((row) => String(row.name));
}

export function operationReserveGiB(config, operation) {
  const admission = config?.developerGridAdmission || {};
  if (operation === "remote-build") return Number(admission.remoteBuildReserveGiB);
  if (operation === "windows-package") return Number(admission.windowsPackageReserveGiB);
  throw new Error("STORAGE_ADMISSION_OPERATION_INVALID");
}

function parseArgs(argv) {
  const out = {};
  for (let i=0;i<argv.length;i+=1) {
    const arg = argv[i];
    if (arg === "--json") { out.json = true; continue; }
    if (arg === "--operation") { out.operation = argv[++i]; continue; }
    if (arg.startsWith("--operation=")) { out.operation = arg.slice("--operation=".length); continue; }
    throw new Error("STORAGE_ADMISSION_ARGUMENT_INVALID:" + arg);
  }
  return out;
}

function diskState(target) {
  const s = fs.statfsSync(target);
  const block = Number(s.bsize);
  return { totalBytes:Number(s.blocks) * block, freeBytes:Number(s.bavail) * block };
}

export function runStorageAdmission({ operation, configFile=CONFIG, devRoot=DEV_ROOT }) {
  if (!["remote-build","windows-package"].includes(operation)) throw new Error("STORAGE_ADMISSION_OPERATION_INVALID");
  if (!devRoot.startsWith("/srv/dimpro-dev")) {
    return { ok:true, bypassed:true, environment:"NON_CANONICAL_DEV", productionAccess:"DENY", operation };
  }
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  const hardMinGiB = Number(config.preBuildHardMinFreeGiB);
  const emergencyUsedPercent = Number(config.emergencyUsedPercent);
  const reserveGiB = operationReserveGiB(config, operation);
  if (![hardMinGiB, emergencyUsedPercent, reserveGiB].every(Number.isFinite)) throw new Error("STORAGE_ADMISSION_CONFIG_INVALID");
  const disk = diskState(devRoot);
  const evaluation = evaluateStorageAdmission({ ...disk, hardMinGiB, reserveGiB, emergencyUsedPercent });
  const runtimeCandidates = onlineDeveloperGridRuntimeCandidates();
  const runtimeRetention = evaluateRuntimeRetention({
    onlineCount:runtimeCandidates.length,
    maxOnline:Number(config?.developerGridAdmission?.maxOnlineRuntimeCandidatesBeforeBuild),
  });
  const reasons = [...evaluation.reasons];
  if (!runtimeRetention.ok) reasons.push(runtimeRetention.reason);
  return {
    ...evaluation,
    ok:reasons.length === 0,
    reasons,
    runtimeRetention,
    runtimeCandidates,
    environment:"DEV",
    productionAccess:"DENY",
    operation,
    configFile,
    devRoot,
    bypassed:false,
  };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runStorageAdmission({ operation:args.operation });
    if (args.json) console.log(JSON.stringify(result));
    else {
      const tag = result.ok ? "PASS" : "BLOCKED";
      console.log("[Developer Grid storage admission] " + tag + " · operation=" + result.operation + " free=" + (result.freeBytes/GIB).toFixed(2) + " GiB reserve=" + result.reserveGiB + " GiB projected=" + result.projectedFreeGiB + " GiB hard-min=" + result.hardMinGiB + " GiB used=" + result.usedPercent + "%");
      if (!result.ok) console.error("DEVELOPER_GRID_STORAGE_ADMISSION_BLOCKED · " + result.reasons.join(","));
    }
    process.exit(result.ok ? 0 : 75);
  } catch (error) {
    console.error("DEVELOPER_GRID_STORAGE_ADMISSION_DENY · " + (error?.message || error));
    process.exit(78);
  }
}
