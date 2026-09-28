#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const switcher = readFileSync("components/drive/ViewLayoutSwitcher.tsx", "utf8");
const bar = readFileSync("components/drive/TableFullscreenBar.tsx", "utf8");
const zoomControls = readFileSync("components/drive/TableZoomControls.tsx", "utf8");
const toolbar = readFileSync("components/drive/DriveToolbar.tsx", "utf8");
const grid = readFileSync("components/drive/FileGridPanel.tsx", "utf8");
const details = readFileSync("components/drive/DetailsPanel.tsx", "utf8");
const workspace = readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const projectGate = readFileSync("components/project-gate/DriveWorkspace.tsx", "utf8");
const css = readFileSync("components/drive/DriveWorkspace.module.css", "utf8");

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log(`PASS ${name}`); };

check("full table special button is after Commander", () => {
  const commander = switcher.indexOf('value: "commander"');
  const modesEnd = switcher.indexOf("];", commander);
  const table = switcher.indexOf("onToggleTableFullscreen &&");
  assert.ok(commander >= 0 && modesEnd > commander && table > modesEnd);
});

check("full table button has a dedicated visual class", () => assert.match(switcher, /layoutTableSpecial/));
check("special button has active state", () => assert.match(switcher, /layoutTableSpecialActive/));
check("Drive toolbar exposes fullscreen table toggle", () => assert.match(toolbar, /onToggleTableFullscreen/));
check("main Drive renders fullscreen table overlay", () => assert.match(workspace, /data-drive-full-table="0\.1\.0"/));
check("Projectkapu Drive renders fullscreen table overlay", () => assert.match(projectGate, /data-project-gate-drive-full-table="0\.1\.0"/));

check("main Drive requests real browser fullscreen", () => assert.match(workspace, /document\.documentElement\.requestFullscreen\(\)/));
check("Projectkapu Drive requests real browser fullscreen", () => assert.match(projectGate, /document\.documentElement\.requestFullscreen\(\)/));
check("main Drive listens for browser fullscreen exit", () => assert.match(workspace, /addEventListener\("fullscreenchange"/));
check("Projectkapu Drive listens for browser fullscreen exit", () => assert.match(projectGate, /addEventListener\("fullscreenchange"/));
check("main Drive exits browser fullscreen explicitly", () => assert.match(workspace, /document\.exitFullscreen\(\)/));
check("Projectkapu Drive exits browser fullscreen explicitly", () => assert.match(projectGate, /document\.exitFullscreen\(\)/));

check("fullscreen table has 70-150 percent zoom limits", () => {
  assert.match(zoomControls, /Math\.max\(70, Math\.min\(150/);
  assert.match(zoomControls, /zoom <= 70/);
  assert.match(zoomControls, /zoom >= 150/);
});
check("zoom value resets to 100 percent", () => assert.match(zoomControls, /onZoomChange\(100\)/));
check("zoom is applied to engineering and review tables", () => {
  assert.match(grid, /reviewTable} style=\{\{ zoom: tableZoom \/ 100 \}\}/);
  assert.match(grid, /fileTable} style=\{\{ zoom: tableZoom \/ 100 \}\}/);
});
check("long-press drag pan waits before activation", () => assert.match(grid, /}, 180\)/));
check("drag pan moves table horizontally", () => assert.match(grid, /scrollLeft = state\.startLeft - dx/));
check("drag pan moves table vertically", () => assert.match(grid, /scrollTop = state\.startTop - dy/));
check("fullscreen pan mode disables native row drag", () => assert.match(grid, /draggable=\{!dragPanEnabled\}/));

check("fullscreen overlay covers the complete application window", () => {
  assert.match(css, /\.fullTableOverlay\s*\{[\s\S]*?position: fixed;[\s\S]*?inset: 0;/);
});
check("fullscreen table header keeps view switcher available", () => assert.match(bar, /<ViewLayoutSwitcher/));
check("fullscreen table header shows drag-pan help", () => assert.match(bar, /Hosszan nyomd az egérgombot/));

check("fullscreen bar exposes compact document inspector toggle", () => {
  assert.match(bar, /fullTableInspectorButton/);
  assert.match(bar, />Adatok<\/span>/);
});
check("fullscreen inspector floats above table instead of resizing it", () => {
  assert.match(css, /\.fullTableInspector\s*\{[\s\S]*?position: absolute;/);
  assert.match(css, /box-shadow:/);
});
check("main Drive inspector renders DetailsPanel", () => assert.match(workspace, /className=\{styles\.fullTableInspector\}[\s\S]*?<DetailsPanel/));
check("Projectkapu inspector renders DetailsPanel", () => assert.match(projectGate, /className=\{richStyles\.fullTableInspector\}[\s\S]*?<DetailsPanel/));
check("review symbol action opens fullscreen inspector", () => {
  assert.match(workspace, /openReviewDetail\(document, field\); setFullTableInspectorOpen\(true\)/);
  assert.match(projectGate, /openReviewDetail\(document\.id, field\); setFullTableInspectorOpen\(true\)/);
});
check("DetailsPanel provides all four requested tabs", () => {
  assert.match(details, />Részletek<\/button>/);
  assert.match(details, />Tervellenőrzés<\/button>/);
  assert.match(details, /Verziók \(\{details\?\.versions\.length \|\| 0\}\)/);
  assert.match(details, />Megjegyzések<\/button>/);
});

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
