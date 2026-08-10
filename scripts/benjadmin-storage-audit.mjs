import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const rootArg = args.find((arg) => arg.startsWith("--root="));
const ageArg = args.find((arg) => arg.startsWith("--min-age-hours="));
const protectedArgs = args.filter((arg) => arg.startsWith("--protect=")).map((arg) => arg.slice("--protect=".length)).filter(Boolean);
const jsonOnly = args.includes("--json");
const root = path.resolve(rootArg ? rootArg.slice("--root=".length) : process.cwd());
const minAgeHours = Math.max(1, Number(ageArg ? ageArg.slice("--min-age-hours=".length) : 24) || 24);
const now = Date.now();

function sizeBytes(target) {
  try {
    const output = execFileSync("du", ["-sk", target], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return Number(output.split(/\s+/)[0] || 0) * 1024;
  } catch {
    return 0;
  }
}

function human(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit >= 3 ? 2 : 1)} ${units[unit]}`;
}

function pointerProtectedBuilds() {
  const builds = new Set();
  for (const name of fs.readdirSync(root)) {
    if (!name.startsWith(".work_") || !name.includes("rollback")) continue;
    const file = path.join(root, name);
    let content = "";
    try { content = fs.readFileSync(file, "utf8"); } catch { continue; }
    for (const match of content.matchAll(/(?:^|\s)(\.next[-_][^\s]+)/g)) builds.add(match[1]);
  }
  return builds;
}

const protectedBuilds = new Set([".next", ...protectedArgs, ...pointerProtectedBuilds()]);
const entries = fs.readdirSync(root, { withFileTypes: true });
const builds = [];
const stalePointers = [];

for (const entry of entries) {
  if (!entry.isDirectory() || !entry.name.startsWith(".next")) continue;
  const fullPath = path.join(root, entry.name);
  const stat = fs.statSync(fullPath);
  const ageHours = (now - stat.mtimeMs) / 3600000;
  const isProtected = protectedBuilds.has(entry.name);
  builds.push({
    name: entry.name,
    path: fullPath,
    bytes: sizeBytes(fullPath),
    ageHours: Math.round(ageHours * 10) / 10,
    classification: isProtected ? "protected" : ageHours >= minAgeHours ? "cleanup-candidate" : "recent-hold",
  });
}

for (const name of fs.readdirSync(root)) {
  if (!name.startsWith(".work_") || !name.includes("rollback")) continue;
  const file = path.join(root, name);
  let content = "";
  try { content = fs.readFileSync(file, "utf8").trim(); } catch { continue; }
  if (!content.startsWith(".next")) continue;
  const target = path.join(root, content);
  if (!fs.existsSync(target)) stalePointers.push({ pointer: name, target: content });
}

builds.sort((a, b) => b.bytes - a.bytes);
const candidateBytes = builds.filter((item) => item.classification === "cleanup-candidate").reduce((sum, item) => sum + item.bytes, 0);
const protectedBytes = builds.filter((item) => item.classification === "protected").reduce((sum, item) => sum + item.bytes, 0);
const backupRoot = path.join(root, "backups");
const dimproverBackupRoot = path.join(root, ".dimprover", "backups");
const report = {
  generatedAt: new Date().toISOString(),
  root,
  mode: "read-only",
  minAgeHours,
  protectedBuilds: [...protectedBuilds].sort(),
  totals: {
    buildBytes: builds.reduce((sum, item) => sum + item.bytes, 0),
    cleanupCandidateBytes: candidateBytes,
    protectedBuildBytes: protectedBytes,
    backupsBytes: fs.existsSync(backupRoot) ? sizeBytes(backupRoot) : 0,
    dimproverBackupsBytes: fs.existsSync(dimproverBackupRoot) ? sizeBytes(dimproverBackupRoot) : 0,
  },
  builds,
  staleRollbackPointers: stalePointers,
  policy: {
    automaticDelete: false,
    cleanupCandidateMeaning: `Nem védett .next könyvtár, legalább ${minAgeHours} órás. Törlés előtt külön backup és runtime ellenőrzés szükséges.`,
    backupsMeaning: "A backup könyvtárak csak review kategória. Ez a script nem töröl backupot.",
  },
};

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`BENJADMIN storage audit: ${root}`);
  console.log(`Mode: read-only | build total: ${human(report.totals.buildBytes)} | cleanup candidates: ${human(candidateBytes)}`);
  console.log(`Backups: ${human(report.totals.backupsBytes)} | .dimprover backups: ${human(report.totals.dimproverBackupsBytes)}`);
  console.log(`Stale rollback pointers: ${stalePointers.length}`);
  for (const item of builds.slice(0, 40)) console.log(`${item.classification.padEnd(17)} ${human(item.bytes).padStart(10)} ${String(item.ageHours).padStart(8)}h ${item.name}`);
}
