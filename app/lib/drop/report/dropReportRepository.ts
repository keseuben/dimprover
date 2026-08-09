import { DropRepositoryError, getDropSupabaseClient } from "../dropRepository";
import type { DropFileRecord, DropPackageRecord, DropRecipientRecord } from "../dropTypes";

function databaseError(message: string, error: unknown): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  throw new DropRepositoryError(
    message,
    candidate?.code || "DROP_REPORT_DATABASE_ERROR",
    500,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

export type DropReportRecord = {
  id: string;
  package_id: string;
  report_type: "final" | "manual" | "comments";
  status: string;
  storage_key: string | null;
  page_count: number | null;
  file_size_bytes: number | null;
  generated_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type DropGroupRecord = {
  id: string;
  package_id: string;
  name: string;
  code: string;
  description: string | null;
  sort_order: number;
  file_name_prefix: string | null;
  sequence_start: number;
  created_at: string;
  updated_at: string;
};

export type DropCommentRecord = {
  id: string;
  package_id: string;
  file_id: string | null;
  parent_comment_id: string | null;
  author_name: string;
  author_email: string | null;
  comment_text: string;
  status: string;
  created_at: string;
  updated_at: string;
};


export type DropFileSourceMetric = {
  fileId: string;
  sourceOriginalSizeBytes: number;
  uploadSizeBytes: number;
  savedBytes: number;
  savedPercent: number;
  createdAt: string;
};

export type DropFinalReportBundle = {
  packageRow: DropPackageRecord;
  groups: DropGroupRecord[];
  files: DropFileRecord[];
  comments: DropCommentRecord[];
  recipients: DropRecipientRecord[];
  fileSourceMetrics: Record<string, DropFileSourceMetric>;
};

function maxIso(values: Array<string | null | undefined>) {
  let current = 0;
  let currentIso = "1970-01-01T00:00:00.000Z";
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isFinite(time) && time > current) {
      current = time;
      currentIso = new Date(time).toISOString();
    }
  }
  return currentIso;
}

export function getDropReportContentUpdatedAt(bundle: DropFinalReportBundle) {
  return maxIso([
    bundle.packageRow.created_at,
    bundle.packageRow.closed_at,
    bundle.packageRow.expired_at,
    ...bundle.files.map((file) => file.updated_at || file.created_at),
    ...bundle.comments.map((comment) => comment.updated_at || comment.created_at),
    ...Object.values(bundle.fileSourceMetrics).map((metric) => metric.createdAt),
  ]);
}

export function isDropReportFresh(report: DropReportRecord | null, bundle: DropFinalReportBundle) {
  if (!report || !report.generated_at || !["generated", "sending", "sent", "completed"].includes(report.status)) return false;
  return new Date(report.generated_at).getTime() >= new Date(getDropReportContentUpdatedAt(bundle)).getTime();
}

export async function loadDropFinalReportBundle(packageId: string): Promise<DropFinalReportBundle> {
  const client = getDropSupabaseClient();
  const [packageResult, groupsResult, filesResult, commentsResult, recipientsResult, metricsResult] = await Promise.all([
    client.from("drop_packages").select("*").eq("id", packageId).maybeSingle(),
    client.from("drop_groups").select("*").eq("package_id", packageId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    client.from("drop_files").select("*").eq("package_id", packageId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    client
      .from("drop_comments")
      .select("id,package_id,file_id,parent_comment_id,author_name,author_email,comment_text,status,created_at,updated_at")
      .eq("package_id", packageId)
      .is("deleted_at", null)
      .in("status", ["active", "edited"])
      .order("created_at", { ascending: true }),
    client.from("drop_recipients").select("*").eq("package_id", packageId).order("created_at", { ascending: true }),
    client
      .from("drop_events")
      .select("file_id,event_type,payload,created_at")
      .eq("package_id", packageId)
      .in("event_type", ["upload.rules_accepted", "upload.rules_reconfirmed"])
      .not("file_id", "is", null)
      .order("created_at", { ascending: false }),
  ]);
  const errors = [packageResult.error, groupsResult.error, filesResult.error, commentsResult.error, recipientsResult.error, metricsResult.error].filter(Boolean);
  if (errors.length) databaseError("A DROP végleges riport adatcsomagja nem tölthető be.", errors[0]);
  if (!packageResult.data) throw new DropRepositoryError("A DROP csomag nem található.", "DROP_REPORT_PACKAGE_NOT_FOUND", 404);
  const fileSourceMetrics: Record<string, DropFileSourceMetric> = {};
  for (const event of metricsResult.data || []) {
    const fileId = event.file_id ? String(event.file_id) : "";
    if (!fileId || fileSourceMetrics[fileId]) continue;
    const payload = (event.payload || {}) as Record<string, unknown>;
    const sourceOriginalSizeBytes = Number(payload.sourceOriginalSizeBytes || 0);
    const uploadSizeBytes = Number(payload.uploadSizeBytes || 0);
    if (!Number.isSafeInteger(sourceOriginalSizeBytes) || sourceOriginalSizeBytes <= 0 || !Number.isSafeInteger(uploadSizeBytes) || uploadSizeBytes <= 0) continue;
    fileSourceMetrics[fileId] = {
      fileId,
      sourceOriginalSizeBytes,
      uploadSizeBytes,
      savedBytes: Math.max(0, Number(payload.savedBytes || sourceOriginalSizeBytes - uploadSizeBytes)),
      savedPercent: Math.max(0, Math.min(100, Number(payload.savedPercent || Math.round((1 - uploadSizeBytes / sourceOriginalSizeBytes) * 100)))),
      createdAt: String(event.created_at),
    };
  }
  return {
    packageRow: packageResult.data as DropPackageRecord,
    groups: (groupsResult.data || []) as DropGroupRecord[],
    files: (filesResult.data || []) as DropFileRecord[],
    comments: (commentsResult.data || []) as DropCommentRecord[],
    recipients: (recipientsResult.data || []) as DropRecipientRecord[],
    fileSourceMetrics,
  };
}

export async function getLatestDropFinalReport(packageId: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_reports")
    .select("*")
    .eq("package_id", packageId)
    .eq("report_type", "final")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) databaseError("A DROP végleges riport állapota nem tölthető be.", error);
  return (data || null) as DropReportRecord | null;
}

export async function createDropFinalReportRecord(packageId: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_reports")
    .insert({ package_id: packageId, report_type: "final", status: "queued" })
    .select("*")
    .single();
  if (error || !data) databaseError("A DROP végleges riport rekordja nem hozható létre.", error);
  return data as DropReportRecord;
}

export async function ensureDropFinalReportRecord(bundle: DropFinalReportBundle) {
  const latest = await getLatestDropFinalReport(bundle.packageRow.id);
  const contentUpdatedAt = new Date(getDropReportContentUpdatedAt(bundle)).getTime();
  const reusable = latest && (
    isDropReportFresh(latest, bundle)
    || (["queued", "generating", "generated", "sending", "failed"].includes(latest.status)
      && new Date(latest.created_at).getTime() >= contentUpdatedAt)
  );
  return reusable ? latest : createDropFinalReportRecord(bundle.packageRow.id);
}

export async function updateDropFinalReportRecord(reportId: string, patch: Partial<Pick<DropReportRecord,
  "status" | "storage_key" | "page_count" | "file_size_bytes" | "generated_at" | "sent_at" | "error_message"
>>) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_reports")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", reportId)
    .select("*")
    .single();
  if (error || !data) databaseError("A DROP végleges riport rekordja nem frissíthető.", error);
  return data as DropReportRecord;
}

export async function updateDropPackageFinalReportStatus(packageId: string, status: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_packages")
    .update({ final_report_status: status, updated_at: new Date().toISOString() })
    .eq("id", packageId)
    .select("*")
    .single();
  if (error || !data) databaseError("A DROP csomag riportállapota nem frissíthető.", error);
  return data as DropPackageRecord;
}

export async function invalidateDropFinalReport(packageId: string, reason: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_packages")
    .update({ final_report_status: "not_requested", updated_at: new Date().toISOString() })
    .eq("id", packageId)
    .select("id,final_report_status")
    .maybeSingle();
  if (error) databaseError("A DROP végleges riport érvénytelenítése sikertelen.", error);
  if (data) {
    const { error: eventError } = await client.from("drop_events").insert({
      package_id: packageId,
      event_type: "report.invalidated",
      severity: "info",
      actor_name: "DIMPRO Drop",
      payload: { reason: reason.slice(0, 500) },
    });
    if (eventError) databaseError("A DROP riportérvénytelenítési esemény nem menthető.", eventError);
  }
  return Boolean(data);
}

export async function listDropFinalReportEmailRecipients(bundle: DropFinalReportBundle) {
  const recipients: Array<{ name: string; email: string; source: "uploader" | "invitee" }> = [];
  if (bundle.packageRow.send_final_report_to_uploader !== false && bundle.packageRow.uploader_email) {
    recipients.push({ name: bundle.packageRow.uploader_name || "Feltöltő", email: bundle.packageRow.uploader_email, source: "uploader" });
  }
  if (bundle.packageRow.send_final_report_to_invitees !== false) {
    for (const recipient of bundle.recipients) {
      if (recipient.receive_final_report !== false && recipient.email) {
        recipients.push({ name: recipient.name || "Címzett", email: recipient.email, source: "invitee" });
      }
    }
  }
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const email = recipient.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) return false;
    seen.add(email);
    recipient.email = email;
    return true;
  });
}

export async function listSentDropFinalReportEmails(packageId: string, reportId: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_email_log")
    .select("recipient_email,status")
    .eq("package_id", packageId)
    .eq("email_type", `final_report:${reportId}`)
    .eq("status", "sent");
  if (error) databaseError("A DROP riport e-mail naplója nem tölthető be.", error);
  return new Set((data || []).map((item) => String(item.recipient_email || "").trim().toLowerCase()).filter(Boolean));
}

export async function writeDropFinalReportEmailLog(input: {
  packageId: string;
  reportId: string;
  recipientEmail: string;
  status: "sent" | "failed";
  messageId?: string | null;
  error?: string | null;
}) {
  const client = getDropSupabaseClient();
  const { error } = await client.from("drop_email_log").insert({
    package_id: input.packageId,
    recipient_email: input.recipientEmail,
    email_type: `final_report:${input.reportId}`,
    provider_message_id: input.messageId || null,
    status: input.status,
    attempt_count: 1,
    sent_at: input.status === "sent" ? new Date().toISOString() : null,
    last_error: input.error || null,
  });
  if (error) databaseError("A DROP riport e-mail naplója nem menthető.", error);
}

export async function writeDropReportEvent(input: {
  packageId: string;
  eventType: string;
  severity?: "info" | "warning" | "error" | "critical";
  payload?: Record<string, unknown>;
}) {
  const client = getDropSupabaseClient();
  const { error } = await client.from("drop_events").insert({
    package_id: input.packageId,
    event_type: input.eventType,
    severity: input.severity || "info",
    actor_name: "DIMPRO DROP report worker",
    payload: input.payload || {},
  });
  if (error) databaseError("A DROP riport auditbejegyzése nem menthető.", error);
}
