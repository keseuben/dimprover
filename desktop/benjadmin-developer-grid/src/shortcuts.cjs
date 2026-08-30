"use strict";

const SHORTCUT_DEFINITIONS = Object.freeze([
  Object.freeze({ accelerator: "CommandOrControl+Alt+Space", action: "shell-toggle", inputKeys: [" ", "Space"] }),
  Object.freeze({ accelerator: "CommandOrControl+Alt+Z", action: "lock", inputKeys: ["z", "Z", "KeyZ"] }),
  Object.freeze({ accelerator: "CommandOrControl+Alt+5", action: "central", inputKeys: ["5", "Digit5", "Numpad5"] }),
  Object.freeze({ accelerator: "CommandOrControl+Alt+6", action: "layout-toggle", inputKeys: ["6", "Digit6", "Numpad6"] }),
  Object.freeze({ accelerator: "CommandOrControl+Alt+9", action: "guide", inputKeys: ["9", "Digit9", "Numpad9"] }),
  Object.freeze({ accelerator: "CommandOrControl+Alt+N", action: "quiet-toggle", inputKeys: ["n", "N", "KeyN"] }),
  Object.freeze({ accelerator: "CommandOrControl+Alt+1", action: "cell-1", inputKeys: ["1", "Digit1", "Numpad1"] }),
  Object.freeze({ accelerator: "CommandOrControl+Alt+2", action: "cell-2", inputKeys: ["2", "Digit2", "Numpad2"] }),
  Object.freeze({ accelerator: "CommandOrControl+Alt+3", action: "cell-3", inputKeys: ["3", "Digit3", "Numpad3"] }),
  Object.freeze({ accelerator: "CommandOrControl+Alt+4", action: "cell-4", inputKeys: ["4", "Digit4", "Numpad4"] })
]);

const INPUT_TO_ACTION = new Map();
for (const definition of SHORTCUT_DEFINITIONS) {
  for (const key of definition.inputKeys) INPUT_TO_ACTION.set(key, definition.action);
}

function shortcutActionFromInput(input) {
  if (!input?.control || !input?.alt) return "";
  const key = String(input.key || "");
  const code = String(input.code || "");
  return INPUT_TO_ACTION.get(key) || INPUT_TO_ACTION.get(code) || "";
}

function shortcutDefinitionForAction(action) {
  return SHORTCUT_DEFINITIONS.find((definition) => definition.action === action) || null;
}

module.exports = { SHORTCUT_DEFINITIONS, shortcutActionFromInput, shortcutDefinitionForAction };
