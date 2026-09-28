#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const details = readFileSync("components/drive/DetailsPanel.tsx", "utf8");
const grid = readFileSync("components/drive/FileGridPanel.tsx", "utf8");
const css = readFileSync("components/drive/DriveWorkspace.module.css", "utf8");

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log("PASS " + name); };

check("empty metadata starts with one scale input", () => {
  assert.match(details, /const emptyMetadata:[\s\S]*?scales: \[""\]/);
});
check("details metadata keeps up to three scales", () => {
  assert.match(details, /scales: string\[\]/);
  assert.match(details, /slice\(0, 3\)/);
});
check("scale entry uses fixed M=1 prefix", () => {
  assert.match(details, /<span>M=1:<\/span>/);
});
check("scale input accepts numeric denominator only", () => {
  assert.match(details, /inputMode="numeric"/);
  assert.match(details, /replace\(\/\\D\+\/g, ""\)/);
});
check("additional scale button appears up to three", () => {
  assert.match(details, /metadata\.scales\.length < 3/);
  assert.match(details, /Lépték hozzáadása/);
});
check("extra scale rows can be removed", () => {
  assert.match(details, /index > 0/);
  assert.match(details, /Lépték eltávolítása/);
});
check("saved metadata stores canonical M=1 scale strings", () => {
  assert.match(details, /"M=1:" \+ value/);
  assert.match(details, /scales: scalesForSave\(metadata\.scales\)/);
});
check("legacy single scale metadata can still be read", () => {
  assert.match(details, /extra\?\.scale/);
});
check("engineering table has scale column", () => {
  assert.match(grid, /<th>Lépték<\/th>/);
  assert.match(grid, /className=\{styles\.metadataCellButton\} title=\{scaleSummary\(metadata\)\.title\}[\s\S]{0,180}openDetail\(document, \"scales\"\)/);
});
check("review table has scale column", () => {
  assert.match(grid, /title="Tervlépték">Lépték/);
  assert.match(grid, /className=\{styles\.metadataCellButton\} title=\{row\.scale\.title\}[\s\S]{0,180}openDetail\(row\.document, \"scales\"\)/);
});
check("single scale displays fully and multiple scales collapse", () => {
  assert.match(grid, /scales\.length === 1 \? scales\[0\] : scales\[0\] \+ ", …"/);
  assert.match(grid, /title: scales\.length \? scales\.join\(", "\)/);
});
check("scale cells are compact and ellipsized", () => {
  assert.match(css, /\.planScaleCell\s*\{/);
  assert.match(css, /text-overflow: ellipsis/);
});
check("details scale editor has dedicated styling", () => {
  assert.match(css, /\.scaleEditor\s*\{/);
  assert.match(css, /\.scaleEditorRow\s*\{/);
});

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
