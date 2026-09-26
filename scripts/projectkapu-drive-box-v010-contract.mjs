#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui=readFileSync("components/project-gate/DriveWorkspace.tsx","utf8");
const shelf=readFileSync("components/drive/BoxShelf.tsx","utf8");
const types=readFileSync("components/drive/driveTypes.ts","utf8");
const boxesRoute=readFileSync("app/api/projects/[projectId]/drive/boxes/route.ts","utf8");
const itemsRoute=readFileSync("app/api/projects/[projectId]/drive/boxes/[boxId]/items/route.ts","utf8");
const deleteRoute=readFileSync("app/api/projects/[projectId]/drive/boxes/[boxId]/items/[itemId]/route.ts","utf8");

let pass=0;
const check=(name,fn)=>{fn();pass++;console.log("PASS "+name);};

check("ProjectGate imports and renders shared BoxShelf",()=>assert.match(ui,/import BoxShelf/)&&assert.match(ui,/<BoxShelf/));
check("ProjectGate loads boxes from shared API",()=>assert.match(ui,/function loadBoxes|const loadBoxes/)&&assert.match(ui,/\/drive\/boxes/));
check("Box actions are workspace-ready guarded",()=>assert.match(ui,/!canWrite \|\| !health\?\.workspace\?\.databaseReady/));
check("ProjectGate can create add and remove BOX items",()=>{
  assert.match(ui,/async function createBox/);
  assert.match(ui,/async function addDocumentToBox/);
  assert.match(ui,/async function removeBoxItem/);
});
check("Box APIs keep document.write guard",()=>{
  assert.match(boxesRoute,/requireProjectPermission\(request, projectId, "document\.write"\)/);
  assert.match(itemsRoute,/requireProjectPermission\(request, projectId, "document\.write"\)/);
  assert.match(deleteRoute,/requireProjectPermission\(request, projectId, "document\.write"\)/);
});
check("DriveBox purpose includes ISSUE package",()=>assert.match(types,/DriveBoxPurpose = "GENERAL" \| "DROP" \| "COMPARE" \| "AI_ANALYSIS" \| "ISSUE" \| "MEETING"/));
check("BoxShelf exposes Kiadási csomag choice",()=>assert.match(shelf,/Kiadási csomag/)&&assert.match(shelf,/value: "ISSUE"/));
check("BOX stores document and version references instead of copying files",()=>{
  assert.match(ui,/documentId: document\.id, versionId: document\.currentVersion\?\.id \|\| null/);
  assert.doesNotMatch(ui,/copy.*storage|duplicate.*file|clone.*file/i);
});
check("Compare BOX seeds shared compare workspace",()=>assert.match(ui,/function openCompareBox/)&&assert.match(ui,/setCompareSeedItems\(seeds\)/)&&assert.match(ui,/onOpenCompareBox=\{openCompareBox\}/));
check("CompareWorkspace receives live BOX list",()=>assert.match(ui,/boxes=\{boxes\}/));
check("Engineering file list receives BOX color markers",()=>assert.match(ui,/boxColorsByDocument=\{boxColorsByDocument\}/));
check("CsomagBOX header button exposes box count",()=>assert.match(ui,/CsomagBOX \{boxes\.length/));
check("BOX preparation does not call formal issue API",()=>{
  const start=ui.indexOf("async function createBox");
  const end=ui.indexOf("async function moveDocument",start);
  const block=ui.slice(start,end);
  assert.doesNotMatch(block,/\/issue|issueDocumentVersion|document\.issue/);
});

console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
