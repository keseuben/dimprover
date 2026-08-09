import { DropRepositoryError, getDropSupabaseClient } from "../dropRepository";
import type { DropFileRecord, DropPackageRecord, DropUploadSessionRecord } from "../dropTypes";

function databaseError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  throw new DropRepositoryError(
    message,
    candidate?.code || "DROP_STORAGE_DATABASE_ERROR",
    status,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

function mapRpcError(error: { code?: string; message?: string } | null): never {
  const message = error?.message || "";
  const mappings: Record<string, { message: string; status: number }> = {
    DROP_UPLOAD_INPUT_INVALID: { message: "Érvénytelen feltöltési kérés.", status: 400 },
    DROP_UPLOAD_UUID_INVALID: { message: "Érvénytelen feltöltési azonosító.", status: 400 },
    DROP_UPLOAD_CONTEXT_INCOMPLETE: { message: "A feltöltési környezet hiányos.", status: 400 },
    DROP_UPLOAD_SIZE_INVALID: { message: "A fájl mérete érvénytelen.", status: 400 },
    DROP_UPLOAD_CHUNK_SIZE_INVALID: { message: "A feltöltési részek mérete érvénytelen.", status: 400 },
    DROP_UPLOAD_CHUNK_TOO_SMALL: { message: "A multipart részméret túl kicsi.", status: 400 },
    DROP_UPLOAD_PART_COUNT_INVALID: { message: "A feltöltési részek száma érvénytelen.", status: 400 },
    DROP_UPLOAD_PART_NUMBER_INVALID: { message: "A feltöltési rész sorszáma érvénytelen.", status: 400 },
    DROP_UPLOAD_PART_CHECKSUM_INVALID: { message: "A feltöltési rész ellenőrzőösszege érvénytelen.", status: 400 },
    DROP_UPLOAD_PART_SIZE_MISMATCH: { message: "A feltöltési rész mérete eltér a várt mérettől.", status: 400 },
    DROP_UPLOAD_PART_CONFLICT: { message: "A feltöltési rész már más tartalommal elkészült.", status: 409 },
    DROP_UPLOAD_PART_NOT_FOUND: { message: "A feltöltési rész nem található.", status: 404 },
    DROP_UPLOAD_PARTS_INCOMPLETE: { message: "A feltöltési részek még nem teljesek.", status: 409 },
    DROP_UPLOAD_AUTHORIZATION_MODE_INVALID: { message: "A feltöltési jogosultsági mód érvénytelen.", status: 400 },
    DROP_PACKAGE_NOT_FOUND: { message: "A Drop csomag nem található.", status: 404 },
    DROP_PACKAGE_UPLOAD_UNAVAILABLE: { message: "A Drop csomag jelenleg nem fogad feltöltést.", status: 410 },
    DROP_UPLOAD_FILE_TOO_LARGE: { message: "A fájl meghaladja a csomag fájlonkénti méretkorlátját.", status: 413 },
    DROP_PACKAGE_FILE_LIMIT_REACHED: { message: "A Drop csomag elérte a fájlszámkorlátot.", status: 409 },
    DROP_PACKAGE_STORAGE_LIMIT_REACHED: { message: "A Drop csomag elérte a tárhelykeretét.", status: 409 },
    DROP_SPACE_STORAGE_LIMIT_REACHED: { message: "A Drop tér elérte a licenc szerinti tárhelykeretet.", status: 409 },
    DROP_UPLOAD_GROUP_INVALID: { message: "A kiválasztott csoport nem ehhez a csomaghoz tartozik.", status: 400 },
    DROP_SPACE_NOT_FOUND: { message: "A Drop tér nem található.", status: 404 },
    DROP_SPACE_NOT_WRITABLE: { message: "A Drop tér jelenleg nem írható.", status: 409 },
    DROP_UPLOAD_MEMBERSHIP_REQUIRED: { message: "A feltöltéshez aktív tértagság szükséges.", status: 401 },
    DROP_SPACE_MEMBERSHIP_NOT_ACTIVE: { message: "A Drop tértagság nem aktív.", status: 403 },
    DROP_SPACE_ACCESS_EXPIRED: { message: "A Drop tértagság hozzáférése lejárt.", status: 410 },
    DROP_SPACE_UPLOAD_FORBIDDEN: { message: "A tértagsági szerepkör nem tölthet fel fájlt.", status: 403 },
    DROP_PACKAGE_UPLOAD_FORBIDDEN: { message: "Ehhez a csomaghoz nincs feltöltési jogosultság.", status: 403 },
    DROP_UPLOAD_SPACE_SESSION_INVALID: { message: "A térsession nem használható ennél a csomagnál.", status: 403 },
    DROP_UPLOAD_SESSION_NOT_FOUND: { message: "A feltöltési munkamenet nem található.", status: 404 },
    DROP_UPLOAD_SESSION_UNAVAILABLE: { message: "A feltöltési munkamenet már nem használható.", status: 409 },
    DROP_UPLOAD_SESSION_EXPIRED: { message: "A feltöltési munkamenet lejárt.", status: 410 },
    DROP_UPLOAD_SIZE_MISMATCH: { message: "A beérkezett fájlméret eltér az előre megadott mérettől.", status: 400 },
    DROP_UPLOAD_SHA256_INVALID: { message: "A fájl ellenőrzőösszege érvénytelen.", status: 400 },
    DROP_UPLOAD_SESSION_NOT_FINALIZABLE: { message: "A feltöltési munkamenet nem véglegesíthető.", status: 409 },
    DROP_UPLOAD_FINALIZE_MISMATCH: { message: "A véglegesítés fájladatai nem egyeznek a feltöltéssel.", status: 409 },
    DROP_S3_SESSION_NOT_FINALIZABLE: { message: "Az S3 feltöltési munkamenet nem véglegesíthető.", status: 409 },
    DROP_S3_OBJECT_SIZE_MISMATCH: { message: "Az S3 objektum mérete eltér a várt fájlmérettől.", status: 409 },
    DROP_S3_MANIFEST_SHA256_INVALID: { message: "Az S3 partmanifest ellenőrzőösszege érvénytelen.", status: 400 },
    DROP_S3_OBJECT_ETAG_INVALID: { message: "Az S3 objektum ETag értéke érvénytelen.", status: 400 },
    DROP_CLEANUP_OPERATION_INVALID: { message: "A DROP objektumtakarítás művelete érvénytelen.", status: 400 },
    DROP_CLEANUP_STORAGE_REFERENCE_INVALID: { message: "A DROP objektumtakarítás tárhelyhivatkozása hiányos.", status: 400 },
    DROP_CLEANUP_MULTIPART_ID_REQUIRED: { message: "Multipart megszakításhoz tárhelyazonosító szükséges.", status: 400 },
    DROP_CLEANUP_TASK_NOT_FOUND: { message: "A DROP objektumtakarítási feladat nem található.", status: 404 },
  };
  const matched = Object.entries(mappings).find(([code]) => message.includes(code));
  if (matched) {
    const [code, details] = matched;
    throw new DropRepositoryError(details.message, code, details.status);
  }
  databaseError("A Drop tárhelyművelet adatbázis-hibával leállt.", error);
}

export async function getDropStorageSchemaHealth() {
  try {
    const client = getDropSupabaseClient();
    const markerResult = await client
      .from("drop_schema_meta")
      .select("component,schema_version,migration_count,bootstrap_id,metadata")
      .eq("component", "drop-storage")
      .maybeSingle();
    const marker = markerResult.data as {
      component: string;
      schema_version: string;
      migration_count: number;
      bootstrap_id: string;
      metadata: Record<string, unknown>;
    } | null;
    const markerVersion = marker?.schema_version || "";
    const v040Marker = markerVersion === "DROP 0.4.0"
      && Number(marker?.migration_count) === 3
      && marker?.bootstrap_id === "drop-040-private-s3-storage-20260802"
      && marker?.metadata?.privateS3Storage === true
      && marker?.metadata?.directMultipartUpload === true
      && marker?.metadata?.partManifestIntegrity === true
      && marker?.metadata?.durableObjectCleanup === true;
    const v050Marker = markerVersion === "DROP 0.5.0"
      && Number(marker?.migration_count) === 4
      && marker?.bootstrap_id === "drop-050-malware-retention-download-20260803"
      && marker?.metadata?.privateS3Storage === true
      && marker?.metadata?.directMultipartUpload === true
      && marker?.metadata?.partManifestIntegrity === true
      && marker?.metadata?.durableObjectCleanup === true
      && marker?.metadata?.clamdInstreamScan === true
      && marker?.metadata?.secureSignedDownload === true;
    const privateS3Marker = v040Marker || v050Marker;

    const [fileCheck, sessionCheck, cleanupCheck] = await Promise.all([
      privateS3Marker
        ? client.from("drop_files").select("id,uploaded_by_membership_id,security_status,quarantine_reason,ready_at,integrity_type,integrity_manifest_sha256,object_etag,object_verified_at").limit(0)
        : client.from("drop_files").select("id,uploaded_by_membership_id,security_status,quarantine_reason,ready_at").limit(0),
      privateS3Marker
        ? client.from("drop_upload_sessions").select("id,created_by_membership_id,authorization_mode,storage_provider,storage_bucket,storage_key,reservation_released,received_sha256,received_mime_type,received_at,finalized_at,integrity_type,integrity_manifest_sha256,object_etag,object_verified_at").limit(0)
        : client.from("drop_upload_sessions").select("id,created_by_membership_id,authorization_mode,storage_provider,storage_bucket,storage_key,reservation_released,received_sha256,received_mime_type,received_at,finalized_at").limit(0),
      privateS3Marker
        ? client.from("drop_object_cleanup_tasks").select("id,status,operation,attempts").limit(0)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const v033Ready = markerVersion === "DROP 0.3.3"
      && Number(marker?.migration_count) === 1
      && marker?.bootstrap_id === "drop-033-private-storage-quarantine-20260801"
      && marker?.metadata?.atomicQuotaReservation === true
      && marker?.metadata?.streamingUpload === true;
    const v034Ready = markerVersion === "DROP 0.3.4"
      && Number(marker?.migration_count) === 2
      && marker?.bootstrap_id === "drop-034-resumable-multipart-20260802"
      && marker?.metadata?.resumableMultipartUpload === true
      && Number(marker?.metadata?.maxFileSizeBytes) === 524_288_000
      && Number(marker?.metadata?.defaultChunkSizeBytes) === 67_108_864;
    const ready = !fileCheck.error
      && !sessionCheck.error
      && !markerResult.error
      && !cleanupCheck.error
      && (v033Ready || v034Ready || privateS3Marker);
    return {
      ready,
      checks: {
        dropFiles: !fileCheck.error,
        dropUploadSessions: !sessionCheck.error,
        marker: !markerResult.error && Boolean(marker),
        cleanupTasks: privateS3Marker ? !cleanupCheck.error : null,
      },
      marker,
      errors: [fileCheck.error, sessionCheck.error, markerResult.error, cleanupCheck.error].filter(Boolean).map((error) => ({
        code: error?.code || null,
        message: error?.message || null,
      })),
    };
  } catch (error) {
    return {
      ready: false,
      checks: { dropFiles: false, dropUploadSessions: false, marker: false, cleanupTasks: false },
      marker: null,
      errors: [{ code: error instanceof DropRepositoryError ? error.code : "DROP_STORAGE_SCHEMA_ERROR", message: error instanceof Error ? error.message : "Ismeretlen hiba" }],
    };
  }
}

export async function initializeDropUploadAtomic(input: {
  packageId: string;
  fileId: string;
  sessionId: string;
  groupId?: string | null;
  createdByMembershipId?: string | null;
  authorizationMode: "space_session" | "capability_token" | "admin";
  clientUploadId: string;
  originalName: string;
  displayName: string;
  generatedName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: string;
  storageBucket: string;
  storageKey: string;
  storageMultipartId?: string | null;
  chunkSizeBytes?: number;
  expiresAt: string;
  isImage: boolean;
  isZip: boolean;
  uploadedByName?: string | null;
  uploadedByEmail?: string | null;
}) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_initialize_upload_atomic", {
    p_input: {
      package_id: input.packageId,
      file_id: input.fileId,
      session_id: input.sessionId,
      group_id: input.groupId || null,
      created_by_membership_id: input.createdByMembershipId || null,
      authorization_mode: input.authorizationMode,
      client_upload_id: input.clientUploadId,
      original_name: input.originalName,
      display_name: input.displayName,
      generated_name: input.generatedName,
      extension: input.extension,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      storage_provider: input.storageProvider,
      storage_bucket: input.storageBucket,
      storage_key: input.storageKey,
      storage_multipart_id: input.storageMultipartId || null,
      chunk_size_bytes: input.chunkSizeBytes || null,
      expires_at: input.expiresAt,
      is_image: input.isImage,
      is_zip: input.isZip,
      uploaded_by_name: input.uploadedByName || null,
      uploaded_by_email: input.uploadedByEmail || null,
    },
  });
  if (error) mapRpcError(error);
  const value = data as { file?: DropFileRecord; session?: DropUploadSessionRecord } | null;
  if (!value?.file || !value.session) {
    throw new DropRepositoryError("A feltöltési munkamenet nem adott vissza fájl- és sessionadatot.", "DROP_UPLOAD_INIT_EMPTY", 500);
  }
  return { file: value.file, session: value.session };
}

export async function markDropUploadReceived(input: { sessionId: string; receivedBytes: number; sha256: string }) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_mark_upload_received", {
    p_session_id: input.sessionId,
    p_received_bytes: input.receivedBytes,
    p_sha256: input.sha256,
  });
  if (error) mapRpcError(error);
  const value = data as { file?: DropFileRecord; session?: DropUploadSessionRecord } | null;
  if (!value?.file || !value.session) throw new DropRepositoryError("A feltöltés bájtjainak rögzítése hiányos.", "DROP_UPLOAD_RECEIVE_EMPTY", 500);
  return { file: value.file, session: value.session };
}

export async function finalizeDropQuarantineUpload(input: {
  sessionId: string;
  detectedMimeType: string;
  storedBytes: number;
  sha256: string;
  zipScanStatus: string;
  quarantineReason: string;
}) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_finalize_quarantine_upload", {
    p_session_id: input.sessionId,
    p_detected_mime_type: input.detectedMimeType,
    p_stored_bytes: input.storedBytes,
    p_sha256: input.sha256,
    p_zip_scan_status: input.zipScanStatus,
    p_quarantine_reason: input.quarantineReason,
  });
  if (error) mapRpcError(error);
  const value = data as { file?: DropFileRecord; session?: DropUploadSessionRecord } | null;
  if (!value?.file || !value.session) throw new DropRepositoryError("A karanténfeltöltés véglegesítése hiányos.", "DROP_UPLOAD_FINALIZE_EMPTY", 500);
  return { file: value.file, session: value.session };
}

export async function abortDropUpload(input: { sessionId: string; failureCode: string; failureMessage: string }) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_abort_upload_atomic", {
    p_session_id: input.sessionId,
    p_failure_code: input.failureCode,
    p_failure_message: input.failureMessage,
  });
  if (error) mapRpcError(error);
  return data as { file?: DropFileRecord; session?: DropUploadSessionRecord; reservationReleased?: boolean } | null;
}

export async function getDropUploadBundle(sessionId: string) {
  const client = getDropSupabaseClient();
  const { data: session, error: sessionError } = await client.from("drop_upload_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (sessionError) databaseError("A feltöltési munkamenet betöltése sikertelen.", sessionError);
  if (!session) return null;
  const [fileResult, packageResult] = await Promise.all([
    client.from("drop_files").select("*").eq("id", session.file_id).maybeSingle(),
    client.from("drop_packages").select("*").eq("id", session.package_id).maybeSingle(),
  ]);
  if (fileResult.error) databaseError("A feltöltött fájlrekord betöltése sikertelen.", fileResult.error);
  if (packageResult.error) databaseError("A Drop csomag betöltése sikertelen.", packageResult.error);
  if (!fileResult.data || !packageResult.data) return null;
  return {
    session: session as DropUploadSessionRecord,
    file: fileResult.data as DropFileRecord,
    package: packageResult.data as DropPackageRecord,
  };
}

export async function getDropMultipartSchemaHealth() {
  const storage = await getDropStorageSchemaHealth();
  const marker = storage.marker;
  const v034Ready = marker?.schema_version === "DROP 0.3.4"
    && Number(marker?.migration_count) === 2
    && marker?.bootstrap_id === "drop-034-resumable-multipart-20260802"
    && marker?.metadata?.resumableMultipartUpload === true
    && Number(marker?.metadata?.maxFileSizeBytes) === 524_288_000;
  const v040Ready = marker?.schema_version === "DROP 0.4.0"
    && Number(marker?.migration_count) === 3
    && marker?.bootstrap_id === "drop-040-private-s3-storage-20260802"
    && marker?.metadata?.directMultipartUpload === true
    && marker?.metadata?.partManifestIntegrity === true;
  const v050Ready = marker?.schema_version === "DROP 0.5.0"
    && Number(marker?.migration_count) === 4
    && marker?.bootstrap_id === "drop-050-malware-retention-download-20260803"
    && marker?.metadata?.directMultipartUpload === true
    && marker?.metadata?.partManifestIntegrity === true
    && marker?.metadata?.clamdInstreamScan === true;
  return { ready: Boolean(storage.ready && (v034Ready || v040Ready || v050Ready)), storage };
}

export async function listDropUploadParts(sessionId: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_upload_parts")
    .select("id,session_id,part_number,size_bytes,etag,checksum,status,created_at,completed_at")
    .eq("session_id", sessionId)
    .order("part_number", { ascending: true });
  if (error) databaseError("A feltöltési részek nem tölthetők be.", error);
  return data || [];
}

export async function countActiveDropUploadSessions(packageId: string) {
  const client = getDropSupabaseClient();
  const { count, error } = await client
    .from("drop_upload_sessions")
    .select("id", { count: "exact", head: true })
    .eq("package_id", packageId)
    .in("status", ["initialized", "uploading", "parts_received"])
    .gt("expires_at", new Date().toISOString());
  if (error) databaseError("Az aktív feltöltési munkamenetek nem számolhatók meg.", error);
  return count || 0;
}

export async function findReusableDropUpload(input: { packageId: string; clientUploadId: string }) {
  const client = getDropSupabaseClient();
  const { data: session, error } = await client
    .from("drop_upload_sessions")
    .select("*")
    .eq("package_id", input.packageId)
    .eq("client_upload_id", input.clientUploadId)
    .in("status", ["initialized", "uploading", "parts_received"])
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) databaseError("A folytatható feltöltési munkamenet keresése sikertelen.", error);
  if (!session) return null;
  const bundle = await getDropUploadBundle(session.id);
  if (!bundle) return null;
  const parts = await listDropUploadParts(session.id);
  return { ...bundle, parts };
}

export async function markDropUploadPartReceived(input: {
  sessionId: string;
  partNumber: number;
  receivedBytes: number;
  checksum: string;
  etag?: string | null;
}) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_mark_upload_part_received", {
    p_session_id: input.sessionId,
    p_part_number: input.partNumber,
    p_received_bytes: input.receivedBytes,
    p_checksum: input.checksum,
    p_etag: input.etag || null,
  });
  if (error) mapRpcError(error);
  const value = data as { part?: Record<string, unknown>; session?: DropUploadSessionRecord; allPartsReceived?: boolean } | null;
  if (!value?.part || !value.session) throw new DropRepositoryError("A feltöltési rész rögzítése hiányos.", "DROP_UPLOAD_PART_RECEIVE_EMPTY", 500);
  return { part: value.part, session: value.session, allPartsReceived: Boolean(value.allPartsReceived) };
}

export async function finalizeDropMultipartReceived(input: { sessionId: string; receivedBytes: number; sha256: string }) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_finalize_multipart_received", {
    p_session_id: input.sessionId,
    p_received_bytes: input.receivedBytes,
    p_sha256: input.sha256,
  });
  if (error) mapRpcError(error);
  const value = data as { file?: DropFileRecord; session?: DropUploadSessionRecord } | null;
  if (!value?.file || !value.session) throw new DropRepositoryError("A multipart feltöltés lezárása hiányos.", "DROP_UPLOAD_MULTIPART_FINALIZE_EMPTY", 500);
  return { file: value.file, session: value.session };
}

export async function listDropPackageFiles(packageId: string) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_files")
    .select("*")
    .eq("package_id", packageId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) databaseError("A Drop csomag fájllistája nem tölthető be.", error);
  return (data || []) as DropFileRecord[];
}


export async function finalizeDropS3QuarantineUpload(input: {
  sessionId: string;
  storedBytes: number;
  manifestSha256: string;
  objectEtag: string;
  detectedMimeType: string;
  quarantineReason: string;
}) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_finalize_s3_quarantine_upload", {
    p_session_id: input.sessionId,
    p_stored_bytes: input.storedBytes,
    p_manifest_sha256: input.manifestSha256,
    p_object_etag: input.objectEtag,
    p_detected_mime_type: input.detectedMimeType,
    p_quarantine_reason: input.quarantineReason,
  });
  if (error) mapRpcError(error);
  const value = data as { file?: DropFileRecord; session?: DropUploadSessionRecord } | null;
  if (!value?.file || !value.session) {
    throw new DropRepositoryError("Az S3 karantén-véglegesítés hiányos választ adott.", "DROP_S3_FINALIZE_EMPTY", 500);
  }
  return { file: value.file, session: value.session };
}

export type DropObjectCleanupTask = {
  id: string;
  package_id: string | null;
  file_id: string | null;
  session_id: string | null;
  storage_bucket: string;
  storage_key: string;
  storage_multipart_id: string | null;
  operation: "DELETE_OBJECT" | "ABORT_MULTIPART";
  reason: string;
  status: "pending" | "failed" | "completed";
  attempts: number;
  last_error: string | null;
};

export async function queueDropObjectCleanup(input: {
  packageId?: string | null;
  fileId?: string | null;
  sessionId?: string | null;
  storageBucket: string;
  storageKey: string;
  storageMultipartId?: string | null;
  operation: "DELETE_OBJECT" | "ABORT_MULTIPART";
  reason: string;
}) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_queue_object_cleanup", {
    p_package_id: input.packageId || null,
    p_file_id: input.fileId || null,
    p_session_id: input.sessionId || null,
    p_storage_bucket: input.storageBucket,
    p_storage_key: input.storageKey,
    p_storage_multipart_id: input.storageMultipartId || null,
    p_operation: input.operation,
    p_reason: input.reason,
  });
  if (error) mapRpcError(error);
  return data as DropObjectCleanupTask;
}

export async function completeDropObjectCleanup(input: { taskId: string; success: boolean; error?: string | null }) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.rpc("drop_complete_object_cleanup", {
    p_task_id: input.taskId,
    p_success: input.success,
    p_error: input.error || null,
  });
  if (error) mapRpcError(error);
  return data as DropObjectCleanupTask;
}

export async function listPendingDropObjectCleanup(limit = 50) {
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_object_cleanup_tasks")
    .select("*")
    .in("status", ["pending", "failed"])
    .lt("attempts", 100)
    .order("requested_at", { ascending: true })
    .limit(Math.max(1, Math.min(200, limit)));
  if (error) databaseError("A DROP objektumtakarítási sor nem tölthető be.", error);
  return (data || []) as DropObjectCleanupTask[];
}
