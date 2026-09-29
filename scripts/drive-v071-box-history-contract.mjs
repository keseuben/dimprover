import fs from "node:fs";
import assert from "node:assert/strict";

const read = (p) => fs.readFileSync(p, "utf8");
const route = read("app/api/projects/[projectId]/drive/boxes/[boxId]/history/route.ts");
const shelf = read("components/drive/BoxShelf.tsx");
const panel = read("components/drive/BoxHistoryPanel.tsx");
const css = read("components/drive/DriveWorkspace.module.css");
const standalone = read("components/drive/DriveWorkspace.tsx");
const gate = read("components/project-gate/DriveWorkspace.tsx");

let pass=0, fail=0;
function check(name, fn) {
  const n=String(pass+fail+1).padStart(2,"0");
  try { fn(); pass++; console.log(`PASS ${n} ${name}`); }
  catch (e) { fail++; console.error(`FAIL ${n} ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}

check("History endpoint requires document.read",()=>assert.match(route,/requireProjectPermission\(request, projectId, "document\.read"\)/));
check("History endpoint validates BOX exists",()=>assert.match(route,/listed\.boxes\.some\(\(box\) => box\.id === boxId\)/));
check("History reuses project audit log",()=>assert.match(route,/listProjectAuditEvents\(projectId, 100\)/));
check("History filters direct BOX events",()=>assert.match(route,/event\.entityType === "box" && event\.entityId === boxId/));
check("History filters child events through metadata boxId",()=>assert.match(route,/event\.metadata\?\.boxId/));
check("History includes lifecycle events",()=>assert.match(route,/DRIVE_BOX_LIFECYCLE_CHANGED/));
check("History includes ZIP package events",()=>assert.match(route,/DRIVE_DOWNLOAD_PACKAGE_CREATED/));
check("History panel loads lazily from BOX history endpoint",()=>assert.match(panel,/\/history/)&&assert.match(panel,/cache: "no-store"/));
check("History panel exposes refresh",()=>assert.match(panel,/RefreshCcw/));
check("History panel shows actor and timestamp",()=>assert.match(panel,/actorUserId/)&&assert.match(panel,/dateTime=/));
check("History panel explains lifecycle transition",()=>assert.match(panel,/previousStatus/)&&assert.match(panel,/nextStatus/));
check("History panel explains package file count",()=>assert.match(panel,/fileCount/));
check("CsomagBOX exposes Előzmények action",()=>assert.match(shelf,/Előzmények/));
check("CsomagBOX renders BoxHistoryPanel",()=>assert.match(shelf,/<BoxHistoryPanel/));
check("Standalone Drive passes projectId into BoxShelf",()=>assert.match(standalone,/<BoxShelf[\s\S]*?projectId=\{projectId\}/));
check("ProjectGate Drive passes projectId into BoxShelf",()=>assert.match(gate,/<BoxShelf[\s\S]*?projectId=\{projectId\}/));
check("History list has dedicated scroll container",()=>assert.match(css,/\.boxHistoryList[\s\S]*?overflow-y:\s*auto/));
check("History panel has responsive Drive styling",()=>assert.match(css,/\.boxHistoryPanel/)&&assert.match(css,/\.boxHistoryRow/));

console.log(JSON.stringify({ok:fail===0,contract:"DIMPRO Drive V0.7.1 CsomagBOX history",pass,fail},null,2));
if(fail) process.exit(1);
