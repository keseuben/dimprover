import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const CANONICAL_ROOT = "/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v1-20260827";

function fail(code, detail) {
  const error = new Error(detail || code);
  error.code = code;
  throw error;
}

function arg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function readJson(file, code) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { fail(code, `Nem olvasható JSON: ${file}`); }
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

export function createWindowsArtifactMarker({
  root = CANONICAL_ROOT,
  expectedCommit,
  expectedBranch,
  version,
  buildId,
} = {}) {
  if (!/^[0-9a-f]{40}$/.test(String(expectedCommit || ""))) fail("WINDOWS_MARKER_EXPECTED_COMMIT_INVALID");
  if (!expectedBranch) fail("WINDOWS_MARKER_EXPECTED_BRANCH_INVALID");
  if (!/^\d+\.\d+\.\d+$/.test(String(version || ""))) fail("WINDOWS_MARKER_VERSION_INVALID");
  if (!buildId) fail("WINDOWS_MARKER_BUILD_ID_INVALID");

  const head = git(root, ["rev-parse", "HEAD"]);
  const branch = git(root, ["branch", "--show-current"]);
  const status = git(root, ["status", "--porcelain", "--untracked-files=normal"]);
  if (head !== expectedCommit || branch !== expectedBranch || status) fail("WINDOWS_MARKER_SOURCE_MISMATCH");

  const desktop = path.join(root, "desktop", "benjadmin-developer-grid");
  const pkg = readJson(path.join(desktop, "package.json"), "WINDOWS_MARKER_PACKAGE_INVALID");
  if (pkg.version !== version) fail("WINDOWS_MARKER_VERSION_MISMATCH");

  const actualBuildId = fs.readFileSync(path.join(root, ".next", "BUILD_ID"), "utf8").trim();
  const releaseMeta = readJson(path.join(root, ".next", ".dimpro-release.json"), "WINDOWS_MARKER_RELEASE_META_INVALID");
  if (actualBuildId !== buildId || releaseMeta.buildId !== buildId || releaseMeta.gitCommit !== expectedCommit || releaseMeta.gitBranch !== expectedBranch) {
    fail("WINDOWS_MARKER_BUILD_PROVENANCE_MISMATCH");
  }

  const exeName = `BENJADMIN-Developer-Grid-${version}-Windows-x64.exe`;
  const exeFile = path.join(desktop, "dist", exeName);
  if (!fs.existsSync(exeFile)) fail("WINDOWS_MARKER_EXE_MISSING");

  const marker = {
    schemaVersion: 1,
    product: "BENJADMIN Developer Grid",
    version,
    gitCommit: expectedCommit,
    gitBranch: expectedBranch,
    buildId,
    environment: "DEV",
    productionAccess: "DENY",
    exe: {
      file: exeName,
      sha256: sha256(exeFile),
      bytes: fs.statSync(exeFile).size,
      signed: false,
    },
    generatedAt: new Date().toISOString(),
  };

  const markerFile = path.join(desktop, "dist", ".dimpro-windows-artifact.json");
  const temp = `${markerFile}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, markerFile);
  fs.chmodSync(markerFile, 0o600);
  return { markerFile, marker };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    const result = createWindowsArtifactMarker({
      root: arg("root") || CANONICAL_ROOT,
      expectedCommit: arg("expected-commit"),
      expectedBranch: arg("expected-branch"),
      version: arg("version"),
      buildId: arg("build-id"),
    });
    console.log(JSON.stringify({ ok: true, markerFile: result.markerFile, gitCommit: result.marker.gitCommit, buildId: result.marker.buildId, exe: result.marker.exe }, null, 2));
  } catch (error) {
    console.error(`BLOCKED · ${error?.code || "WINDOWS_MARKER_FAILED"}`);
    process.exitCode = 1;
  }
}
