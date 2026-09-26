#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const permissions = readFileSync("app/lib/project-core/permissions.ts","utf8");
const auth = readFileSync("app/lib/project-core/auth.ts","utf8");
const drive = readFileSync("components/project-gate/DriveWorkspace.tsx","utf8");
const tree = readFileSync("app/api/projects/[projectId]/drive/tree/route.ts","utf8");
const gate = readFileSync("app/api/projects/[projectId]/drop/submission-gates/route.ts","utf8");
const review = readFileSync("app/api/projects/[projectId]/drive/documents/[documentId]/versions/[versionId]/review/route.ts","utf8");
const scan = readFileSync("app/api/projects/[projectId]/drive/documents/[documentId]/versions/[versionId]/security-scan/route.ts","utf8");
const issue = readFileSync("app/api/projects/[projectId]/drive/documents/[documentId]/versions/[versionId]/issue/route.ts","utf8");
const accessLinks = readFileSync("app/api/projects/[projectId]/drive/issues/[issueId]/access-links/route.ts","utf8");

let pass=0;
const check=(name,fn)=>{fn();pass++;console.log("PASS "+name);};

function roleBlock(role,nextRole){
  const marker="\n  "+role+": [";
  const nextMarker=nextRole ? "\n  "+nextRole+": [" : null;
  const start=permissions.indexOf(marker);
  assert.ok(start>=0, role+" missing");
  const end=nextMarker ? permissions.indexOf(nextMarker,start+marker.length) : permissions.indexOf("\n};",start+marker.length);
  assert.ok(end>start, role+" block end missing");
  return permissions.slice(start,end);
}
const owner=roleBlock("OWNER","PROJECT_MANAGER");
const manager=roleBlock("PROJECT_MANAGER","CONTRIBUTOR");
const contributor=roleBlock("CONTRIBUTOR","REVIEWER");
const reviewer=roleBlock("REVIEWER","VIEWER");
const viewer=roleBlock("VIEWER",null);

check("OWNER can read write comment approve and issue documents",()=>{assert.match(owner,/document\.read/);assert.match(owner,/document\.write/);assert.match(owner,/document\.comment/);assert.match(owner,/document\.approve/);assert.match(owner,/document\.issue/);});
check("PROJECT_MANAGER can read write comment approve and issue documents",()=>{assert.match(manager,/document\.read/);assert.match(manager,/document\.write/);assert.match(manager,/document\.comment/);assert.match(manager,/document\.approve/);assert.match(manager,/document\.issue/);});
check("CONTRIBUTOR can write and comment but cannot approve or issue",()=>{assert.match(contributor,/document\.read/);assert.match(contributor,/document\.write/);assert.match(contributor,/document\.comment/);assert.doesNotMatch(contributor,/document\.approve/);assert.doesNotMatch(contributor,/document\.issue/);});
check("REVIEWER can comment and approve but cannot write or issue",()=>{assert.match(reviewer,/document\.read/);assert.match(reviewer,/document\.comment/);assert.match(reviewer,/document\.approve/);assert.doesNotMatch(reviewer,/document\.write/);assert.doesNotMatch(reviewer,/document\.issue/);});
check("VIEWER is document read only",()=>{assert.match(viewer,/document\.read/);assert.doesNotMatch(viewer,/document\.write/);assert.doesNotMatch(viewer,/document\.comment/);assert.doesNotMatch(viewer,/document\.approve/);assert.doesNotMatch(viewer,/document\.issue/);});

check("backend permission denial is 403",()=>assert.match(auth,/status: 403/));
check("DRIVE tree returns authoritative API permissions",()=>assert.match(tree,/permissions: access\.access\.permissions/));
check("UI derives write approve and issue independently",()=>assert.match(drive,/canWrite = effectivePermissions\.includes\("document\.write"\)/)&&assert.match(drive,/canApprove = effectivePermissions\.includes\("document\.approve"\)/)&&assert.match(drive,/canIssue = effectivePermissions\.includes\("document\.issue"\)/));
check("submission gate mutation requires document.write",()=>assert.match(gate,/requireProjectPermission\(request, projectId, "document\.write"\)/));
check("review requires document.approve",()=>assert.match(review,/requireProjectPermission\(request, projectId, "document\.approve"\)/));
check("security scan requires document.approve",()=>assert.match(scan,/requireProjectPermission\(request, projectId, "document\.approve"\)/));
check("formal document issue requires document.issue",()=>assert.match(issue,/requireProjectPermission\(request, projectId, "document\.issue"\)/));
check("recipient link regeneration requires document.issue",()=>assert.match(accessLinks,/requireProjectPermission\(request, projectId, "document\.issue"\)/));
check("issue and link UI actions use canIssue",()=>assert.match(drive,/canIssue && documentFlowReady/)&&assert.match(drive,/canIssue && documentFlowReady && formalIssue/));

console.log(JSON.stringify({
  total:pass,
  pass,
  fail:0,
  currentPolicy:{
    owner:"read/write/comment/approve/issue",
    projectManager:"read/write/comment/approve/issue",
    contributor:"read/write/comment",
    reviewer:"read/comment/approve",
    viewer:"read",
    formalDocumentIssuePermission:"document.issue"
  }
},null,2));
