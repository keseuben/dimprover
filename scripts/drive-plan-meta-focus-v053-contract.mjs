#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const grid = readFileSync("components/drive/FileGridPanel.tsx", "utf8");
const details = readFileSync("components/drive/DetailsPanel.tsx", "utf8");
const main = readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const project = readFileSync("components/project-gate/DriveWorkspace.tsx", "utf8");
const css = readFileSync("components/drive/DriveWorkspace.module.css", "utf8");

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log("PASS " + name); };

check("engineering columns are PlanNo Name Scale FileName", () => {
  assert.match(grid, /<th>Tervszám<\/th><th>Név<\/th><th>Lépték<\/th><th>Fájlnév<\/th>/);
});
check("review columns are PlanNo Name Scale FileName", () => {
  assert.match(grid, /Tervszám">Tervszám<\/th>[\s\S]{0,250}Megjelenített tervnév">Név<\/th>[\s\S]{0,250}Tervlépték">Lépték<\/th>[\s\S]{0,250}Eredeti fájlnév">Fájlnév<\/th>/);
});
check("review document group and folder row account for new column", () => {
  assert.match(grid, /<th colSpan=\{9\}>Dokumentum<\/th>/);
  assert.match(grid, /<td colSpan=\{21\}>/);
});
check("engineering folder row accounts for new column", () => {
  assert.match(grid, /<td colSpan=\{14\}>/);
});
check("plan number table cells open metadata detail", () => {
  assert.match(grid, /openDetail\(row\.document, "planNo"\)/);
  assert.match(grid, /openDetail\(document, "planNo"\)/);
});
check("scale table cells open metadata detail", () => {
  assert.match(grid, /openDetail\(row\.document, "scales"\)/);
  assert.match(grid, /openDetail\(document, "scales"\)/);
});
check("review search includes plan number and scale", () => {
  assert.match(grid, /row\.planNo/);
  assert.match(grid, /row\.scale\.title/);
});
check("details panel supports metadata focus", () => {
  assert.match(details, /detailsFocus\?: "planNo" \| "scales" \| ""/);
  assert.match(details, /targetId = detailsFocus === "planNo" \? "drive-meta-planNo" : "drive-meta-scale-0"/);
});
check("details plan number field can be highlighted", () => {
  assert.match(details, /data-details-focused=\{detailsFocus === key/);
});
check("details scale editor can be highlighted", () => {
  assert.match(details, /data-details-focused=\{detailsFocus === "scales"/);
  assert.match(details, /id=\{"drive-meta-scale-" \+ index\}/);
});
check("main workspace routes metadata cells to Details tab", () => {
  assert.match(main, /field === "planNo" \|\| field === "scales"/);
  assert.match(main, /setDetailsFocus\(\{ documentId: document\.id, field \}\)/);
  assert.match(main, /detailsFocus=\{detailsFocus\?\.documentId === selectedDocument\?\.id/);
});
check("project workspace routes metadata cells to Details tab", () => {
  assert.match(project, /field === "planNo" \|\| field === "scales"/);
  assert.match(project, /setDetailsFocus\(\{ documentId, field \}\)/);
});
check("project legacy review also exposes plan number and scale", () => {
  assert.match(project, /<th>Tervszám<\/th><th>Név<\/th><th>Lépték<\/th><th>Szakág<\/th>/);
  assert.match(project, /openReviewDetail\(row\.document\.id, "planNo"\)/);
  assert.match(project, /openReviewDetail\(row\.document\.id, "scales"\)/);
});
check("metadata cells have interactive styling", () => {
  assert.match(css, /\.metadataCellButton\s*\{/);
  assert.match(css, /\.metaItem\[data-details-focused="true"\]/);
});

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
