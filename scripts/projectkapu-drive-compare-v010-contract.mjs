#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui=readFileSync("components/project-gate/DriveWorkspace.tsx","utf8");
const css=readFileSync("components/project-gate/DriveWorkspace.module.css","utf8");
const compare=readFileSync("components/drive/CompareWorkspace.tsx","utf8");
const visual=readFileSync("components/drive/DriveVisualCompareViewer.tsx","utf8");
const storage=readFileSync("app/lib/drive-core/storageService.ts","utf8");

let pass=0;
const check=(name,fn)=>{fn();pass++;console.log("PASS "+name);};

check("ProjectGate imports shared CompareWorkspace",()=>assert.match(ui,/import CompareWorkspace/));
check("ProjectGate exposes compare view mode",()=>assert.match(ui,/BrowserViewMode = "list" \| "split" \| "viewer" \| "compare"/)&&assert.match(ui,/Összehasonlítás/));
check("Compare opens from selected document with fallback seed",()=>assert.match(ui,/function openCompare\(\)/)&&assert.match(ui,/setCompareSeedItems\(seeds\)/)&&assert.match(ui,/setBrowserViewMode\("compare"\)/));
check("ProjectGate renders shared compare workspace",()=>assert.match(ui,/data-project-gate-drive-compare="0\.1\.0"/)&&assert.match(ui,/<CompareWorkspace/));
check("CompareWorkspace supports revision selectors on both sides",()=>assert.match(compare,/A dokumentum revíziója/)&&assert.match(compare,/B dokumentum revíziója/)&&assert.match(compare,/details\.versions/));
check("CompareWorkspace supports same-document version comparison",()=>assert.match(compare,/ugyanazon terv korábbi verziói is összevethetők/));
check("Visual compare supports side-by-side and overlay modes",()=>assert.match(visual,/SIDE_BY_SIDE/)&&assert.match(visual,/OVERLAY/));
check("Visual compare accepts quarantined client preview candidate",()=>assert.match(visual,/previewStatus !== "AVAILABLE" && previewStatus !== "QUARANTINED"/));
check("Backend still requires CLEAN scan for quarantined preview",()=>assert.match(storage,/record\.version\.status === "QUARANTINED" \|\| !trustedDropArchive/)&&assert.match(storage,/requireDriveCleanSecurityScan/));
check("Compare host has dedicated ProjectGate container",()=>assert.match(css,/\.compareHost/));

console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
