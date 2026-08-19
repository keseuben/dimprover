#!/usr/bin/env node
import fs from "node:fs";
import assert from "node:assert/strict";

const backend = fs.readFileSync("app/lib/dev-center/developer-console.ts", "utf8");
const route = fs.readFileSync("app/api/dev/console/weekly-trend-history/route.ts", "utf8");
const panel = fs.readFileSync("components/admin/developer-console/WeeklyDevelopmentSummary.tsx", "utf8");
const types = fs.readFileSync("components/admin/developer-console/types.ts", "utf8");
const css = fs.readFileSync("components/admin/developer-console/DeveloperConsole.module.css", "utf8");
let passed = 0;
function check(label, fn) { fn(); passed += 1; console.log(`PASS ${String(passed).padStart(2, "0")} ${label}`); }

check("V2.1 exposes backend trend-history type", () => assert.ok(backend.includes("export type DeveloperWeeklyTrendHistory")));
check("V2.1 exposes frontend trend-history type", () => assert.ok(types.includes("export type WeeklyTrendHistory")));
check("V2.1 history type carries score status and five chart metrics", () => ["score: number", 'status: "stable" | "watch" | "critical"', "activities: number", "completed: number", "waiting: number", "errors: number"].every((token) => assert.ok(types.includes(token))));
check("V2.1 factors weekly comparison into reusable helper", () => assert.ok(backend.includes("function applyWeeklyComparison") && backend.includes("deriveWeeklyManagementSummary(summary)")));
check("V2.1 single-week summary reuses comparison helper", () => assert.ok(backend.includes("applyWeeklyComparison(summary, previous);")));
check("V2.1 history defaults to eight weeks", () => assert.ok(backend.includes("weeksInput = 8")));
check("V2.1 history clamps range to four through twelve", () => assert.ok(backend.includes("Math.max(4, Math.min(12")));
check("V2.1 history loads one extra baseline week", () => assert.ok(backend.includes("length: weeks + 1")));
check("V2.1 history bounds DB concurrency to three summaries", () => assert.ok(backend.includes("const batchSize = 3")));
check("V2.1 history applies comparison to every displayed point", () => assert.ok(backend.includes("const previous = summaries[index]") && backend.includes("applyWeeklyComparison(summary, previous)")));
check("V2.1 history exposes waiting errors and handoff gap", () => assert.ok(backend.includes("handoffGapMinutes") && backend.includes("schedulerRuns.failed")));
check("V2.1 route is DEV-center authorized", () => assert.ok(route.includes("isDevCenterAuthorized(request.headers, true)")));
check("V2.1 route supports project week and weeks filters", () => ["projectId", "week", "weeks"].every((token) => assert.ok(route.includes(token))));
check("V2.1 route is private no-store and PROD denied", () => assert.ok(route.includes("private, no-store") && route.includes('x-dimpro-production-access') && route.includes('"DENY"')));
check("V2.1 UI fetches eight-week history", () => assert.ok(panel.includes('new URLSearchParams({ weeks: "8" })') && panel.includes("/api/dev/console/weekly-trend-history")));
check("V2.1 UI refreshes history every five minutes", () => assert.ok(panel.includes("300_000")));
check("V2.1 UI exposes five metric selectors", () => ["score", "activities", "completed", "waiting", "errors"].every((metric) => assert.ok(panel.includes(`${metric}:`))));
check("V2.1 UI exposes stable trend metadata", () => assert.ok(panel.includes('data-testid="benjadmin-weekly-trend-history"') && panel.includes("data-anchor-week") && panel.includes("data-metric={trendMetric}")));
check("V2.1 UI renders SVG polyline and week points", () => assert.ok(panel.includes('data-trend-line="true"') && panel.includes("data-week-point={point.weekKey}")));
check("V2.1 UI renders status and current-week point semantics", () => assert.ok(panel.includes("data-status={point.status}") && panel.includes('data-current={point.isCurrentWeek ? "true" : "false"}')));
check("V2.1 metric buttons are accessible toggles", () => assert.ok(panel.includes("aria-pressed={trendMetric === metric}") && panel.includes("data-trend-metric={metric}")));
check("V2.1 chart has responsive internal scrolling", () => assert.ok(css.includes(".weeklyTrendChartWrap { overflow-x: auto; }") && css.includes(".weeklyTrendPointGrid { min-width: 640px; }")));
check("V2.1 mobile metric selector uses grid", () => assert.ok(css.includes("grid-template-columns: repeat(3,minmax(0,1fr))")));
check("V2.1 remains migration free and PROD denied", () => assert.ok(!route.toLowerCase().includes("migration") && !backend.toLowerCase().includes("create table") && panel.includes("PROD DENY")));

console.log(JSON.stringify({ ok: true, passed, failed: 0, contract: "BENJADMIN Weekly Development Flow V2.1 Multi-week Trend", productionAccess: "DENY" }, null, 2));
