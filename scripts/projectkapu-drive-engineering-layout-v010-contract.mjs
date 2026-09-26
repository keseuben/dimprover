#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui=readFileSync("components/project-gate/DriveWorkspace.tsx","utf8");
const layout=readFileSync("components/drive/ViewLayoutSwitcher.tsx","utf8");
const grid=readFileSync("components/drive/FileGridPanel.tsx","utf8");
const commander=readFileSync("components/drive/CommanderPanel.tsx","utf8");
const moveRoute=readFileSync("app/api/projects/[projectId]/drive/documents/[documentId]/move/route.ts","utf8");
const healthRoute=readFileSync("app/api/projects/[projectId]/drive/health/route.ts","utf8");
const css=readFileSync("components/project-gate/DriveWorkspace.module.css","utf8");

let pass=0;
const check=(name,fn)=>{fn();pass++;console.log("PASS "+name);};

check("ProjectGate exposes engineering browser mode",()=>assert.match(ui,/BrowserViewMode = "list" \| "engineering" \| "split" \| "viewer" \| "compare"/)&&assert.match(ui,/> Mérnöki<\/button>/));
check("ProjectGate reuses shared layout switcher",()=>assert.match(ui,/import ViewLayoutSwitcher/)&&assert.match(ui,/<ViewLayoutSwitcher value=\{engineeringLayoutMode\}/));
check("Shared layout switcher contains 3 2 1 split commander modes",()=>{
  assert.match(layout,/value: "three"/);
  assert.match(layout,/value: "two"/);
  assert.match(layout,/value: "one"/);
  assert.match(layout,/value: "split"/);
  assert.match(layout,/value: "commander"/);
});
check("ProjectGate reuses shared folder file and details panels",()=>{
  assert.match(ui,/import FolderTreePanel/);
  assert.match(ui,/import FileGridPanel/);
  assert.match(ui,/import DetailsPanel/);
  assert.match(ui,/<FolderTreePanel/);
  assert.match(ui,/<FileGridPanel/);
});
check("FileGridPanel supports simple and engineering tables",()=>assert.match(grid,/Egyszerű nézet/)&&assert.match(grid,/Mérnöki nézet/)&&assert.match(grid,/viewMode === "simple"/));
check("Three two and one panel visibility semantics are preserved",()=>{
  assert.match(ui,/engineeringFolderHidden = engineeringLayoutMode !== "three"/);
  assert.match(ui,/engineeringDetailsHidden = engineeringLayoutMode === "one"/);
  assert.match(ui,/richStyles\.layoutTwo/);
  assert.match(ui,/richStyles\.layoutOne/);
  assert.match(ui,/richStyles\.layoutSplit/);
});
check("Commander receives complete project document set",()=>assert.match(ui,/documents=\{tree\?\.documents \|\| \[\]\}/));
check("Commander move is permission and workspace guarded",()=>{
  assert.match(ui,/!canWrite \|\| !health\?\.workspace\?\.databaseReady/);
  assert.match(ui,/moveReady=\{Boolean\(health\?\.workspace\?\.databaseReady\)\}/);
  assert.match(commander,/canWrite && moveReady/);
});
check("Move API requires document.write",()=>assert.match(moveRoute,/requireProjectPermission\(request, projectId, "document\.write"\)/));
check("Health API exposes workspace readiness",()=>assert.match(healthRoute,/workspace:/)&&assert.match(healthRoute,/databaseReady: workspace\.ready/));
check("Commander supports drag and arrow move",()=>assert.match(commander,/application\/x-dimpro-drive-document/)&&assert.match(commander,/onMoveDocument\(document, oppositeFolderId\)/));
check("ProjectGate engineering host has dedicated wrapper",()=>assert.match(ui,/data-project-gate-drive-engineering="0\.1\.0"/)&&assert.match(css,/\.engineeringHost/));

console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
