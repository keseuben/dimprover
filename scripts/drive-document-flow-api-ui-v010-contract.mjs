import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const list=fs.readFileSync(path.join(root,"app/api/projects/[projectId]/drive/document-flow/route.ts"),"utf8");
const issue=fs.readFileSync(path.join(root,"app/api/projects/[projectId]/drive/documents/[documentId]/versions/[versionId]/issue/route.ts"),"utf8");
const repo=fs.readFileSync(path.join(root,"app/lib/drive-core/documentFlowRepository.ts"),"utf8");
const health=fs.readFileSync(path.join(root,"app/api/projects/[projectId]/drive/health/route.ts"),"utf8");
const ui=fs.readFileSync(path.join(root,"components/project-gate/DriveWorkspace.tsx"),"utf8");

const checks=[];const check=(name,fn)=>{try{fn();checks.push({name,pass:true})}catch(error){checks.push({name,pass:false,error:error instanceof Error?error.message:String(error)})}};
check("list permission document.read",()=>assert.match(list,/requireProjectPermission\(request, projectId, "document\.read"\)/));
check("issue permission document.approve",()=>assert.match(issue,/requireProjectPermission\(request, projectId, "document\.approve"\)/));
check("list repository",()=>assert.match(repo,/export async function listDriveDocumentFlow/));
check("issue repository",()=>assert.match(repo,/export async function issueDriveDocumentVersion/));
check("formal issue RPC",()=>assert.match(repo,/drive_core_issue_document_version_atomic/));
check("recipient cap",()=>assert.match(repo,/slice\(0, 200\)/));
check("health exposes document flow",()=>assert.match(health,/documentFlow:/));
check("ui loads document flow",()=>assert.match(ui,/\/drive\/document-flow/));
check("ui issue route",()=>assert.match(ui,/\/issue/));
check("ui only offers issue from ERVENYES",()=>assert.match(ui,/businessStatus === "ERVENYES"/));
check("ui displays KIADOTT",()=>assert.match(ui,/KIADOTT/));
const pass=checks.filter(x=>x.pass).length;
console.log(JSON.stringify({pass,total:checks.length,checks},null,2));
if(pass!==checks.length)process.exit(1);
