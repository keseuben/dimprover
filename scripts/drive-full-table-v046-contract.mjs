#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const switcher = readFileSync("components/drive/ViewLayoutSwitcher.tsx", "utf8");
const bar = readFileSync("components/drive/TableFullscreenBar.tsx", "utf8");
const zoomControls = readFileSync("components/drive/TableZoomControls.tsx", "utf8");
const toolbar = readFileSync("components/drive/DriveToolbar.tsx", "utf8");
const grid = readFileSync("components/drive/FileGridPanel.tsx", "utf8");
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
check("main Drive exits fullscreen table with Escape", () => assert.match(workspace, /fullscreenchange/));
check("Projectkapu Drive exits fullscreen table with Escape", () => assert.match(projectGate, /fullscreenchange/));
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

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
