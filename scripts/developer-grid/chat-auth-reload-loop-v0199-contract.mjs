import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const main = fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/src/main.cjs"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/package.json"), "utf8"));
const types = fs.readFileSync(path.join(root, "app/lib/developer-grid/types.ts"), "utf8");

let n = 0;
function check(label, fn) {
  fn();
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${label}`);
}

check("desktop/backend version is v0.1.99", () => {
  assert.equal(pkg.version, "0.1.99");
  assert.ok(types.includes('DEVELOPER_GRID_VERSION = "0.1.99-dev"'));
});
check("shared ChatGPT OpenAI cookie propagation remains enabled", () => {
  assert.ok(main.includes("function isSharedChatAuthCookie(cookie)"));
  assert.ok(main.includes("await targetSession.cookies.set(normalized)"));
});
check("reload trigger has separate auth-significance filter", () => {
  assert.ok(main.includes("function isChatAuthRefreshTriggerCookie(cookie)"));
});
check("session and auth cookies can trigger refresh", () => {
  assert.ok(main.includes('name.includes("session")'));
  assert.ok(main.includes('name.includes("auth")'));
});
check("access and refresh token cookie patterns can trigger refresh", () => {
  assert.ok(main.includes("access([_-]?token)?"));
  assert.ok(main.includes("refresh([_-]?token)?"));
});
check("generic shared cookie no longer schedules reload", () => {
  const a = main.indexOf("await targetSession.cookies.set(normalized)");
  const b = main.indexOf("} catch {", a);
  assert.ok(a > 0 && b > a);
  const block = main.slice(a, b);
  assert.ok(block.includes("if (isChatAuthRefreshTriggerCookie(cookie))"));
  assert.ok(!block.includes("cookies.set(normalized);\n    scheduleChatAuthRefreshForPartition"));
});
check("auth reload has 60 second hard cooldown", () => {
  assert.ok(main.includes("CHAT_AUTH_REFRESH_COOLDOWN_MS = 60_000"));
});
check("cooldown is checked before scheduling", () => {
  assert.ok(main.includes("now - lastReloadAt < CHAT_AUTH_REFRESH_COOLDOWN_MS"));
});
check("cooldown is rechecked before reload", () => {
  assert.ok(main.includes("Date.now() - latestReloadAt < CHAT_AUTH_REFRESH_COOLDOWN_MS"));
});
check("reload timestamp is recorded before WebContents reload", () => {
  const a = main.indexOf("chatAuthRefreshLastReloadAt.set(chatId, Date.now())");
  const b = main.indexOf("view.webContents.reload()", a);
  assert.ok(a > 0 && b > a);
});
check("visible logged-out guard remains mandatory", () => {
  assert.ok(main.includes("if (!loggedOut || view.webContents.isLoading()) return"));
});
check("cooldown state is cleared on quit", () => {
  assert.ok(main.includes("chatAuthRefreshLastReloadAt.clear()"));
});

console.log(`Developer Grid v0.1.99 ChatGPT auth reload-loop hotfix contract PASS · ${n}/${n}`);
