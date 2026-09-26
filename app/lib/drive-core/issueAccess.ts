import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DriveCoreRepositoryError } from "./errors";
import { createDriveSignedGetUrl } from "./s3ObjectStorage";

const TOKEN_VERSION = 1;
const DEFAULT_TTL_HOURS = 7 * 24;
const MAX_TTL_HOURS = 30 * 24;

type DbRecipient = {
  id: string;
  project_id: string;
  issue_id: string;
  recipient_type: "PROJECT_MEMBER" | "EMAIL";
  user_id: string | null;
  email: string | null;
  name: string;
  organization: string;
  permission: "DOWNLOAD";
  access_expires_at: string | null;
  downloaded_at: string | null;
};

type DbIssue = {
  id: string;
  project_id: string;
  document_id: string;
  version_id: string;
  issue_number: string;
  status: "ISSUED" | "WITHDRAWN" | "SUPERSEDED";
  issued_at: string;
};

type DbGovernance = {
  version_id: string;
  business_status: string | null;
  issue_status: string;
};

type DbVersion = {
  id: string;
  project_id: string;
  document_id: string;
  original_name: string;
  mime_type: string;
  storage_provider: string;
  storage_bucket: string | null;
  storage_key: string | null;
  status: string;
};

type DbDocument = {
  id: string;
  name: string;
};

function db(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) {
    throw new DriveCoreRepositoryError(
      "A DRIVE kiadási link adatbázis-kapcsolata nincs konfigurálva.",
      "DRIVE_ISSUE_ACCESS_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-drive-issue-access/0.1.0" } },
  });
}

function baseSecret() {
  const value = (
    process.env.DIMPRO_DRIVE_ISSUE_LINK_SECRET?.trim()
    || process.env.DROP_SESSION_SECRET?.trim()
    || ""
  );
  if (value.length < 32 || value.includes("<") || value.includes(">")) {
    throw new DriveCoreRepositoryError(
      "A DRIVE kiadási link aláíró kulcsa nincs konfigurálva.",
      "DRIVE_ISSUE_ACCESS_SECRET_NOT_CONFIGURED",
      503,
    );
  }
  return value;
}

function signingKey() {
  return createHmac("sha256", baseSecret())
    .update("dimpro-drive-issue-access-v1", "utf8")
    .digest();
}

function ttlHours() {
  const parsed = Number(process.env.DIMPRO_DRIVE_ISSUE_LINK_TTL_HOURS || DEFAULT_TTL_HOURS);
  if (!Number.isFinite(parsed)) return DEFAULT_TTL_HOURS;
  return Math.max(1, Math.min(MAX_TTL_HOURS, Math.floor(parsed)));
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(payload: string) {
  return createHmac("sha256", signingKey()).update(payload, "utf8").digest("base64url");
}

function encodeToken(recipientId: string, expiresAtSeconds: number) {
  const payload = Buffer.from(JSON.stringify({
    v: TOKEN_VERSION,
    r: recipientId,
    e: expiresAtSeconds,
  }), "utf8").toString("base64url");
  return payload + "." + sign(payload);
}

function decodeToken(token: string) {
  const parts = token.trim().split(".");
  const payload = parts[0] || "";
  const signature = parts[1] || "";
  if (parts.length !== 2 || !payload || !signature || payload.length > 1024 || signature.length > 128) {
    throw new DriveCoreRepositoryError("Érvénytelen kiadási hozzáférési link.", "DRIVE_ISSUE_ACCESS_TOKEN_INVALID", 401);
  }
  const expected = sign(payload);
  if (!safeEqual(signature, expected)) {
    throw new DriveCoreRepositoryError("Érvénytelen kiadási hozzáférési link.", "DRIVE_ISSUE_ACCESS_TOKEN_INVALID", 401);
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new DriveCoreRepositoryError("Érvénytelen kiadási hozzáférési link.", "DRIVE_ISSUE_ACCESS_TOKEN_INVALID", 401);
  }
  const row = decoded as { v?: unknown; r?: unknown; e?: unknown };
  const recipientId = typeof row.r === "string" ? row.r.trim() : "";
  const expiresAtSeconds = Number(row.e);
  if (
    row.v !== TOKEN_VERSION
    || !/^[a-zA-Z0-9_-]{8,200}$/.test(recipientId)
    || !Number.isFinite(expiresAtSeconds)
  ) {
    throw new DriveCoreRepositoryError("Érvénytelen kiadási hozzáférési link.", "DRIVE_ISSUE_ACCESS_TOKEN_INVALID", 401);
  }
  if (expiresAtSeconds <= Math.floor(Date.now() / 1000)) {
    throw new DriveCoreRepositoryError("A kiadási hozzáférési link lejárt.", "DRIVE_ISSUE_ACCESS_TOKEN_EXPIRED", 410);
  }
  return { recipientId, expiresAtSeconds };
}

function publicOrigin(origin: string) {
  const url = new URL(origin);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new DriveCoreRepositoryError("A kiadási link csak HTTPS eredetről készíthető.", "DRIVE_ISSUE_ACCESS_ORIGIN_INVALID", 500);
  }
  return url.origin;
}

export type DriveIssueAccessLink = {
  recipientId: string;
  email: string | null;
  name: string;
  organization: string;
  url: string;
  expiresAt: string;
};

export async function createDriveIssueAccessLinks(input: {
  projectId: string;
  issueId: string;
  origin: string;
}) {
  const client = db();
  const result = await client
    .from("drive_core_document_issue_recipients")
    .select("id,project_id,issue_id,recipient_type,user_id,email,name,organization,permission,access_expires_at,downloaded_at")
    .eq("project_id", input.projectId)
    .eq("issue_id", input.issueId)
    .eq("permission", "DOWNLOAD")
    .order("created_at", { ascending: true });
  if (result.error) {
    throw new DriveCoreRepositoryError(
      "A kiadási címzettek nem tölthetők be.",
      result.error.code || "DRIVE_ISSUE_ACCESS_RECIPIENT_QUERY_FAILED",
      500,
    );
  }
  const recipients = (result.data || []) as DbRecipient[];
  if (!recipients.length) {
    throw new DriveCoreRepositoryError(
      "A kiadáshoz nincs letöltésre jogosult címzett.",
      "DRIVE_ISSUE_ACCESS_RECIPIENT_NOT_FOUND",
      404,
    );
  }
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + ttlHours() * 60 * 60;
  const expiresAt = new Date(expiresAtSeconds * 1000).toISOString();
  const ids = recipients.map((item) => item.id);
  const update = await client
    .from("drive_core_document_issue_recipients")
    .update({ access_expires_at: expiresAt })
    .in("id", ids)
    .eq("project_id", input.projectId)
    .eq("issue_id", input.issueId);
  if (update.error) {
    throw new DriveCoreRepositoryError(
      "A kiadási link lejárata nem menthető.",
      update.error.code || "DRIVE_ISSUE_ACCESS_EXPIRY_UPDATE_FAILED",
      500,
    );
  }
  const origin = publicOrigin(input.origin);
  return {
    expiresAt,
    links: recipients.map((recipient) => {
      const token = encodeToken(recipient.id, expiresAtSeconds);
      const url = new URL("/kiadas", origin);
      url.searchParams.set("token", token);
      return {
        recipientId: recipient.id,
        email: recipient.email,
        name: recipient.name || "",
        organization: recipient.organization || "",
        url: url.toString(),
        expiresAt,
      } satisfies DriveIssueAccessLink;
    }),
  };
}

async function getRecipientContext(recipientId: string) {
  const client = db();
  const recipientResult = await client
    .from("drive_core_document_issue_recipients")
    .select("id,project_id,issue_id,recipient_type,user_id,email,name,organization,permission,access_expires_at,downloaded_at")
    .eq("id", recipientId)
    .maybeSingle();
  if (recipientResult.error) throw new DriveCoreRepositoryError("A kiadási címzett nem tölthető be.", recipientResult.error.code || "DRIVE_ISSUE_ACCESS_RECIPIENT_QUERY_FAILED", 500);
  const recipient = recipientResult.data as DbRecipient | null;
  if (!recipient || recipient.permission !== "DOWNLOAD") {
    throw new DriveCoreRepositoryError("A kiadási hozzáférés nem található.", "DRIVE_ISSUE_ACCESS_NOT_FOUND", 404);
  }

  const issueResult = await client
    .from("drive_core_document_issues")
    .select("id,project_id,document_id,version_id,issue_number,status,issued_at")
    .eq("id", recipient.issue_id)
    .eq("project_id", recipient.project_id)
    .maybeSingle();
  if (issueResult.error) throw new DriveCoreRepositoryError("A dokumentumkiadás nem tölthető be.", issueResult.error.code || "DRIVE_ISSUE_ACCESS_ISSUE_QUERY_FAILED", 500);
  const issue = issueResult.data as DbIssue | null;
  if (!issue || issue.status !== "ISSUED") {
    throw new DriveCoreRepositoryError("A dokumentumkiadás már nem aktív.", "DRIVE_ISSUE_ACCESS_NOT_ISSUED", 410);
  }

  const results = await Promise.all([
    client.from("drive_core_document_governance")
      .select("version_id,business_status,issue_status")
      .eq("version_id", issue.version_id)
      .eq("project_id", issue.project_id)
      .maybeSingle(),
    client.from("drive_core_document_versions")
      .select("id,project_id,document_id,original_name,mime_type,storage_provider,storage_bucket,storage_key,status")
      .eq("id", issue.version_id)
      .eq("project_id", issue.project_id)
      .eq("document_id", issue.document_id)
      .maybeSingle(),
    client.from("drive_core_documents")
      .select("id,name")
      .eq("id", issue.document_id)
      .eq("project_id", issue.project_id)
      .maybeSingle(),
  ]);
  const governanceResult = results[0];
  const versionResult = results[1];
  const documentResult = results[2];
  if (governanceResult.error || versionResult.error || documentResult.error) {
    throw new DriveCoreRepositoryError("A kiadási dokumentum nem tölthető be.", "DRIVE_ISSUE_ACCESS_DOCUMENT_QUERY_FAILED", 500);
  }
  const governance = governanceResult.data as DbGovernance | null;
  const version = versionResult.data as DbVersion | null;
  const document = documentResult.data as DbDocument | null;
  if (
    !governance
    || governance.business_status !== "KIADOTT"
    || governance.issue_status !== "ISSUED"
    || !version
    || version.status !== "AVAILABLE"
    || version.storage_provider !== "S3"
    || !version.storage_bucket
    || !version.storage_key
    || !document
  ) {
    throw new DriveCoreRepositoryError("A kiadott dokumentum jelenleg nem tölthető le.", "DRIVE_ISSUE_ACCESS_DOCUMENT_NOT_AVAILABLE", 409);
  }
  return { client, recipient, issue, version, document };
}

function assertRecipientAccessExpiry(
  accessExpiresAt: string | null,
  tokenExpiresAtSeconds: number,
) {
  const configuredExpiry = accessExpiresAt ? new Date(accessExpiresAt).getTime() : 0;
  const tokenExpiry = tokenExpiresAtSeconds * 1000;
  if (!configuredExpiry || configuredExpiry <= Date.now() || tokenExpiry <= Date.now()) {
    throw new DriveCoreRepositoryError(
      "A kiadási hozzáférési link lejárt.",
      "DRIVE_ISSUE_ACCESS_TOKEN_EXPIRED",
      410,
    );
  }
  return new Date(Math.min(configuredExpiry, tokenExpiry)).toISOString();
}

export async function inspectDriveIssueAccess(token: string) {
  const verified = decodeToken(token);
  const context = await getRecipientContext(verified.recipientId);
  const expiresAt = assertRecipientAccessExpiry(
    context.recipient.access_expires_at,
    verified.expiresAtSeconds,
  );
  return {
    issueNumber: context.issue.issue_number,
    issuedAt: context.issue.issued_at,
    documentName: context.document.name || context.version.original_name,
    mimeType: context.version.mime_type,
    recipientId: context.recipient.id,
    recipientName: context.recipient.name || "",
    recipientEmail: context.recipient.email,
    recipientOrganization: context.recipient.organization || "",
    expiresAt,
    downloadedAt: context.recipient.downloaded_at,
  };
}

export async function resolveDriveIssueAccessDownload(token: string) {
  const verified = decodeToken(token);
  const context = await getRecipientContext(verified.recipientId);
  assertRecipientAccessExpiry(
    context.recipient.access_expires_at,
    verified.expiresAtSeconds,
  );

  const signed = await createDriveSignedGetUrl({
    storageKey: context.version.storage_key!,
    bucket: context.version.storage_bucket,
    fileName: context.document.name || context.version.original_name,
    mimeType: context.version.mime_type,
    disposition: "attachment",
  });

  const downloadedAt = new Date().toISOString();
  const recipientUpdate = await context.client
    .from("drive_core_document_issue_recipients")
    .update({ downloaded_at: downloadedAt })
    .eq("id", context.recipient.id)
    .eq("issue_id", context.issue.id)
    .eq("project_id", context.issue.project_id);
  if (recipientUpdate.error) {
    throw new DriveCoreRepositoryError("A letöltési auditállapot nem menthető.", recipientUpdate.error.code || "DRIVE_ISSUE_ACCESS_DOWNLOAD_AUDIT_FAILED", 500);
  }

  const audit = await context.client.from("project_core_audit_events").insert({
    id: "project-audit-" + randomUUID().replaceAll("-", "").slice(0, 12),
    project_id: context.issue.project_id,
    actor_user_id: "issue-recipient:" + context.recipient.id,
    event_type: "DRIVE_DOCUMENT_ISSUE_RECIPIENT_DOWNLOADED",
    entity_type: "document_version",
    entity_id: context.issue.version_id,
    summary: "Kiadási címzett letöltési linket nyitott meg: " + context.issue.issue_number,
    metadata: {
      issueId: context.issue.id,
      issueNumber: context.issue.issue_number,
      recipientId: context.recipient.id,
      documentId: context.issue.document_id,
      versionId: context.issue.version_id,
      downloadedAt,
      documentFlowSchema: "0.1.0",
    },
  });
  if (audit.error) {
    throw new DriveCoreRepositoryError("A címzetti letöltés auditnaplója nem menthető.", audit.error.code || "DRIVE_ISSUE_ACCESS_AUDIT_INSERT_FAILED", 500);
  }

  return {
    url: signed.url,
    signedExpiresAt: signed.expiresAt,
    issueNumber: context.issue.issue_number,
    recipientId: context.recipient.id,
    downloadedAt,
  };
}
