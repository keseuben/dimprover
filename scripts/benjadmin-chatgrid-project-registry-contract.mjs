#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const registry = fs.readFileSync(path.join(root, "scripts/benjadmin-chatgrid-project-registry.mjs"), "utf8");
const map = fs.readFileSync(path.join(root, "app/lib/dev-center/development-map.ts"), "utf8");
const checks = [
  ["stable BENJADMIN project id", registry.includes('id: "project_benjadmin"')],
  ["ChatGrid v0.2.9 registered as TESTING", registry.includes('id: "version_benjadmin_chatgrid_029"') && registry.includes('status: "testing"')],
  ["External Review Room registered as PLANNED", registry.includes('id: "version_benjadmin_chatgrid_external_review_v01"') && registry.includes('status: "planned"')],
  ["registry is hard DEV gated", registry.includes("app.dev.dimpro.hu") && registry.includes("admin.dev.dimpro.hu") && registry.includes("PROD DENY")],
  ["M.Forge and V.Guard are visible participants", registry.includes('["BENJADMIN", "BENAI", "MFORGE", "VGUARD"]')],
  ["write needs explicit BenjAdmin approval", registry.includes("EXPLICIT_BENJADMIN_APPROVAL_REQUIRED")],
  ["V.Guard write invalidates independent review", registry.includes("EXPLICIT_SCOPED_DEV_WRITE_INVALIDATES_INDEPENDENT_REVIEW")],
  ["ChatGrid development map node exists", map.includes('id: "benjadmin-chatgrid"')],
  ["External Review Room map node exists", map.includes('id: "benjadmin-external-review-room"')],
];
let passed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (ok) passed += 1;
}
console.log(JSON.stringify({ ok: passed === checks.length, passed, total: checks.length, failed: checks.length - passed }, null, 2));
if (passed !== checks.length) process.exit(1);
