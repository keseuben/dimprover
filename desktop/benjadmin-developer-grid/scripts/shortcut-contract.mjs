import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const { SHORTCUT_DEFINITIONS, shortcutActionFromInput } = require(path.join(root, "src/shortcuts.cjs"));
const main = fs.readFileSync(path.join(root, "src/main.cjs"), "utf8");
const renderer = fs.readFileSync(path.join(root, "src/renderer/renderer.js"), "utf8");
const html = fs.readFileSync(path.join(root, "src/renderer/index.html"), "utf8");
let n = 0;
const check = (label, fn) => { fn(); n += 1; console.log(`PASS ${String(n).padStart(2,"0")} ${label}`); };

check("exactly 10 shortcut definitions", () => assert.equal(SHORTCUT_DEFINITIONS.length, 10));
check("accelerators are unique", () => assert.equal(new Set(SHORTCUT_DEFINITIONS.map((x) => x.accelerator)).size, 10));
check("actions are unique", () => assert.equal(new Set(SHORTCUT_DEFINITIONS.map((x) => x.action)).size, 10));
for (const definition of SHORTCUT_DEFINITIONS) {
  check(`${definition.action} input variants resolve`, () => {
    for (const key of definition.inputKeys) assert.equal(shortcutActionFromInput({ control: true, alt: true, key, code: key }), definition.action);
  });
}
check("non Ctrl+Alt input rejected", () => {
  assert.equal(shortcutActionFromInput({ control: true, alt: false, key: "1" }), "");
  assert.equal(shortcutActionFromInput({ control: false, alt: true, key: "1" }), "");
});
check("main verifies globalShortcut registration", () => {
  assert.match(main, /globalShortcut\.register\(definition\.accelerator/);
  assert.match(main, /globalShortcut\.isRegistered\(definition\.accelerator\)/);
});
check("local handler remains active even when global shortcut reports registered", () => {
  assert.doesNotMatch(main, /registeredGlobalShortcutActions\.has\(action\).*return false/);
  assert.match(main, /dispatchShortcutAction\(action, "local"\)/);
});
check("renderer does not execute Ctrl+Alt shortcut action", () => assert.doesNotMatch(renderer, /if \(localShortcutAction\(event\)\) return/));
check("local shortcut rejects keyUp to prevent double toggle", () => {
  assert.equal(shortcutActionFromInput({ type: "keyUp", control: true, alt: true, key: "1", code: "Digit1" }), "");
  assert.equal(shortcutActionFromInput({ type: "keyDown", control: true, alt: true, key: "1", code: "Digit1" }), "cell-1");
});
check("global and local shortcut delivery is deduplicated", () => {
  assert.match(main, /SHORTCUT_DEDUPE_MS = 220/);
  assert.match(main, /shortcutDispatchTimestamps/);
  assert.match(main, /dispatchShortcutAction\(definition\.action, "global"\)/);
});
check("05 DevminAI header plus exists", () => assert.match(html, /id="devminButton"[\s\S]*Ctrl\+Alt\+5/));
check("old four-cell intersection plus overlay removed", () => assert.doesNotMatch(main, /createPlusOverlayWindow|plus:click|plusWindow/));
console.log(`Developer Grid shortcut contract PASS · ${n}/${n}`);
