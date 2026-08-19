import assert from "node:assert/strict";
import fs from "node:fs";
const helper=fs.readFileSync("app/lib/aruter/mockOrderNumber.ts","utf8");
const server=fs.readFileSync("app/lib/aruter/serverRepository.ts","utf8");
const store=fs.readFileSync("app/lib/aruter/store.ts","utf8");
const dashboard=fs.readFileSync("components/aruter/AruterDashboard.tsx","utf8");
const checks=[
 ["01 shared mock order number helper exists",helper.includes("createMockAruterOrderNumber")],
 ["02 mock number keeps AR prefix",helper.includes("`AR-${now.getUTCFullYear()}-")],
 ["03 mock number contains UTC timestamp",helper.includes("compactUtcStamp(now)")],
 ["04 mock number contains entropy",helper.includes("entropy()")],
 ["05 entropy prefers crypto randomUUID",helper.includes("cryptoObject.randomUUID")],
 ["06 entropy has browser-safe fallback",helper.includes("Math.random()")],
 ["07 sequence hint remains visible",helper.includes("padStart(4, \"0\")")],
 ["08 helper is explicitly mock-only",helper.includes("Mock/demo-only order number")],
 ["09 server repository uses shared helper",server.includes("createMockAruterOrderNumber(serverState.orders.length)")],
 ["10 zustand mock store uses shared helper",store.includes("createMockAruterOrderNumber(state.orders.length)")],
 ["11 dashboard demo path uses shared helper",dashboard.includes("createMockAruterOrderNumber(orders.length)")],
 ["12 old process-reset generator removed from server",!server.includes("AR-2026-${String(orderCount + 1)")],
 ["13 old process-reset generator removed from store",!store.includes("AR-2026-${String(orderCount + 1)")],
 ["14 dashboard no longer synthesizes AR-2026 sequence directly",!dashboard.includes("`AR-2026-${String(orders.length + 1)")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
