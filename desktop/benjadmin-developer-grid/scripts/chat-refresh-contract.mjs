import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, "..");
const read = (relative) => fs.readFileSync(path.join(desktop, relative), "utf8");
const require = createRequire(import.meta.url);
const { sanitizeConfig, CONFIG_VERSION } = require(path.join(desktop, "src/config/defaults.cjs"));
const main = read("src/main.cjs");
const preload = read("src/preload.cjs");
const renderer = read("src/renderer/renderer.js");
const html = read("src/renderer/index.html");
const packageJson = JSON.parse(read("package.json"));

const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, ok: true }); }
  catch (error) { checks.push({ name, ok: false, error: error.message }); }
}

check("config v13 enables safe daily refresh by default", () => {
  assert.equal(CONFIG_VERSION, 13);
  assert.equal(sanitizeConfig({}).chatRefresh.dailyEnabled, true);
  assert.equal(sanitizeConfig({ version: 13, chatRefresh: { dailyEnabled: false } }).chatRefresh.dailyEnabled, false);
});
check("refresh avoids active generation and unsent drafts", () => {
  assert.match(main, /data-testid="stop-button"/);
  assert.match(main, /hasDraft/);
  assert.match(main, /reloadIgnoringCache/);
});
check("refresh state is bridged without DOM coupling", () => {
  assert.match(preload, /getChatRefreshState/);
  assert.match(preload, /onChatRefreshState/);
  assert.match(renderer, /renderChatRefreshStatus/);
});
check("visible refresh controls and daily setting exist", () => {
  assert.match(html, /id="footerChatRefreshStatus"/);
  assert.match(html, /id="chatRefreshButton"/);
  assert.match(html, /id="chatDailyRefreshInput"/);
});
check("renderer markup remains compatible with strict style CSP", () => assert.doesNotMatch(html, /\sstyle=/));
check("Electron compatibility patch is pinned", () => assert.equal(packageJson.devDependencies.electron, "43.6.0"));

for (const item of checks) console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}${item.error ? ` — ${item.error}` : ""}`);
if (checks.some((item) => !item.ok)) process.exit(1);
