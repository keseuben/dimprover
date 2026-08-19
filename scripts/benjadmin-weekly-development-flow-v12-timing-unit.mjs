#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildLockTimingPatch, closeBuildLockTiming } from "./benjadmin-worker-presence-bridge.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`PASS ${String(passed).padStart(2, "0")} ${name}`); }
const base = Date.parse("2026-08-19T10:00:00.000Z");
let meta = {};
meta = { ...meta, ...buildLockTimingPatch(meta, true, base, true) };
check("First wait starts one observation", () => assert.deepEqual({ waiting: meta.buildLockWaiting, count: meta.buildLockWaitObservationCount, total: meta.buildLockWaitTotalMs }, { waiting: true, count: 1, total: 0 }));
const firstStartedAt = meta.buildLockWaitStartedAt;
meta = { ...meta, ...buildLockTimingPatch(meta, true, base + 2 * 60_000, true) };
check("Continued wait preserves start and count", () => assert.equal(meta.buildLockWaitStartedAt, firstStartedAt));
check("Continued wait does not double count", () => assert.equal(meta.buildLockWaitObservationCount, 1));
meta = { ...meta, ...buildLockTimingPatch(meta, false, base + 4 * 60_000, true) };
check("Wait end stores four minutes", () => assert.equal(meta.buildLockWaitTotalMs, 4 * 60_000));
check("Wait end clears active marker", () => assert.equal(meta.buildLockWaitStartedAt, null));
meta = { ...meta, ...buildLockTimingPatch(meta, true, base + 6 * 60_000, true) };
check("Second wait increments observation count", () => assert.equal(meta.buildLockWaitObservationCount, 2));
meta = { ...meta, ...buildLockTimingPatch(meta, false, base + 9 * 60_000, true) };
check("Second wait accumulates total", () => assert.equal(meta.buildLockWaitTotalMs, 7 * 60_000));
meta = { ...meta, ...buildLockTimingPatch(meta, true, base + 10 * 60_000, true) };
const closed = { ...meta, ...closeBuildLockTiming(meta, base + 12 * 60_000) };
check("Presence close accumulates active wait", () => assert.equal(closed.buildLockWaitTotalMs, 9 * 60_000));
check("Presence close marks wait inactive", () => assert.equal(closed.buildLockWaiting, false));
check("Presence close preserves observation count", () => assert.equal(closed.buildLockWaitObservationCount, 3));
const fresh = buildLockTimingPatch(closed, true, base + 20 * 60_000, false);
check("New presence resets historical total", () => assert.equal(fresh.buildLockWaitTotalMs, 0));
check("New waiting presence starts fresh count", () => assert.equal(fresh.buildLockWaitObservationCount, 1));
console.log(JSON.stringify({ ok: true, passed, failed: 0, suite: "BENJADMIN Weekly Flow V1.2 build-lock timing" }, null, 2));
