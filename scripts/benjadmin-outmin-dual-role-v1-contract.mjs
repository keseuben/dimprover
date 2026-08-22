import fs from "node:fs";

const isolation = fs.readFileSync("app/lib/dev-center/partner-isolation.ts", "utf8");
const orchestration = fs.readFileSync("app/lib/dev-center/orchestration-repository.ts", "utf8");
const commonChat = fs.readFileSync("DIMPROVER_PRODUCT_DOCS/296_benjadmin_common_chat_external_routing_worktime_v2_3_20260820.md", "utf8");

const checks = [
  ["01 OutminAI named worker", isolation.includes('OUTMINAI_WORKER_CODE = "OUTMINAI"')],
  ["02 unconditional internal deny removed", !isolation.includes('"PARTNER_OUTMIN_INTERNAL_DENIED"')],
  ["03 dual-role internal rule documented in source", isolation.includes("OutminAI dual-role policy (2026-08-22)")],
  ["04 partner plane still bound to OutminAI", isolation.includes("partner.default_worker_id !== worker.id") && isolation.includes("worker.code !== OUTMINAI_WORKER_CODE")],
  ["05 partner project status gate remains", isolation.includes("PARTNER_PROJECT_NOT_RUNNABLE")],
  ["06 automatic next-task claim remains denied", orchestration.includes("PARTNER_OUTMIN_EXPLICIT_TASK_REQUIRED")],
  ["07 explicit-task wording active", orchestration.includes("csak explicit kiosztott taskot claimelhet")],
  ["08 Common Chat classifies OutminAI internal", commonChat.includes("BELSŐ: BenAI, ÁrminAI, JázminAI, OutminAI.")],
  ["09 external workers remain M.Forge and V.Guard", commonChat.includes("KÜLSŐ: M.Forge-AI, V.Guard-AI.")],
  ["10 PROD DENY remains normative", commonChat.includes("PROD DENY")],
];

let passed = 0;
for (const [name, ok] of checks) {
  if (!ok) throw new Error(`FAIL ${name}`);
  passed += 1;
  console.log(`PASS ${name}`);
}
console.log(JSON.stringify({ ok: true, passed, failed: 0 }, null, 2));
