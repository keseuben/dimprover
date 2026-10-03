#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const grid = fs.readFileSync("components/drive/FileGridPanel.tsx","utf8");
const css = fs.readFileSync("components/drive/DriveWorkspace.module.css","utf8");
let pass=0;
const check=(label,fn)=>{fn();pass++;console.log(`PASS ${String(pass).padStart(2,"0")} ${label}`);};

check("simple view has dedicated statusIcons column",()=>{
  assert.match(grid,/const SIMPLE_COLUMNS[\s\S]*?statusIcons", defaultWidth: 132, minWidth: 124/);
});
check("engineering icon column default is 112",()=>{
  assert.match(grid,/const ENGINEERING_COLUMNS[\s\S]*?statusIcons", defaultWidth: 132, minWidth: 124/);
});
check("review icon column default is 112",()=>{
  assert.match(grid,/const REVIEW_COLUMNS[\s\S]*?statusIcons", defaultWidth: 132, minWidth: 124/);
});
check("simple header exposes resizable icon column",()=>{
  assert.match(grid,/startColumnResize\("simple", "statusIcons"/);
});
check("simple table uses 12 column spans",()=>{
  assert.match(grid,/colSpan=\{12\}/);
  assert.match(grid,/colSpan=\{12\}[\s\S]*?newFolderName/);
});
check("simple file icons and BOX live in status icon cell",()=>{
  assert.match(grid,/<td className=\{styles\.statusIconColumn\}>[\s\S]*?<div className=\{styles\.statusIconStrip\}>[\s\S]*?BoxInlineMarker[\s\S]*?<\/td>[\s\S]*?<td><div className=\{styles\.fileNameCell\}><DisplayNameValue/);
});
check("simple Name cell contains display name but no BOX marker",()=>{
  assert.match(grid,/<td><div className=\{styles\.fileNameCell\}><DisplayNameValue/);
});
check("icon column is left aligned",()=>{
  assert.match(css,/\.statusIconColumn \{[\s\S]*?text-align: left !important/);
  assert.match(css,/\.statusIconStrip \{[\s\S]*?justify-content: flex-start/);
});
check("icon column remains resizable via min width only",()=>{
  const block=css.match(/\.statusIconColumn \{([\s\S]*?)\n\}/)?.[1]||"";
  assert.match(block,/min-width: 124px/);
  assert.doesNotMatch(block,/max-width:/);
  assert.doesNotMatch(block,/width: 132px !important/);
});
check("BOX marker cannot overflow into adjacent name cell",()=>{
  assert.match(css,/\.statusIconColumn \{[\s\S]*?overflow: hidden !important/);
  assert.match(css,/\.statusIconStrip \{[\s\S]*?overflow: hidden/);
});
console.log(JSON.stringify({ok:true,contract:"DIMPRO Drive V0.9.1 icon-column alignment hotfix",pass,fail:0,productionAccess:"DENY"},null,2));
