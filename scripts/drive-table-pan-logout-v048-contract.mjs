#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const toolbar = readFileSync("components/drive/DriveToolbar.tsx", "utf8");
const grid = readFileSync("components/drive/FileGridPanel.tsx", "utf8");
const commander = readFileSync("components/drive/CommanderPanel.tsx", "utf8");
const workspace = readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const projectDrive = readFileSync("components/project-gate/DriveWorkspace.tsx", "utf8");
const projectShell = readFileSync("components/project-gate/ProjectGateShell.tsx", "utf8");
const logout = readFileSync("components/auth/HeaderLogoutIconButton.tsx", "utf8");
const css = readFileSync("components/drive/DriveWorkspace.module.css", "utf8");
const projectCss = readFileSync("components/project-gate/ProjectGateShell.module.css", "utf8");

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log(`PASS ${name}`); };

check("regular Drive toolbar exposes table zoom", () => {
  assert.match(toolbar, /TableZoomControls/);
  assert.match(toolbar, /onTableZoomChange/);
});
check("main normal file grid receives zoom", () => {
  const normal = workspace.slice(workspace.indexOf('className={`${browserClass}'), workspace.indexOf("<BoxShelf"));
  assert.match(normal, /tableZoom=\{tableZoom\}/);
});
check("main normal file grid enables drag pan", () => {
  const normal = workspace.slice(workspace.indexOf('className={`${browserClass}'), workspace.indexOf("<BoxShelf"));
  assert.match(normal, /dragPanEnabled/);
});
check("Projectkapu normal engineering view exposes zoom controls", () => {
  assert.match(projectDrive, /<TableZoomControls zoom=\{tableZoom\}/);
});
check("Projectkapu normal engineering file grid receives zoom", () => {
  const start = projectDrive.indexOf('!tableFullscreen && <section');
  const normal = projectDrive.slice(start, projectDrive.indexOf('browserViewMode === "split"', start));
  assert.match(normal, /tableZoom=\{tableZoom\}/);
});
check("Projectkapu normal engineering file grid enables drag pan", () => {
  const start = projectDrive.indexOf('!tableFullscreen && <section');
  const normal = projectDrive.slice(start, projectDrive.indexOf('browserViewMode === "split"', start));
  assert.match(normal, /dragPanEnabled/);
});
check("Commander supports zoom", () => {
  assert.match(commander, /tableZoom\?: number/);
  assert.match(commander, /style=\{\{ zoom: tableZoom \/ 100 \}\}/);
});
check("Commander supports long-press pan", () => {
  assert.match(commander, /}, 180\)/);
  assert.match(commander, /scrollLeft = state\.startLeft - dx/);
  assert.match(commander, /scrollTop = state\.startTop - dy/);
});
check("Commander preserves file move with dedicated grip", () => {
  assert.match(commander, /draggable=\{false\}/);
  assert.match(commander, /className=\{styles\.commanderGrip\}[\s\S]*?draggable=\{canWrite && moveReady\}/);
  assert.match(commander, /application\/x-dimpro-drive-document/);
});
check("main Commander gets pan and zoom", () => {
  assert.match(workspace, /<CommanderPanel[\s\S]*?tableZoom=\{tableZoom\}[\s\S]*?dragPanEnabled/);
});
check("Projectkapu Commander gets pan and zoom", () => {
  assert.match(projectDrive, /<CommanderPanel[\s\S]*?tableZoom=\{tableZoom\}[\s\S]*?dragPanEnabled/);
});
check("file grid long press remains enabled outside fullscreen", () => {
  assert.match(grid, /dragPanEnabled \? styles\.tablePanEnabled/);
  assert.match(grid, /}, 180\)/);
});
check("Drive header has logout after Help", () => {
  const help = workspace.indexOf("Súgó");
  const out = workspace.indexOf("HeaderLogoutIconButton", help);
  assert.ok(help >= 0 && out > help);
});
check("Projectkapu header has logout after Help", () => {
  const help = projectShell.indexOf('title="Súgó"');
  const out = projectShell.indexOf("HeaderLogoutIconButton", help);
  assert.ok(help >= 0 && out > help);
});
check("logout clears DEV access cookie session", () => {
  assert.match(logout, /method: "DELETE"/);
  assert.match(logout, /\/api\/project-gate\/dev-access\/session/);
});
check("logout clears Supabase session too", () => assert.match(logout, /supabase\.auth\.signOut\(\)/));
check("logout redirects to login", () => assert.match(logout, /window\.location\.href = "\/login"/));
check("Drive logout is red", () => {
  assert.match(css, /\.headerLogout\s*\{[\s\S]*?color: #d62d2d/);
});
check("Projectkapu logout is red", () => {
  assert.match(projectCss, /\.headerLogout\s*\{[\s\S]*?color: #d92d2d/);
});

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
