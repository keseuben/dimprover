#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync("components/project-gate/DriveWorkspace.tsx", "utf8");
const css = readFileSync("components/project-gate/DriveWorkspace.module.css", "utf8");
const complete = readFileSync("app/api/projects/[projectId]/drive/uploads/[uploadId]/complete/route.ts", "utf8");
const viewer = readFileSync("components/drive/DriveDocumentViewer.tsx", "utf8");
const detailsPanel = readFileSync("components/drive/DetailsPanel.tsx", "utf8");
const noteRoute = readFileSync("app/api/projects/[projectId]/drive/documents/[documentId]/note/route.ts", "utf8");
const types = readFileSync("components/drive/driveTypes.ts", "utf8");

let pass = 0;
const check = (name, fn) => {
  fn();
  pass += 1;
  console.log("PASS " + name);
};

check("ProjectGate reuses shared DetailsPanel and its DriveDocumentViewer", () => {
  assert.match(ui, /import DetailsPanel/);
  assert.match(ui, /<DetailsPanel/);
  assert.match(detailsPanel, /import DriveDocumentViewer/);
  assert.match(detailsPanel, /<DriveDocumentViewer projectId=\{projectId\} document=\{document\}/);
});
check("List split and viewer modes exist", () => {
  assert.match(ui, /type BrowserViewMode = "list" \| "engineering" \| "split" \| "viewer" \| "compare"/);
  assert.match(ui, /> Lista<\/button>/);
  assert.match(ui, /> Osztott<\/button>/);
  assert.match(ui, /> Tervnéző<\/button>/);
});
check("Document selection opens viewer", () => {
  assert.match(ui, /setSelectedDocumentId\(document\.id\)/);
  assert.match(ui, /data-project-gate-drive-viewer="0\.2\.0"/);
});
check("Shared viewer uses permission-guarded preview API", () => {
  assert.match(viewer, /\/drive\/documents\/\$\{encodeURIComponent\(document\.id\)\}\/preview/);
});
check("New version action is document.write guarded", () => {
  assert.match(ui, /\{canWrite && <button[^>]*versionUploadButton/);
  assert.match(ui, /startVersionUpload\(document\)/);
});
check("New version upload uses existing document identity and conflict guard", () => {
  assert.match(ui, /documentId: item\.existingDocumentId \|\| undefined/);
  assert.match(ui, /expectedCurrentVersion: item\.existingDocumentId \? item\.expectedCurrentVersion : undefined/);
});
check("New version defaults to next revision and change note", () => {
  assert.match(ui, /suggestedRevision/);
  assert.match(ui, /currentVersionNumber \+ 1/);
  assert.match(ui, /Változás rövid leírása/);
});
check("Upload complete registers Document Flow governance when ready", () => {
  assert.match(complete, /getDriveDocumentFlowHealth/);
  assert.match(complete, /registerDriveIncomingDocument/);
  assert.match(complete, /sourceChannel/);
});
check("Upload complete still runs security scan", () => {
  assert.match(complete, /scanDriveQuarantinedVersion/);
});
check("Quarantined plans are previewable only through CLEAN scan guard", () => {
  const storage = readFileSync("app/lib/drive-core/storageService.ts", "utf8");
  assert.match(storage, /status === "AVAILABLE" \|\| record\.version\.status === "QUARANTINED"/);
  assert.match(storage, /record\.version\.status === "QUARANTINED" \|\| !trustedDropArchive/);
  assert.match(storage, /requireDriveCleanSecurityScan/);
  assert.match(viewer, /previewStatus === "AVAILABLE" \|\| previewStatus === "QUARANTINED"/);
});
check("Shared rich Drive permission model includes document.issue", () => {
  assert.match(types, /"document\.issue"/);
});
check("Rich view CSS includes selection viewer and version-upload states", () => {
  assert.match(css, /\.viewModeSwitcher/);
  assert.match(css, /\.previewPane/);
  assert.match(css, /\.documentSelected/);
  assert.match(css, /\.versionUploadButton/);
});
check("Shared DetailsPanel exposes versions and notes tabs", () => {
  assert.match(detailsPanel, /Verziók \(/);
  assert.match(detailsPanel, />Megjegyzések<\/button>/);
  assert.match(ui, /loadDetails\(selectedDocumentId\)/);
});
check("Reviewer comments are separated from document write permission", () => {
  assert.match(ui, /canComment = effectivePermissions\.includes\("document\.comment"\)/);
  assert.match(ui, /canComment=\{canComment\}/);
  assert.match(noteRoute, /requireProjectPermission\(request, projectId, "document\.comment"\)/);
  assert.match(detailsPanel, /readOnly=\{!canComment\}/);
  assert.match(detailsPanel, /disabled=\{!canComment \|\| busy\}/);
});
check("Viewer and compare modes preserve workflow actions", () => {
  assert.match(ui, /browserViewMode === "viewer" \|\| browserViewMode === "compare" \|\| browserViewMode === "engineering" \? styles\.listHidden/);
  assert.match(ui, /canApprove && document\.currentVersion\?\.status === "QUARANTINED"/);
  assert.match(ui, /canIssue && documentFlowReady/);
});

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
