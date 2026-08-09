const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

// A standalone Next.js release a saját könyvtárára válthatja a process.cwd() értékét.
// Minden release-nek ugyanazt a központi projekt- és licencadatkönyvtárat kell használnia.
process.env.DIMPRO_PROJECT_ROOT = process.env.DIMPRO_PROJECT_ROOT?.trim() || root;
process.env.DIMPRO_LICENSE_DATA_ROOT = process.env.DIMPRO_LICENSE_DATA_ROOT?.trim()
  || path.join(root, ".dimprover");
process.env.NEXT_ENV_PROJECT_DIR = process.env.NEXT_ENV_PROJECT_DIR?.trim() || root;
const releasePointerPath = path.join(root, ".dimprover", "active-next-release");
const pointerValue = fs.existsSync(releasePointerPath)
  ? fs.readFileSync(releasePointerPath, "utf8").trim()
  : "";
const configured = (process.env.NEXT_DIST_DIR || pointerValue || ".next").trim() || ".next";
const distRoot = path.resolve(root, configured);
const relative = path.relative(root, distRoot);

if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
  console.error(`[DIMPRO standalone start] Érvénytelen NEXT_DIST_DIR: ${configured}`);
  process.exit(1);
}

const buildIdPath = path.join(distRoot, "BUILD_ID");
const serverPath = path.join(distRoot, "standalone", "server.js");
if (!fs.existsSync(buildIdPath) || !fs.existsSync(serverPath)) {
  console.error(`[DIMPRO standalone start] Hiányos release: ${relative}`);
  process.exit(1);
}

const centralDataRoot = path.join(root, ".dimprover");
const standaloneDataPath = path.join(distRoot, "standalone", ".dimprover");
fs.mkdirSync(centralDataRoot, { recursive: true });
if (!fs.existsSync(standaloneDataPath)) {
  fs.symlinkSync(centralDataRoot, standaloneDataPath, "dir");
} else {
  const stat = fs.lstatSync(standaloneDataPath);
  const pointsToCentralRoot = stat.isSymbolicLink()
    && fs.realpathSync(standaloneDataPath) === fs.realpathSync(centralDataRoot);
  if (!pointsToCentralRoot) {
    console.error(`[DIMPRO standalone start] A release .dimprover útvonala nem a központi adattárra mutat: ${relative}`);
    process.exit(1);
  }
}

execFileSync(process.execPath, [path.join(root, "scripts", "ensure-next-standalone-assets.cjs")], {
  cwd: root,
  env: { ...process.env, NEXT_DIST_DIR: relative },
  stdio: "inherit",
});

const buildId = fs.readFileSync(buildIdPath, "utf8").trim();
console.log(`[DIMPRO standalone start] Release: ${relative}; build: ${buildId}`);
require(serverPath);
