#!/usr/bin/env node
import fs from "node:fs";
import assert from "node:assert/strict";

const renderer = fs.readFileSync("app/lib/dev-center/weekly-report.ts", "utf8");
const route = fs.readFileSync("app/api/dev/console/weekly-report-export/route.ts", "utf8");
const panel = fs.readFileSync("components/admin/developer-console/WeeklyDevelopmentSummary.tsx", "utf8");
const css = fs.readFileSync("components/admin/developer-console/DeveloperConsole.module.css", "utf8");

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${label}`);
}

check("V2.0 renderer has stable report version", () => assert.ok(renderer.includes('BENJADMIN_WEEKLY_REPORT_V2_0')));
check("V2.0 renderer reuses DeveloperWeeklySummary", () => assert.ok(renderer.includes('DeveloperWeeklySummary')));
check("V2.0 HTML is A4 print oriented", () => assert.ok(renderer.includes('@page { size: A4') && renderer.includes('font-family: "Segoe UI"')));
check("V2.0 report contains management headline and score", () => assert.ok(renderer.includes('management.headline') && renderer.includes('management.score')));
check("V2.0 report contains positives risks and actions", () => ["management.positives", "management.risks", "management.nextActions"].every((token) => assert.ok(renderer.includes(token))));
check("V2.0 report contains trend and worker load", () => assert.ok(renderer.includes('flow.trend') && renderer.includes('flow.workerLoad')));
check("V2.0 report contains handoff timing and blockers", () => assert.ok(renderer.includes('flow.handoffTiming') && renderer.includes('flow.blockers')));
check("V2.0 report footer keeps DEV and PROD deny labels", () => assert.ok(renderer.includes('DEV ONLY · PROD DENY')));
check("V2.0 export route is DEV-center authorized", () => assert.ok(route.includes('isDevCenterAuthorized(request.headers, true)')));
check("V2.0 route reuses weekly summary source", () => assert.ok(route.includes('getDeveloperConsoleWeeklySummary(projectId, week)')));
check("V2.0 route supports pdf html and json", () => ["pdf", "html", "json"].every((format) => assert.ok(route.includes(`\"${format}\"`))));
check("V2.0 route generates PDF with Puppeteer", () => assert.ok(route.includes('await import("puppeteer")') && route.includes('page.pdf({ format: "A4"')));
check("V2.0 route returns attachment content disposition", () => assert.ok(route.includes('content-disposition') && route.includes('filename*=UTF-8')));
check("V2.0 route returns no-store and nosniff", () => assert.ok(route.includes('private, no-store') && route.includes('nosniff')));
check("V2.0 route explicitly denies PROD", () => assert.ok(route.includes('x-dimpro-production-access') && route.includes('"DENY"')));
check("V2.0 UI exposes report action group", () => assert.ok(panel.includes('data-testid="benjadmin-weekly-report-actions"')));
check("V2.0 UI exposes PDF HTML JSON buttons", () => ["pdf", "html", "json"].every((format) => assert.ok(panel.includes(`data-report-format=\"${format}\"`))));
check("V2.0 UI exposes share action", () => assert.ok(panel.includes('data-report-action="share"') && panel.includes('navigator.share')));
check("V2.0 share has download fallback", () => assert.ok(panel.includes('downloadBlob(blob, fileName)')));
check("V2.0 UI reuses admin authorization header", () => assert.ok(panel.includes('fetch(reportExportUrl(format), { headers: adminHeaders()')));
check("V2.0 export errors surface through existing weekly error UI", () => assert.ok(panel.includes('setError(caught instanceof Error')));
check("V2.0 report action CSS is responsive", () => assert.ok(css.includes('.weeklyReportActions') && css.includes('grid-template-columns: repeat(2,minmax(0,1fr))')));
check("V2.0 remains migration free", () => assert.ok(!route.toLowerCase().includes('migration') && !renderer.toLowerCase().includes('create table')));

console.log(JSON.stringify({ ok: true, passed, failed: 0, contract: "BENJADMIN Weekly Development Flow V2.0 Report Export", productionAccess: "DENY" }, null, 2));
