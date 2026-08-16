#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const baseUrl = (process.env.DRIVE_V110_E2E_BASE_URL || "http://127.0.0.1:3220").replace(/\/$/, "");
const root = "/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2";
const token = readFileSync(`${root}/.dimprover/drive/dev-token.txt`, "utf8").trim();
const actorUserId = `qa-drive-v110-${Date.now()}`;
let pass = 0;

function check(name, condition, detail = "") {
  assert.ok(condition, `${name}${detail ? ` :: ${detail}` : ""}`);
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, "0")} ${name}${detail ? ` :: ${detail}` : ""}`);
}
function headers(json = false) {
  return {
    host: "app.dev.dimpro.hu",
    "x-dimpro-drive-dev-token": token,
    "x-dimpro-drive-client-id": "jazmin-drive-v110-e2e",
    "x-dimpro-notification-user-id": actorUserId,
    "x-dimpro-notification-user-name": "DIMPRO Drive V1.1 QA",
    ...(json ? { "content-type": "application/json" } : {}),
  };
}
async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { status: response.status, payload };
}
async function uploadFile(projectId, folderId, name, mimeType, body) {
  const sha256 = createHash("sha256").update(body).digest("hex");
  const init = await api(`/api/projects/${encodeURIComponent(projectId)}/drive/uploads/init`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({
      folderId,
      documentName: name,
      originalName: name,
      mimeType,
      sizeBytes: body.length,
      sha256,
      revisionCode: "V1",
      description: "Drive Project Provisioning + Web Upload V1.1 E2E",
      changeNote: "V1.1 runtime E2E",
      source: "WEB",
    }),
  });
  check(`${name} upload init`, init.status === 201 && init.payload?.signedUpload?.url && init.payload?.completeUrl);
  const put = await fetch(init.payload.signedUpload.url, {
    method: init.payload.signedUpload.method || "PUT",
    headers: init.payload.signedUpload.headers || { "content-type": mimeType },
    body,
  });
  check(`${name} signed PUT`, put.ok, `HTTP ${put.status}`);
  const complete = await api(init.payload.completeUrl, { method: "POST", headers: headers(true), body: "{}" });
  check(`${name} complete`, complete.status === 200 && complete.payload?.ok === true);
  check(`${name} SHA verified`, complete.payload?.object?.checksumVerified === true && complete.payload?.object?.sha256 === sha256);
  check(`${name} security result`, Boolean(complete.payload?.securityScan) && ["CLEAN", "INFECTED", "ERROR", undefined].includes(complete.payload?.securityScan?.scan?.status));
  return complete.payload;
}

const unauth = await api("/api/projects", { method: "POST", headers: { host: "app.dev.dimpro.hu", "content-type": "application/json" }, body: JSON.stringify({ name: "unauth" }) });
check("Project create unauth denied", unauth.status === 401);

const stamp = Date.now();
const create = await api("/api/projects", {
  method: "POST",
  headers: headers(true),
  body: JSON.stringify({
    name: `Drive V1.1 QA ${stamp}`,
    code: `DRV11-${String(stamp).slice(-6)}`,
    description: "Automatikus Drive provisioning és többfájlos upload E2E",
    currentPhase: "DEV QA",
  }),
});
check("Project create HTTP 201", create.status === 201 && create.payload?.ok === true);
const projectId = create.payload?.project?.id;
check("Project ID returned", typeof projectId === "string" && projectId.startsWith("project-"));
check("Auto provisioning returned", create.payload?.driveProvisioning?.ok === true);
check("Auto provisioning ready", create.payload?.driveProvisioning?.ready === true);
check("Beérkező Drop returned", create.payload?.driveProvisioning?.incomingDropFolder?.name === "Beérkező Drop");
check("Provisioned folder count", Number(create.payload?.driveProvisioning?.folderCount || 0) >= 8);

const provisionGet = await api(`/api/projects/${projectId}/drive/provision`, { headers: headers() });
check("Provision GET 200", provisionGet.status === 200 && provisionGet.payload?.provisioning?.ready === true);
check("Provision GET incoming folder", provisionGet.payload?.provisioning?.incomingDropFolder?.name === "Beérkező Drop");
const incomingId = provisionGet.payload?.provisioning?.incomingDropFolder?.id;
check("Incoming folder ID", typeof incomingId === "string" && incomingId.length > 8);

const provisionRetry = await api(`/api/projects/${projectId}/drive/provision`, { method: "POST", headers: headers(true), body: "{}" });
check("Provision retry 200", provisionRetry.status === 200 && provisionRetry.payload?.provisioning?.ready === true);
check("Provision retry idempotent incoming", provisionRetry.payload?.provisioning?.incomingCreated === false && provisionRetry.payload?.provisioning?.incomingDropFolder?.id === incomingId);

const treeBefore = await api(`/api/projects/${projectId}/drive/tree`, { headers: headers() });
check("Drive tree 200", treeBefore.status === 200 && treeBefore.payload?.tree);
const incomingMatches = (treeBefore.payload.tree.folders || []).filter((folder) => folder.parentId === null && folder.name === "Beérkező Drop");
check("Exactly one incoming root folder", incomingMatches.length === 1);
check("Default project folders exist", ["01_Tervek", "02_Muszaki_dokumentumok", "05_Jegyzokonyvek"].every((name) => treeBefore.payload.tree.folders.some((folder) => folder.name === name)));

const manualName = `V110_QA_${String(stamp).slice(-5)}`;
const folderCreate = await api(`/api/projects/${projectId}/drive/folders`, {
  method: "POST",
  headers: headers(true),
  body: JSON.stringify({ name: manualName, parentId: incomingId }),
});
check("Manual folder create", folderCreate.status === 201 && folderCreate.payload?.ok === true);
const manualFolderId = folderCreate.payload?.folder?.id;
check("Manual folder ID", typeof manualFolderId === "string" && manualFolderId.length > 8);

const files = [
  { name: `v110-${stamp}-a.txt`, mime: "text/plain", body: Buffer.from(`DIMPRO Drive V1.1 A ${stamp}\n`) },
  { name: `v110-${stamp}-b.txt`, mime: "text/plain", body: Buffer.from(`DIMPRO Drive V1.1 B ${stamp}\n${randomBytes(32).toString("hex")}`) },
  { name: `v110-${stamp}-c.png`, mime: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlqZVQAAAAASUVORK5CYII=", "base64") },
];
const uploaded = await Promise.all(files.map((file) => uploadFile(projectId, manualFolderId, file.name, file.mime, file.body)));
check("Three upload results", uploaded.length === 3 && uploaded.every((item) => item?.document?.id));

const treeAfter = await api(`/api/projects/${projectId}/drive/tree`, { headers: headers() });
check("Drive tree after uploads 200", treeAfter.status === 200);
const names = new Set((treeAfter.payload?.tree?.documents || []).filter((doc) => doc.folderId === manualFolderId).map((doc) => doc.name));
check("All three files persisted in target folder", files.every((file) => names.has(file.name)), [...names].join(","));
check("Document count at least three", Number(treeAfter.payload?.tree?.summary?.documentCount || 0) >= 3);
check("Version count at least three", Number(treeAfter.payload?.tree?.summary?.versionCount || 0) >= 3);

const health = await api(`/api/projects/${projectId}/drive/health`, { headers: headers() });
check("Drive health 200", health.status === 200 && health.payload?.ok === true);
check("Drive object writes active", health.payload?.storage?.realObjectWriteEnabled === true);
check("Drive security ready", health.payload?.security?.ready === true);

console.log(JSON.stringify({
  ok: true,
  contract: "Drive Project Provisioning + Web Upload V1.1 runtime E2E",
  pass,
  projectId,
  incomingDropFolderId: incomingId,
  manualFolderId,
  uploadedDocumentIds: uploaded.map((item) => item.document.id),
  completedAt: new Date().toISOString(),
}, null, 2));
