#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const helper = readFileSync("components/drive/externalFileDrop.ts", "utf8");
const workspace = readFileSync("components/drive/DriveWorkspace.tsx", "utf8");

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log("PASS " + name); };

check("shared external file detector is exported", () => {
  assert.match(helper, /export function hasExternalDriveFiles\(/);
});

check("external detector accepts Files transfer type", () => {
  assert.match(helper, /types\.some\(\(type\) => type === ["']Files["']\)/);
});

check("external detector falls back to file-kind DataTransfer items", () => {
  assert.match(helper, /items\.some\(\(item\) => item\.kind === ["']file["']\)/);
});

check("external detector falls back to DataTransfer files", () => {
  assert.match(helper, /dataTransfer\.files\?\.length/);
});

const dropStart = workspace.indexOf("async function handleExternalDrop");
const dropEnd = workspace.indexOf("\n  function requestUpload", dropStart);
assert.ok(dropStart >= 0 && dropEnd > dropStart, "handleExternalDrop source block not found");
const drop = workspace.slice(dropStart, dropEnd);

check("Drive drop handler uses shared external detector", () => {
  assert.match(drop, /const hasExternalFiles = hasExternalDriveFiles\(event\.dataTransfer\)/);
});

check("valid external drop prevents browser default before permission/storage gates", () => {
  const prevent = drop.indexOf("event.preventDefault()");
  const permission = drop.indexOf("if (!canWrite)");
  const storage = drop.indexOf("if (!health?.storage?.realObjectWriteEnabled)");
  assert.ok(prevent >= 0 && permission > prevent && storage > prevent);
});

check("valid external drop stops bubbling before permission/storage gates", () => {
  const stop = drop.indexOf("event.stopPropagation()");
  const permission = drop.indexOf("if (!canWrite)");
  assert.ok(stop >= 0 && permission > stop);
});

check("permission failure is user-visible", () => {
  assert.match(drop, /if \(!canWrite\)[\s\S]*?setError\("Nincs jogosultságod fájl feltöltésére ebbe a mappába\."\)/);
});

check("prepared groups are validated by actual file count", () => {
  assert.match(drop, /prepared\.groups\.reduce\(\(sum, group\) => sum \+ group\.files\.length, 0\)/);
  assert.match(drop, /preparedFileCount === 0[\s\S]*?setError\("A behúzott elem nem tartalmaz feltölthető fájlt\."\)/);
});

check("prepared groups still use common Drive upload pipeline", () => {
  assert.match(drop, /uploadFiles\(group\.files, group\.folder, group\.originalRelativePaths\)/);
});

const uploadStart = workspace.indexOf("async function uploadFiles");
const uploadEnd = workspace.indexOf("\n  async function scanSelectedVersion", uploadStart);
assert.ok(uploadStart >= 0 && uploadEnd > uploadStart, "uploadFiles source block not found");
const upload = workspace.slice(uploadStart, uploadEnd);

check("uploadFiles permission and target folder failures are user-visible", () => {
  assert.doesNotMatch(upload, /if \(!files\.length \|\| !targetFolder \|\| !canWrite\) return/);
  assert.match(upload, /if \(!files\.length\) return/);
  assert.match(upload, /if \(!canWrite\)[\s\S]*?setError\(/);
  assert.match(upload, /if \(!targetFolder\)[\s\S]*?setError\(/);
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.7.2 external OS drag-drop regression",
  pass,
  fail: 0,
}, null, 2));
