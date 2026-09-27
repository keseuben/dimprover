#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const grid = readFileSync("components/drive/FileGridPanel.tsx", "utf8");
const commander = readFileSync("components/drive/CommanderPanel.tsx", "utf8");
const css = readFileSync("components/drive/DriveWorkspace.module.css", "utf8");
let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log(`PASS ${name}`); };

check("pilot file input enables multi-select", () => assert.match(workspace, /type="file" multiple hidden/));
check("pilot file input forwards every selected file", () => assert.match(workspace, /Array\.from\(event\.target\.files \|\| \[\]\)/));
check("bulk uploader iterates selected files", () => assert.match(workspace, /for \(let index = 0; index < files\.length; index \+= 1\)/));
check("bulk upload reports progress position", () => assert.match(workspace, /\$\{index \+ 1\}\/\$\{files\.length\}/));
check("bulk upload keeps per-file abort cleanup", () => assert.match(workspace, /Web Drive kliensoldali feltöltés megszakadt/));
check("bulk upload reloads once after batch", () => assert.match(workspace, /await load\(\);[\s\S]*if \(lastDocumentId\)/));
check("JPG and common raster formats have dedicated image mapping", () => assert.match(grid, /new Set\(\["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif", "tif", "tiff"\]\)/));
check("file grid renders image glyph", () => assert.match(grid, /return <ImageIcon size=\{13\} \/>/));
check("file grid uses dedicated image color class", () => assert.match(grid, /styles\.fileIconImage/));
check("commander renders image glyph", () => assert.match(commander, /return <ImageIcon size=\{13\} \/>/));
check("image icon CSS differs from default PDF-red icon", () => { assert.match(css, /\.fileIconImage \{ background: #f1ecff; color: #7354c8; \}/); assert.match(css, /\.fileIcon \{[^}]*#ffe9e9[^}]*#e64545/); });

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
