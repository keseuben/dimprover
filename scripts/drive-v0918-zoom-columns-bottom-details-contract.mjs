import assert from "node:assert/strict";
import fs from "node:fs";

const read=(f)=>fs.readFileSync(f,"utf8");
const grid=read("components/drive/FileGridPanel.tsx");
const drive=read("components/drive/DriveWorkspace.tsx");
const personal=read("components/drive/PersonalDriveWorkspace.tsx");
const gate=read("components/project-gate/DriveWorkspace.tsx");
const zoom=read("components/drive/TableZoomControls.tsx");
const toolbar=read("components/drive/DriveToolbar.tsx");
const commander=read("components/drive/CommanderPanel.tsx");
const css=read("components/drive/DriveWorkspace.module.css");
let pass=0;
const check=(name,fn)=>{fn();pass++;console.log(`PASS ${String(pass).padStart(2,"0")} ${name}`)};

check("project Drive default table zoom is 90",()=>assert.match(drive,/const \[tableZoom, setTableZoom\] = useState\(90\)/));
check("personal Drive default table zoom is 90",()=>assert.match(personal,/const \[tableZoom, setTableZoom\] = useState\(90\)/));
check("Project Gate default table zoom is 90",()=>assert.match(gate,/const \[tableZoom, setTableZoom\] = useState\(90\)/));
check("grid toolbar and commander defaults are 90",()=>{assert.match(grid,/tableZoom = 90/);assert.match(toolbar,/tableZoom = 90/);assert.match(commander,/tableZoom = 90/)});
check("zoom value reset returns to 90",()=>{assert.match(zoom,/onZoomChange\(90\)/);assert.match(zoom,/Visszaállítás 90%-ra/)});

check("collapsible columns use persistent storage",()=>{assert.match(grid,/HIDDEN_COLUMNS_STORAGE_KEY = "dimpro-drive-table-hidden-columns-v1"/);assert.match(grid,/localStorage\.getItem\(HIDDEN_COLUMNS_STORAGE_KEY\)/);assert.match(grid,/localStorage\.setItem\(HIDDEN_COLUMNS_STORAGE_KEY/)});
check("engineering supports the four requested collapsible columns",()=>assert.match(grid,/engineering: \{ planNo: "Tervszám", fileName: "Fájlnév", uploader: "Feltöltő", type: "Típus" \}/));
check("simple supports file name uploader and type collapse",()=>assert.match(grid,/simple: \{ fileName: "Fájlnév", uploader: "Feltöltő", type: "Típus" \}/));
check("review supports available requested columns",()=>assert.match(grid,/review: \{ planNo: "Tervszám", fileName: "Fájlnév", uploader: "Feltöltő" \}/));
check("header double click collapses supported column",()=>{assert.match(grid,/onDoubleClick=\{\(event\) => \{/);assert.match(grid,/onCollapse\(\)/)});
check("collapsed header is a plus restore control with tooltip",()=>{assert.match(grid,/collapsedColumnRestore/);assert.match(grid,/<Plus size=\{13\}/);assert.match(grid,/oszlop elrejtve · Kattintás: visszaállítás/)});
check("collapsed columns keep a narrow physical slot",()=>{assert.match(grid,/COLLAPSED_COLUMN_WIDTH = 28/);assert.match(css,/\.collapsedColumnHeader[\s\S]*?width: 28px/);assert.match(css,/\.collapsedColumnCell[\s\S]*?width: 28px/)});
check("collapsed width participates in table minimum width",()=>assert.match(grid,/columnDisplayWidth\(view, column\)/));

check("project Drive default layout is folders",()=>assert.match(drive,/useState<DriveLayoutMode>\("folders"\)/));
check("personal Drive default layout is folders",()=>assert.match(personal,/useState<DriveLayoutMode>\("folders"\)/));
check("Project Gate engineering default layout is folders",()=>assert.match(gate,/useState<DriveLayoutMode>\("folders"\)/));
check("personal layout persistence moved to v2 default contract",()=>{assert.match(personal,/dimpro-drive-personal-layout-v2/);assert.doesNotMatch(personal,/getItem\("dimpro-drive-personal-layout"\)/)});
check("folders layout has top two panels plus resize and bottom details rows",()=>assert.match(css,/\.layoutFolders \{[\s\S]*?grid-template-columns: 260px minmax\(500px, 1fr\);[\s\S]*?grid-template-rows: minmax\(220px, 1fr\) 10px 280px/));
check("folders details spans full width below top panels",()=>{assert.match(css,/\.foldersDetailsResizeHandle \{ grid-column: 1 \/ -1; grid-row: 2; \}/);assert.match(css,/\.foldersDetailsCard \{ grid-column: 1 \/ -1; grid-row: 3/)});
check("project Drive folders view keeps details visible",()=>assert.match(drive,/const detailsHidden = layoutMode === "one"/));
check("personal folders view keeps details visible",()=>assert.match(personal,/const detailsHidden = layoutMode === "one"/));
check("Project Gate folders view keeps details visible",()=>assert.match(gate,/const engineeringDetailsHidden = engineeringLayoutMode === "one"/));
check("project Drive folders details maximum is one half",()=>assert.match(drive,/Math\.floor\(\(workspaceHeight - 10\) \/ 2\)/));
check("personal Drive folders details maximum is one half",()=>assert.match(personal,/Math\.floor\(\(height - 10\) \/ 2\)/));
check("Project Gate folders details maximum is one half",()=>assert.match(gate,/Math\.floor\(\(height - 10\) \/ 2\)/));
check("details actions no longer force folders view to three panels",()=>{assert.doesNotMatch(drive,/layoutMode === "folders"\) setLayoutMode\("three"\)/);assert.doesNotMatch(gate,/engineeringLayoutMode === "folders"\) setEngineeringLayoutMode\("three"\)/)});

console.log(JSON.stringify({ok:true,contract:"DIMPRO Drive V0.9.18 zoom + collapsible columns + bottom details",pass,fail:0,productionAccess:"DENY"},null,2));
