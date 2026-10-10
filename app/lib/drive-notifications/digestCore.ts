import type { DriveChangeEvent } from "@/app/lib/drive-core/types";

/** Only authoritative business events may create digest entries; metadata edits must not. */
export type DigestCategory = "DOCUMENT_CHANGES" | "APPROVAL_DECISIONS";
export type DigestKind = "NEW_DOCUMENT" | "NEW_VERSION" | "NEW_REVISION" | "REVIEW_DECISION" | "FORMAL_ISSUE";

export type DigestItem = {
  eventId: string;
  sequence: number;
  projectId: string;
  documentId: string;
  occurredAt: string;
  actorUserId: string;
  kind: DigestKind;
  category: DigestCategory;
};

const KNOWN_EVENTS: Record<string, { kind: DigestKind; category: DigestCategory }> = {
  DOCUMENT_UPLOADED: { kind: "NEW_DOCUMENT", category: "DOCUMENT_CHANGES" },
  DOCUMENT_VERSION_UPLOADED: { kind: "NEW_VERSION", category: "DOCUMENT_CHANGES" },
  DOCUMENT_VERSION_CREATED: { kind: "NEW_VERSION", category: "DOCUMENT_CHANGES" },
  DOCUMENT_REVISION_UPLOADED: { kind: "NEW_REVISION", category: "DOCUMENT_CHANGES" },
  DOCUMENT_REVISION_CREATED: { kind: "NEW_REVISION", category: "DOCUMENT_CHANGES" },
  DOCUMENT_MARKED_VALID: { kind: "REVIEW_DECISION", category: "APPROVAL_DECISIONS" },
  DOCUMENT_MARKED_REJECTED: { kind: "REVIEW_DECISION", category: "APPROVAL_DECISIONS" },
  DOCUMENT_VERSION_ISSUED: { kind: "FORMAL_ISSUE", category: "APPROVAL_DECISIONS" },
  DOCUMENT_REVIEW_DECISION_CHANGED: { kind: "REVIEW_DECISION", category: "APPROVAL_DECISIONS" },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeText(value: unknown): string {
  return typeof value === "string" && value.length <= 180 ? value : "";
}

function extractDocumentId(event: DriveChangeEvent): string {
  const payload = asRecord(event.payload);
  const document = asRecord(payload.document);
  const version = asRecord(payload.version);
  const governance = asRecord(payload.governance);
  return safeText(payload.documentId) || safeText(payload.document_id)
    || safeText(document.id) || safeText(version.document_id)
    || safeText(version.documentId) || safeText(governance.document_id);
}

/** Returns null on an unknown event, missing document identity or unsupported metadata-only change. */
export function classifyDriveChange(event: DriveChangeEvent): DigestItem | null {
  const definition = KNOWN_EVENTS[event.eventType];
  if (!definition || event.entityType !== "document" && event.entityType !== "document_version") return null;
  const documentId = extractDocumentId(event) || (event.entityType === "document" ? event.entityId : "");
  if (!documentId || !event.projectId || !event.id || !Number.isSafeInteger(event.sequence)) return null;
  return {
    eventId: event.id, sequence: event.sequence, projectId: event.projectId,
    documentId, occurredAt: event.createdAt, actorUserId: event.actorUserId,
    ...definition,
  };
}

export type DigestRecipientScope = {
  userId: string;
  projectId: string;
  visibleDocumentIds: ReadonlySet<string>;
  /** Must be evaluated for each recipient on dispatch, independently from document.read. */
  approvalDocumentIds: ReadonlySet<string>;
  enabledCategories: ReadonlySet<DigestCategory>;
  followedDocumentIds?: ReadonlySet<string>;
  followedOnly?: boolean;
};

export function buildRecipientDigest(changes: readonly DriveChangeEvent[], scope: DigestRecipientScope): DigestItem[] {
  const eventIds = new Set<string>();
  return changes
    .map(classifyDriveChange)
    .filter((item): item is DigestItem => item !== null)
    .filter((item) => {
      if (item.projectId !== scope.projectId || !scope.enabledCategories.has(item.category)) return false;
      if (!scope.visibleDocumentIds.has(item.documentId)) return false;
      if (item.category === "APPROVAL_DECISIONS" && !scope.approvalDocumentIds.has(item.documentId)) return false;
      if (scope.followedOnly && !scope.followedDocumentIds?.has(item.documentId)) return false;
      if (eventIds.has(item.eventId)) return false;
      eventIds.add(item.eventId);
      return true;
    }).sort((a, b) => a.sequence - b.sequence);
}

/** No e-mail HTML may contain unescaped names or externally sourced metadata. */
export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] || char);
}

const kindLabels: Record<DigestKind, string> = {
  NEW_DOCUMENT: "Új dokumentum",
  NEW_VERSION: "Új verzió",
  NEW_REVISION: "Új revízió",
  REVIEW_DECISION: "Tervellenőrzési döntés",
  FORMAL_ISSUE: "Hivatalos kiadás",
};

export function renderDigestHtml(input: {
  projectTitle: string;
  periodLabel: string;
  items: readonly DigestItem[];
  /** Pre-filtered, ACL-approved document names only. */
  namesByDocumentId: ReadonlyMap<string, string>;
}) {
  const items = input.items.filter((event) => input.namesByDocumentId.has(event.documentId));
  if (!items.length) return null; // empty digest must never be sent
  const rows = items.map((event) => `<tr><td style="padding:9px;border-bottom:1px solid #e0e8ed">${escapeEmailHtml(kindLabels[event.kind])}</td><td style="padding:9px;border-bottom:1px solid #e0e8ed">${escapeEmailHtml(input.namesByDocumentId.get(event.documentId) || "")}</td></tr>`).join("");
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"></head><body style="margin:0;background:#f3f7fa;font-family:Arial,sans-serif;color:#193349">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f7fa"><tr><td align="center" style="padding:24px">
  <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid #dae5eb">
  <tr><td style="background:#102d47;color:#fff;padding:24px;font-weight:bold;font-size:20px">DIMPRO <span style="color:#50d7ce">DRIVE</span></td></tr>
  <tr><td style="padding:20px"><strong>${escapeEmailHtml(input.projectTitle)}</strong><p style="color:#5b7282">${escapeEmailHtml(input.periodLabel)}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  <p style="color:#5b7282;font-size:12px">Ez az összesítő kizárólag az Ön számára engedélyezett dokumentumváltozásokat tartalmazza.</p></td></tr>
  </table></td></tr></table></body></html>`;
}
