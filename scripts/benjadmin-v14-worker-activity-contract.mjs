#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const types = read("components/admin/developer-console/types.ts");
const message = read("components/admin/developer-console/DeveloperMessage.tsx");
const conversation = read("components/admin/developer-console/DeveloperConversation.tsx");
const shell = read("components/admin/developer-console/DeveloperConsoleShell.tsx");
const live = read("components/admin/developer-console/LiveWorkPanel.tsx");
const drawer = read("components/admin/developer-console/WorkerActivityDrawer.tsx");
const css = read("components/admin/developer-console/DeveloperConsole.module.css");
const route = read("app/api/dev/console/activity/route.ts");
const messageRoute = read("app/api/dev/console/messages/route.ts");
const lib = read("app/lib/dev-center/developer-console.ts");
const bridge = read("app/lib/dev-center/manual-bridge.ts");
const helper = read("scripts/benjadmin-worker-activity.mjs");
let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`PASS ${String(passed).padStart(2,"0")} ${name}`); }

check("Structured coding message kinds exist", () => { for (const kind of ["CODE_ACTIVITY","FILE_CHANGE","DIFF","TERMINAL_ACTIVITY","ARCHIVE_SUMMARY"]) assert.ok(types.includes(kind), kind); });
check("Developer message exposes author identity", () => assert.ok(message.includes("data-author={message.author}")));
check("Armin card uses green tint", () => assert.ok(css.includes('[data-author="ARMINAI"]') && css.includes("var(--green) 10%")));
check("BenAI card uses blue tint", () => assert.ok(css.includes('[data-author="BENAI"]') && css.includes("var(--blue) 9%")));
check("Jazmin card uses violet tint", () => assert.ok(css.includes('[data-author="JAZMINAI"]') && css.includes("var(--violet) 10%")));
check("Outmin card uses amber tint", () => assert.ok(css.includes('[data-author="OUTMINAI"]') && css.includes("var(--amber) 10%")));
check("Coding detail metadata is visible", () => assert.ok(message.includes("filePath") && message.includes("diffSummary") && message.includes("command") && message.includes("SANITIZED")));
check("Repeated activity cards collapse", () => assert.ok(conversation.includes("collapseRepeatedMessages") && conversation.includes("repeatCount") && conversation.includes("30 * 60_000")));
check("Repeated cards require same development context", () => assert.ok(conversation.includes("previous.metadata?.mainModule") && conversation.includes("previous.metadata?.presenceKey")));
check("Taskless worker cards show context", () => assert.ok(message.includes("Boolean(mainModule || moduleName || submoduleName || workItem)")));
check("Worker activity persistence dedupes exact repeats", () => assert.ok(lib.includes("activityDedupeKey") && lib.includes("30 * 60_000") && lib.includes(".eq(\"worker_code\", workerCode)")));
check("Worker dedupe keeps PROD deny final", () => assert.ok(lib.includes("activityDedupeKey: dedupeKey,\n      productionAccess: \"DENY\"")));
check("Daily archive exists", () => assert.ok(conversation.includes('type: "day"') && conversation.includes("Tegnap")));
check("Older-than-week archive exists behind reveal", () => assert.ok(conversation.includes("showEarlierArchive") && conversation.includes("mondayKey") && conversation.includes("Korábbi archívum megjelenítése")));
check("Archive groups are lazy rendered", () => assert.ok(conversation.includes("expandedArchives") && conversation.includes("ageDays <= 7") && css.includes("content-visibility: auto")));
check("Older history loads by cursor", () => assert.ok(messageRoute.includes('searchParams.get("before")') && lib.includes("listDeveloperConsoleMessagesPage")));
check("SSE merge preserves loaded history", () => assert.ok(shell.includes("new Map(current.map") && shell.includes("slice(-2400)")));
check("History exhaustion survives live refresh", () => assert.ok(shell.includes("historyExhaustedRef") && shell.includes("!historyExhaustedRef.current")));
check("Worker coding drawer exists", () => assert.ok(drawer.includes("WORKER KÓDOLÁSI CSEVEGÉS") && drawer.includes("benjadmin-worker-activity-feed")));
check("Worker cards open coding drawer", () => assert.ok(live.includes("Részletes kódolási csevegés") && live.includes("onOpenWorkerActivity")));
check("Worker activity endpoint requires auth", () => assert.ok(route.includes("isDevCenterAuthorized") && route.includes("401")));
check("Worker activity endpoint is DEV-deny for PROD", () => assert.ok(lib.includes('productionAccess: "DENY"') && helper.includes("Nem DEV host")));
check("Worker activity sanitizes text and file paths", () => assert.ok(route.includes("scanSensitiveText") && route.includes("isSensitivePath") && route.includes("ÉRZÉKENY ÚTVONAL MASZKOLVA")));
check("Worker helper uses stdin JSON", () => assert.ok(helper.includes("for await (const chunk of process.stdin)") && helper.includes("JSON.parse(raw)")));
check("Worker helper keeps admin key out of CLI args", () => assert.ok(helper.includes("admin-key.txt") && !helper.includes("process.argv")));
check("Manual bridge requires activity milestones", () => assert.ok(bridge.includes("analysis / coding / file-change / diff / test / build / commit / release") && bridge.includes("benjadmin-worker-activity.mjs")));
check("No native provider was enabled by V1.4", () => assert.ok(!route.includes("OPENAI_API_KEY") && !helper.includes("OPENAI_API_KEY")));

console.log(JSON.stringify({ ok: true, passed, failed: 0, contract: "BENJADMIN V1.4 Worker Activity + Archive" }, null, 2));
