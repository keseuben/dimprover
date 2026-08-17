import fs from "node:fs";
import assert from "node:assert/strict";

const controlPlane = fs.readFileSync("supabase/migrations/20260811005500_benjadmin_control_plane_v031.sql", "utf8");
const optionalMigration = fs.readFileSync("supabase/migrations/20260817125500_benjadmin_development_scheduler_v010.sql", "utf8");
const engine = fs.readFileSync("app/lib/dev-center/development-scheduler.ts", "utf8");
const api = fs.readFileSync("app/api/dev/console/scheduler/route.ts", "utf8");
const tickApi = fs.readFileSync("app/api/dev/console/scheduler/tick/route.ts", "utf8");
const monitor = fs.readFileSync("scripts/benjadmin-monitor-collector.mjs", "utf8");
const panel = fs.readFileSync("components/admin/developer-console/DevelopmentSchedulerPanel.tsx", "utf8");
const live = fs.readFileSync("components/admin/developer-console/LiveWorkPanel.tsx", "utf8");

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`PASS ${String(passed).padStart(2, "0")} ${name}`); }

check("Existing control plane provides decision memory", () => assert.ok(controlPlane.includes("create table if not exists public.dev_center_decision_memory")));
check("Decision key is database-unique", () => assert.ok(controlPlane.includes("constraint dev_center_decision_key_unique unique (decision_key)")));
check("Scheduler V1 uses existing decision memory", () => assert.ok(engine.includes('from("dev_center_decision_memory")')));
check("Scheduler V1 storage mode is explicit", () => assert.ok(engine.includes('CONTROL_PLANE_DECISION_MEMORY_V1')));
check("Schedule and run categories are separate", () => assert.ok(engine.includes('development_scheduler') && engine.includes('development_scheduler_run')));
check("Hourly run key is deterministic", () => assert.ok(engine.includes('benjadmin:scheduler-run:${schedule.id}:${slotAt}')));
check("Runtime does not depend on dedicated scheduler tables", () => assert.ok(!engine.includes('from("dev_center_development_schedules")') && !engine.includes('from("dev_center_scheduler_runs")')));
check("Optional V1.1 dedicated migration remains staged", () => assert.ok(optionalMigration.includes("dev_center_development_schedules") && optionalMigration.includes("dev_center_scheduler_runs")));
check("Minimum cadence remains hourly", () => assert.ok(engine.includes("Math.max(60") && panel.includes("cadenceMinutes: 60")));
check("Runtime is fail-closed outside DEV", () => assert.ok(engine.includes("SCHEDULER_PRODUCTION_DENIED") && engine.includes('productionAccess: "DENY"')));
check("Scheduler metadata keeps PROD denied", () => assert.ok(engine.includes('productionAccess: "DENY"') && engine.includes("scheduleMetadata") && engine.includes("runMetadata")));
check("Scheduler has retry policy", () => assert.ok(engine.includes("maxAttempts") && engine.includes("retryDelayMinutes")));
check("Stale run can recover", () => assert.ok(engine.includes("staleRunning") && engine.includes('"recovery"')));
check("Retry exhaustion advances safely", () => assert.ok(engine.includes("DEVELOPMENT_SCHEDULER_RETRY_EXHAUSTED")));
check("Missed slots support catch-up and skip", () => assert.ok(engine.includes('missedRunPolicy') && engine.includes('=== "skip"') && engine.includes("nextSlot")));
check("Scheduler reuses existing Ben-AI routing", () => assert.ok(engine.includes("autoRouteDevEngineTaskByAvailability") && engine.includes("prepareForPlusPull: true")));
check("Already-routed task rechecks project isolation", () => assert.ok(engine.includes("assertWorkerProjectIsolation") && engine.includes("PartnerIsolationPolicyError")));
check("Scheduler prepares READY_FOR_PLUS_PULL", () => assert.ok(engine.includes("READY_FOR_PLUS_PULL") && engine.includes("BENJADMIN_SCHEDULER")));
check("Scheduler never creates a development task", () => assert.ok(!engine.includes('from("dev_center_tasks").insert')));
check("Active worker prevents duplicate task start", () => assert.ok(engine.includes('outcome = "worker_active"') && engine.includes("worker/session már aktív")));
check("External wake has 15 minute deadline", () => assert.ok(engine.includes("15 * 60_000")));
check("Missing ChatGPT wake is audited", () => assert.ok(engine.includes("DEVELOPMENT_SCHEDULER_EXTERNAL_WAKE_MISSED")));
check("Observed Plus pull completes scheduler run", () => assert.ok(engine.includes("wakeObservedAt") && engine.includes('status: "completed"')));
check("External wake misses are counted on schedule", () => assert.ok(engine.includes("externalWakeMissCount") && engine.includes("lastExternalWakeMissAt")));
check("Scheduler API requires admin auth", () => assert.ok(api.includes("isDevCenterAuthorized") && tickApi.includes("isDevCenterAuthorized")));
check("Monitor heartbeat calls scheduler tick", () => assert.ok(monitor.includes("/api/dev/console/scheduler/tick") && monitor.includes("triggerDevelopmentScheduler")));
check("Monitor tolerates scheduler endpoint absence", () => assert.ok(monitor.includes("SCHEDULER_ENDPOINT_NOT_DEPLOYED") && monitor.includes("SCHEDULER_TICK_UNAVAILABLE")));
check("UI exposes overnight scheduler panel", () => assert.ok(panel.includes("ÉJSZAKAI FEJLESZTÉS") && live.includes("<DevelopmentSchedulerPanel")));
check("UI preset is 23:00–07:00 hourly", () => assert.ok(panel.includes("23:00–07:00 · óránként") && panel.includes("cadenceMinutes: 60") && panel.includes("maxRuns: 9")));
check("UI shows monitor and Plus wake separation", () => assert.ok(panel.includes("MONITOR 60S") && panel.includes("PLUS SCHEDULED TASK")));
check("Pause resume cancel controls exist", () => assert.ok(panel.includes('action: "PAUSE"') && panel.includes('action: "RESUME"') && panel.includes('action: "CANCEL"')));
check("Native OpenAI provider is not enabled", () => assert.ok(!engine.includes("OPENAI_API_KEY") && !api.includes("OPENAI_API_KEY") && !tickApi.includes("OPENAI_API_KEY")));

console.log(JSON.stringify({ ok: true, passed, failed: 0, contract: "BENJADMIN Overnight Scheduler V1 decision-memory runtime" }, null, 2));
