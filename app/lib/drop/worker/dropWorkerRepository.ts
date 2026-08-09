import { DropRepositoryError, getDropSupabaseClient } from "../dropRepository";
import type { DropFileRecord, DropPackageRecord, DropUploadSessionRecord } from "../dropTypes";

function databaseError(message: string, error: unknown): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  throw new DropRepositoryError(
    message,
    candidate?.code || "DROP_WORKER_DATABASE_ERROR",
    500,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

export type DropWorkerJobType =
  | "scan_file"
  | "advance_package_lifecycle"
  | "finalize_package_deletion"
  | "generate_final_report"
  | "send_final_report"
  | "delete_package_objects"
  | "cleanup_upload_session";

export type DropWorkerJob = {
  id: string;
  package_id: string | null;
  file_id: string | null;
  job_type: DropWorkerJobType;
  job_key: string | null;
  status: "queued" | "running" | "retry" | "completed" | "failed";
  attempt_count: number;
  max_attempts: number;
  run_after: string;
  locked_at: string | null;
  locked_by: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type DropScanResultInput = {
  fileId: string;
  workerId: string;
  result: "clean" | "infected" | "error";
  sha256?: string | null;
  engine?: string | null;
  engineVersion?: string | null;
  signatureVersion?: string | null;
  signatureName?: string | null;
  error?: string | null;
};

export async function getDropWorkerSchemaHealth() {
  const client = getDropSupabaseClient();
  const [marker, files, jobs, downloads] = await Promise.all([
    client.from("drop_schema_meta").select("schema_version,migration_count,bootstrap_id,metadata").eq("component", "drop-storage").maybeSingle(),
    client.from("drop_files").select("id,scan_attempts,scan_started_at,scan_completed_at,scan_worker_id,scan_engine,scan_engine_version,scan_signature_version,scan_signature_name,scan_error,download_ready_at,download_count,last_downloaded_at").limit(0),
    client.from("drop_jobs").select("id,file_id,job_key,lease_expires_at").limit(0),
    client.from("drop_downloads").select("id,download_token_hint,ip_hash,user_agent_summary,signed_url_expires_at,storage_etag,issued_at").limit(0),
  ]);
  const errors = [marker.error, files.error, jobs.error, downloads.error].filter(Boolean);
  const value = marker.data as { schema_version?: string; migration_count?: number; bootstrap_id?: string; metadata?: Record<string, unknown> } | null;
  const ready = errors.length === 0
    && value?.schema_version === "DROP 0.5.0"
    && Number(value?.migration_count) === 4
    && value?.bootstrap_id === "drop-050-malware-retention-download-20260803"
    && value?.metadata?.clamdInstreamScan === true
    && value?.metadata?.leasedWorkerQueue === true
    && value?.metadata?.secureSignedDownload === true
    && value?.metadata?.retentionReportGate === true;
  return {
    ready,
    marker: value,
    checks: {
      files: !files.error,
      jobs: !jobs.error,
      downloads: !downloads.error,
      marker: !marker.error && Boolean(value),
    },
    errors: errors.map((error) => ({ code: error?.code || null, message: error?.message || null })),
  };
}

export async function queueDropWorkerJob(input: {
  type: DropWorkerJobType;
  packageId?: string | null;
  fileId?: string | null;
  jobKey: string;
  payload?: Record<string, unknown>;
  runAfter?: string;
  maxAttempts?: number;
}) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_queue_worker_job", {
    p_job_type: input.type,
    p_package_id: input.packageId || null,
    p_file_id: input.fileId || null,
    p_job_key: input.jobKey,
    p_payload: input.payload || {},
    p_run_after: input.runAfter || new Date().toISOString(),
    p_max_attempts: input.maxAttempts || 5,
  });
  if (error) databaseError("A DROP worker-feladat sorba állítása sikertelen.", error);
  return data as DropWorkerJob;
}

export async function claimDropWorkerJobs(input: {
  workerId: string;
  types: DropWorkerJobType[];
  limit: number;
  leaseSeconds: number;
}) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_claim_worker_jobs", {
    p_worker_id: input.workerId,
    p_job_types: input.types,
    p_limit: input.limit,
    p_lease_seconds: input.leaseSeconds,
  });
  if (error) databaseError("A DROP worker-feladatok foglalása sikertelen.", error);
  return (data || []) as DropWorkerJob[];
}

export async function finishDropWorkerJob(input: {
  jobId: string;
  workerId: string;
  success: boolean;
  error?: string | null;
  retryAfterSeconds?: number;
}) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_finish_worker_job", {
    p_job_id: input.jobId,
    p_worker_id: input.workerId,
    p_success: input.success,
    p_error: input.error || null,
    p_retry_after_seconds: input.retryAfterSeconds || 300,
  });
  if (error) databaseError("A DROP worker-feladat lezárása sikertelen.", error);
  return data as DropWorkerJob;
}

export async function startDropFileScan(fileId: string, workerId: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_start_file_scan", {
    p_file_id: fileId,
    p_worker_id: workerId,
  });
  if (error) databaseError("A DROP fájlvizsgálat indítása sikertelen.", error);
  return data as DropFileRecord;
}

export async function applyDropFileScanResult(input: DropScanResultInput) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_apply_file_scan_result", {
    p_file_id: input.fileId,
    p_worker_id: input.workerId,
    p_result: input.result,
    p_sha256: input.sha256 || null,
    p_engine: input.engine || null,
    p_engine_version: input.engineVersion || null,
    p_signature_version: input.signatureVersion || null,
    p_signature_name: input.signatureName || null,
    p_error: input.error || null,
  });
  if (error) databaseError("A DROP fájlvizsgálat eredményének mentése sikertelen.", error);
  return data as DropFileRecord;
}

export async function markDropFileObjectDeleted(fileId: string, reason: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_mark_file_object_deleted", {
    p_file_id: fileId,
    p_reason: reason,
  });
  if (error) databaseError("A DROP fájl törlési állapotának mentése sikertelen.", error);
  return data as { file: DropFileRecord; reservationReleased: boolean; idempotent: boolean };
}

export async function createDropFileDownloadRecord(input: {
  packageId: string;
  fileId: string;
  tokenHash: string;
  tokenHint: string;
  ipHash: string;
  userAgentSummary: string;
  expiresAt: string;
}) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_create_file_download", {
    p_package_id: input.packageId,
    p_file_id: input.fileId,
    p_token_hash: input.tokenHash,
    p_token_hint: input.tokenHint,
    p_ip_hash: input.ipHash,
    p_user_agent_summary: input.userAgentSummary,
    p_expires_at: input.expiresAt,
  });
  if (error) databaseError("A DROP letöltési audit létrehozása sikertelen.", error);
  return data as { download: Record<string, unknown>; file: DropFileRecord };
}

export async function listDropScanCandidates(limit = 100) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_files")
    .select("*")
    .eq("storage_provider", "s3-compatible")
    .eq("security_status", "scanner_required")
    .in("virus_scan_status", ["scanner_required", "error"])
    .is("deleted_at", null)
    .order("is_image", { ascending: false })
    .order("size_stored_bytes", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(500, limit)));
  if (error) databaseError("A DROP vizsgálatra váró fájljai nem tölthetők be.", error);
  return (data || []) as DropFileRecord[];
}

export async function getDropWorkerFile(fileId: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.from("drop_files").select("*").eq("id", fileId).maybeSingle();
  if (error) databaseError("A DROP worker fájlrekordja nem tölthető be.", error);
  return (data || null) as DropFileRecord | null;
}

export async function listDropDuePackages(limit = 100) {
  const client = getDropSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("drop_packages")
    .select("*")
    .in("status", ["active", "upload_closed", "expiring", "expired", "deleting"])
    .or(`upload_closes_at.lte.${now},expires_at.lte.${now},grace_expires_at.lte.${now},status.eq.deleting`)
    .order("expires_at", { ascending: true })
    .limit(Math.max(1, Math.min(500, limit)));
  if (error) databaseError("A DROP lejáratra váró csomagjai nem tölthetők be.", error);
  return (data || []) as DropPackageRecord[];
}

export async function listDropStaleUploadSessions(limit = 100) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_upload_sessions")
    .select("*")
    .in("status", ["initialized", "uploading", "parts_received"])
    .lte("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true })
    .limit(Math.max(1, Math.min(500, limit)));
  if (error) databaseError("A DROP lejárt feltöltési munkamenetei nem tölthetők be.", error);
  return (data || []) as DropUploadSessionRecord[];
}

export async function listDropPackageWorkerFiles(packageId: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_files")
    .select("*")
    .eq("package_id", packageId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) databaseError("A DROP törlendő csomagfájljai nem tölthetők be.", error);
  return (data || []) as DropFileRecord[];
}

export async function countDropPackageLiveFiles(packageId: string) {
  const client = getDropSupabaseClient();
  const { count, error } = await client
    .from("drop_files")
    .select("id", { count: "exact", head: true })
    .eq("package_id", packageId)
    .is("deleted_at", null);
  if (error) databaseError("A DROP csomag élő fájljai nem számolhatók meg.", error);
  return count || 0;
}

export async function markDropPackageFinalReportQueued(packageId: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_packages")
    .update({ final_report_status: "queued", updated_at: new Date().toISOString() })
    .eq("id", packageId)
    .in("final_report_status", ["not_requested", "failed"])
    .select("*")
    .maybeSingle();
  if (error) databaseError("A DROP végleges riport sorba állítása sikertelen.", error);
  return (data || null) as DropPackageRecord | null;
}

export async function writeDropWorkerEvent(input: {
  packageId: string;
  fileId?: string | null;
  eventType: string;
  severity?: "info" | "warning" | "error" | "critical";
  payload?: Record<string, unknown>;
}) {
  const client = getDropSupabaseClient();
  const { error } = await client.from("drop_events").insert({
    package_id: input.packageId,
    file_id: input.fileId || null,
    event_type: input.eventType,
    severity: input.severity || "info",
    actor_name: "DIMPRO DROP worker",
    payload: input.payload || {},
  });
  if (error) databaseError("A DROP worker auditbejegyzése sikertelen.", error);
}

export async function listDropDownloadableFiles(packageId: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_files")
    .select("*")
    .eq("package_id", packageId)
    .eq("security_status", "clean")
    .eq("virus_scan_status", "clean")
    .eq("upload_status", "ready")
    .eq("processing_status", "ready")
    .is("deleted_at", null)
    .not("download_ready_at", "is", null)
    .order("created_at", { ascending: true });
  if (error) databaseError("A DROP letölthető fájljai nem tölthetők be.", error);
  return (data || []) as DropFileRecord[];
}

export async function getDropDownloadableFile(packageId: string, fileId: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_files")
    .select("*")
    .eq("id", fileId)
    .eq("package_id", packageId)
    .maybeSingle();
  if (error) databaseError("A DROP letöltendő fájl nem tölthető be.", error);
  return (data || null) as DropFileRecord | null;
}
