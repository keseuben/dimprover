import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const CANONICAL_ROOT = "/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v1-20260827";
const CANONICAL_BRANCH = "feature/benjadmin-developer-grid-v1-20260827";

function fail(code, detail = "") { const error = new Error(detail || code); error.code = code; throw error; }
function arg(name) { const prefix = `--${name}=`; const hit = process.argv.slice(2).find((v) => v.startsWith(prefix)); return hit ? hit.slice(prefix.length) : ""; }
function git(root, args) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim(); }
function readJson(file, code) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail(code, file); } }
function sha256(file) { const h = crypto.createHash("sha256"); const fd = fs.openSync(file, "r"); const b = Buffer.allocUnsafe(1024 * 1024); try { let n; do { n = fs.readSync(fd, b, 0, b.length, null); if (n) h.update(b.subarray(0, n)); } while (n); } finally { fs.closeSync(fd); } return h.digest("hex"); }

export function createPackageSessionMarker({ root = CANONICAL_ROOT, expectedCommit, expectedBranch = CANONICAL_BRANCH, version, buildId, zipFile: explicitZipFile = "" } = {}) {
  if (!/^[0-9a-f]{40}$/.test(String(expectedCommit || ""))) fail("PACKAGE_SESSION_EXPECTED_COMMIT_INVALID");
  if (!expectedBranch) fail("PACKAGE_SESSION_EXPECTED_BRANCH_INVALID");
  if (!/^\d+\.\d+\.\d+$/.test(String(version || ""))) fail("PACKAGE_SESSION_VERSION_INVALID");
  if (!buildId) fail("PACKAGE_SESSION_BUILD_ID_INVALID");

  const head = git(root, ["rev-parse", "HEAD"]);
  const branch = git(root, ["branch", "--show-current"]);
  const status = git(root, ["status", "--porcelain", "--untracked-files=normal"]);
  if (head !== expectedCommit || branch !== expectedBranch || status) fail("PACKAGE_SESSION_SOURCE_MISMATCH");

  const desktop = path.join(root, "desktop", "benjadmin-developer-grid");
  const pkg = readJson(path.join(desktop, "package.json"), "PACKAGE_SESSION_PACKAGE_INVALID");
  if (pkg.version !== version) fail("PACKAGE_SESSION_VERSION_MISMATCH");

  const actualBuildId = fs.readFileSync(path.join(root, ".next", "BUILD_ID"), "utf8").trim();
  const releaseMeta = readJson(path.join(root, ".next", ".dimpro-release.json"), "PACKAGE_SESSION_RELEASE_META_INVALID");
  if (actualBuildId !== buildId || releaseMeta.buildId !== buildId || releaseMeta.gitCommit !== expectedCommit || releaseMeta.gitBranch !== expectedBranch) fail("PACKAGE_SESSION_BUILD_PROVENANCE_MISMATCH");

  const windowsMarker = readJson(path.join(desktop, "dist", ".dimpro-windows-artifact.json"), "PACKAGE_SESSION_WINDOWS_MARKER_MISSING");
  if (windowsMarker.gitCommit !== expectedCommit || windowsMarker.gitBranch !== expectedBranch || windowsMarker.buildId !== buildId || windowsMarker.version !== version || windowsMarker.environment !== "DEV" || windowsMarker.productionAccess !== "DENY") fail("PACKAGE_SESSION_WINDOWS_PROVENANCE_MISMATCH");

  const exeFile = path.join(desktop, "dist", `BENJADMIN-Developer-Grid-${version}-Windows-x64.exe`);
  const zipFile = explicitZipFile ? path.resolve(explicitZipFile) : path.join(desktop, "dist-dev", `BENJADMIN-Developer-Grid-v${version}-DEV.zip`);
  if (!fs.existsSync(exeFile)) fail("PACKAGE_SESSION_EXE_MISSING");
  if (!fs.existsSync(zipFile)) fail("PACKAGE_SESSION_ZIP_MISSING");
  const exeHash = sha256(exeFile);
  if (windowsMarker.exe?.file !== path.basename(exeFile) || windowsMarker.exe?.sha256 !== exeHash || Number(windowsMarker.exe?.bytes) !== fs.statSync(exeFile).size) fail("PACKAGE_SESSION_WINDOWS_HASH_MISMATCH");
  const zipHash = sha256(zipFile);
  const sessionId = crypto.createHash("sha256").update(`${expectedCommit}\n${expectedBranch}\n${buildId}\n${version}\n${exeHash}\n${zipHash}\n`).digest("hex");
  const marker = {
    schemaVersion: 1,
    product: "BENJADMIN Developer Grid",
    packageSessionId: sessionId,
    version,
    gitCommit: expectedCommit,
    gitBranch: expectedBranch,
    buildId,
    environment: "DEV",
    productionAccess: "DENY",
    exe: { file: path.basename(exeFile), sha256: exeHash, bytes: fs.statSync(exeFile).size },
    devZip: { file: path.basename(zipFile), sha256: zipHash, bytes: fs.statSync(zipFile).size },
    generatedAt: new Date().toISOString(),
  };
  const markerFile = path.join(path.dirname(zipFile), ".dimpro-package-session.json");
  const temp = `${markerFile}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, markerFile); fs.chmodSync(markerFile, 0o600);
  return { markerFile, marker };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    const result = createPackageSessionMarker({ root: arg("root") || CANONICAL_ROOT, expectedCommit: arg("expected-commit"), expectedBranch: arg("expected-branch") || CANONICAL_BRANCH, version: arg("version"), buildId: arg("build-id"), zipFile: arg("zip-file") });
    console.log(JSON.stringify({ ok: true, markerFile: result.markerFile, packageSessionId: result.marker.packageSessionId, gitCommit: result.marker.gitCommit, buildId: result.marker.buildId, exe: result.marker.exe, devZip: result.marker.devZip }, null, 2));
  } catch (error) { console.error(`BLOCKED · ${error?.code || "PACKAGE_SESSION_MARKER_FAILED"}`); process.exitCode = 1; }
}
