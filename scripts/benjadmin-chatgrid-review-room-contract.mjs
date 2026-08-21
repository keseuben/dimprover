#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const route = read("app/api/dev/chatgrid/review-room/route.ts");
const core = read("app/lib/dev-center/chatgrid-review-room.ts");
const checks = [
  ["device auth required", route.includes("isChatGridDeviceAuthorized")],
  ["route is GET-only", route.includes("export async function GET") && !route.includes("export async function POST")],
  ["external tasks are canonical source", core.includes("listExternalAiWorkerTasks")],
  ["thread comes from canonical console messages", core.includes("listDeveloperConsoleMessages(240)")],
  ["M.Forge and V.Guard profiles exposed", core.includes("EXTERNAL_AI_WORKERS")],
  ["provider state is sanitized", core.includes("provider: adapter.provider") && core.includes("modelId: adapter.modelId")],
  ["provider secrets are not exposed", !core.includes("secretConfigured:") && !core.includes("OPENAI_API_KEY") && !core.includes("ANTHROPIC_API_KEY")],
  ["review mode is read only", core.includes('mode: "READ_ONLY_REVIEW"')],
  ["PROD is denied", core.includes('productionAccess: "DENY"')],
  ["review findings are bounded", core.includes("list(guard.findings, 16)")],
  ["thread size is bounded", core.includes(".slice(-120)")],
];
let pass=0;
for (const [name,ok] of checks) { console.log(`${ok?"PASS":"FAIL"} ${name}`); if(ok) pass++; }
console.log(JSON.stringify({ok:pass===checks.length,passed:pass,total:checks.length,failed:checks.length-pass},null,2));
if(pass!==checks.length) process.exit(1);
