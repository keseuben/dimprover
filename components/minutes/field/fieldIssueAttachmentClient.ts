export type FieldDriveFolder = {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  path: string;
};

export type FieldDriveVersion = {
  id: string;
  versionNumber: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
};

export type FieldDriveDocument = {
  id: string;
  projectId: string;
  folderId: string;
  name: string;
  status: string;
  currentVersionNumber: number;
  currentVersion: FieldDriveVersion | null;
};

export type FieldDriveTree = {
  projectId: string;
  folders: FieldDriveFolder[];
  documents: FieldDriveDocument[];
};

export type CoreIssueAttachment = {
  id: string;
  projectId: string;
  issueId: string;
  attachmentKind: "PHOTO" | "PLAN" | "DOCUMENT";
  fieldAttachmentId: string;
  relationType: "EVIDENCE" | "ATTACHMENT";
  driveDocumentId: string;
  driveVersionId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  metadata: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type UploadInitPayload = {
  ok?: boolean;
  error?: string;
  signedUpload?: { method: "PUT"; url: string; headers: Record<string, string>; expiresAt: string };
  completeUrl?: string;
  abortUrl?: string;
};

type UploadCompletePayload = {
  ok?: boolean;
  error?: string;
  document?: { id?: string; currentVersionNumber?: number };
  version?: { id?: string; versionNumber?: number; status?: string; mimeType?: string; sizeBytes?: number };
  session?: { finalizedDocumentId?: string | null; finalizedVersionId?: string | null; finalVersionStatus?: string };
  securityScan?: { ok?: boolean; error?: string; code?: string; scan?: { status?: string; engine?: string | null; engineVersion?: string | null } };
};

export async function loadFieldDriveTree(projectId: string): Promise<FieldDriveTree> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/tree`, { credentials: "same-origin", cache: "no-store" });
  const payload = await response.json() as { ok?: boolean; error?: string; tree?: FieldDriveTree };
  if (!response.ok || !payload.ok || !payload.tree) throw new Error(payload.error || "A projekt Drive dokumentumtára nem tölthető be.");
  return payload.tree;
}

async function createDriveFolder(projectId: string, name: string, parentId: string | null) {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/folders`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, parentId }),
  });
  const payload = await response.json() as { ok?: boolean; error?: string; folder?: FieldDriveFolder };
  if (!response.ok || !payload.ok || !payload.folder) throw new Error(payload.error || `A Drive mappa nem hozható létre: ${name}`);
  return payload.folder;
}

export async function ensureFieldIssueDriveFolder(projectId: string, issueSerial: string) {
  let tree = await loadFieldDriveTree(projectId);
  let root = tree.folders.find((folder) => folder.parentId === null && folder.name === "Terepi HJ") || null;
  if (!root) {
    try {
      root = await createDriveFolder(projectId, "Terepi HJ", null);
    } catch {
      tree = await loadFieldDriveTree(projectId);
      root = tree.folders.find((folder) => folder.parentId === null && folder.name === "Terepi HJ") || null;
      if (!root) throw new Error("A Terepi HJ Drive gyökérmappa nem hozható létre.");
    }
  }

  tree = await loadFieldDriveTree(projectId);
  let issueFolder = tree.folders.find((folder) => folder.parentId === root!.id && folder.name === issueSerial) || null;
  if (!issueFolder) {
    try {
      issueFolder = await createDriveFolder(projectId, issueSerial, root.id);
    } catch {
      tree = await loadFieldDriveTree(projectId);
      issueFolder = tree.folders.find((folder) => folder.parentId === root!.id && folder.name === issueSerial) || null;
      if (!issueFolder) throw new Error(`A ${issueSerial} Drive mappa nem hozható létre.`);
    }
  }
  return issueFolder;
}

export async function dataUrlToFieldFile(dataUrl: string, fileName: string, fallbackMime = "image/jpeg") {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("A terepi kép nem alakítható feltölthető fájllá.");
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || fallbackMime, lastModified: Date.now() });
}

export async function objectUrlToFieldFile(url: string, fileName: string, fallbackMime = "application/octet-stream") {
  const response = await fetch(url);
  if (!response.ok) throw new Error("A terepi tervfájl nem olvasható vissza a helyi munkamenetből.");
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || fallbackMime, lastModified: Date.now() });
}

export async function uploadFieldFileToDrive(input: {
  projectId: string;
  file: File;
  folderId?: string | null;
  documentId?: string | null;
  expectedCurrentVersion?: number;
  documentName: string;
  description: string;
  changeNote: string;
}) {
  let abortUrl = "";
  try {
    const initResponse = await fetch(`/api/projects/${encodeURIComponent(input.projectId)}/drive/uploads/init`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        folderId: input.folderId || undefined,
        documentId: input.documentId || undefined,
        expectedCurrentVersion: input.expectedCurrentVersion || 0,
        documentName: input.documentName,
        originalName: input.file.name,
        mimeType: input.file.type || "application/octet-stream",
        sizeBytes: input.file.size,
        revisionCode: input.documentId ? `V${Math.max(2, (input.expectedCurrentVersion || 1) + 1)}` : "V1",
        description: input.description,
        changeNote: input.changeNote,
        source: "WEB",
      }),
    });
    const initialized = await initResponse.json() as UploadInitPayload;
    if (!initResponse.ok || !initialized.ok || !initialized.signedUpload || !initialized.completeUrl) {
      throw new Error(initialized.error || "A Drive feltöltési munkamenet nem hozható létre.");
    }
    abortUrl = initialized.abortUrl || "";

    const objectResponse = await fetch(initialized.signedUpload.url, {
      method: initialized.signedUpload.method,
      headers: initialized.signedUpload.headers,
      body: input.file,
    });
    if (!objectResponse.ok) throw new Error(`A privát Drive tárhely feltöltése sikertelen (${objectResponse.status}).`);

    const completeResponse = await fetch(initialized.completeUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const completed = await completeResponse.json() as UploadCompletePayload;
    if (!completeResponse.ok || !completed.ok) throw new Error(completed.error || "A Drive feltöltés véglegesítése sikertelen.");
    const documentId = completed.document?.id || completed.session?.finalizedDocumentId || "";
    const versionId = completed.version?.id || completed.session?.finalizedVersionId || "";
    if (!documentId || !versionId) throw new Error("A Drive feltöltésből nem érkezett dokumentum- vagy verzióazonosító.");
    return {
      documentId,
      versionId,
      versionNumber: Number(completed.version?.versionNumber || completed.document?.currentVersionNumber || 1),
      versionStatus: completed.version?.status || completed.session?.finalVersionStatus || "QUARANTINED",
      securityStatus: completed.securityScan?.scan?.status || (completed.securityScan?.ok === false ? "ERROR" : "PENDING"),
      securityMessage: completed.securityScan?.error || completed.securityScan?.code || "",
    };
  } catch (error) {
    if (abortUrl) {
      await fetch(abortUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Terepi HJ melléklet kliensoldali feltöltése megszakadt." }),
      }).catch(() => undefined);
    }
    throw error;
  }
}

export async function linkFieldIssueAttachment(input: {
  projectId: string;
  issueId: string;
  attachmentKind: "PHOTO" | "PLAN" | "DOCUMENT";
  fieldAttachmentId: string;
  relationType?: "EVIDENCE" | "ATTACHMENT";
  driveDocumentId: string;
  driveVersionId: string;
  metadata: Record<string, unknown>;
}) {
  const response = await fetch(`/api/projects/${encodeURIComponent(input.projectId)}/issues/${encodeURIComponent(input.issueId)}/attachments`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as { ok?: boolean; error?: string; code?: string; attachment?: CoreIssueAttachment; created?: boolean; updated?: boolean };
  const attachment = payload.attachment;
  if (!response.ok || !payload.ok || !attachment) throw new Error(payload.error || "A HJ mellékletkapcsolat mentése sikertelen.");
  return { ok: true as const, attachment, created: Boolean(payload.created), updated: Boolean(payload.updated) };
}

export async function unlinkFieldIssueAttachment(input: { projectId: string; issueId: string; attachmentId: string; expectedVersion: number }) {
  const response = await fetch(`/api/projects/${encodeURIComponent(input.projectId)}/issues/${encodeURIComponent(input.issueId)}/attachments/${encodeURIComponent(input.attachmentId)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: input.expectedVersion }),
  });
  const payload = await response.json() as { ok?: boolean; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error || "A HJ mellékletkapcsolat leválasztása sikertelen.");
  return true;
}
