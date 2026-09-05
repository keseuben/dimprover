import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export const CANONICAL_ROOT = "/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v013-outminai-20260905";
export const CANONICAL_BRANCH = "feature/benjadmin-developer-grid-v013-outminai-20260905";
export const DEFAULT_COORDINATION_ROOT = "/srv/dimpro-dev/coordination";
export const DEFAULT_ARTIFACT_ROOT = "/srv/dimpro-dev/artifacts/benjadmin-developer-grid";

const SAFE_OPERATION_FIELDS = ["status", "operation", "owner", "task", "target", "workerCode", "host", "pid", "startedAt", "finishedAt", "exitCode", "event"];

function safeRecord(value) {
  if (!value || typeof value !== "object") return null;
  return Object.fromEntries(SAFE_OPERATION_FIELDS.filter((key) => key in value).map((key) => [key, value[key]]));
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function readJsonLines(file) {
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } catch { return []; }
}

function sha256(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytes = 0;
    do {
      bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytes > 0) hash.update(buffer.subarray(0, bytes));
    } while (bytes > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function processAlive(pid) {
  return Number.isInteger(Number(pid)) && Number(pid) > 1 && fs.existsSync(`/proc/${Number(pid)}`);
}

function git(root, args) {
  try { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
}

function artifactDir(artifactRoot, version, commit) {
  return path.join(artifactRoot, `v${version}-${commit.slice(0, 7)}`);
}

function verifyBuildProof(root, expectedCommit, expectedBranch) {
  const buildIdFile = path.join(root, ".next", "BUILD_ID");
  const metaFile = path.join(root, ".next", ".dimpro-release.json");
  const standalone = path.join(root, ".next", "standalone", "server.js");
  if (![buildIdFile, metaFile, standalone].every(fs.existsSync)) return { ok: false, reason: "BUILD_PROOF_MISSING" };
  const buildId = fs.readFileSync(buildIdFile, "utf8").trim();
  const meta = readJson(metaFile);
  if (!meta || meta.gitCommit !== expectedCommit || meta.gitBranch !== expectedBranch || meta.buildId !== buildId) {
    return { ok: false, reason: "BUILD_PROVENANCE_MISMATCH", buildId: buildId || null };
  }
  return { ok: true, reason: "BUILD_PROVENANCE_VERIFIED", buildId };
}

function verifyWindowsMarkerProof(root, version, expectedCommit, expectedBranch) {
  const markerFile = path.join(root, "desktop", "benjadmin-developer-grid", "dist", ".dimpro-windows-artifact.json");
  const marker = readJson(markerFile);
  if (!marker) return { ok: false, reason: "WINDOWS_ARTIFACT_MARKER_MISSING", markerFile };
  if (marker.version !== version || marker.gitCommit !== expectedCommit || marker.gitBranch !== expectedBranch || marker.environment !== "DEV" || marker.productionAccess !== "DENY") {
    return { ok: false, reason: "WINDOWS_ARTIFACT_MARKER_PROVENANCE_MISMATCH", markerFile };
  }
  if (!marker.exe?.file || !/^[0-9a-f]{64}$/.test(String(marker.exe.sha256 || ""))) {
    return { ok: false, reason: "WINDOWS_ARTIFACT_MARKER_INVALID", markerFile };
  }
  const exeFile = path.join(root, "desktop", "benjadmin-developer-grid", "dist", marker.exe.file);
  if (!fs.existsSync(exeFile)) return { ok: false, reason: "WINDOWS_ARTIFACT_MARKER_EXE_MISSING", markerFile, file: marker.exe.file };
  const actual = sha256(exeFile);
  if (actual !== marker.exe.sha256) return { ok: false, reason: "WINDOWS_ARTIFACT_MARKER_HASH_MISMATCH", markerFile, file: marker.exe.file };
  return {
    ok: true,
    reason: "WINDOWS_ARTIFACT_MARKER_VERIFIED",
    markerFile,
    buildId: marker.buildId || null,
    exe: { file: marker.exe.file, sha256: marker.exe.sha256, bytes: marker.exe.bytes },
  };
}

function verifyManifestProof(artifactRoot, version, expectedCommit, expectedBranch, kind) {
  const dir = artifactDir(artifactRoot, version, expectedCommit);
  const manifestFile = path.join(dir, `ARTIFACT_MANIFEST_v${version}.json`);
  const manifest = readJson(manifestFile);
  if (!manifest) return { ok: false, reason: "ARTIFACT_MANIFEST_MISSING", dir, manifestFile };
  if (manifest.gitCommit !== expectedCommit || manifest.gitBranch !== expectedBranch || manifest.environment !== "DEV" || manifest.productionAccess !== "DENY") {
    return { ok: false, reason: "ARTIFACT_MANIFEST_PROVENANCE_MISMATCH", dir, manifestFile };
  }
  const files = [];
  if (kind === "windows" || kind === "release") files.push(manifest.exe);
  if (kind === "release") files.push(manifest.devZip);
  for (const item of files) {
    if (!item?.file || !/^[0-9a-f]{64}$/.test(String(item.sha256 || ""))) return { ok: false, reason: "ARTIFACT_MANIFEST_ENTRY_INVALID", dir, manifestFile };
    const file = path.join(dir, item.file);
    if (!fs.existsSync(file)) return { ok: false, reason: "ARTIFACT_FILE_MISSING", dir, manifestFile, file: item.file };
    const actual = sha256(file);
    if (actual !== item.sha256) return { ok: false, reason: "ARTIFACT_HASH_MISMATCH", dir, manifestFile, file: item.file };
  }
  return {
    ok: true,
    reason: kind === "windows" ? "WINDOWS_ARTIFACT_MANIFEST_VERIFIED" : "RELEASE_ARTIFACT_MANIFEST_VERIFIED",
    dir,
    manifestFile,
    buildId: manifest.buildId || null,
    exe: manifest.exe ? { file: manifest.exe.file, sha256: manifest.exe.sha256, bytes: manifest.exe.bytes } : null,
    devZip: manifest.devZip ? { file: manifest.devZip.file, sha256: manifest.devZip.sha256, bytes: manifest.devZip.bytes } : null,
  };
}

function matchingHistory(history, { operation, task }) {
  const matched = history.filter((entry) => {
    if (operation && entry.operation !== operation) return false;
    if (task && entry.task !== task) return false;
    return true;
  });
  return matched.length ? matched[matched.length - 1] : null;
}

export function reconcileOperation({
  kind,
  expectedCommit,
  expectedBranch = CANONICAL_BRANCH,
  version = "",
  task = "",
  root = CANONICAL_ROOT,
  coordinationRoot = DEFAULT_COORDINATION_ROOT,
  artifactRoot = DEFAULT_ARTIFACT_ROOT,
  processAliveFn = processAlive,
} = {}) {
  if (!new Set(["build", "windows", "release"]).has(kind)) throw new Error("INVALID_RECONCILE_KIND");
  if (!/^[0-9a-f]{40}$/.test(String(expectedCommit || ""))) throw new Error("INVALID_EXPECTED_COMMIT");
  if (!expectedBranch) throw new Error("INVALID_EXPECTED_BRANCH");
  if ((kind === "windows" || kind === "release") && !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("INVALID_VERSION");

  const activeFile = path.join(coordinationRoot, "active-development.json");
  const historyFile = path.join(coordinationRoot, "development-operations.jsonl");
  const activeRaw = readJson(activeFile);
  const active = safeRecord(activeRaw);
  const expectedOperation = kind === "release" ? "release" : "build";
  const activeIsLive = Boolean(active && active.status === "running" && processAliveFn(active.pid));
  const activeMatches = Boolean(activeIsLive && active.operation === expectedOperation && (!task || active.task === task));

  if (activeMatches) {
    return { state: "RUNNING", decision: "WAIT", reason: "MATCHING_OPERATION_ACTIVE", expectedCommit, expectedBranch, version: version || null, active };
  }
  if (activeIsLive) {
    return { state: "BLOCKED", decision: "WAIT", reason: "OTHER_EXCLUSIVE_OPERATION_ACTIVE", expectedCommit, expectedBranch, version: version || null, active };
  }

  let proof;
  if (kind === "build") proof = verifyBuildProof(root, expectedCommit, expectedBranch);
  else if (kind === "windows") {
    const markerProof = verifyWindowsMarkerProof(root, version, expectedCommit, expectedBranch);
    proof = markerProof.ok ? markerProof : verifyManifestProof(artifactRoot, version, expectedCommit, expectedBranch, kind);
  } else proof = verifyManifestProof(artifactRoot, version, expectedCommit, expectedBranch, kind);
  if (proof.ok) {
    return { state: "COMPLETED", decision: "DO_NOT_REPEAT", reason: proof.reason, expectedCommit, expectedBranch, version: version || null, proof };
  }

  const history = readJsonLines(historyFile);
  const latest = matchingHistory(history, { operation: expectedOperation, task });
  const safeHistory = safeRecord(latest);
  if (latest?.status === "completed" && Number(latest.exitCode) === 0) {
    if (kind === "windows") {
      const exe = path.join(root, "desktop", "benjadmin-developer-grid", "dist", `BENJADMIN-Developer-Grid-${version}-Windows-x64.exe`);
      if (fs.existsSync(exe)) {
        return {
          state: "COMPLETED",
          decision: "DO_NOT_REPEAT",
          reason: "WINDOWS_OPERATION_HISTORY_AND_EXE_VERIFIED",
          expectedCommit,
          expectedBranch,
          version,
          history: safeHistory,
          proof: { file: path.basename(exe), bytes: fs.statSync(exe).size, sha256: sha256(exe), manifestPending: true },
        };
      }
    }
    if (kind === "release") {
      return { state: "BLOCKED", decision: "VERIFY_ARTIFACT", reason: "RELEASE_HISTORY_COMPLETED_BUT_MANIFEST_NOT_VERIFIED", expectedCommit, expectedBranch, version, history: safeHistory, proof };
    }
    if (kind === "build") {
      return { state: "BLOCKED", decision: "VERIFY_BUILD", reason: "BUILD_HISTORY_COMPLETED_BUT_PROVENANCE_NOT_VERIFIED", expectedCommit, expectedBranch, version: null, history: safeHistory, proof };
    }
  }
  if (latest?.status === "failed" || (latest?.event === "finished" && Number(latest?.exitCode) !== 0)) {
    return { state: "BLOCKED", decision: "REVIEW_FAILURE", reason: "PREVIOUS_OPERATION_FAILED", expectedCommit, expectedBranch, version: version || null, history: safeHistory, proof };
  }

  const currentHead = git(root, ["rev-parse", "HEAD"]);
  const currentBranch = git(root, ["branch", "--show-current"]);
  const dirty = Boolean(git(root, ["status", "--porcelain", "--untracked-files=normal"]));
  if (currentHead !== expectedCommit || currentBranch !== expectedBranch || dirty) {
    return {
      state: "BLOCKED",
      decision: "DO_NOT_REPEAT",
      reason: "SOURCE_MOVED_OR_DIRTY",
      expectedCommit,
      expectedBranch,
      version: version || null,
      source: { currentHead: currentHead || null, currentBranch: currentBranch || null, dirty },
      proof,
    };
  }

  return { state: "NOT_FOUND", decision: "SAFE_TO_START_AFTER_PREFLIGHT", reason: proof.reason || "NO_OPERATION_PROOF", expectedCommit, expectedBranch, version: version || null, history: safeHistory, proof };
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const [key, ...rest] = arg.split("=");
    const value = rest.join("=");
    if (key === "--kind") out.kind = value;
    else if (key === "--expected-commit") out.expectedCommit = value;
    else if (key === "--expected-branch") out.expectedBranch = value;
    else if (key === "--version") out.version = value;
    else if (key === "--task") out.task = value;
    else if (key === "--root") out.root = value;
    else if (key === "--coordination-root") out.coordinationRoot = value;
    else if (key === "--artifact-root") out.artifactRoot = value;
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    const result = reconcileOperation(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (result.state === "COMPLETED") process.exitCode = 0;
    else if (result.state === "RUNNING") process.exitCode = 10;
    else if (result.state === "NOT_FOUND") process.exitCode = 20;
    else process.exitCode = 30;
  } catch (error) {
    console.error(JSON.stringify({ state: "BLOCKED", decision: "REVIEW", reason: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 64;
  }
}
