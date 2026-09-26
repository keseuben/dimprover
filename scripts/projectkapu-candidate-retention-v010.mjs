#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const value = (name, fallback = "") => {
  const item = args.find((arg) => arg.startsWith(name + "="));
  return item ? item.slice(name.length + 1) : fallback;
};
const has = (name) => args.includes(name);

const ROOT = path.resolve(value("--root", "/srv/dimpro-dev/candidates/projectkapu-drop-drive-pilot"));
const REPO = path.resolve(value("--repo", "/srv/dimpro-dev/repositories/dimprover.git"));
const REPORT = value("--report-file", "");
const EXPECTED_ROOT = "/srv/dimpro-dev/candidates/projectkapu-drop-drive-pilot";
const EXPECTED_SKILL_SHA = "d4da2a3a0917d1046d1a9f397ea22a46d2d1cac2038d4ee6f1d8bf7ea084f3cb";
const SKILL = "/srv/dimpro-dev/development-library/skills/dimpro-safe-delete/SKILL.md";
const DIRECTIVE = "/srv/dimpro-dev/coordination/SAFE_DELETE_SKILL_REQUIRED.md";
const EXPECTED_BRANCH = "worker/benjaminai/dev-task-grid-22b48c4d9bae10e22e09";

function fail(message, code = 2) {
  console.error("PROJECTKAPU_CANDIDATE_RETENTION_DENY: " + message);
  process.exit(code);
}
function exec(file, argv) {
  try {
    return execFileSync(file, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}
function commandOk(file, argv) {
  try {
    execFileSync(file, argv, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function sha256File(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
function sizeBytes(target) {
  const out = exec("du", ["-sk", target]);
  return Number(out.split(/\s+/)[0] || 0) * 1024;
}
function within(child, parent) {
  const c = path.resolve(child), p = path.resolve(parent);
  return c === p || c.startsWith(p + path.sep);
}
function commitExists(commit) {
  if (!commit) return false;
  return commandOk("git", ["--git-dir", REPO, "cat-file", "-e", commit + "^{commit}"]);
}
function portPid(port) {
  const out = exec("ss", ["-ltnp"]);
  const line = out.split("\n").find((row) => row.includes(":" + port + " "));
  const match = line?.match(/pid=(\d+)/);
  return match ? Number(match[1]) : 0;
}

if (has("--apply")) {
  fail("Apply nincs implementálva. Külön approved guard + explicit human approval szükséges.", 77);
}
if (ROOT !== EXPECTED_ROOT) fail("Nem canonical Projektkapu candidate root: " + ROOT);
if (!fs.existsSync(SKILL) || !fs.existsSync(DIRECTIVE)) fail("Safe Delete skill/directive hiányzik.");
const skillSha = sha256File(SKILL);
if (skillSha !== EXPECTED_SKILL_SHA) fail("Safe Delete skill SHA mismatch.");
const directiveText = fs.readFileSync(DIRECTIVE, "utf8");
if (!directiveText.includes(EXPECTED_SKILL_SHA)) fail("Directive nem igazolja a canonical skill SHA-t.");
if (!fs.existsSync(REPO)) fail("Canonical bare repo hiányzik.");

const pointerFile = path.join(ROOT, "latest-source-path.txt");
if (!fs.existsSync(pointerFile)) fail("Aktív candidate pointer hiányzik.");
const current = path.resolve(fs.readFileSync(pointerFile, "utf8").trim());
if (!within(current, ROOT) || !fs.existsSync(current)) fail("Aktív pointer érvénytelen.");

const pid = portPid(3299);
if (!pid) fail("A DEV 3299 runtime nem azonosítható.");
let runtimeCwd = "";
try { runtimeCwd = fs.realpathSync("/proc/" + pid + "/cwd"); } catch {}
if (!runtimeCwd || !within(runtimeCwd, current)) {
  fail("A 3299 runtime CWD nem az aktív candidate alatt van.");
}

const directories = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("source-"))
  .map((entry) => path.join(ROOT, entry.name))
  .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);

const prelim = directories.map((dir) => {
  const next = path.join(dir, ".next");
  const nextStat = fs.existsSync(next) ? fs.lstatSync(next) : null;
  const releaseFile = path.join(next, ".dimpro-release.json");
  const release = fs.existsSync(releaseFile) ? readJson(releaseFile) : null;
  const commit = String(release?.gitCommit || "");
  const branch = String(release?.gitBranch || "");
  const buildId = String(release?.buildId || "");
  const bytes = nextStat && nextStat.isDirectory() && !nextStat.isSymbolicLink() ? sizeBytes(next) : 0;
  const complete = Boolean(
    bytes > 0
    && release
    && buildId
    && commit
    && branch === EXPECTED_BRANCH
    && commitExists(commit)
    && fs.existsSync(path.join(next, "standalone", "server.js"))
  );
  return {
    path: dir,
    name: path.basename(dir),
    nextPath: next,
    nextBytes: bytes,
    mtimeMs: fs.statSync(dir).mtimeMs,
    gitCommit: commit || null,
    gitBranch: branch || null,
    buildId: buildId || null,
    releaseComplete: complete,
  };
});

const completeNonCurrent = prelim
  .filter((item) => item.path !== current && item.releaseComplete)
  .sort((a, b) => b.mtimeMs - a.mtimeMs);
const rollback = completeNonCurrent[0]?.path || null;

const items = prelim.map((item) => {
  let classification = "UNKNOWN_DENY";
  let reason = "Hiányos vagy nem bizonyított candidate.";
  if (item.path === current) {
    classification = "PROTECTED_CURRENT_RUNTIME";
    reason = "latest-source-path + 3299 runtime CWD.";
  } else if (item.path === rollback) {
    classification = "PROTECTED_ROLLBACK_CANDIDATE";
    reason = "Legújabb előző teljes, Gitből igazolt candidate.";
  } else if (item.releaseComplete && !within(runtimeCwd, item.path)) {
    classification = "PROVEN_REGENERABLE_PENDING_APPROVAL";
    reason = "Teljes release metadata + Git commit + standalone bizonyított; nincs aktív runtime referencia.";
  }
  return {
    ...item,
    mtimeUtc: new Date(item.mtimeMs).toISOString(),
    nextGiB: Number((item.nextBytes / 1024 ** 3).toFixed(3)),
    classification,
    reason,
  };
});

const eligible = items.filter((item) => item.classification === "PROVEN_REGENERABLE_PENDING_APPROVAL");
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "DRY_RUN_ONLY",
  environment: "DEV",
  productionAccess: "DENY",
  safeDeleteSkillSha256: skillSha,
  root: ROOT,
  currentPointer: current,
  runtime: { port: 3299, pid, cwd: runtimeCwd },
  rollbackCandidate: rollback,
  policy: {
    applyImplemented: false,
    applyAllowed: false,
    deleteTargetIfFutureApproved: ".next only",
    sourceDeletionAllowed: false,
    candidateRootDeletionAllowed: false,
    requiresSeparateDirectiveApproval: true,
    requiresExplicitHumanApproval: true,
  },
  counts: {
    total: items.length,
    currentProtected: items.filter((x) => x.classification === "PROTECTED_CURRENT_RUNTIME").length,
    rollbackProtected: items.filter((x) => x.classification === "PROTECTED_ROLLBACK_CANDIDATE").length,
    provenRegenerablePendingApproval: eligible.length,
    unknownDeny: items.filter((x) => x.classification === "UNKNOWN_DENY").length,
  },
  potentialReclaimBytes: eligible.reduce((sum, item) => sum + item.nextBytes, 0),
  potentialReclaimGiB: Number((eligible.reduce((sum, item) => sum + item.nextBytes, 0) / 1024 ** 3).toFixed(3)),
  items,
};

if (REPORT) {
  const resolved = path.resolve(REPORT);
  if (!within(resolved, "/srv/dimpro-dev/coordination/checkpoints")) {
    fail("Report csak coordination/checkpoints alatt írható.");
  }
  fs.writeFileSync(resolved, JSON.stringify(report, null, 2), { mode: 0o600 });
}
console.log(JSON.stringify(report, null, 2));
