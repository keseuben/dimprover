import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const rootArg = args.find((arg) => arg.startsWith("--root="));
const ageArg = args.find((arg) => arg.startsWith("--min-age-hours="));
const protectedArgs = args.filter((arg) => arg.startsWith("--protect=")).map((arg) => arg.slice("--protect=".length)).filter(Boolean);
const apply = args.includes("--apply");
const root = path.resolve(rootArg ? rootArg.slice("--root=".length) : process.cwd());
const minAgeHours = Math.max(24, Number(ageArg ? ageArg.slice("--min-age-hours=".length) : 24) || 24);
const protectedBuilds = new Set([".next", ...protectedArgs]);
const now = Date.now();

function sizeBytes(target) {
  try {
    const output = execFileSync("du", ["-sk", target], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return Number(output.split(/\s+/)[0] || 0) * 1024;
  } catch { return 0; }
}

function human(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes; let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit >= 3 ? 2 : 1)} ${units[unit]}`;
}

const candidates = [];
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith(".next-")) continue;
  if (protectedBuilds.has(entry.name)) continue;
  const fullPath = path.join(root, entry.name);
  const stat = fs.statSync(fullPath);
  const ageHours = (now - stat.mtimeMs) / 3600000;
  if (ageHours < minAgeHours) continue;
  candidates.push({ name: entry.name, path: fullPath, ageHours, bytes: sizeBytes(fullPath) });
}

candidates.sort((a, b) => a.name.localeCompare(b.name));
const totalBytes = candidates.reduce((sum, item) => sum + item.bytes, 0);
const manifest = {
  generatedAt: new Date().toISOString(), mode: apply ? "apply" : "dry-run", root, minAgeHours,
  protectedBuilds: [...protectedBuilds].sort(), candidateCount: candidates.length, totalBytes,
  candidates: candidates.map((item) => ({ ...item, ageHours: Math.round(item.ageHours * 10) / 10 })),
};

console.log(JSON.stringify(manifest, null, 2));
if (!apply) process.exit(0);

for (const item of candidates) {
  const resolved = path.resolve(item.path);
  if (!resolved.startsWith(`${root}${path.sep}.next-`)) throw new Error(`Unsafe cleanup path: ${resolved}`);
  if (protectedBuilds.has(path.basename(resolved))) throw new Error(`Protected build reached cleanup loop: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: false, maxRetries: 2, retryDelay: 200 });
  if (fs.existsSync(resolved)) throw new Error(`Cleanup failed: ${resolved}`);
  console.error(`REMOVED ${item.name} ${human(item.bytes)}`);
}
console.error(`CLEANUP_COMPLETE count=${candidates.length} reclaimed=${human(totalBytes)}`);
