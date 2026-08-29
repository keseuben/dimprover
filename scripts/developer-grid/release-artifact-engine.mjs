import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const RELEASE_ENGINE_SCHEMA_VERSION = 1;
export const EXPECTED_HOST = "dimpro-dev";
export const EXPECTED_WORKTREE = "/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v1-20260827";
export const EXPECTED_BRANCH = "feature/benjadmin-developer-grid-v1-20260827";
export const EXPECTED_REPOSITORY = "/srv/dimpro-dev/repositories/dimprover.git";
export const DEFAULT_ARTIFACT_ROOT = "/srv/dimpro-dev/artifacts/benjadmin-developer-grid";
export const DEFAULT_PUBLIC_ROOT = "/var/www/developer-grid-download";
export const DEFAULT_PUBLIC_BASE = "https://admin.dev.dimpro.hu/downloads/benjadmin-developer-grid";

const FORBIDDEN_ZIP_ENTRY = /(^|\/)(node_modules|\.next|\.git|\.ssh)(\/|$)|(^|\/)(?:\.env(?:\.|\/|$)|\.npmrc$|\.netrc$)|(^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|credentials(?:\.[^/]+)?|service-account(?:\.[^/]+)?|[^/]+\.(?:pem|key|p12|pfx))$|admin-key|reporter-key|device-token|SUPABASE_SERVICE_ROLE/i;

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function text(value) {
  return String(value ?? "").trim();
}

function run(file, args, options = {}) {
  return execFileSync(file, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  }).trim();
}

function git(root, ...args) {
  return run("git", ["-C", root, ...args]);
}

function parseArgs(argv) {
  const result = {
    stage: false,
    verifyPublic: false,
    artifactRoot: DEFAULT_ARTIFACT_ROOT,
    publicRoot: DEFAULT_PUBLIC_ROOT,
    publicBase: DEFAULT_PUBLIC_BASE,
  };
  for (const arg of argv) {
    if (arg === "--stage") result.stage = true;
    else if (arg === "--verify-public") result.verifyPublic = true;
    else if (arg.startsWith("--artifact-root=")) result.artifactRoot = arg.slice("--artifact-root=".length);
    else if (arg.startsWith("--public-root=")) result.publicRoot = arg.slice("--public-root=".length);
    else if (arg.startsWith("--public-base=")) result.publicBase = arg.slice("--public-base=".length);
    else fail("UNKNOWN_RELEASE_ARGUMENT", arg);
  }
  if (result.verifyPublic && !result.stage) {
    fail("PUBLIC_VERIFY_REQUIRES_STAGE", "A publikus visszaellenőrzés csak --stage mellett futtatható.");
  }
  return result;
}

export function isForbiddenZipEntry(entry) {
  return FORBIDDEN_ZIP_ENTRY.test(String(entry || ""));
}

export function validateReleaseMetadata({ buildId, head, branch, releaseMeta }) {
  if (!releaseMeta || typeof releaseMeta !== "object") {
    fail("RELEASE_METADATA_MISSING", ".dimpro-release.json hiányzik vagy érvénytelen.");
  }
  if (text(releaseMeta.buildId) !== text(buildId)) {
    fail("RELEASE_STATE_MISMATCH", `Build ID eltérés: ${releaseMeta.buildId || "NINCS"} != ${buildId}`);
  }
  if (text(releaseMeta.gitCommit) !== text(head)) {
    fail("RELEASE_STATE_MISMATCH", `Commit eltérés: ${releaseMeta.gitCommit || "NINCS"} != ${head}`);
  }
  if (text(releaseMeta.gitBranch) !== text(branch)) {
    fail("RELEASE_STATE_MISMATCH", `Branch eltérés: ${releaseMeta.gitBranch || "NINCS"} != ${branch}`);
  }
  return true;
}


export function validateWindowsArtifactMarker({ marker, version, head, branch, buildId, exeFile, exeHash, exeBytes }) {
  if (!marker || typeof marker !== "object") {
    fail("WINDOWS_ARTIFACT_MARKER_MISSING", ".dimpro-windows-artifact.json hiányzik vagy érvénytelen.");
  }
  if (Number(marker.schemaVersion) !== 1 || marker.product !== "BENJADMIN Developer Grid") {
    fail("WINDOWS_ARTIFACT_MARKER_INVALID", "Marker schema/product eltérés.");
  }
  const checks = [
    [text(marker.version), text(version), "version"],
    [text(marker.gitCommit), text(head), "commit"],
    [text(marker.gitBranch), text(branch), "branch"],
    [text(marker.buildId), text(buildId), "buildId"],
    [text(marker.environment).toUpperCase(), "DEV", "environment"],
    [text(marker.productionAccess).toUpperCase(), "DENY", "productionAccess"],
    [text(marker.exe?.file), path.basename(exeFile), "exe.file"],
    [text(marker.exe?.sha256).toLowerCase(), text(exeHash).toLowerCase(), "exe.sha256"],
    [String(marker.exe?.bytes ?? ""), String(exeBytes), "exe.bytes"],
  ];
  for (const [actual, expected, field] of checks) {
    if (actual !== expected) fail("WINDOWS_ARTIFACT_MARKER_MISMATCH", `${field}: ${actual || "NINCS"} != ${expected}`);
  }
  if (marker.exe?.signed !== false) fail("WINDOWS_ARTIFACT_MARKER_MISMATCH", "exe.signed != false");
  return true;
}

export function validatePublicHeaders(headers) {
  const env = text(headers?.get?.("x-dimpro-environment")).toUpperCase();
  const prod = text(headers?.get?.("x-dimpro-production-access")).toUpperCase();
  if (env !== "DEV") fail("PUBLIC_ENVIRONMENT_MISMATCH", `Elvárt DEV, kapott: ${env || "NINCS"}`);
  if (prod !== "DENY") fail("PUBLIC_PRODUCTION_ACCESS_MISMATCH", `Elvárt DENY, kapott: ${prod || "NINCS"}`);
  return true;
}

export function validateSha256Sidecar(content, fileName, expectedHash) {
  const line = String(content || "").trim();
  const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
  if (!match) fail("PUBLIC_SHA256_SIDECAR_INVALID", fileName);
  const actualHash = match[1].toLowerCase();
  const actualFile = path.basename(match[2].trim());
  if (actualFile !== path.basename(fileName)) fail("PUBLIC_SHA256_SIDECAR_FILE_MISMATCH", `${actualFile} != ${path.basename(fileName)}`);
  if (actualHash !== String(expectedHash || "").toLowerCase()) fail("PUBLIC_SHA256_SIDECAR_HASH_MISMATCH", fileName);
  return true;
}

export function writeImmutableBuffer(file, content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file);
    if (!existing.equals(buffer)) {
      fail("ARTIFACT_IMMUTABILITY_VIOLATION", `Már létező artifact eltér: ${file}`);
    }
    return "EXISTS_SAME";
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o755 });
  fs.writeFileSync(file, buffer, { mode: 0o644 });
  return "CREATED";
}

async function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(file);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

async function sha256ResponseBody(response) {
  if (!response.body) fail("PUBLIC_DOWNLOAD_BODY_MISSING", "A publikus letöltés válasza üres.");
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    hash.update(buffer);
  }
  return { sha256: hash.digest("hex"), bytes };
}

export function assertPathWithin(candidate, allowedRoot, code = "PATH_DENIED") {
  const resolved = path.resolve(candidate);
  const root = path.resolve(allowedRoot);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    fail(code, `${resolved} nincs az engedélyezett ${root} alatt.`);
  }
  if (fs.existsSync(root)) {
    const realRoot = fs.realpathSync.native(root);
    if (realRoot !== root) fail(`${code}_SYMLINK_ESCAPE`, `Az engedélyezett root szimbolikus linken keresztül oldódik fel: ${root} -> ${realRoot}`);
  }
  const relative = path.relative(root, resolved);
  let current = root;
  for (const part of relative ? relative.split(path.sep) : []) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) break;
    if (fs.lstatSync(current).isSymbolicLink()) {
      fail(`${code}_SYMLINK_ESCAPE`, `Szimbolikus link tiltott release útvonalban: ${current}`);
    }
  }
  return resolved;
}

function readJson(file, code) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(code, `${file}: ${error.message}`);
  }
}

function requireFile(file, code) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(code, file);
  return file;
}

function releaseFileNames(version) {
  return {
    exe: `BENJADMIN-Developer-Grid-${version}-Windows-x64.exe`,
    zip: `BENJADMIN-Developer-Grid-v${version}-DEV.zip`,
    manifest: `ARTIFACT_MANIFEST_v${version}.json`,
  };
}

function readSourceVersion(root) {
  const source = fs.readFileSync(path.join(root, "app/lib/developer-grid/types.ts"), "utf8");
  return source.match(/DEVELOPER_GRID_VERSION\s*=\s*"([^"]+)"/)?.[1] || "";
}

function verifySourceIdentity(root) {
  if (os.hostname() !== EXPECTED_HOST) fail("RELEASE_HOST_MISMATCH", `${os.hostname()} != ${EXPECTED_HOST}`);
  const topLevel = git(root, "rev-parse", "--show-toplevel");
  const branch = git(root, "branch", "--show-current");
  const head = git(root, "rev-parse", "HEAD");
  const commonDirRaw = git(root, "rev-parse", "--git-common-dir");
  const commonDir = path.resolve(root, commonDirRaw);
  const status = git(root, "status", "--porcelain");
  if (topLevel !== EXPECTED_WORKTREE) fail("SOURCE_BASELINE_MISMATCH", `worktree: ${topLevel}`);
  if (branch !== EXPECTED_BRANCH) fail("SOURCE_BASELINE_MISMATCH", `branch: ${branch}`);
  if (commonDir !== EXPECTED_REPOSITORY) fail("SOURCE_BASELINE_MISMATCH", `repository: ${commonDir}`);
  if (status) fail("SOURCE_WORKTREE_DIRTY", "Release artifact csak tiszta worktree-ből készülhet.");
  return { head, branch, worktree: topLevel, repository: commonDir };
}

function verifyZip(zipFile, version, identity, buildId) {
  let entries;
  try {
    entries = run("zipinfo", ["-1", zipFile]).split(/\r?\n/).filter(Boolean);
  } catch (error) {
    fail("ZIPINFO_UNAVAILABLE", error.message);
  }
  const forbidden = entries.filter(isForbiddenZipEntry);
  if (forbidden.length) fail("DEV_ZIP_FORBIDDEN_CONTENT", forbidden.slice(0, 5).join(", "));
  const readmeEntry = `BENJADMIN-Developer-Grid-v${version}-DEV/README_FIRST.txt`;
  if (!entries.includes(readmeEntry)) fail("DEV_ZIP_README_MISSING", readmeEntry);
  const readme = run("unzip", ["-p", zipFile, readmeEntry]);
  const required = [
    `BENJADMIN Developer Grid v${version} DEV`,
    "DEV ONLY · PROD DENY",
    `Commit: ${identity.head}`,
    `Branch: ${identity.branch}`,
    `Build ID: ${buildId}`,
  ];
  for (const line of required) if (!readme.includes(line)) fail("DEV_ZIP_PROVENANCE_MISMATCH", line);
  return { entries: entries.length, forbidden: 0, readmeEntry };
}

function copyImmutableFile(source, destination) {
  requireFile(source, "ARTIFACT_SOURCE_MISSING");
  if (fs.existsSync(destination)) {
    const src = fs.readFileSync(source);
    const dest = fs.readFileSync(destination);
    if (!src.equals(dest)) fail("ARTIFACT_IMMUTABILITY_VIOLATION", destination);
    return "EXISTS_SAME";
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(destination, 0o644);
  return "CREATED";
}

function writeShaFile(directory, fileName, hash) {
  const shaName = `${fileName}.sha256`;
  writeImmutableBuffer(path.join(directory, shaName), `${hash}  ${fileName}\n`);
  return shaName;
}

async function inspectRelease(root) {
  const identity = verifySourceIdentity(root);
  const packageFile = path.join(root, "desktop/benjadmin-developer-grid/package.json");
  const pkg = readJson(packageFile, "DESKTOP_PACKAGE_INVALID");
  const version = text(pkg.version);
  if (!/^0\.\d+\.\d+$/.test(version)) fail("DESKTOP_VERSION_INVALID", version);
  const sourceVersion = readSourceVersion(root);
  if (sourceVersion !== `${version}-dev`) {
    fail("VERSION_CONTRACT_MISMATCH", `${sourceVersion || "NINCS"} != ${version}-dev`);
  }
  const buildId = text(fs.readFileSync(requireFile(path.join(root, ".next/BUILD_ID"), "BUILD_ID_MISSING"), "utf8"));
  if (!buildId) fail("BUILD_ID_MISSING", "Üres BUILD_ID.");
  const releaseMeta = readJson(path.join(root, ".next/.dimpro-release.json"), "RELEASE_METADATA_MISSING");
  validateReleaseMetadata({ buildId, head: identity.head, branch: identity.branch, releaseMeta });
  requireFile(path.join(root, ".next/standalone/server.js"), "STANDALONE_RUNTIME_MISSING");
  const names = releaseFileNames(version);
  const exeFile = requireFile(path.join(root, "desktop/benjadmin-developer-grid/dist", names.exe), "WINDOWS_EXE_MISSING");
  const zipFile = requireFile(path.join(root, "desktop/benjadmin-developer-grid/dist-dev", names.zip), "DEV_ZIP_MISSING");
  const zipSafety = verifyZip(zipFile, version, identity, buildId);
  const [exeHash, zipHash] = await Promise.all([sha256File(exeFile), sha256File(zipFile)]);
  const exeBytes = fs.statSync(exeFile).size;
  const windowsMarkerFile = requireFile(path.join(root, "desktop/benjadmin-developer-grid/dist/.dimpro-windows-artifact.json"), "WINDOWS_ARTIFACT_MARKER_MISSING");
  const windowsMarker = readJson(windowsMarkerFile, "WINDOWS_ARTIFACT_MARKER_INVALID");
  validateWindowsArtifactMarker({ marker: windowsMarker, version, head: identity.head, branch: identity.branch, buildId, exeFile, exeHash, exeBytes });
  return {
    schemaVersion: RELEASE_ENGINE_SCHEMA_VERSION,
    product: "BENJADMIN Developer Grid",
    version: `${version} DEV`,
    versionNumber: version,
    environment: "DEV",
    productionAccess: "DENY",
    gitCommit: identity.head,
    gitBranch: identity.branch,
    sourceWorktree: identity.worktree,
    sourceRepository: identity.repository,
    buildId,
    buildGeneratedAt: text(releaseMeta.generatedAt) || null,
    releaseMetadata: "VERIFIED",
    standalone: "VERIFIED",
    windowsArtifactProvenance: "VERIFIED",
    windowsArtifactMarker: windowsMarkerFile,
    exe: { file: names.exe, source: exeFile, sha256: exeHash, bytes: exeBytes, signed: false },
    devZip: { file: names.zip, source: zipFile, sha256: zipHash, bytes: fs.statSync(zipFile).size, safety: "PASS", entries: zipSafety.entries },
    manifestFile: names.manifest,
    verifiedAt: new Date().toISOString(),
  };
}

async function materializeRelease(inspection, artifactRoot) {
  const safeArtifactRoot = assertPathWithin(artifactRoot, DEFAULT_ARTIFACT_ROOT, "ARTIFACT_ROOT_DENIED");
  const releaseDir = path.join(safeArtifactRoot, `v${inspection.versionNumber}-${inspection.gitCommit.slice(0, 7)}`);
  fs.mkdirSync(releaseDir, { recursive: true, mode: 0o755 });
  const exeDest = path.join(releaseDir, inspection.exe.file);
  const zipDest = path.join(releaseDir, inspection.devZip.file);
  copyImmutableFile(inspection.exe.source, exeDest);
  copyImmutableFile(inspection.devZip.source, zipDest);
  const exeSha = writeShaFile(releaseDir, inspection.exe.file, inspection.exe.sha256);
  const zipSha = writeShaFile(releaseDir, inspection.devZip.file, inspection.devZip.sha256);
  const manifest = {
    schemaVersion: RELEASE_ENGINE_SCHEMA_VERSION,
    product: inspection.product,
    version: inspection.version,
    gitCommit: inspection.gitCommit,
    gitBranch: inspection.gitBranch,
    buildId: inspection.buildId,
    environment: "DEV",
    productionAccess: "DENY",
    releaseEngine: "Developer Grid Release Artifact Engine",
    releaseMetadata: inspection.releaseMetadata,
    standalone: inspection.standalone,
    windowsArtifactProvenance: inspection.windowsArtifactProvenance,
    exe: { file: inspection.exe.file, sha256: inspection.exe.sha256, bytes: inspection.exe.bytes, signed: false },
    devZip: { file: inspection.devZip.file, sha256: inspection.devZip.sha256, bytes: inspection.devZip.bytes, forbiddenContentCheck: "PASS", files: inspection.devZip.entries },
    generatedAt: inspection.buildGeneratedAt,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestPath = path.join(releaseDir, inspection.manifestFile);
  writeImmutableBuffer(manifestPath, manifestText);
  const manifestHash = crypto.createHash("sha256").update(manifestText).digest("hex");
  const manifestSha = writeShaFile(releaseDir, inspection.manifestFile, manifestHash);
  return { releaseDir, manifest, manifestPath, manifestHash, files: [inspection.exe.file, exeSha, inspection.devZip.file, zipSha, inspection.manifestFile, manifestSha] };
}

function stageRelease(materialized, publicRoot) {
  if (process.env.DIMPRO_RELEASE_COORDINATED !== "1") {
    fail("RELEASE_LOCK_REQUIRED", "Publikus staging csak központi release lock alatt engedélyezett.");
  }
  const safePublicRoot = path.resolve(publicRoot);
  if (safePublicRoot !== path.resolve(DEFAULT_PUBLIC_ROOT)) fail("PUBLIC_ROOT_DENIED", safePublicRoot);
  fs.mkdirSync(safePublicRoot, { recursive: true, mode: 0o755 });
  for (const file of materialized.files) {
    copyImmutableFile(path.join(materialized.releaseDir, file), path.join(safePublicRoot, file));
  }
  return { publicRoot: safePublicRoot, files: [...materialized.files] };
}

async function verifyPublicRelease(materialized, publicBase) {
  const base = String(publicBase).replace(/\/+$/, "");
  if (base !== DEFAULT_PUBLIC_BASE) fail("PUBLIC_BASE_DENIED", base);
  const expected = [
    [materialized.manifest.exe.file, materialized.manifest.exe.sha256, materialized.manifest.exe.bytes],
    [materialized.manifest.devZip.file, materialized.manifest.devZip.sha256, materialized.manifest.devZip.bytes],
  ];
  const verified = [];
  for (const [file, expectedHash, expectedBytes] of expected) {
    const response = await fetch(`${base}/${encodeURIComponent(file)}`, { redirect: "manual" });
    if (response.status !== 200) fail("PUBLIC_DOWNLOAD_FAILED", `${file}: HTTP ${response.status}`);
    validatePublicHeaders(response.headers);
    const actual = await sha256ResponseBody(response);
    if (actual.sha256 !== expectedHash) fail("PUBLIC_ARTIFACT_HASH_MISMATCH", file);
    if (actual.bytes !== expectedBytes) fail("PUBLIC_ARTIFACT_SIZE_MISMATCH", `${file}: ${actual.bytes} != ${expectedBytes}`);
    const sidecarName = `${file}.sha256`;
    const sidecarResponse = await fetch(`${base}/${encodeURIComponent(sidecarName)}`, { redirect: "manual" });
    if (sidecarResponse.status !== 200) fail("PUBLIC_SHA256_SIDECAR_FAILED", `${sidecarName}: HTTP ${sidecarResponse.status}`);
    validatePublicHeaders(sidecarResponse.headers);
    validateSha256Sidecar(await sidecarResponse.text(), file, expectedHash);
    verified.push({ file, sha256: actual.sha256, bytes: actual.bytes, sidecar: "VERIFIED" });
  }
  const manifestFile = materialized.manifestFile || `ARTIFACT_MANIFEST_v${materialized.manifest.version?.split(" ")[0]}.json`;
  const manifestResponse = await fetch(`${base}/${encodeURIComponent(manifestFile)}`, { redirect: "manual" });
  if (manifestResponse.status !== 200) fail("PUBLIC_MANIFEST_FAILED", `HTTP ${manifestResponse.status}`);
  validatePublicHeaders(manifestResponse.headers);
  const manifestBytes = Buffer.from(await manifestResponse.arrayBuffer());
  const manifestHash = crypto.createHash("sha256").update(manifestBytes).digest("hex");
  if (manifestHash !== materialized.manifestHash) fail("PUBLIC_MANIFEST_HASH_MISMATCH", manifestFile);
  let publicManifest;
  try { publicManifest = JSON.parse(manifestBytes.toString("utf8")); }
  catch { fail("PUBLIC_MANIFEST_INVALID_JSON", manifestFile); }
  if (publicManifest.gitCommit !== materialized.manifest.gitCommit || publicManifest.buildId !== materialized.manifest.buildId || publicManifest.productionAccess !== "DENY") {
    fail("PUBLIC_MANIFEST_PROVENANCE_MISMATCH", "A publikus manifest provenance eltér.");
  }
  const manifestSidecar = `${manifestFile}.sha256`;
  const manifestSidecarResponse = await fetch(`${base}/${encodeURIComponent(manifestSidecar)}`, { redirect: "manual" });
  if (manifestSidecarResponse.status !== 200) fail("PUBLIC_SHA256_SIDECAR_FAILED", `${manifestSidecar}: HTTP ${manifestSidecarResponse.status}`);
  validatePublicHeaders(manifestSidecarResponse.headers);
  validateSha256Sidecar(await manifestSidecarResponse.text(), manifestFile, materialized.manifestHash);
  verified.push({ file: manifestFile, sha256: manifestHash, bytes: manifestBytes.length, sidecar: "VERIFIED" });
  return verified;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = EXPECTED_WORKTREE;
  const inspection = await inspectRelease(root);
  if (process.env.DIMPRO_RELEASE_COORDINATED !== "1") {
    fail("RELEASE_LOCK_REQUIRED", "Artifact materializálás csak központi release lock alatt engedélyezett.");
  }
  const materialized = await materializeRelease(inspection, args.artifactRoot);
  materialized.manifestFile = inspection.manifestFile;
  let staged = null;
  let publicVerification = null;
  if (args.stage) staged = stageRelease(materialized, args.publicRoot);
  if (args.verifyPublic) publicVerification = await verifyPublicRelease(materialized, args.publicBase);
  console.log(JSON.stringify({ ok: true, productionAccess: "DENY", inspection: { version: inspection.version, gitCommit: inspection.gitCommit, gitBranch: inspection.gitBranch, buildId: inspection.buildId, exe: inspection.exe, devZip: inspection.devZip }, releaseDir: materialized.releaseDir, manifest: materialized.manifestPath, staged, publicVerification }, null, 2));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
