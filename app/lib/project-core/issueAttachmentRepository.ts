import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ProjectIssueRepositoryError } from "./issueRepository";

export type ProjectIssueAttachmentKind = "PHOTO" | "PLAN" | "DOCUMENT";
export type ProjectIssueAttachmentRelation = "EVIDENCE" | "ATTACHMENT";

export type ProjectIssueAttachment = {
  id: string;
  projectId: string;
  issueId: string;
  attachmentKind: ProjectIssueAttachmentKind;
  fieldAttachmentId: string;
  relationType: ProjectIssueAttachmentRelation;
  driveDocumentId: string;
  driveVersionId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  metadata: Record<string, unknown>;
  version: number;
  createdBy: string;
  createdByName: string;
  updatedBy: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
};

type DbAttachment = {
  id: string;
  project_id: string;
  issue_id: string;
  attachment_kind: ProjectIssueAttachmentKind;
  field_attachment_id: string;
  relation_type: ProjectIssueAttachmentRelation;
  drive_document_id: string;
  drive_version_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number | string;
  sha256: string | null;
  metadata: Record<string, unknown> | null;
  version: number;
  created_by: string;
  created_by_name: string;
  updated_by: string;
  updated_by_name: string;
  created_at: string;
  updated_at: string;
};

type DbLink = {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relation_type: string;
  created_at: string;
  created_by: string;
};

const ATTACHMENT_KINDS: ProjectIssueAttachmentKind[] = ["PHOTO", "PLAN", "DOCUMENT"];
const RELATION_TYPES: ProjectIssueAttachmentRelation[] = ["EVIDENCE", "ATTACHMENT"];

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) {
    throw new ProjectIssueRepositoryError("A Project Issue Core szerveroldali Supabase-kapcsolata nincs beállítva.", "PROJECT_ISSUE_DATABASE_NOT_CONFIGURED", 503);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-project-issue-attachments/0.4.0" } },
  });
}

function mapAttachment(row: DbAttachment): ProjectIssueAttachment {
  return {
    id: row.id,
    projectId: row.project_id,
    issueId: row.issue_id,
    attachmentKind: row.attachment_kind,
    fieldAttachmentId: row.field_attachment_id,
    relationType: row.relation_type,
    driveDocumentId: row.drive_document_id,
    driveVersionId: row.drive_version_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    sha256: row.sha256,
    metadata: row.metadata || {},
    version: Number(row.version),
    createdBy: row.created_by,
    createdByName: row.created_by_name || "",
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeMetadata(value: unknown) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ProjectIssueRepositoryError("A HJ melléklet metadata mezőjének objektumnak kell lennie.", "PROJECT_ISSUE_ATTACHMENT_METADATA_INVALID", 400);
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > 30000) {
    throw new ProjectIssueRepositoryError("A HJ melléklet metadata mezője túl nagy.", "PROJECT_ISSUE_ATTACHMENT_METADATA_TOO_LARGE", 400);
  }
  return value as Record<string, unknown>;
}

function normalizeAttachmentInput(input: Record<string, unknown>) {
  const attachmentKind = typeof input.attachmentKind === "string" ? input.attachmentKind.trim().toUpperCase() as ProjectIssueAttachmentKind : "" as ProjectIssueAttachmentKind;
  if (!ATTACHMENT_KINDS.includes(attachmentKind)) {
    throw new ProjectIssueRepositoryError("Érvénytelen HJ melléklettípus.", "PROJECT_ISSUE_ATTACHMENT_KIND_INVALID", 400);
  }
  const relationType = (typeof input.relationType === "string" && input.relationType.trim()
    ? input.relationType.trim().toUpperCase()
    : attachmentKind === "PHOTO" ? "EVIDENCE" : "ATTACHMENT") as ProjectIssueAttachmentRelation;
  if (!RELATION_TYPES.includes(relationType)) {
    throw new ProjectIssueRepositoryError("Érvénytelen HJ melléklet-kapcsolattípus.", "PROJECT_ISSUE_ATTACHMENT_RELATION_INVALID", 400);
  }
  const fieldAttachmentId = typeof input.fieldAttachmentId === "string" ? input.fieldAttachmentId.trim().slice(0, 240) : "";
  if (!fieldAttachmentId) {
    throw new ProjectIssueRepositoryError("A terepi mellékletazonosító kötelező.", "PROJECT_ISSUE_ATTACHMENT_FIELD_ID_INVALID", 400);
  }
  const driveDocumentId = typeof input.driveDocumentId === "string" ? input.driveDocumentId.trim().slice(0, 240) : "";
  const driveVersionId = typeof input.driveVersionId === "string" ? input.driveVersionId.trim().slice(0, 240) : "";
  if (!driveDocumentId || !driveVersionId) {
    throw new ProjectIssueRepositoryError("A HJ melléklethez Drive dokumentum- és verzióazonosító szükséges.", "PROJECT_ISSUE_ATTACHMENT_DRIVE_REFERENCE_REQUIRED", 400);
  }
  return {
    attachmentKind,
    fieldAttachmentId,
    relationType,
    driveDocumentId,
    driveVersionId,
    metadata: normalizeMetadata(input.metadata),
  };
}

function attachmentDbError(message: string, error: unknown): never {
  const candidate = error as { code?: string; message?: string; details?: string } | null;
  const text = `${candidate?.message || ""} ${candidate?.details || ""}`;
  const mappings: Array<[string, string, number, string]> = [
    ["PROJECT_ISSUE_NOT_FOUND", "PROJECT_ISSUE_NOT_FOUND", 404, "A hibajegy nem található vagy már archivált."],
    ["PROJECT_ISSUE_ATTACHMENT_NOT_FOUND", "PROJECT_ISSUE_ATTACHMENT_NOT_FOUND", 404, "A HJ mellékletkapcsolat nem található."],
    ["PROJECT_ISSUE_ATTACHMENT_VERSION_CONFLICT", "PROJECT_ISSUE_ATTACHMENT_VERSION_CONFLICT", 409, "A HJ mellékletkapcsolat közben módosult. Frissítsd az adatokat."],
    ["PROJECT_ISSUE_ATTACHMENT_KIND_INVALID", "PROJECT_ISSUE_ATTACHMENT_KIND_INVALID", 400, "Érvénytelen HJ melléklettípus."],
    ["PROJECT_ISSUE_ATTACHMENT_RELATION_INVALID", "PROJECT_ISSUE_ATTACHMENT_RELATION_INVALID", 400, "Érvénytelen HJ melléklet-kapcsolattípus."],
    ["PROJECT_ISSUE_ATTACHMENT_FIELD_ID_INVALID", "PROJECT_ISSUE_ATTACHMENT_FIELD_ID_INVALID", 400, "Érvénytelen terepi mellékletazonosító."],
    ["PROJECT_ISSUE_ATTACHMENT_DRIVE_REFERENCE_REQUIRED", "PROJECT_ISSUE_ATTACHMENT_DRIVE_REFERENCE_REQUIRED", 400, "A Drive dokumentum- és verzióazonosító kötelező."],
    ["PROJECT_ISSUE_ATTACHMENT_METADATA_INVALID", "PROJECT_ISSUE_ATTACHMENT_METADATA_INVALID", 400, "A HJ melléklet metadata mezője hibás."],
    ["PROJECT_ISSUE_ATTACHMENT_DOCUMENT_NOT_FOUND", "PROJECT_ISSUE_ATTACHMENT_DOCUMENT_NOT_FOUND", 404, "A kapcsolandó Drive dokumentum nem található ebben a projektben."],
    ["PROJECT_ISSUE_ATTACHMENT_VERSION_NOT_FOUND", "PROJECT_ISSUE_ATTACHMENT_VERSION_NOT_FOUND", 404, "A kapcsolandó Drive dokumentumverzió nem található."],
    ["PROJECT_ISSUE_ATTACHMENT_VERSION_UNSAFE", "PROJECT_ISSUE_ATTACHMENT_VERSION_UNSAFE", 409, "Elutasított vagy nem biztonságos Drive-verzió nem kapcsolható HJ mellékletként."],
  ];
  for (const [needle, code, status, userMessage] of mappings) {
    if (text.includes(needle)) throw new ProjectIssueRepositoryError(userMessage, code, status);
  }
  const missing = candidate?.code === "PGRST205" || candidate?.code === "42P01" || candidate?.code === "42883";
  throw new ProjectIssueRepositoryError(
    missing ? "A Project Issue Core V0.4 mellékletsémája még nincs alkalmazva." : message,
    missing ? "PROJECT_ISSUE_ATTACHMENT_SCHEMA_NOT_READY" : candidate?.code || "PROJECT_ISSUE_ATTACHMENT_DATABASE_ERROR",
    missing ? 503 : 500,
  );
}

export async function listProjectIssueAttachments(projectId: string, issueId: string) {
  const client = getClient();
  const result = await client.from("project_issue_attachments").select("*")
    .eq("project_id", projectId).eq("issue_id", issueId).is("deleted_at", null)
    .order("created_at", { ascending: true }).limit(500);
  if (result.error) attachmentDbError("A HJ mellékletei nem tölthetők be.", result.error);
  return { ok: true as const, attachments: ((result.data || []) as DbAttachment[]).map(mapAttachment) };
}

export async function linkProjectIssueAttachment(projectId: string, issueId: string, input: Record<string, unknown>, actorUserId: string, actorName: string) {
  const normalized = normalizeAttachmentInput(input);
  const client = getClient();
  const result = await client.rpc("project_issue_attachment_link_atomic", {
    p_project_id: projectId,
    p_issue_id: issueId,
    p_attachment: normalized,
    p_actor_user_id: actorUserId,
    p_actor_name: actorName,
  });
  if (result.error) attachmentDbError("A HJ melléklet kapcsolása sikertelen.", result.error);
  const payload = result.data as { attachment?: DbAttachment; link?: DbLink; created?: boolean; updated?: boolean } | null;
  if (!payload?.attachment?.id) {
    throw new ProjectIssueRepositoryError("A HJ mellékletkapcsolat létrejöttét a szerver nem tudta visszaigazolni.", "PROJECT_ISSUE_ATTACHMENT_RESPONSE_INVALID", 500);
  }
  return {
    ok: true as const,
    attachment: mapAttachment(payload.attachment),
    link: payload.link || null,
    created: Boolean(payload.created),
    updated: Boolean(payload.updated),
  };
}

export async function unlinkProjectIssueAttachment(projectId: string, issueId: string, attachmentId: string, expectedVersion: number, actorUserId: string, actorName: string) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new ProjectIssueRepositoryError("A leválasztáshoz érvényes expectedVersion szükséges.", "PROJECT_ISSUE_ATTACHMENT_EXPECTED_VERSION_REQUIRED", 400);
  }
  const client = getClient();
  const result = await client.rpc("project_issue_attachment_unlink_atomic", {
    p_project_id: projectId,
    p_issue_id: issueId,
    p_attachment_id: attachmentId,
    p_expected_version: expectedVersion,
    p_actor_user_id: actorUserId,
    p_actor_name: actorName,
  });
  if (result.error) attachmentDbError("A HJ mellékletkapcsolat megszüntetése sikertelen.", result.error);
  if (!result.data) throw new ProjectIssueRepositoryError("A HJ melléklet leválasztását a szerver nem tudta visszaigazolni.", "PROJECT_ISSUE_ATTACHMENT_UNLINK_RESPONSE_INVALID", 500);
  return { ok: true as const, attachment: mapAttachment(result.data as DbAttachment) };
}
