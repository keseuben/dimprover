#!/usr/bin/env node
import fs from "node:fs";
import assert from "node:assert/strict";

const read = (file) => fs.readFileSync(file, "utf8");
const backend = read("app/lib/dev-center/developer-console.ts");
const route = read("app/api/dev/console/weekly-summary/route.ts");
const context = read("app/lib/dev-center/development-context.ts");
const panel = read("components/admin/developer-console/WeeklyDevelopmentSummary.tsx");
const conversation = read("components/admin/developer-console/DeveloperConversation.tsx");
const shell = read("components/admin/developer-console/DeveloperConsoleShell.tsx");
const drawer = read("components/admin/developer-console/WorkerActivityDrawer.tsx");
const types = read("components/admin/developer-console/types.ts");
const css = read("components/admin/developer-console/DeveloperConsole.module.css");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${name}`);
}

check("API accepts explicit week parameter", () =>
  assert.ok(route.includes('searchParams.get("week")') && route.includes("getDeveloperConsoleWeeklySummary(projectId, week)")));
check("Backend normalizes requested date to Budapest Monday", () =>
  assert.ok(backend.includes("budapestWeekFromCalendarDate") && backend.includes("mondayShift") && backend.includes("localMidnightUtc")));
check("Period exposes navigation keys", () =>
  assert.ok(backend.includes("previousWeekKey") && backend.includes("nextWeekKey") && backend.includes("currentWeekKey") && backend.includes("isCurrentWeek")));
check("Weekly type exposes navigation keys", () =>
  assert.ok(types.includes("previousWeekKey: string") && types.includes("isCurrentWeek: boolean")));
check("UI sends week query to API", () => assert.ok(panel.includes('query.set("week", weekKey)')));
check("UI has previous next and current week controls", () =>
  assert.ok(panel.includes("Előző hét") && panel.includes("Következő hét") && panel.includes("Aktuális hét")));
check("Date picker normalizes to Monday", () =>
  assert.ok(panel.includes("mondayDateKey") && panel.includes('type="date"')));
check("Future navigation stops on current week", () =>
  assert.ok(panel.includes("disabled={!summary || summary.period.isCurrentWeek}")));
check("Worker filter is interactive and persisted in URL", () =>
  assert.ok(panel.includes("weeklyWorker") && panel.includes("selectWorker") && panel.includes("data-worker-filter")));
check("Six-stage filter is interactive and persisted in URL", () =>
  assert.ok(panel.includes("weeklyStage") && panel.includes("selectStage") && panel.includes("data-stage-filter")));
check("Stage filter uses aggregate stageCounts", () =>
  assert.ok(panel.includes("context.stageCounts[String(stageFilter)]")));
check("Context cards are clickable deep-links", () =>
  assert.ok(panel.includes("weeklyContextCard") && panel.includes("onOpenContext?.(context, summary.period.weekKey)")));
check("Conversation forwards weekly context callback", () =>
  assert.ok(conversation.includes("onOpenWeeklyContext") && conversation.includes("onOpenContext={onOpenWeeklyContext}")));
check("Shared context key helper is used by backend and drawer", () =>
  assert.ok(context.includes("export function buildDevelopmentContextKey") && backend.includes("buildDevelopmentContextKey({") && drawer.includes("buildDevelopmentContextKey({")));
check("Shell persists weekly deep-link in URL", () =>
  assert.ok(shell.includes("weeklyContext") && shell.includes("weeklyDrawerWorker") && shell.includes("openWeeklyContext")));
check("Weekly deep-link supports full worker team", () =>
  assert.ok(shell.includes("BENAI") && shell.includes("MFORGE") && shell.includes("VGUARD") && drawer.includes('type WorkerCode = "BENAI"')));
check("Worker drawer applies exact context filter", () =>
  assert.ok(drawer.includes("focusedContextKey") && drawer.includes("=== focusedContextKey")));
check("Worker drawer exposes clear context action", () =>
  assert.ok(drawer.includes("HETI MUNKARÉSZRE SZŰRVE") && drawer.includes("Összes esemény")));
check("V1.1 responsive CSS covers toolbar filters and context card", () =>
  assert.ok(css.includes(".weeklySummaryToolbar") && css.includes(".weeklyFilterRow") && css.includes(".weeklyContextCard") && css.includes(".workerActivityContextFilter")));
check("V1.1 remains DEV only and migration free", () =>
  assert.ok(panel.includes("PROD DENY") && !route.includes("migration")));

console.log(JSON.stringify({ ok: true, passed, failed: 0, contract: "BENJADMIN Weekly Development Summary V1.1" }, null, 2));
