import assert from "node:assert/strict";
import fs from "node:fs";

const read=(f)=>fs.readFileSync(f,"utf8");
const types=read("components/drive/driveTypes.ts");
const switcher=read("components/drive/ViewLayoutSwitcher.tsx");
const drive=read("components/drive/DriveWorkspace.tsx");
const personal=read("components/drive/PersonalDriveWorkspace.tsx");
const gate=read("components/project-gate/DriveWorkspace.tsx");
const css=read("components/drive/DriveWorkspace.module.css");
let pass=0;
const check=(name,fn)=>{fn();pass++;console.log(`PASS ${String(pass).padStart(2,"0")} ${name}`)};

check("layout type contains folders mode",()=>assert.match(types,/DriveLayoutMode = "folders" \| "three"/));
check("folders mode appears before three panel mode",()=>assert.match(switcher,/value: "folders"[\s\S]*?value: "three"/));
check("folders mode label is explicit",()=>assert.match(switcher,/Mappák \+ dokumentumtár/));
check("fullscreen table control is last in layout switcher",()=>{const commander=switcher.lastIndexOf("commanderMode.value");const table=switcher.lastIndexOf("layoutTableSpecial");assert.ok(table>commander)});
check("fullscreen table button has stronger inactive styling",()=>{assert.match(css,/\.layoutTableSpecial \{[\s\S]*?background: linear-gradient/);assert.match(css,/box-shadow:[^;]*rgba\(87,48,159/)});
check("folders layout is left tree plus document table",()=>assert.match(css,/\.layoutFolders \{ grid-template-columns: 260px minmax\(500px, 1fr\); \}/));
check("main Drive shows folder tree in folders mode",()=>assert.match(drive,/folderHidden = layoutMode !== "three" && layoutMode !== "folders"/));
check("main Drive hides details in folders mode",()=>assert.match(drive,/detailsHidden = layoutMode === "one" \|\| layoutMode === "folders"/));
check("personal Drive persists folders layout mode",()=>assert.match(personal,/\["folders", "three", "two", "one", "split", "commander"\]/));
check("personal Drive applies folders panel rules",()=>{assert.match(personal,/layoutMode === "folders" \? styles\.layoutFolders/);assert.match(personal,/detailsHidden = layoutMode === "one" \|\| layoutMode === "folders"/)});
check("Project Gate applies folders panel rules",()=>{assert.match(gate,/engineeringLayoutMode === "folders" \? richStyles\.layoutFolders/);assert.match(gate,/engineeringDetailsHidden = engineeringLayoutMode === "one" \|\| engineeringLayoutMode === "folders"/)});
check("detail actions escape folders-only view",()=>{assert.match(drive,/layoutMode === "folders"\) setLayoutMode\("three"\)/);assert.match(gate,/engineeringLayoutMode === "folders"\) setEngineeringLayoutMode\("three"\)/)});
check("new version uses modal confirmation flow",()=>{assert.match(drive,/versionDialogOpen/);assert.match(drive,/aria-label="Új dokumentumverzió"/);assert.doesNotMatch(drive,/versionFileInputRef/)});
check("version modal names selected target prominently",()=>assert.match(drive,/ezt a kijelölt fájlt fogjuk verziózni[\s\S]*?<strong>\{selectedDocument\.name\}<\/strong>/));
check("revision modal names selected target prominently",()=>assert.match(drive,/ezt a kijelölt fájlt fogjuk revíziózni[\s\S]*?<strong>\{selectedDocument\.name\}<\/strong>/));
check("target warning uses orange emphasis",()=>{assert.match(css,/\.versionTargetWarning/);assert.match(css,/background: #fff1dc/);assert.match(css,/border-left: 5px solid #e08b1d/)});
check("version preview increments version but keeps revision",()=>assert.match(drive,/V\{selectedDocument\.currentVersion\.versionNumber \+ 1\} · \{selectedDocument\.currentVersion\.revisionCode/));
check("revision preview increments version and revision",()=>assert.match(drive,/V\{selectedDocument\.currentVersion\.versionNumber \+ 1\} · R\{String\(selectedDocument\.currentVersion\.revisionNumber \+ 1\)/));

console.log(JSON.stringify({ok:true,contract:"DIMPRO Drive V0.9.17 layout + version/revision UX",pass,fail:0,productionAccess:"DENY"},null,2));
