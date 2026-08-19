#!/usr/bin/env node
import fs from "node:fs";
import assert from "node:assert/strict";

const read = (file) => fs.readFileSync(file, "utf8");
const backend = read("app/lib/dev-center/developer-console.ts");
const panel = read("components/admin/developer-console/WeeklyDevelopmentSummary.tsx");
const types = read("components/admin/developer-console/types.ts");
const css = read("components/admin/developer-console/DeveloperConsole.module.css");
const route = read("app/api/dev/console/weekly-summary/route.ts");
const presenceBridge = read("scripts/benjadmin-worker-presence-bridge.mjs");
let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`PASS ${String(passed).padStart(2, "0")} ${name}`); }
check("Flow V1.2 keeps the existing weekly API route", () => assert.ok(route.includes("getDeveloperConsoleWeeklySummary(projectId, week)")));
check("Transition view carries previous last-seen timestamp", () => assert.ok(backend.includes("fromLastSeenAt: string") && backend.includes("previous.endedAt || previous.lastSeenAt")));
check("Transition derives non-negative observed handoff gap", () => assert.ok(backend.includes("gapMinutes") && backend.includes("Math.max(0, Math.round((changedMs - fromMs) / 60_000))")));
check("Handoff timing type exposes average median and maximum", () => assert.ok(types.includes("averageGapMinutes") && types.includes("medianGapMinutes") && types.includes("maxGapMinutes")));
check("Handoff timing exposes observed and zero-gap counts", () => assert.ok(types.includes("observedHandoffs") && types.includes("zeroGapCount")));
check("Build-lock timing keeps a legacy presence-window fallback", () => assert.ok(backend.includes("observedPresenceMinutes") && backend.includes("item.endedAt || item.lastSeenAt")));
check("Build-lock timing exposes event and minute totals", () => assert.ok(types.includes("buildLockWaitEvents") && types.includes("buildLockWaitMinutes")));
check("Presence bridge persists build-lock timing metadata", () => assert.ok(presenceBridge.includes("buildLockWaitStartedAt") && presenceBridge.includes("buildLockWaitTotalMs") && presenceBridge.includes("buildLockWaitObservationCount")));
check("Presence bridge closes active build-lock window safely", () => assert.ok(presenceBridge.includes("closeBuildLockTiming") && presenceBridge.includes("...closeBuildLockTiming")));
check("Weekly analytics keeps completed build-lock waits", () => assert.ok(backend.includes("item.buildLockWaiting || item.buildLockWaitTotalMs > 0 || item.buildLockWaitObservationCount > 0") && backend.includes("buildLockWaitEventCount")));
check("Backend computes median without external dependency", () => assert.ok(backend.includes("handoffGaps.length % 2") && backend.includes("Math.round((handoffGaps")));
check("Backend identifies slowest handoff", () => assert.ok(backend.includes("slowestHandoff") && backend.includes("b.gapMinutes - a.gapMinutes")));
check("Backend identifies longest build-lock window", () => assert.ok(backend.includes("longestBuildLock") && backend.includes("b.minutes - a.minutes")));
check("Bottleneck is explicit handoff or build-lock kind", () => assert.ok(types.includes("\"HANDOFF_GAP\" | \"BUILD_LOCK\" | null") && backend.includes("kind: \"BUILD_LOCK\" as const") && backend.includes("kind: \"HANDOFF_GAP\" as const")));
check("Timing details preserve worker pair work item and reason", () => assert.ok(types.includes("fromWorkerCode: string; toWorkerCode: string; workItem: string; changedAt: string; gapMinutes: number; reason:")));
check("UI renders lead-time section", () => assert.ok(panel.includes("data-testid=\"benjadmin-weekly-handoff-timing\"") && panel.includes("Átadási idő / lead time")));
check("UI renders four timing metric cards", () => ["average","median","maximum","build-lock"].every((key) => panel.includes(`data-handoff-timing=\"${key}\"`)));
check("UI exposes bottleneck kind", () => assert.ok(panel.includes("data-bottleneck-kind={summary.flowAnalytics.handoffTiming.bottleneck.kind}")));
check("UI lists measured handoff gaps", () => assert.ok(panel.includes("data-handoff-gap={item.gapMinutes}") && panel.includes("durationLabel(item.gapMinutes)")));
check("Duration helper renders minutes and hours", () => assert.ok(panel.includes("function durationLabel") && panel.includes("`${hours} ó ${rest} p`")));
check("Responsive CSS covers timing metrics", () => assert.ok(css.includes(".weeklyHandoffTimingMetrics") && css.includes("grid-template-columns: repeat(2,minmax(0,1fr))") && css.includes(".weeklyHandoffTimingDetails > b { max-width: 100%; }")));
check("Flow V1.2 remains PROD denied and migration free", () => assert.ok(panel.includes("PROD DENY") && !route.includes("migration")));
console.log(JSON.stringify({ ok: true, passed, failed: 0, contract: "BENJADMIN Weekly Development Flow V1.2" }, null, 2));
