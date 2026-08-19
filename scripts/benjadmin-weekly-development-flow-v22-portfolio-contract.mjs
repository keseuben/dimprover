#!/usr/bin/env node
import fs from "node:fs";
import assert from "node:assert/strict";

const backend = fs.readFileSync("app/lib/dev-center/developer-console.ts", "utf8");
const route = fs.readFileSync("app/api/dev/console/weekly-portfolio/route.ts", "utf8");
const panel = fs.readFileSync("components/admin/developer-console/WeeklyDevelopmentSummary.tsx", "utf8");
const conversation = fs.readFileSync("components/admin/developer-console/DeveloperConversation.tsx", "utf8");
const shell = fs.readFileSync("components/admin/developer-console/DeveloperConsoleShell.tsx", "utf8");
const types = fs.readFileSync("components/admin/developer-console/types.ts", "utf8");
const css = fs.readFileSync("components/admin/developer-console/DeveloperConsole.module.css", "utf8");
let passed = 0;
function check(label, fn) { fn(); passed += 1; console.log("PASS " + String(passed).padStart(2, "0") + " " + label); }

check("V2.2 exposes backend portfolio type", () => assert.ok(backend.includes("export type DeveloperWeeklyPortfolio")));
check("V2.2 exposes frontend portfolio type", () => assert.ok(types.includes("export type WeeklyPortfolio")));
check("V2.2 portfolio type carries score status and weekly metrics", () => ["managementStatus", "score: number", "activities: number", "completed: number", "waiting: number", "errors: number"].forEach((token) => assert.ok(types.includes(token))));
check("V2.2 portfolio uses canonical dev-center projects table", () => assert.ok(backend.includes('from("dev_center_projects")')));
check("V2.2 portfolio includes active projects only", () => assert.ok(backend.includes('.eq("status", "active")')));
check("V2.2 portfolio bounds project scan", () => assert.ok(backend.includes('.limit(40)')));
check("V2.2 portfolio batches project summaries by two", () => assert.ok(backend.includes("const batchSize = 2")));
check("V2.2 portfolio reuses weekly summary engine with comparison", () => assert.ok(backend.includes("getDeveloperConsoleWeeklySummary(text(project.id), period.weekKey, true)")));
check("V2.2 portfolio computes waiting and errors from existing flow fields", () => assert.ok(backend.includes("buildLockWaits + summary.flowAnalytics.waitingForWorker") && backend.includes("schedulerRuns.failed")));
check("V2.2 ranking prioritizes critical watch stable", () => assert.ok(backend.includes("const severity = { critical: 0, watch: 1, stable: 2 }")));
check("V2.2 ranking then uses lower score higher errors and waits", () => assert.ok(backend.includes("a.score - b.score") && backend.includes("b.errors - a.errors") && backend.includes("b.waiting - a.waiting")));
check("V2.2 portfolio assigns deterministic rank", () => assert.ok(backend.includes("rank: index + 1")));
check("V2.2 portfolio totals include unique worker count", () => assert.ok(backend.includes("const totalWorkers = new Set<string>()") && backend.includes("totals.workers = totalWorkers.size")));
check("V2.2 route requires DEV-center authorization", () => assert.ok(route.includes("isDevCenterAuthorized(request.headers, true)")));
check("V2.2 route supports week selection", () => assert.ok(route.includes('searchParams.get("week")')));
check("V2.2 route is private no-store and PROD denied", () => assert.ok(route.includes("private, no-store") && route.includes("x-dimpro-production-access") && route.includes("DENY")));
check("V2.2 UI fetches weekly portfolio independently of project selection", () => assert.ok(panel.includes("/api/dev/console/weekly-portfolio") && panel.includes("const loadPortfolio = useCallback")));
check("V2.2 UI refreshes portfolio every five minutes", () => assert.ok(panel.includes("setInterval(() => void loadPortfolio(), 300_000)")));
check("V2.2 manual refresh includes portfolio", () => assert.ok(panel.includes("void loadPortfolio();")));
check("V2.2 UI exposes portfolio test metadata", () => assert.ok(panel.includes('data-testid="benjadmin-weekly-portfolio"') && panel.includes("data-project-count")));
check("V2.2 UI exposes ranking status and selected project semantics", () => assert.ok(panel.includes("data-rank={project.rank}") && panel.includes("data-status={project.managementStatus}") && panel.includes("data-selected={selectedProjectId === project.projectId")));
check("V2.2 UI project row switches project", () => assert.ok(panel.includes("onSelectProject?.(project.projectId)")));
check("V2.2 project selection callback reaches conversation", () => assert.ok(conversation.includes("onSelectProject?: (projectId: string) => void") && conversation.includes("onSelectProject={onSelectProject}")));
check("V2.2 project selection callback reaches canonical shell changeProject", () => assert.ok(shell.includes("onSelectProject={changeProject}")));
check("V2.2 portfolio CSS has status selected and responsive states", () => assert.ok(css.includes('.weeklyPortfolioList > button[data-status="critical"]') && css.includes('.weeklyPortfolioList > button[data-selected="true"]') && css.includes(".weeklyPortfolioTotals { grid-template-columns: repeat(2,minmax(0,1fr)); }")));
check("V2.2 remains migration free and PROD denied", () => assert.ok(!route.toLowerCase().includes("migration") && !backend.toLowerCase().includes("create table") && panel.includes("PROD DENY")));

console.log(JSON.stringify({ ok: true, passed, failed: 0, contract: "BENJADMIN Weekly Development Flow V2.2 Portfolio", productionAccess: "DENY" }, null, 2));
