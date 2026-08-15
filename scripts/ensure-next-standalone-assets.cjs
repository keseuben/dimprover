const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const configuredDistDir = (process.env.NEXT_DIST_DIR || ".next").trim() || ".next";
const nextRoot = path.resolve(root, configuredDistDir);
const relativeDistDir = path.relative(root, nextRoot);
if (!relativeDistDir || relativeDistDir.startsWith("..") || path.isAbsolute(relativeDistDir)) {
  console.error(`[DIMPRO standalone assets] Érvénytelen NEXT_DIST_DIR: ${configuredDistDir}`);
  process.exit(1);
}
const standaloneRoot = path.join(nextRoot, "standalone");
const standaloneDistRoot = path.join(standaloneRoot, relativeDistDir);
const sourceStatic = path.join(nextRoot, "static");
const targetStatic = path.join(standaloneDistRoot, "static");
const sourcePublic = path.join(root, "public");
const targetPublic = path.join(standaloneRoot, "public");
const sourceServer = path.join(nextRoot, "server");
const targetServer = path.join(standaloneDistRoot, "server");
const buildIdPath = path.join(nextRoot, "BUILD_ID");
const releaseMetadataPath = path.join(nextRoot, ".dimpro-release.json");
const markerPath = path.join(standaloneRoot, ".dimpro-assets-build-id");
const standaloneDataPath = path.join(standaloneRoot, ".dimprover");
const force = process.argv.includes("--force");

function fail(message) {
  console.error(`[DIMPRO standalone assets] ${message}`);
  process.exit(1);
}

function safeGit(args) {
  try {
    return execFileSync("/usr/bin/git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function releaseSourceIdentity() {
  const gitCommit = (process.env.DIMPRO_RELEASE_SOURCE_COMMIT || safeGit(["rev-parse", "HEAD"])).trim();
  const gitBranch = (process.env.DIMPRO_RELEASE_SOURCE_BRANCH || safeGit(["branch", "--show-current"])).trim();
  if (!/^[0-9a-f]{40}$/i.test(gitCommit)) fail("A release source commit érvénytelen.");
  return { gitCommit: gitCommit.toLowerCase(), gitBranch };
}

function writeReleaseMetadata(buildId) {
  const source = releaseSourceIdentity();
  const payload = {
    schemaVersion: 1,
    buildId,
    gitCommit: source.gitCommit,
    gitBranch: source.gitBranch,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(releaseMetadataPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
  console.log(`[DIMPRO standalone assets] Release meta: ${source.gitBranch || "detached"} · ${source.gitCommit.slice(0, 12)}`);
}

function verifyReleaseMetadata(buildId) {
  if (!fs.existsSync(releaseMetadataPath)) {
    console.warn(`[DIMPRO standalone assets] Legacy release meta nélkül: ${relativeDistDir}`);
    return;
  }
  let value;
  try { value = JSON.parse(fs.readFileSync(releaseMetadataPath, "utf8")); } catch { fail("A release meta JSON sérült."); }
  if (value?.buildId !== buildId) fail("A release meta build ID eltér a BUILD_ID értékétől.");
  if (!/^[0-9a-f]{40}$/i.test(String(value?.gitCommit || ""))) fail("A release meta Git commit érvénytelen.");
}

function removeIfExists(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}


function removeTracedStandaloneDataCopy() {
  if (!fs.existsSync(standaloneDataPath)) return false;
  const stat = fs.lstatSync(standaloneDataPath);
  if (stat.isSymbolicLink()) return false;
  if (!stat.isDirectory()) fail("A standalone .dimprover útvonal nem könyvtár és nem symlink.");
  removeIfExists(standaloneDataPath);
  console.log("[DIMPRO standalone assets] Build-local .dimprover másolat eltávolítva; a start központi symlinket készít.");
  return true;
}

function copyDirectory(source, target) {
  if (!fs.existsSync(source)) fail(`Hiányzó forráskönyvtár: ${source}`);
  removeIfExists(target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true });
}

function pruneStandalone() {
  if (!fs.existsSync(standaloneRoot)) return;
  const exactNames = new Set([
    "backups",
    ".dimprover",
    "DIMPROVER_PRODUCT_DOCS",
    "desktop_clients",
    "launcher_source",
    "notes",
  ]);

  for (const entry of fs.readdirSync(standaloneRoot, { withFileTypes: true })) {
    const shouldRemove = exactNames.has(entry.name)
      || (relativeDistDir !== ".next" && entry.name === ".next")
      || entry.name.startsWith(".work_")
      || entry.name.toLowerCase().endsWith(".zip");
    if (shouldRemove) removeIfExists(path.join(standaloneRoot, entry.name));
  }
}

function copyServerManifests() {
  fs.mkdirSync(targetServer, { recursive: true });
  if (!fs.existsSync(sourceServer)) fail(`Hiányzó Next.js server könyvtár: ${sourceServer}`);

  for (const entry of fs.readdirSync(sourceServer, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const isManifest = /manifest.*\.(json|js)$/i.test(entry.name);
    const isMiddleware = /^middleware\.js(?:\.map|\.nft\.json)?$/i.test(entry.name);
    if (isManifest || isMiddleware) {
      fs.copyFileSync(path.join(sourceServer, entry.name), path.join(targetServer, entry.name));
    }
  }
}

if (!fs.existsSync(buildIdPath)) fail("A .next/BUILD_ID nem található. Előbb sikeres build szükséges.");
if (!fs.existsSync(path.join(standaloneRoot, "server.js"))) fail("A standalone server.js nem található.");

const buildId = fs.readFileSync(buildIdPath, "utf8").trim();
if (force) writeReleaseMetadata(buildId);
else verifyReleaseMetadata(buildId);
const currentMarker = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, "utf8").trim() : "";
const targetChunkDirectory = path.join(targetStatic, "chunks");
const targetHasChunks = fs.existsSync(targetChunkDirectory)
  && fs.readdirSync(targetChunkDirectory).some((name) => name.endsWith(".js") || name.endsWith(".css"));
const targetHasPublic = fs.existsSync(targetPublic) && fs.readdirSync(targetPublic).length > 0;
const tracedDataCopyRemoved = removeTracedStandaloneDataCopy();
const needsSync = force || tracedDataCopyRemoved || currentMarker !== buildId || !targetHasChunks || !targetHasPublic;

if (needsSync) {
  pruneStandalone();
  copyDirectory(sourceStatic, targetStatic);
  copyDirectory(sourcePublic, targetPublic);
  copyServerManifests();
  fs.writeFileSync(markerPath, `${buildId}\n`, "utf8");
  console.log(`[DIMPRO standalone assets] Szinkronizálva. Build: ${buildId}`);
} else {
  console.log(`[DIMPRO standalone assets] Rendben. Build: ${buildId}`);
}

const finalChunkCount = fs.readdirSync(targetChunkDirectory)
  .filter((name) => name.endsWith(".js") || name.endsWith(".css")).length;
if (!finalChunkCount) fail("A standalone statikus chunk könyvtár üres.");
console.log(`[DIMPRO standalone assets] ${finalChunkCount} statikus chunk ellenőrizve.`);
