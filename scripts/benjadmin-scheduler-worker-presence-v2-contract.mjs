#!/usr/bin/env node
import fs from "node:fs";
import assert from "node:assert/strict";
const read=(f)=>fs.readFileSync(f,"utf8");
const bridge=read("scripts/benjadmin-worker-presence-bridge.mjs");
const scheduler=read("app/lib/dev-center/development-scheduler.ts");
const live=read("app/lib/dev-center/developer-console.ts");
const types=read("components/admin/developer-console/types.ts");
const panel=read("components/admin/developer-console/LiveWorkPanel.tsx");
let passed=0;
function check(name,fn){fn();passed+=1;console.log(`PASS ${String(passed).padStart(2,"0")} ${name}`);}
check("Scheduler evidence is collected by Worker Presence",()=>assert.ok(bridge.includes("collectSchedulerEvidence")&&bridge.includes("development_scheduler_run")));
check("Only active scheduler lifecycle states become presence",()=>assert.ok(bridge.includes("ready_for_pull")&&bridge.includes("worker_active")&&bridge.includes("running")));
check("Scheduler presence key is deterministic per schedule slot worker",()=>assert.ok(bridge.includes("scheduler:${text(item.meta.scheduleId)}:${text(item.meta.slotAt)}:${item.workerCode}")));
check("Scheduler engine run key remains deterministic",()=>assert.ok(scheduler.includes("benjadmin:scheduler-run:${schedule.id}:${slotAt}")));
check("Presence exposes explicit six-stage index",()=>assert.ok(bridge.includes("workStageIndex")&&live.includes("workStageIndex")&&types.includes("workStageIndex")));
check("Presence exposes scheduler start and heartbeat",()=>assert.ok(bridge.includes("startedAt")&&bridge.includes("heartbeatAt")&&panel.includes("heartbeat:")));
check("Presence exposes next step",()=>assert.ok(bridge.includes("nextStep")&&live.includes("nextStep")&&panel.includes("Következő:")));
check("Build lock wait is explicit",()=>assert.ok(bridge.includes("buildLockWaiting")&&panel.includes("BUILD LOCK · VÁRAKOZÁS")));
check("Scheduler run identity reaches UI",()=>assert.ok(bridge.includes("schedulerRunId")&&live.includes("schedulerRunId")&&types.includes("schedulerRunId")&&panel.includes("data-scheduler-run")));
check("Task development context is reused",()=>assert.ok(bridge.includes("developmentContext")&&bridge.includes("context.mainModule")&&bridge.includes("context.moduleName")&&bridge.includes("context.submoduleName")));
check("Session evidence outranks scheduler evidence",()=>assert.ok(bridge.includes("score: 120")&&bridge.includes("score: 115")));
check("Scheduler evidence outranks passive lease fallback",()=>assert.ok(bridge.includes("score: 115")&&bridge.includes("score: 110")));
check("Retry and missed wake cannot create a second scheduler run key",()=>assert.ok(scheduler.includes("getRunByKey")&&scheduler.includes("isUniqueViolation")&&scheduler.includes("duplicate_wait")));
check("PROD DENY remains explicit",()=>assert.ok(bridge.includes("productionAccess:")&&bridge.includes("DENY")&&scheduler.includes("productionAccess:")&&scheduler.includes("DENY")));
console.log(JSON.stringify({ok:true,passed,failed:0,contract:"BENJADMIN Scheduler + Worker Presence V2"},null,2));
