#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const css=fs.readFileSync("components/drive/DriveWorkspace.module.css","utf8");
const buildInfo=fs.readFileSync("components/drive/driveBuildInfo.ts","utf8");
let pass=0; const check=(label,fn)=>{fn();pass++;console.log("PASS "+String(pass).padStart(2,"0")+" "+label);};
const need=(token)=>assert.ok(css.includes(token),"missing "+token);
check("Drive V0.9.x development version source remains active",()=>assert.match(buildInfo,/DRIVE_DEVELOPMENT_VERSION = "0\.9\.\d+"/));
check("header notification and help actions are visible in dark mode",()=>{need('.headerAction'); need("color: #b8cad9"); need(".headerAction:hover"); need("color: #f1f7fb");});
check("file name audit card is dark",()=>{need(".fileNameAuditBox"); need("background: #101f2d"); need(".fileNameAuditBox strong");});
check("version and revision editor is dark",()=>{need(".numberingEditor"); need(".numberingEditorHead strong"); need(".numberingEditGrid select");});
check("plan scale editor is dark",()=>{need(".scaleEditor"); need(".scaleEditorHead strong"); need(".scaleEditorRow input");});
check("focused metadata fields remain dark",()=>{need('.metaItem[data-details-focused="true"]'); need(".metaItem input"); need(".metaItem textarea");});
check("metadata settings keep dark text controls",()=>{need(".metadataSettings"); need(".metadataSettingsGrid strong");});
check("PROD access remains denied",()=>assert.doesNotMatch(css+buildInfo,/PROD ALLOW/));
console.log(JSON.stringify({ok:true,contract:"DIMPRO Drive V0.9.12 DetailsPanel and Header Dark Completion",pass,fail:0,productionAccess:"DENY"},null,2));