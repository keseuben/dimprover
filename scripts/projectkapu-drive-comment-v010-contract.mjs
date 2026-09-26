#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types=readFileSync("app/lib/project-core/types.ts","utf8");
const permissions=readFileSync("app/lib/project-core/permissions.ts","utf8");
const route=readFileSync("app/api/projects/[projectId]/drive/documents/[documentId]/note/route.ts","utf8");
const panel=readFileSync("components/drive/DetailsPanel.tsx","utf8");
const ui=readFileSync("components/project-gate/DriveWorkspace.tsx","utf8");

function block(role){
  const start=permissions.indexOf(`  ${role}: [`);
  const end=permissions.indexOf("  ],",start);
  assert.ok(start>=0&&end>start);
  return permissions.slice(start,end);
}
let pass=0; const check=(name,fn)=>{fn();pass++;console.log("PASS "+name);};
check("ProjectPermission includes document.comment",()=>assert.match(types,/document\.comment/));
check("OWNER can comment",()=>assert.match(block("OWNER"),/document\.comment/));
check("PROJECT_MANAGER can comment",()=>assert.match(block("PROJECT_MANAGER"),/document\.comment/));
check("CONTRIBUTOR can comment",()=>assert.match(block("CONTRIBUTOR"),/document\.comment/));
check("REVIEWER can comment without document.write",()=>{assert.match(block("REVIEWER"),/document\.comment/);assert.doesNotMatch(block("REVIEWER"),/document\.write/);});
check("VIEWER cannot comment",()=>assert.doesNotMatch(block("VIEWER"),/document\.comment/));
check("note API requires document.comment",()=>assert.match(route,/requireProjectPermission\(request, projectId, "document\.comment"\)/));
check("DetailsPanel uses canComment for note editing",()=>assert.match(panel,/readOnly=\{!canComment\}/)&&assert.match(panel,/disabled=\{!canComment \|\| busy\}/));
check("ProjectGate passes canComment into shared panel",()=>assert.match(ui,/canComment=\{canComment\}/));
console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
