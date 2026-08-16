#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const argValue = (name) => {
  const item = args.find((arg) => arg.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : null;
};
const has = (name) => args.includes(name);

const testMode = process.env.DIMPRO_RETENTION_TEST_MODE === "1";
const devRoot = path.resolve(argValue("--dev-root") || "/srv/dimpro-dev");
const worktreesRoot = path.resolve(argValue("--worktrees-root") || path.join(devRoot, "worktrees"));
const operatorRoot = path.resolve(argValue("--operator-root") || path.join(worktreesRoot, "benjadmin-operator-ui-v2"));
const configPath = path.resolve(argValue("--config") || path.join(operatorRoot, "config", "dimpro-dev-storage-retention.json"));
const applyBuildsRequested = has("--apply-builds");
const pruneDependenciesRequested = has("--prune-dependencies");
const postBuild = has("--post-build");
const quiet = has("--quiet");
const reportFile = argValue("--report-file");

function fail(message, code = 1) {
  console.error(`[DIMPRO retention] ${message}`);
  process.exit(code);
}

if (!fs.existsSync(configPath)) fail(`Hiányzó konfiguráció: ${configPath}`);
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
if (config.schemaVersion !== 1) fail(`Nem támogatott retention config schema: ${config.schemaVersion}`);

const canonicalDev = devRoot === "/srv/dimpro-dev" || devRoot.startsWith("/srv/dimpro-dev/");
if ((applyBuildsRequested || pruneDependenciesRequested) && !canonicalDev && !testMode) {
  fail(`Apply csak DEV root alatt engedélyezett: ${devRoot}`);
}
if ((applyBuildsRequested || pruneDependenciesRequested) && devRoot === "/") fail("A root filesystem közvetlen célként tiltott.");

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
function exec(file, argv, options = {}) {
  try {
    return execFileSync(file, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], ...options }).trim();
  } catch { return ""; }
}
function sizeBytes(target) {
  const out = exec("du", ["-sk", target]);
  return Number(out.split(/\s+/)[0] || 0) * 1024;
}
function human(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes || 0); let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit >= 3 ? 2 : 1)} ${units[unit]}`;
}
function diskState() {
  const out = exec("df", ["-Pk", devRoot]);
  const lines = out.split("\n").filter(Boolean);
  const cols = (lines.at(-1) || "").trim().split(/\s+/);
  const total = Number(cols[1] || 0) * 1024;
  const used = Number(cols[2] || 0) * 1024;
  const free = Number(cols[3] || 0) * 1024;
  const usedPercent = Number(String(cols[4] || "0").replace("%", ""));
  return { totalBytes: total, usedBytes: used, freeBytes: free, usedPercent };
}
function listWorktrees() {
  if (!fs.existsSync(worktreesRoot)) return [];
  return fs.readdirSync(worktreesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(worktreesRoot, entry.name));
}
function safeStat(target) {
  try { return fs.statSync(target); } catch { return null; }
}
function git(target, argv) { return exec("git", ["-C", target, ...argv]); }
function isGitClean(target) { return git(target, ["status", "--porcelain"]) === ""; }
function headCommit(target) { return git(target, ["rev-parse", "HEAD"]); }
function headCommitMs(target) {
  const value = Number(git(target, ["log", "-1", "--format=%ct", "HEAD"]));
  return Number.isFinite(value) && value > 0 ? value * 1000 : 0;
}
function isAncestor(commit, ref) {
  if (!commit || !ref) return false;
  try {
    execFileSync("git", ["-C", operatorRoot, "merge-base", "--is-ancestor", commit, ref], { stdio: "ignore" });
    return true;
  } catch { return false; }
}
function real(target) {
  try { return fs.realpathSync(target); } catch { return path.resolve(target); }
}
function within(child, parent) {
  const c = path.resolve(child); const p = path.resolve(parent);
  return c === p || c.startsWith(`${p}${path.sep}`);
}

const stateFile = path.join(devRoot, "coordination", "active-development.json");
const activeOperation = readJson(stateFile);
if ((applyBuildsRequested || pruneDependenciesRequested) && activeOperation) {
  const allowed = postBuild && activeOperation.operation === "build"
    ? true
    : activeOperation.operation === "maintenance";
  if (!allowed) fail(`Aktív kizárólagos művelet miatt apply tiltva: ${activeOperation.operation} / ${activeOperation.owner || "unknown"}`, 75);
}

const protectedPaths = new Set();
const protect = (candidate) => {
  if (!candidate) return;
  const p = path.isAbsolute(candidate) ? candidate : path.join(operatorRoot, candidate);
  protectedPaths.add(path.resolve(p));
  protectedPaths.add(real(p));
};

try {
  const pointerFile = path.join(operatorRoot, ".dimprover", "active-next-release");
  if (fs.existsSync(pointerFile)) protect(fs.readFileSync(pointerFile, "utf8").trim());
  const rollbackFile = path.join(operatorRoot, ".dimprover", "rollback-next-release");
  if (fs.existsSync(rollbackFile)) protect(fs.readFileSync(rollbackFile, "utf8").trim());
} catch {}

if (!testMode) {
  const pm2Json = exec("pm2", ["jlist"]);
  if (pm2Json) {
    try {
      for (const proc of JSON.parse(pm2Json)) {
        const env = proc?.pm2_env || {};
        if (!env.pm_cwd || !env.NEXT_DIST_DIR) continue;
        const target = path.isAbsolute(env.NEXT_DIST_DIR) ? env.NEXT_DIST_DIR : path.join(env.pm_cwd, env.NEXT_DIST_DIR);
        protect(target);
      }
    } catch {}
  }
}

if (activeOperation?.target) {
  const command = String(activeOperation.command || "");
  const operationWorktree = command
    .split(/\s+/)
    .map((token) => token.replace(/^['"]|['"]$/g, ""))
    .find((token) => within(token, worktreesRoot) && fs.existsSync(token))
    || (postBuild && within(process.cwd(), worktreesRoot) ? process.cwd() : null);
  if (operationWorktree) protect(path.isAbsolute(activeOperation.target) ? activeOperation.target : path.join(operationWorktree, activeOperation.target));
}

const now = Date.now();
const initialDisk = diskState();
const buildCandidates = [];
const protectedBuilds = [];
const allBuilds = [];
const worktreeActivity = new Map();
const keepNewest = Math.max(1, Number(config.builds?.keepNewestPerWorktree || 3));
const normalBuildAgeHours = Math.max(1, Number(config.builds?.minAgeHours || 24));
const criticalBuildAgeHours = Math.max(1, Number(config.builds?.criticalMinAgeHours || 6));
const emergencyBuildAgeHours = Math.max(1, Number(config.builds?.emergencyMinAgeHours || 2));
const criticalUsedPercent = Number(config.criticalUsedPercent || 92);
const emergencyUsedPercent = Number(config.emergencyUsedPercent || 97);
const minBuildAgeHours = initialDisk.usedPercent >= emergencyUsedPercent
  ? emergencyBuildAgeHours
  : initialDisk.usedPercent >= criticalUsedPercent
    ? criticalBuildAgeHours
    : normalBuildAgeHours;
const protectedNames = new Set(config.builds?.protectedNames || []);

for (const wt of listWorktrees()) {
  const entries = fs.readdirSync(wt, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(".next"))
    .map((entry) => {
      const full = path.join(wt, entry.name);
      const st = safeStat(full);
      return st ? { worktree: wt, name: entry.name, path: full, mtimeMs: st.mtimeMs, ageHours: (now - st.mtimeMs) / 3600000 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const newest = new Set(entries.slice(0, keepNewest).map((item) => path.resolve(item.path)));
  const latestBuildMs = entries[0]?.mtimeMs || 0;
  worktreeActivity.set(wt, Math.max(latestBuildMs, headCommitMs(wt)));
  for (const item of entries) {
    const resolved = path.resolve(item.path);
    const reasons = [];
    if (newest.has(resolved)) reasons.push(`newest-${keepNewest}`);
    if (protectedNames.has(item.name)) reasons.push("protected-name");
    if (protectedPaths.has(resolved) || protectedPaths.has(real(resolved))) reasons.push("active-or-rollback");
    if (item.ageHours < minBuildAgeHours) reasons.push(`younger-than-${minBuildAgeHours}h`);
    const record = { ...item, ageHours: Math.round(item.ageHours * 10) / 10, reasons };
    allBuilds.push(record);
    if (reasons.length) protectedBuilds.push(record);
    else buildCandidates.push(record);
  }
}

buildCandidates.sort((a, b) => a.mtimeMs - b.mtimeMs);
for (const item of buildCandidates) item.bytes = sizeBytes(item.path);

const runningRoots = new Set();
if (!testMode) {
  const procCwds = exec("bash", ["-lc", "for p in /proc/[0-9]*/cwd; do readlink -f \"$p\" 2>/dev/null || true; done"]);
  for (const line of procCwds.split("\n").filter(Boolean)) runningRoots.add(line);
}
function hasRunningProcess(wt) {
  for (const cwd of runningRoots) if (within(cwd, wt)) return true;
  return false;
}

const dependencyCandidates = [];
const dependencyProtected = [];
const minDepHours = Math.max(24, Number(config.dependencies?.minInactiveHours || 72));
const mergedRefs = config.dependencies?.requireMergedIntoAnyRef || [];
for (const wt of listWorktrees()) {
  if (path.resolve(wt) === path.resolve(operatorRoot)) continue;
  const nm = path.join(wt, "node_modules");
  let lst;
  try { lst = fs.lstatSync(nm); } catch { continue; }
  if (lst.isSymbolicLink() || !lst.isDirectory()) continue;
  const head = headCommit(wt);
  const latestActivityMs = Math.max(worktreeActivity.get(wt) || 0, lst.mtimeMs || 0);
  const inactiveHours = (now - latestActivityMs) / 3600000;
  const reasons = [];
  const clean = isGitClean(wt);
  const merged = mergedRefs.length === 0 ? false : mergedRefs.some((ref) => isAncestor(head, ref));
  if (config.dependencies?.requireCleanWorktree !== false && !clean) reasons.push("dirty-worktree");
  if (!merged) reasons.push("head-not-merged-into-canonical-ref");
  if (inactiveHours < minDepHours) reasons.push(`active-within-${minDepHours}h`);
  if (hasRunningProcess(wt)) reasons.push("running-process");
  if (activeOperation?.command?.includes(wt)) reasons.push("active-operation");
  const marker = path.join(nm, "next", "package.json");
  let hardlinkCount = 1;
  try { hardlinkCount = fs.statSync(marker).nlink; } catch {}
  if (hardlinkCount > 1) reasons.push("shared-hardlinks");
  const record = { worktree: wt, path: nm, head, clean, merged, inactiveHours: Math.round(inactiveHours * 10) / 10, hardlinkCount, reasons };
  if (reasons.length) dependencyProtected.push(record);
  else {
    record.bytes = sizeBytes(nm);
    dependencyCandidates.push(record);
  }
}

dependencyCandidates.sort((a, b) => b.inactiveHours - a.inactiveHours);

const before = initialDisk;
const targetFreeBytes = Math.max(1, Number(config.targetFreeGiB || 20)) * 1024 ** 3;
const shouldPostBuildApply = !postBuild || before.usedPercent >= Number(config.warningUsedPercent || 85);
let deletedBuilds = [];
let deletedDependencies = [];
let reclaimedBuildBytes = 0;
let reclaimedDependencyBytes = 0;

function safeRemove(target, kind) {
  const resolved = path.resolve(target);
  if (!within(resolved, worktreesRoot)) fail(`Unsafe ${kind} cleanup path: ${resolved}`);
  if (kind === "build" && !path.basename(resolved).startsWith(".next")) fail(`Nem build könyvtár: ${resolved}`);
  if (kind === "dependency" && path.basename(resolved) !== "node_modules") fail(`Nem node_modules: ${resolved}`);
  if (protectedPaths.has(resolved) || protectedPaths.has(real(resolved))) fail(`Védett útvonal elérte a törlési ciklust: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: false, maxRetries: 2, retryDelay: 250 });
  if (fs.existsSync(resolved)) fail(`Cleanup sikertelen: ${resolved}`);
}

if (applyBuildsRequested && shouldPostBuildApply) {
  let currentFree = before.freeBytes;
  for (const item of buildCandidates) {
    if (currentFree >= targetFreeBytes) break;
    safeRemove(item.path, "build");
    deletedBuilds.push(item.path);
    reclaimedBuildBytes += item.bytes || 0;
    currentFree += item.bytes || 0;
  }
}

if (pruneDependenciesRequested) {
  for (const item of dependencyCandidates) {
    const current = diskState();
    if (current.freeBytes >= targetFreeBytes) break;
    safeRemove(item.path, "dependency");
    deletedDependencies.push(item.path);
    reclaimedDependencyBytes += item.bytes || 0;
  }
}

const groupSizes = {};
for (const [name, target] of [
  ["artifacts", path.join(devRoot, "artifacts")],
  ["backups", path.join(devRoot, "backups")],
  ["repositories", path.join(devRoot, "repositories")],
]) {
  groupSizes[name] = fs.existsSync(target) ? sizeBytes(target) : 0;
}

const after = diskState();
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: { applyBuilds: applyBuildsRequested, pruneDependencies: pruneDependenciesRequested, postBuild, testMode },
  roots: { devRoot, worktreesRoot, operatorRoot, configPath },
  thresholds: {
    warningUsedPercent: config.warningUsedPercent,
    criticalUsedPercent: config.criticalUsedPercent,
    emergencyUsedPercent: config.emergencyUsedPercent,
    targetFreeGiB: config.targetFreeGiB,
    keepNewestBuildsPerWorktree: keepNewest,
    minBuildAgeHours,
    minDependencyInactiveHours: minDepHours,
  },
  diskBefore: { ...before, free: human(before.freeBytes) },
  diskAfter: { ...after, free: human(after.freeBytes) },
  activeOperation: activeOperation ? { operation: activeOperation.operation, owner: activeOperation.owner, task: activeOperation.task, target: activeOperation.target } : null,
  protectedRuntimePaths: [...protectedPaths].sort(),
  inventory: {
    worktreeCount: listWorktrees().length,
    buildCount: allBuilds.length,
    protectedBuildCount: protectedBuilds.length,
    buildCandidateCount: buildCandidates.length,
    buildCandidateBytes: buildCandidates.reduce((sum, item) => sum + (item.bytes || 0), 0),
    dependencyCandidateCount: dependencyCandidates.length,
    dependencyCandidateBytes: dependencyCandidates.reduce((sum, item) => sum + (item.bytes || 0), 0),
    dependencyProtectedCount: dependencyProtected.length,
    groupSizes,
  },
  actions: {
    postBuildThresholdMet: shouldPostBuildApply,
    deletedBuildCount: deletedBuilds.length,
    deletedBuilds,
    reclaimedBuildBytes,
    deletedDependencyCount: deletedDependencies.length,
    deletedDependencies,
    reclaimedDependencyBytes,
  },
  buildCandidates: buildCandidates.map((item) => ({ ...item, bytesHuman: human(item.bytes || 0) })),
  dependencyCandidates: dependencyCandidates.map((item) => ({ ...item, bytesHuman: human(item.bytes || 0) })),
  notes: [
    "Backup és artifact könyvtárak V1-ben soha nem törlődnek automatikusan.",
    "Worktree könyvtár V1-ben soha nem törlődik automatikusan.",
    "node_modules csak explicit --prune-dependencies módban és clean+merged+inactive gate után törölhető.",
    "Post-build automata kizárólag régi .next* build outputokat takarít, ha a lemezhasználat eléri a warning küszöböt."
  ]
};

const output = JSON.stringify(manifest, null, 2);
if (!quiet) console.log(output);
else console.log(JSON.stringify({
  ok: true,
  usedPercentBefore: before.usedPercent,
  usedPercentAfter: after.usedPercent,
  freeBefore: human(before.freeBytes),
  freeAfter: human(after.freeBytes),
  buildCandidates: buildCandidates.length,
  buildCandidateBytes: human(manifest.inventory.buildCandidateBytes),
  dependencyCandidates: dependencyCandidates.length,
  dependencyCandidateBytes: human(manifest.inventory.dependencyCandidateBytes),
  deletedBuilds: deletedBuilds.length,
  deletedDependencies: deletedDependencies.length,
}, null, 2));
if (reportFile) {
  const target = path.resolve(reportFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${output}\n`, { mode: 0o600 });
}
