import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, "..");
const read = (relative) => fs.readFileSync(path.join(desktop, relative), "utf8");
const main = read("src/main.cjs");
const renderer = read("src/renderer/renderer.js");

const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, ok:true }); }
  catch (error) { checks.push({ name, ok:false, error:error.message }); }
}

check("diagnostic log is local and sanitized", () => {
  assert.match(main, /benjadmin-chat-stream-diagnostics\.jsonl/);
  assert.match(main, /conversationIdHash/);
  assert.match(main, /delete safe\.url/);
});
check("resume stream unavailable is explicitly detected", () => {
  assert.match(main, /RESUME_STREAM_UNAVAILABLE/);
  assert.match(main, /resume stream unavailable/);
  assert.match(main, /CHAT_STREAM_UI_ERROR/);
  assert.match(main, /CHAT_STREAM_UI_RECOVERED/);
});
check("stream probe runs independently of five-minute DOM probe", () => {
  assert.match(main, /await probeChatStreamUiError\(cellId, view\);/);
});
check("grid-initiated navigation is marked before reload or load", () => {
  assert.match(main, /markGridChatNavigationIntent\(chatId, "AUTH_SYNC_RELOAD"/);
  assert.match(main, /markGridChatNavigationIntent\(cellId, "SAFE_REFRESH_PINNED_LOAD"/);
  assert.match(main, /markGridChatNavigationIntent\(cellId, "SAFE_REFRESH_RELOAD"/);
  assert.match(main, /markGridChatNavigationIntent\(cell\.id, "STARTUP_LOAD"/);
});
check("navigation diagnostics distinguish GRID from WEB_OR_USER", () => {
  assert.match(main, /CHAT_DID_NAVIGATE/);
  assert.match(main, /CHAT_DID_NAVIGATE_IN_PAGE/);
  assert.match(main, /"GRID" : "WEB_OR_USER"/);
});
check("load and renderer failures are recorded", () => {
  assert.match(main, /CHAT_DID_FAIL_LOAD/);
  assert.match(main, /CHAT_RENDER_PROCESS_GONE/);
  assert.match(main, /CHAT_WEB_CONTENTS_UNRESPONSIVE/);
});
check("stream failures are surfaced in the Grid status UI", () => {
  assert.match(renderer, /streamErrorCount/);
  assert.match(renderer, /chat stream HIBA/);
});

for (const item of checks) console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}${item.error ? ` — ${item.error}` : ""}`);
if (checks.some((item) => !item.ok)) process.exit(1);
console.log(`Developer Grid v0.1.97 chat stream diagnostics contract PASS · ${checks.length}/${checks.length}`);
