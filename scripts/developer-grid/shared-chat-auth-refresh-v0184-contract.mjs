import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const main = fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/src/main.cjs"), "utf8");
let n = 0;
function check(name, fn) { fn(); n += 1; console.log("PASS " + String(n).padStart(2,"0") + " " + name); }

check("isolated worker partitions remain intact", () => {
  assert.match(main, /CHAT_PARTITION_PREFIX = "persist:benjadmin-developer-grid-chatgpt-cell-"/);
  assert.match(main, /partition: chatSessionPartitions\.get\(cell\.id\) \|\| chatPartitionForCell\(cell\)/);
});
check("shared auth cookie propagation remains enabled", () => {
  assert.match(main, /isSharedChatAuthCookie\(cookie\)/);
  assert.match(main, /await targetSession\.cookies\.set\(normalized\)/);
});
check("auth cookie propagation schedules target-cell refresh", () => {
  assert.match(main, /scheduleChatAuthRefreshForPartition\(partition\)/);
});
check("refresh is restricted to visibly logged-out ChatGPT surfaces", () => {
  assert.match(main, /async function chatViewShowsLoggedOutState\(view\)/);
  assert.match(main, /data-testid="login-button"/);
  assert.match(main, /if \(!loggedOut \|\| view\.webContents\.isLoading\(\)\) return/);
});
check("one login reloads only the affected target cell", () => {
  assert.match(main, /const chatId = chatIdForPartition\(partition\)/);
  assert.match(main, /view\.webContents\.reload\(\)/);
});
check("auth refresh is debounced", () => {
  assert.match(main, /CHAT_AUTH_REFRESH_DELAY_MS = 900/);
  assert.match(main, /clearTimeout\(previous\)/);
});
check("auth refresh is observable", () => {
  assert.match(main, /CHAT_AUTH_SYNC_REFRESHED/);
  assert.match(main, /CHAT_AUTH_SYNC_REFRESH_FAILED/);
});
check("auth refresh timers are cleared on quit", () => {
  assert.match(main, /for \(const timer of chatAuthRefreshTimers\.values\(\)\) clearTimeout\(timer\)/);
  assert.match(main, /chatAuthRefreshTimers\.clear\(\)/);
});

console.log("Developer Grid v0.1.98 shared ChatGPT auth refresh contract PASS · " + n + "/" + n);
