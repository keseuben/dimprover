#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const css=fs.readFileSync("components/drive/DriveWorkspace.module.css","utf8");
const build=fs.readFileSync("components/drive/driveBuildInfo.ts","utf8");
let pass=0; const check=(name,fn)=>{fn(); pass++; console.log(`PASS ${String(pass).padStart(2,"0")} ${name}`)};
check("Drive carries V0.9.30 workline or newer",()=>assert.match(build,/DRIVE_DEVELOPMENT_VERSION = "0\.9\.(30|31)"/));
check("regular split review workline is max-content",()=>assert.match(css,/\.detailsSplitCard \.reviewWorkspace > \.reviewProgress \{[\s\S]*width: max-content;[\s\S]*justify-self: start;[\s\S]*align-self: start;/s));
check("regular split review columns are fixed",()=>assert.match(css,/\.detailsSplitCard \.reviewWorkspace > \.reviewProgress \{[\s\S]*grid-template-columns: repeat\(6, 48px\);[\s\S]*gap: 6px;/s));
check("regular split step wrappers are fixed 48px",()=>assert.match(css,/\.detailsSplitCard \.reviewProgressStepWrap \{[\s\S]*width: 48px;[\s\S]*min-width: 48px;[\s\S]*max-width: 48px;/s));
check("regular split steps are fixed 48px",()=>assert.match(css,/\.detailsSplitCard \.reviewProgressStep \{[\s\S]*width: 48px;[\s\S]*min-width: 48px;[\s\S]*max-width: 48px;/s));
check("regular split status bars are fixed 48px",()=>assert.match(css,/\.detailsSplitCard \.reviewProgressBar \{[\s\S]*width: 48px;[\s\S]*max-width: 48px;/s));
check("regular split icons are compact",()=>assert.match(css,/\.detailsSplitCard \.reviewProgressStep svg \{[\s\S]*width: 13px;[\s\S]*height: 13px;/s));
check("fullscreen bottom shares fixed geometry",()=>assert.match(css,/\.fullTableInspectorBottom \.reviewWorkspace > \.reviewProgress \{[\s\S]*repeat\(6, 48px\);[\s\S]*gap: 6px;/s));
console.log(JSON.stringify({ok:true,contract:"DIMPRO Drive V0.9.30 compact bottom review workline",pass,fail:0,productionAccess:"DENY"},null,2));
