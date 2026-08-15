import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const baseUrl = process.env.V240_E2E_BASE_URL?.trim() || "http://127.0.0.1:3220";
const projectId = "project-drive-compare-rc1-qa";
const actorUserId = "qa-drive-rc1";
const operatorRoot = "/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2";
const token = readFileSync(`${operatorRoot}/.dimprover/drive/dev-token.txt`, "utf8").trim();
const startedAt = new Date().toISOString();
const stamp = Date.now();
let pass = 0;

function check(name, condition) {
  assert.ok(condition, name);
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, "0")} ${name}`);
}

function authHeaders(json = false) {
  return {
    host: "app.dev.dimpro.hu",
    "x-dimpro-drive-dev-token": token,
    "x-dimpro-notification-user-id": actorUserId,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { status: response.status, ok: response.ok, payload };
}

function dbScalar(sql) {
  const result = spawnSync("psql", [
    "-w",
    "-h", "aws-0-eu-central-1.pooler.supabase.com",
    "-p", "5432",
    "-U", "postgres.pbgyuznivqvestuksvif",
    "-d", "postgres",
    "-X",
    "-v", "ON_ERROR_STOP=1",
    "-Atc", sql,
  ], { encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error("V2.4 E2E read-only DB probe failed.");
  return result.stdout.trim();
}

function safeId(value, label) {
  assert.match(value, /^[a-zA-Z0-9_-]+$/, `${label} unsafe for DB probe`);
  return value;
}

const issueListPath = `/api/projects/${projectId}/issues`;
const healthPath = `/api/projects/${projectId}/issues/health`;

const unauth = await api(healthPath, { headers: { host: "app.dev.dimpro.hu" } });
check("health unauthenticated is denied", unauth.status === 401);

const health = await api(healthPath, { headers: authHeaders() });
check("V0.4 health HTTP 200", health.status === 200);
check("V0.4 health version", health.payload?.version === "0.4.0");
check("V0.4 databaseReady", health.payload?.databaseReady === true && health.payload?.actualSchemaVersion === "0.4.0");

const issuesBefore = await api(issueListPath, { headers: authHeaders() });
check("issue list HTTP 200", issuesBefore.status === 200 && Array.isArray(issuesBefore.payload?.issues));
const issue = issuesBefore.payload.issues.find((item) => item.serial === "HJ-00002");
check("HJ-00002 exists", Boolean(issue?.id));
check("HJ-00002 is FIELD_CAPTURE", issue?.sourceType === "FIELD_CAPTURE");
check("HJ-00002 initial attachment counts are zero", Number(issue?.attachmentCount || 0) === 0 && Number(issue?.photoAttachmentCount || 0) === 0 && Number(issue?.planAttachmentCount || 0) === 0);
const issueId = safeId(issue.id, "issueId");

const treeBefore = await api(`/api/projects/${projectId}/drive/tree`, { headers: authHeaders() });
check("Drive tree HTTP 200", treeBefore.status === 200 && treeBefore.payload?.tree);
const folders = treeBefore.payload.tree.folders || [];
const targetFolder = folders.find((folder) => folder.name === "01_Tervek") || folders[0];
check("Drive upload target folder exists", Boolean(targetFolder?.id));
const planDocument = (treeBefore.payload.tree.documents || []).find((document) => document.currentVersion?.status === "AVAILABLE" && document.currentVersion?.mimeType === "application/pdf");
check("AVAILABLE PDF plan exists", Boolean(planDocument?.id && planDocument.currentVersion?.id));
const rejectedDocument = (treeBefore.payload.tree.documents || []).find((document) => document.currentVersion?.status === "REJECTED");
check("REJECTED Drive version exists", Boolean(rejectedDocument?.id && rejectedDocument.currentVersion?.id));

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlqZVQAAAAASUVORK5CYII=", "base64");
const pngSha = createHash("sha256").update(png).digest("hex");
const photoName = `V240_E2E_FieldPhoto_${stamp}.png`;
const init = await api(`/api/projects/${projectId}/drive/uploads/init`, {
  method: "POST",
  headers: authHeaders(true),
  body: JSON.stringify({
    folderId: targetFolder.id,
    documentName: photoName,
    originalName: photoName,
    mimeType: "image/png",
    sizeBytes: png.length,
    sha256: pngSha,
    revisionCode: "V1",
    description: "Project Issue V0.4 runtime E2E field photo",
    changeNote: "V0.4 E2E upload",
    source: "WEB",
  }),
});
check("Drive upload init 201", init.status === 201 && init.payload?.signedUpload?.url && init.payload?.completeUrl);

const signedPut = await fetch(init.payload.signedUpload.url, {
  method: init.payload.signedUpload.method || "PUT",
  headers: init.payload.signedUpload.headers || { "content-type": "image/png" },
  body: png,
});
check("signed S3 PUT success", signedPut.ok);

const complete = await api(init.payload.completeUrl, {
  method: "POST",
  headers: authHeaders(true),
  body: "{}",
});
check("Drive upload complete HTTP 200", complete.status === 200 && complete.payload?.ok === true);
const uploadedDocumentId = safeId(complete.payload?.document?.id || complete.payload?.session?.finalizedDocumentId || "", "uploadedDocumentId");
const uploadedVersionId = safeId(complete.payload?.version?.id || complete.payload?.session?.finalizedVersionId || "", "uploadedVersionId");
check("Drive document/version IDs returned", Boolean(uploadedDocumentId && uploadedVersionId));
check("server SHA-256 verified", complete.payload?.object?.checksumVerified === true && complete.payload?.object?.sha256 === pngSha);
check("uploaded version linkable", ["AVAILABLE", "QUARANTINED"].includes(complete.payload?.version?.status || complete.payload?.session?.finalVersionStatus));

const attachmentPath = `/api/projects/${projectId}/issues/${issueId}/attachments`;
const fieldPhotoA = `v240-e2e-photo-a-${stamp}`;
const fieldPhotoB = `v240-e2e-photo-b-${stamp}`;
const photoBodyA = {
  attachmentKind: "PHOTO",
  fieldAttachmentId: fieldPhotoA,
  relationType: "EVIDENCE",
  driveDocumentId: uploadedDocumentId,
  driveVersionId: uploadedVersionId,
  metadata: { e2e: true, phase: "photo-a", stamp },
};
const photoA = await api(attachmentPath, { method: "POST", headers: authHeaders(true), body: JSON.stringify(photoBodyA) });
check("PHOTO/EVIDENCE create 201", photoA.status === 201 && photoA.payload?.created === true && photoA.payload?.attachment?.version === 1);
const photoAttachmentAId = safeId(photoA.payload.attachment.id, "photoAttachmentAId");

const photoARepeat = await api(attachmentPath, { method: "POST", headers: authHeaders(true), body: JSON.stringify(photoBodyA) });
check("PHOTO idempotent repeat 200", photoARepeat.status === 200 && photoARepeat.payload?.created === false && photoARepeat.payload?.updated === false && photoARepeat.payload?.attachment?.version === 1);

const photoAUpdate = await api(attachmentPath, {
  method: "POST",
  headers: authHeaders(true),
  body: JSON.stringify({ ...photoBodyA, metadata: { e2e: true, phase: "photo-a-updated", note: "metadata update", stamp } }),
});
check("PHOTO metadata update increments version", photoAUpdate.status === 200 && photoAUpdate.payload?.updated === true && photoAUpdate.payload?.attachment?.version === 2);

const staleDelete = await api(`${attachmentPath}/${photoAttachmentAId}`, {
  method: "DELETE",
  headers: authHeaders(true),
  body: JSON.stringify({ expectedVersion: 1 }),
});
check("stale attachment unlink returns 409", staleDelete.status === 409 && staleDelete.payload?.code === "PROJECT_ISSUE_ATTACHMENT_VERSION_CONFLICT");

const photoB = await api(attachmentPath, {
  method: "POST",
  headers: authHeaders(true),
  body: JSON.stringify({ ...photoBodyA, fieldAttachmentId: fieldPhotoB, metadata: { e2e: true, phase: "photo-b", stamp } }),
});
check("second PHOTO same Drive document 201", photoB.status === 201 && photoB.payload?.created === true);
const photoAttachmentBId = safeId(photoB.payload.attachment.id, "photoAttachmentBId");

const evidenceLinkCountBefore = Number(dbScalar(`select count(*) from public.project_core_entity_links where project_id='${projectId}' and source_type='issue' and source_id='${issueId}' and target_type='document' and target_id='${uploadedDocumentId}' and relation_type='EVIDENCE';`));
check("shared PHOTO document has one graph link", evidenceLinkCountBefore === 1);

const deleteA = await api(`${attachmentPath}/${photoAttachmentAId}`, {
  method: "DELETE",
  headers: authHeaders(true),
  body: JSON.stringify({ expectedVersion: 2 }),
});
check("PHOTO A unlink success", deleteA.status === 200 && deleteA.payload?.ok === true);
const evidenceLinkCountAfterA = Number(dbScalar(`select count(*) from public.project_core_entity_links where project_id='${projectId}' and source_type='issue' and source_id='${issueId}' and target_type='document' and target_id='${uploadedDocumentId}' and relation_type='EVIDENCE';`));
check("graph link retained while PHOTO B remains", evidenceLinkCountAfterA === 1);

const deleteB = await api(`${attachmentPath}/${photoAttachmentBId}`, {
  method: "DELETE",
  headers: authHeaders(true),
  body: JSON.stringify({ expectedVersion: 1 }),
});
check("PHOTO B unlink success", deleteB.status === 200 && deleteB.payload?.ok === true);
const evidenceLinkCountAfterB = Number(dbScalar(`select count(*) from public.project_core_entity_links where project_id='${projectId}' and source_type='issue' and source_id='${issueId}' and target_type='document' and target_id='${uploadedDocumentId}' and relation_type='EVIDENCE';`));
check("graph link removed after final PHOTO unlink", evidenceLinkCountAfterB === 0);

const treeAfterPhotoUnlink = await api(`/api/projects/${projectId}/drive/tree`, { headers: authHeaders() });
const preservedDocument = treeAfterPhotoUnlink.payload?.tree?.documents?.find((document) => document.id === uploadedDocumentId);
check("Drive document remains after HJ unlink", Boolean(preservedDocument && preservedDocument.status !== "DELETED"));

const planBody = {
  attachmentKind: "PLAN",
  fieldAttachmentId: `v240-e2e-plan-${stamp}`,
  relationType: "ATTACHMENT",
  driveDocumentId: planDocument.id,
  driveVersionId: planDocument.currentVersion.id,
  metadata: { e2e: true, phase: "plan", pageNumber: 1, stamp },
};
const plan = await api(attachmentPath, { method: "POST", headers: authHeaders(true), body: JSON.stringify(planBody) });
check("PLAN/ATTACHMENT create 201", plan.status === 201 && plan.payload?.created === true && plan.payload?.attachment?.attachmentKind === "PLAN");
const planAttachmentId = safeId(plan.payload.attachment.id, "planAttachmentId");

const planRepeat = await api(attachmentPath, { method: "POST", headers: authHeaders(true), body: JSON.stringify(planBody) });
check("PLAN idempotent repeat 200", planRepeat.status === 200 && planRepeat.payload?.created === false && planRepeat.payload?.updated === false);

const issuesWithPlan = await api(issueListPath, { headers: authHeaders() });
const issueWithPlan = issuesWithPlan.payload?.issues?.find((item) => item.id === issueId);
check("central issue attachment counters update", Number(issueWithPlan?.attachmentCount) === 1 && Number(issueWithPlan?.photoAttachmentCount) === 0 && Number(issueWithPlan?.planAttachmentCount) === 1);

const unsafe = await api(attachmentPath, {
  method: "POST",
  headers: authHeaders(true),
  body: JSON.stringify({
    attachmentKind: "PLAN",
    fieldAttachmentId: `v240-e2e-unsafe-${stamp}`,
    relationType: "ATTACHMENT",
    driveDocumentId: rejectedDocument.id,
    driveVersionId: rejectedDocument.currentVersion.id,
    metadata: { e2e: true, phase: "unsafe", stamp },
  }),
});
check("REJECTED Drive version blocked 409", unsafe.status === 409 && unsafe.payload?.code === "PROJECT_ISSUE_ATTACHMENT_VERSION_UNSAFE");

const deletePlan = await api(`${attachmentPath}/${planAttachmentId}`, {
  method: "DELETE",
  headers: authHeaders(true),
  body: JSON.stringify({ expectedVersion: 1 }),
});
check("PLAN unlink success", deletePlan.status === 200 && deletePlan.payload?.ok === true);

const attachmentsFinal = await api(attachmentPath, { headers: authHeaders() });
check("HJ active attachment list restored empty", attachmentsFinal.status === 200 && Array.isArray(attachmentsFinal.payload?.attachments) && attachmentsFinal.payload.attachments.length === 0);
const issuesFinal = await api(issueListPath, { headers: authHeaders() });
const issueFinal = issuesFinal.payload?.issues?.find((item) => item.id === issueId);
check("central attachment counters restored zero", Number(issueFinal?.attachmentCount || 0) === 0 && Number(issueFinal?.photoAttachmentCount || 0) === 0 && Number(issueFinal?.planAttachmentCount || 0) === 0);

const auditJson = dbScalar(`select json_build_object('linked',count(*) filter (where event_type='PROJECT_ISSUE_ATTACHMENT_LINKED'),'updated',count(*) filter (where event_type='PROJECT_ISSUE_ATTACHMENT_UPDATED'),'unlinked',count(*) filter (where event_type='PROJECT_ISSUE_ATTACHMENT_UNLINKED'))::text from public.project_core_audit_events where project_id='${projectId}' and entity_type='issue' and entity_id='${issueId}' and created_at >= '${startedAt}'::timestamptz and event_type like 'PROJECT_ISSUE_ATTACHMENT_%';`);
const audit = JSON.parse(auditJson);
check("attachment audit linked events", Number(audit.linked) === 3);
check("attachment audit updated event", Number(audit.updated) === 1);
check("attachment audit unlinked events", Number(audit.unlinked) === 3);

console.log(JSON.stringify({
  ok: true,
  contract: "Field Issue Attachments V2.4 runtime E2E",
  pass,
  projectId,
  issueSerial: issue.serial,
  uploadedPhotoDocumentId: uploadedDocumentId,
  uploadedPhotoVersionId: uploadedVersionId,
  planDocumentId: planDocument.id,
  rejectedDocumentId: rejectedDocument.id,
  audit,
  startedAt,
  completedAt: new Date().toISOString(),
}, null, 2));
