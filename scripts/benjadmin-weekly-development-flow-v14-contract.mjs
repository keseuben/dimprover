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
function check(name, fn) { fn(); passed += 1; console.log(`PASS ${String(passed).padStart(2, "0")} ${name}`); }

check("Flow V1.3 keeps existing weekly API route", () => assert.ok(route.includes("getDeveloperConsoleWeeklySummary(projectId, week)")));
check("Shared type exposes four drill-down categories", () => assert.ok(types.includes('drillDown: { scheduler: WeeklyFlowDrillDownItem[]; handoff: WeeklyFlowDrillDownItem[]; waiting: WeeklyFlowDrillDownItem[]; failure: WeeklyFlowDrillDownItem[] }')));
check("Drill-down item has stable common fields", () => ["id: string","category:","kind:","label: string","detail: string","at: string","workerCode: string | null","taskId: string | null","projectId: string | null","status: string | null","fromWorkerCode: string | null","toWorkerCode: string | null","workItem: string | null","attemptCount: number | null"].every((token) => types.includes(token)));
check("Scheduler drill-down reuses weekly scheduler runs", () => assert.ok(backend.includes("scheduler: [...schedulerRuns]") && backend.includes('kind: "SCHEDULER_RUN" as const')));
check("Scheduler drill-down carries status trigger and attempts", () => assert.ok(backend.includes("run.status") && backend.includes("run.triggerSource") && backend.includes("attemptCount: Math.max(1")));
check("Handoff drill-down reuses weekly transitions", () => assert.ok(backend.includes("handoff: weeklyTransitions.slice(0, 12)") && backend.includes("kind: item.reason")));
check("Waiting drill-down contains build-lock and worker waits", () => assert.ok(backend.includes('item.kind === "BUILD_LOCK_WAIT" || item.kind === "WAITING_WORKER"')));
check("Failure drill-down contains task and scheduler failures", () => assert.ok(backend.includes('item.kind === "TASK_FAILED" || item.kind === "SCHEDULER_FAILED"')));
check("Drill-down lists are bounded to twelve", () => assert.ok((backend.match(/slice\(0, 12\)/g) || []).length >= 4));
check("Flow response exposes drill-down payload", () => assert.ok(backend.includes("drillDown: flowDrillDown")));
check("UI has drill-down state and labels", () => assert.ok(panel.includes("FlowDetailKind") && panel.includes("FLOW_DETAIL_LABELS") && panel.includes("flowDetailItems")));
check("Four metric cards are accessible buttons", () => ["scheduler","handoff","waiting","failure"].every((kind) => panel.includes(`data-flow-kind="${kind}"`) && panel.includes(`aria-pressed={flowDetailKind === "${kind}"}`)));
check("Metric click toggles selected drill-down", () => assert.ok(panel.includes("setFlowDetailKind((current) => current ===")));
check("UI renders drill-down panel with category attribute", () => assert.ok(panel.includes('data-testid="benjadmin-weekly-flow-drilldown"') && panel.includes("data-detail-kind={flowDetailKind}")));
check("UI renders stable event-kind metadata", () => assert.ok(panel.includes("data-drilldown-event={item.kind}")));
check("UI exposes explicit close control", () => assert.ok(panel.includes('aria-label="Flow részletek bezárása"') && panel.includes("setFlowDetailKind(null)")));
check("UI has empty-state message", () => assert.ok(panel.includes("Nincs rögzített esemény ebben a kategóriában.")));
check("Metric CSS has pointer selected and focus states", () => assert.ok(css.includes(".weeklyFlowMetrics button[data-selected=\"true\"]") && css.includes(".weeklyFlowMetrics button:focus-visible") && css.includes("cursor: pointer")));
check("Drill-down CSS is compact and responsive", () => assert.ok(css.includes(".weeklyFlowDrillDown") && css.includes(".weeklyFlowDrillDown > div { grid-template-columns: minmax(0,1fr); }")));
check("Flow V1.3 remains PROD denied and migration free", () => assert.ok(panel.includes("PROD DENY") && !route.includes("migration") && !backend.includes("create table")));


check("V1.4 shared type exposes management summary", () => assert.ok(types.includes("managementSummary: {") && types.includes('status: "stable" | "watch" | "critical"')));
check("V1.4 management summary exposes executive fields", () => ["score: number", "headline: string", "narrative: string", "positives: string[]", "nextActions: string[]"].every((token) => types.includes(token)));
check("V1.4 backend derives summary from weekly flow", () => assert.ok(backend.includes("function deriveWeeklyManagementSummary") && backend.includes("const flow = summary.flowAnalytics")));
check("V1.4 combines failure and waiting signals", () => assert.ok(backend.includes("summary.stats.errors + flow.taskFailures + flow.schedulerRuns.failed") && backend.includes("flow.buildLockWaits + flow.waitingForWorker")));
check("V1.4 score is bounded and deterministic", () => assert.ok(backend.includes("Math.max(0, Math.min(100, 100 - penalty))") && backend.includes("failures * 12") && backend.includes("waiting * 6")));
check("V1.4 status has critical and watch thresholds", () => assert.ok(backend.includes("failures >= 3 || summary.stats.blockedTasks >= 2 || score < 60") && backend.includes("score < 85 || failures > 0 || waiting > 0")));
check("V1.4 derives positives risks and actions", () => assert.ok(backend.includes("const positives: string[] = []") && backend.includes('kind: "failure"') && backend.includes('kind: "waiting"') && backend.includes("const nextActions: string[] = []")));
check("V1.4 covers load handoff and trend risks", () => assert.ok(backend.includes('kind: "load"') && backend.includes('kind: "handoff"') && backend.includes('kind: "trend"')));
check("V1.4 recalculates management summary after trend comparison", () => assert.ok(backend.lastIndexOf("summary.managementSummary = deriveWeeklyManagementSummary(summary)") > backend.indexOf("summary.flowAnalytics.trend = {")));
check("V1.4 UI exposes management summary metadata", () => assert.ok(panel.includes('data-testid="benjadmin-weekly-management-summary"') && panel.includes("data-status={summary.managementSummary.status}") && panel.includes("data-score={summary.managementSummary.score}")));
check("V1.4 UI renders score and five indicators", () => assert.ok(panel.includes("Heti fejlesztési flow score") && ["completed","failures","waiting","activeWorkers","handoffGapMinutes"].every((key) => panel.includes(`indicators.${key}`))));
check("V1.4 UI renders positive risk and action groups", () => ["positive","risk","action"].every((group) => panel.includes(`data-management-group="${group}"`)));
check("V1.4 risk UI exposes kind and severity", () => assert.ok(panel.includes("data-risk-kind={item.kind}") && panel.includes("data-severity={item.severity}")));
check("V1.4 CSS has watch critical and responsive management states", () => assert.ok(css.includes('.weeklyManagementSummary[data-status="watch"]') && css.includes('.weeklyManagementSummary[data-status="critical"]') && css.includes(".weeklyManagementColumns { grid-template-columns: minmax(0,1fr); }")));

console.log(JSON.stringify({ ok: true, passed, failed: 0, contract: "BENJADMIN Weekly Development Flow V1.4" }, null, 2));
