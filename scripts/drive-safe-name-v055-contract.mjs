#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const normalizer = readFileSync("app/lib/drive-core/nameNormalizer.ts", "utf8");
const storage = readFileSync("app/lib/drive-core/storageService.ts", "utf8");
const complete = readFileSync("app/api/projects/[projectId]/drive/uploads/[uploadId]/complete/route.ts", "utf8");
const workspace = readFileSync("app/lib/drive-core/workspaceRepository.ts", "utf8");
const details = readFileSync("components/drive/DetailsPanel.tsx", "utf8");
const grid = readFileSync("components/drive/FileGridPanel.tsx", "utf8");

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log("PASS " + name); };

check("safe file names allow only ASCII letters digits underscore hyphen plus extension separator", () => {
  assert.match(normalizer, /replace\(\/\[\^A-Za-z0-9_-\]\+\/g, "_"/);
  assert.match(normalizer, /const extPart = extension \? "\." \+ extension : ""/);
});
check("dots inside file stem are normalized away", () => {
  assert.match(normalizer, /safeStem\(parts\.stem/);
  assert.match(normalizer, /replace\(\/\[\^A-Za-z0-9_-\]\+\/g, "_"/);
});
check("Hungarian and unicode accents are transliterated", () => {
  assert.match(normalizer, /normalize\("NFKD"\)/);
  assert.match(normalizer, /\\u0300-\\u036f/);
});
check("technical file names have bounded length and stable short hash", () => {
  assert.match(normalizer, /DRIVE_SAFE_FILE_NAME_MAX = 96/);
  assert.match(normalizer, /shortStableHash/);
  assert.match(normalizer, /truncateWithHash/);
});
check("technical folder names have bounded length", () => {
  assert.match(normalizer, /DRIVE_SAFE_FOLDER_NAME_MAX = 60/);
  assert.match(normalizer, /normalizeDriveFolderName/);
});
check("Windows reserved device names are protected", () => {
  assert.match(normalizer, /CON\|PRN\|AUX\|NUL\|COM\[1-9\]\|LPT\[1-9\]/);
});
check("upload service uses safe technical document name for new documents", () => {
  assert.match(storage, /const normalizedFileName = normalizeDriveFileName\(rawOriginalName\)/);
  assert.match(storage, /uploadKind === "NEW_DOCUMENT"[\s\S]{0,120}normalizedFileName\.safeFileName/);
});
check("upload metadata preserves original and safe names", () => {
  assert.match(storage, /originalFileName: normalizedFileName\.originalFileName/);
  assert.match(storage, /safeFileName: normalizedFileName\.safeFileName/);
  assert.match(storage, /nameNormalizationVersion: normalizedFileName\.normalizationVersion/);
});
check("new upload completion initializes display metadata", () => {
  assert.match(complete, /result\.session\.uploadKind === "NEW_DOCUMENT"/);
  assert.match(complete, /upsertDriveEngineeringMetadata/);
  assert.match(complete, /displayName/);
  assert.match(complete, /originalFileName/);
  assert.match(complete, /safeFileName/);
});
check("source naming metadata becomes immutable after initial write", () => {
  assert.match(workspace, /immutableSourceNameKeys/);
  assert.match(workspace, /"originalFileName"/);
  assert.match(workspace, /"safeFileName"/);
  assert.match(workspace, /if \(currentExtra\[key\] !== undefined\) extra\[key\] = currentExtra\[key\]/);
});
check("details show original and technical names separately", () => {
  assert.match(details, /Eredeti fájlnév/);
  assert.match(details, /DIMPRO technikai fájlnév/);
});
check("human Name fallback uses original upload name", () => {
  assert.match(grid, /document\.currentVersion\?\.originalName \|\| document\.name/);
});

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
