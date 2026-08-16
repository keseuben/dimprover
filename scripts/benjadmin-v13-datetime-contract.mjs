import fs from "node:fs";
import assert from "node:assert/strict";

const message = fs.readFileSync("components/admin/developer-console/DeveloperMessage.tsx", "utf8");
const live = fs.readFileSync("components/admin/developer-console/LiveWorkPanel.tsx", "utf8");
const css = fs.readFileSync("components/admin/developer-console/DeveloperConsole.module.css", "utf8");
let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
check("Central message timestamp includes year", () => assert.ok(message.includes('year: "numeric"')));
check("Central message timestamp includes month", () => assert.ok(message.includes('month: "2-digit"')));
check("Central message timestamp includes day", () => assert.ok(message.includes('day: "2-digit"')));
check("Central message timestamp keeps seconds", () => assert.ok(message.includes('second: "2-digit"')));
check("Central message uses date+time formatter", () => assert.ok(message.includes('{formatDateTime(message.createdAt)}')));
check("Task ETA includes calendar date", () => assert.ok(/function finishLabel[\s\S]*year: "numeric"[\s\S]*month: "2-digit"[\s\S]*day: "2-digit"/.test(live)));
check("Task ETA keeps hour/minute", () => assert.ok(/function finishLabel[\s\S]*hour: "2-digit"[\s\S]*minute: "2-digit"/.test(live)));
check("Timestamp is protected from wrapping", () => assert.ok(css.includes('.messageHeader time { flex: 0 0 auto;') && css.includes('white-space: nowrap;')));
console.log(JSON.stringify({ ok: true, passed, failed: 0 }, null, 2));
