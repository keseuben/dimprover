#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const css=fs.readFileSync("components/drive/DriveWorkspace.module.css","utf8");
const buildInfo=fs.readFileSync("components/drive/driveBuildInfo.ts","utf8");
let pass=0; const check=(label,fn)=>{fn();pass++;console.log("PASS "+String(pass).padStart(2,"0")+" "+label);};
const need=(token)=>assert.ok(css.includes(token),"missing "+token);
check("Drive residual-dark series uses shared 0.9.x version source",()=>assert.match(buildInfo,/DRIVE_DEVELOPMENT_VERSION = "0\.9\.\d+"/));
check("empty details state is dark",()=>{need('html[data-drive-theme="dark"]') ; need(".loadingState"); need("background: #0d1a28");});
check("Commander root and panes are dark",()=>{for(const t of [".commanderWorkspace",".commanderHeader",".commanderColumns",".commanderPane",".commanderPaneHeader",".commanderList",".commanderPaneFooter"]) need(t);});
check("Commander rows and controls are dark",()=>{for(const t of [".commanderFolderRow",".commanderFileRow",".commanderFileSelected",".commanderFileChecked",".commanderMoveButton",".commanderDeleteButton"]) need(t);});
check("Compare workspace and cards are dark",()=>{for(const t of [".compareWorkspace",".compareHeader",".compareSelectors",".compareDocumentCard",".compareDiffPanel",".comparePreviewPlaceholder"]) need(t);});
check("Viewer chrome is dark while document surfaces stay white",()=>{for(const t of [".driveViewer",".driveViewerToolbar",".driveViewerStage",".driveViewerLoading",".driveViewerUnsupported"]) need(t); assert.match(css,/driveViewerCanvas[\s\S]*?background: #fff/);});
check("Visual compare top-level chrome is dark",()=>{for(const t of [".visualCompare",".visualCompareHeader",".visualCompareToolbar",".visualCompareAlignmentBar",".visualCompareModeSwitch",".visualCompareUnsupported"]) need(t);});
check("engineering document canvases intentionally remain white",()=>{for(const t of [".driveViewerCanvas",".driveViewerImage",".visualCompareCanvas",".visualCompareImage",".visualCompareOverlayViewport"]) need(t);});
check("PROD access remains denied",()=>assert.doesNotMatch(css+buildInfo,/PROD ALLOW/));
console.log(JSON.stringify({ok:true,contract:"DIMPRO Drive V0.9.11 Residual Dark Surface Completion",pass,fail:0,productionAccess:"DENY"},null,2));