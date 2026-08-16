import fs from "node:fs";
import assert from "node:assert/strict";
const cli = fs.readFileSync("scripts/benjadmin-plus-bridge-cli.mjs", "utf8");
const commands = fs.readFileSync("components/admin/developer-console/commandLibrary.ts", "utf8");
let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
check("CLI supports continue alias", () => assert.ok(cli.includes('"continue"')));
check("CLI supports Hungarian folytasd alias", () => assert.ok(cli.includes('"folytasd"')));
check("CLI supports unaccented continuation alias", () => assert.ok(cli.includes('"folytatas"')));
check("CLI supports next-task alias", () => assert.ok(cli.includes('"kovetkezo"')));
check("All short aliases use same Plus next endpoint", () => assert.ok(cli.includes('/plus-bridge/${encodeURIComponent(workerCode)}/next')));
check("Command Library title is Folytasd", () => assert.ok(commands.includes('title: "Plus-only · Folytasd"')));
check("Command Library payload is one word", () => assert.ok(commands.includes('text: "Folytasd."')));
check("Command Library describes Worker Inbox pull", () => assert.ok(commands.includes("saját Worker Inboxából")));
check("No AI API key introduced", () => assert.ok(!cli.includes("OPENAI_API_KEY") && !commands.includes("OPENAI_API_KEY")));
check("PROD behavior remains outside short-command alias", () => assert.ok(!cli.includes("prod-connector") && !cli.includes("ssh-prod")));
console.log(JSON.stringify({ ok: true, passed, failed: 0 }, null, 2));
