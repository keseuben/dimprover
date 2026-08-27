import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "app/admin/developer-grid/page.tsx",
  "app/api/dev/grid/foundation/route.ts",
  "app/api/dev/grid/events/route.ts",
  "app/lib/developer-grid/types.ts",
  "app/lib/developer-grid/source-provenance.ts",
  "app/lib/developer-grid/development-context.ts",
  "app/lib/developer-grid/events.ts",
  "app/lib/developer-grid/release-provenance.ts",
  "app/lib/developer-grid/build-nodes.ts",
  "app/lib/developer-grid/exclusive-lock.ts",
  "app/lib/developer-grid/handoff.ts",
  "components/admin/developer-grid/DeveloperGridShell.tsx",
];

const failures = [];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`MISSING ${file}`);
}

const types = fs.readFileSync(path.join(root, "app/lib/developer-grid/types.ts"), "utf8");
const source = fs.readFileSync(path.join(root, "app/lib/developer-grid/source-provenance.ts"), "utf8");
const context = fs.readFileSync(path.join(root, "app/lib/developer-grid/development-context.ts"), "utf8");
const events = fs.readFileSync(path.join(root, "app/lib/developer-grid/events.ts"), "utf8");
const release = fs.readFileSync(path.join(root, "app/lib/developer-grid/release-provenance.ts"), "utf8");
const build = fs.readFileSync(path.join(root, "app/lib/developer-grid/build-nodes.ts"), "utf8");
const shell = fs.readFileSync(path.join(root, "components/admin/developer-grid/DeveloperGridShell.tsx"), "utf8");

const checks = [
  [types.includes('"ARMINAI" | "OUTMINAI" | "BENJAMINAI" | "JAZMINAI" | "DEVMINAI"'), "worker registry contract"],
  [source.includes("SOURCE_BASELINE_MISMATCH"), "source fail-closed"],
  [context.includes("PRESENCE_IS_AUTHORITATIVE_CONTEXT = false"), "presence non-authoritative"],
  [events.includes('DEVELOPER_GRID_REALTIME_MODE = "DELTA_EVENT"'), "delta/event realtime"],
  [events.includes("FULL_SNAPSHOT_POLLING_ALLOWED = false"), "full snapshot polling forbidden"],
  [release.includes("RELEASE_STATE_MISMATCH"), "release fail-closed"],
  [build.includes("build01.dimpro.hu") && build.includes("build02.dimpro.hu"), "build node abstraction"],
  [build.includes("Veszélyes kerülő build tilos"), "dangerous fallback build forbidden"],
  [shell.includes("05 DevminAI") && shell.includes("01 ÁrminAI") === false, "shell uses registry-driven fixed cells"],
];

for (const [ok, label] of checks) if (!ok) failures.push(`FAIL ${label}`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Developer Grid V1 foundation contract PASS · ${required.length} required files · ${checks.length} invariants`);
