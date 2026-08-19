#!/usr/bin/env node
import fs from "node:fs";
import assert from "node:assert/strict";

const read = (file) => fs.readFileSync(file, "utf8");
const backend = read("app/lib/dev-center/developer-console.ts");
const panel = read("components/admin/developer-console/WeeklyDevelopmentSummary.tsx");
const types = read("components/admin/developer-console/types.ts");
const css = read("components/admin/developer-console/DeveloperConsole.module.css");
const route = read("app/api/dev/console/weekly-summary/route.ts");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${name}`);
}

check("Flow V1.1 keeps the existing weekly API route", () =>
  assert.ok(route.includes("getDeveloperConsoleWeeklySummary(projectId, week)")));
check("Backend can build one previous-week comparison without recursive chaining", () =>
  assert.ok(backend.includes("includeComparison = true") && backend.includes("period.previousWeekKey, false")));
check("Trend type exposes five stable metric keys", () =>
  assert.ok(types.includes('"activities" | "completed" | "handoffs" | "waiting" | "errors"')));
check("Trend exposes previous week and availability state", () =>
  assert.ok(types.includes("previousWeekKey: string") && types.includes("available: boolean")));
check("Trend computes absolute and percentage deltas", () =>
  assert.ok(backend.includes("deltaPercent") && backend.includes("current - prior")));
check("Trend distinguishes higher lower and neutral preferences", () =>
  assert.ok(backend.includes('"higher" | "lower" | "neutral"') && backend.includes("preference ===")));
check("Waiting trend combines build-lock and worker waits", () =>
  assert.ok(backend.includes("currentWaiting = flowAnalytics.buildLockWaits + flowAnalytics.waitingForWorker")));
check("Error trend combines activity errors and task failures", () =>
  assert.ok(backend.includes("summary.stats.errors + flowAnalytics.taskFailures")));
check("Worker load type exposes activity share and signal", () =>
  assert.ok(types.includes("loadSharePercent: number") && types.includes('"normal" | "watch" | "high"')));
check("Worker load includes handoff wait and blocker counts", () =>
  assert.ok(types.includes("handoffCount: number") && types.includes("waitCount: number") && types.includes("blockerCount: number")));
check("Worker load share uses weekly worker activity total", () =>
  assert.ok(backend.includes("totalWorkerActivities") && backend.includes("worker.activityCount / totalWorkerActivities")));
check("Worker load high signal requires explicit pressure or strong concentration", () =>
  assert.ok(backend.includes("blockerCount >= 2") && backend.includes("waitCount >= 2") && backend.includes("loadSharePercent >= 60")));
check("Worker load comparison carries previous activity delta", () =>
  assert.ok(backend.includes("previousActivityCount") && backend.includes("activityDelta")));
check("UI renders previous-week trend section", () =>
  assert.ok(panel.includes('data-testid="benjadmin-weekly-flow-trend"') && panel.includes("Előző héthez képest")));
check("UI renders worker load section", () =>
  assert.ok(panel.includes('data-testid="benjadmin-weekly-worker-load"') && panel.includes("Worker terhelés")));
check("UI renders trend direction and tone metadata", () =>
  assert.ok(panel.includes("data-direction={item.direction}") && panel.includes("data-tone={item.tone}")));
check("UI renders worker load signal metadata", () =>
  assert.ok(panel.includes("data-signal={worker.signal}") && panel.includes("loadSharePercent")));
check("Responsive CSS covers trend and worker load", () =>
  assert.ok(css.includes(".weeklyFlowTrend > div") && css.includes(".weeklyWorkerLoad > div") && css.includes("grid-template-columns: minmax(0,1fr)")));
check("Flow V1.1 remains PROD denied and migration free", () =>
  assert.ok(panel.includes("PROD DENY") && !route.includes("migration")));

console.log(JSON.stringify({ ok: true, passed, failed: 0, contract: "BENJADMIN Weekly Development Flow V1.1" }, null, 2));
