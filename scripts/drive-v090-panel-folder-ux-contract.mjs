#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const workspace = fs.readFileSync(path.join(root, "components/drive/DriveWorkspace.tsx"), "utf8");
const shelf = fs.readFileSync(path.join(root, "components/drive/BoxShelf.tsx"), "utf8");
const details = fs.readFileSync(path.join(root, "components/drive/DetailsPanel.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "components/drive/DriveWorkspace.module.css"), "utf8");

const tests = [
  ["CsomagBOX shelf exposes controlled height", shelf.includes("shelfHeight?: number") && shelf.includes("onShelfHeightChange")],
  ["CsomagBOX shelf has vertical pointer resize", shelf.includes("cursor = \"ns-resize\"") && shelf.includes("startHeight + startY - moveEvent.clientY")],
  ["CsomagBOX double click resets to 50 percent", shelf.includes("onDoubleClick") && workspace.includes("window.innerHeight * 0.5")],
  ["CsomagBOX wrapper reserves dynamic bottom space", workspace.includes("paddingBottom: `\${boxShelfHeight + 36}px`")],
  ["split details handle supports double click", workspace.includes("dupla kattintás: 50%") && workspace.includes("halfDetailsHeight")],
  ["split details keeps existing min heights", workspace.includes("const minDetailsHeight = 250") && workspace.includes("const minMainHeight = 220")],
  ["native Drive folder rename prompt is removed", !workspace.includes('window.prompt("Mappa megjelenítési neve:') && workspace.includes("folderRenameDialog")],
  ["folder rename uses DIMPRO modal", workspace.includes('aria-label="Mappa átnevezése"') && workspace.includes("submitFolderRename")],
  ["metadata lists use four visible rows", details.includes("rows={4}")],
  ["metadata list text is compact", css.includes("font-size: 10px") && css.includes("min-height: 84px")],
  ["password save requires server protection confirmation", workspace.includes("payload.status?.passwordProtected") && workspace.includes("payload.status.locked")],
  ["password API error code becomes visible", workspace.includes("payload.code ?") && workspace.includes("codeSuffix")],
  ["production access remains denied", !workspace.includes("PROD ALLOW") && !shelf.includes("PROD ALLOW")],
];

let passed = 0;
for (let i = 0; i < tests.length; i += 1) {
  const [name, ok] = tests[i];
  if (ok) {
    passed += 1;
    console.log("PASS " + String(i + 1).padStart(2, "0") + " " + name);
  } else {
    console.error("FAIL " + String(i + 1).padStart(2, "0") + " " + name);
  }
}
const fail = tests.length - passed;
console.log(JSON.stringify({ok:fail===0,contract:"DIMPRO Drive V0.9.0 Resizable Panels + Folder UX",pass:passed,fail,productionAccess:"DENY"},null,2));
if (fail) process.exit(2);
