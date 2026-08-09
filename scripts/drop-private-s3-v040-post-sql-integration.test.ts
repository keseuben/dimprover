import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createDropPackage, getDropSupabaseClient } from "../app/lib/drop/dropRepository";
import {
  completeDropObjectCleanup,
  finalizeDropS3QuarantineUpload,
  initializeDropUploadAtomic,
  listDropUploadParts,
  markDropUploadPartReceived,
  queueDropObjectCleanup,
} from "../app/lib/drop/storage/dropStorageRepository";

const TEST_PREFIX = "DROP 0.4.0 post-SQL";
const CHUNK = 5 * 1024 * 1024;
const TOTAL = CHUNK + 1024 * 1024;

async function main() {
  if (process.env.DROP_ALLOW_V040_POST_SQL_TEST !== "DROP-V040-POST-SQL-TEST") {
    throw new Error("Hiányzó DROP 0.4.0 post-SQL tesztengedély.");
  }
  const client = getDropSupabaseClient();
  const unique = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const bucket = `drop-v040-test-${unique}`;
  const objectKey = `_integration/${unique}/quarantine-object.bin`;
  const abortKey = `_integration/${unique}/aborted-object.bin`;
  const multipartId = `multipart-${unique}`;
  const abortMultipartId = `abort-${unique}`;
  let packageId: string | null = null;
  let fileId: string | null = null;
  let sessionId: string | null = null;
  const cleanupTaskIds: string[] = [];
  const checks: string[] = [];

  const pass = (name: string) => checks.push(name);
  try {
    const created = await createDropPackage({
      mode: "file",
      title: `${TEST_PREFIX} ${unique}`,
      description: "Izolált adatbázis- és RPC-integrációs teszt fizikai S3-objektum nélkül.",
      uploaderName: "DIMPRO automatikus teszt",
      uploaderEmail: `drop-v040-${unique}@example.invalid`,
      retentionDays: 1,
      recipients: [],
      groups: [],
      maxFileCount: 5,
      maxFileSizeBytes: 500 * 1024 * 1024,
      maxTotalSizeBytes: 700 * 1024 * 1024,
    }, {
      userId: `drop-v040-test-${unique}`,
      name: "DIMPRO automatikus teszt",
      email: `drop-v040-${unique}@example.invalid`,
    });
    packageId = created.package.id;
    assert.equal(created.package.status, "active");
    pass("test package created");

    fileId = randomUUID();
    sessionId = randomUUID();
    const initialized = await initializeDropUploadAtomic({
      packageId,
      fileId,
      sessionId,
      authorizationMode: "admin",
      clientUploadId: `drop-v040-post-sql-${unique}`,
      originalName: "post-sql-object.bin",
      displayName: "post-sql-object.bin",
      generatedName: `${unique}.bin`,
      extension: "bin",
      mimeType: "application/octet-stream",
      sizeBytes: TOTAL,
      storageProvider: "s3-compatible",
      storageBucket: bucket,
      storageKey: objectKey,
      storageMultipartId: multipartId,
      chunkSizeBytes: CHUNK,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      isImage: false,
      isZip: false,
      uploadedByName: "DIMPRO automatikus teszt",
      uploadedByEmail: `drop-v040-${unique}@example.invalid`,
    });
    assert.equal(initialized.session.total_parts, 2);
    assert.equal(initialized.session.storage_provider, "s3-compatible");
    assert.equal(initialized.session.storage_multipart_id, multipartId);
    pass("S3 multipart session initialized");

    const pendingParts = await listDropUploadParts(sessionId);
    assert.equal(pendingParts.length, 2);
    assert.deepEqual(pendingParts.map((part) => Number(part.size_bytes)), [CHUNK, TOTAL - CHUNK]);
    pass("multipart part rows created");

    const checksum1 = createHash("sha256").update(`part-1-${unique}`).digest("hex");
    const checksum2 = createHash("sha256").update(`part-2-${unique}`).digest("hex");
    await markDropUploadPartReceived({ sessionId, partNumber: 1, receivedBytes: CHUNK, checksum: checksum1, etag: `etag-1-${unique}` });
    const second = await markDropUploadPartReceived({ sessionId, partNumber: 2, receivedBytes: TOTAL - CHUNK, checksum: checksum2, etag: `etag-2-${unique}` });
    assert.equal(second.allPartsReceived, true);
    assert.equal(second.session.status, "parts_received");
    assert.equal(Number(second.session.uploaded_bytes), TOTAL);
    pass("parts atomically confirmed");

    const manifest = createHash("sha256")
      .update(`1:${CHUNK}:${checksum1}:etag-1-${unique}\n2:${TOTAL - CHUNK}:${checksum2}:etag-2-${unique}`)
      .digest("hex");
    const finalized = await finalizeDropS3QuarantineUpload({
      sessionId,
      storedBytes: TOTAL,
      manifestSha256: manifest,
      objectEtag: `object-etag-${unique}`,
      detectedMimeType: "application/octet-stream",
      quarantineReason: "DROP 0.4.0 automatikus post-SQL tesztkarantén.",
    });
    assert.equal(finalized.session.status, "completed");
    assert.equal(finalized.session.integrity_type, "PART_MANIFEST_SHA256");
    assert.equal(finalized.session.integrity_manifest_sha256, manifest);
    assert.equal(finalized.session.received_sha256, manifest);
    assert.equal(finalized.file.integrity_type, "PART_MANIFEST_SHA256");
    assert.equal(finalized.file.integrity_manifest_sha256, manifest);
    assert.equal(finalized.file.sha256, null);
    assert.equal(finalized.file.processing_status, "quarantined");
    assert.equal(finalized.file.security_status, "scanner_required");
    assert.equal(finalized.file.virus_scan_status, "scanner_required");
    pass("S3 quarantine finalized atomically");

    const event = await client
      .from("drop_events")
      .select("event_type,payload")
      .eq("package_id", packageId)
      .eq("file_id", fileId)
      .eq("event_type", "upload.s3_quarantined")
      .single();
    assert.equal(event.error, null, event.error?.message);
    assert.equal(event.data?.payload?.integrityType, "PART_MANIFEST_SHA256");
    assert.equal(event.data?.payload?.manifestSha256, manifest);
    assert.equal(event.data?.payload?.storageProvider, "s3-compatible");
    pass("S3 quarantine event audited");

    const queued = await queueDropObjectCleanup({
      packageId,
      fileId,
      sessionId,
      storageBucket: bucket,
      storageKey: objectKey,
      operation: "DELETE_OBJECT",
      reason: "post-SQL integration test",
    });
    cleanupTaskIds.push(queued.id);
    assert.equal(queued.status, "pending");
    assert.equal(queued.attempts, 0);
    const duplicate = await queueDropObjectCleanup({
      packageId,
      fileId,
      sessionId,
      storageBucket: bucket,
      storageKey: objectKey,
      operation: "DELETE_OBJECT",
      reason: "idempotent requeue",
    });
    assert.equal(duplicate.id, queued.id);
    pass("cleanup queue idempotent");

    const failed = await completeDropObjectCleanup({ taskId: queued.id, success: false, error: "simulated cleanup failure" });
    assert.equal(failed.status, "failed");
    assert.equal(failed.attempts, 1);
    assert.equal(failed.last_error, "simulated cleanup failure");
    const requeued = await queueDropObjectCleanup({
      packageId,
      fileId,
      sessionId,
      storageBucket: bucket,
      storageKey: objectKey,
      operation: "DELETE_OBJECT",
      reason: "retry after simulated failure",
    });
    assert.equal(requeued.id, queued.id);
    assert.equal(requeued.status, "pending");
    assert.equal(requeued.attempts, 1);
    assert.equal(requeued.last_error, null);
    const completed = await completeDropObjectCleanup({ taskId: queued.id, success: true });
    assert.equal(completed.status, "completed");
    assert.equal(completed.attempts, 2);
    assert.equal(completed.last_error, null);
    const completedAgain = await completeDropObjectCleanup({ taskId: queued.id, success: true });
    assert.equal(completedAgain.status, "completed");
    assert.equal(completedAgain.attempts, 2);
    pass("cleanup failure retry and completion");

    const abortTask = await queueDropObjectCleanup({
      packageId,
      fileId,
      sessionId,
      storageBucket: bucket,
      storageKey: abortKey,
      storageMultipartId: abortMultipartId,
      operation: "ABORT_MULTIPART",
      reason: "post-SQL abort integration test",
    });
    cleanupTaskIds.push(abortTask.id);
    assert.equal(abortTask.operation, "ABORT_MULTIPART");
    assert.equal(abortTask.storage_multipart_id, abortMultipartId);
    const abortCompleted = await completeDropObjectCleanup({ taskId: abortTask.id, success: true });
    assert.equal(abortCompleted.status, "completed");
    assert.equal(abortCompleted.attempts, 1);
    pass("multipart abort cleanup modeled");

    const invalidOperation = await client.rpc("drop_queue_object_cleanup", {
      p_package_id: packageId,
      p_file_id: fileId,
      p_session_id: sessionId,
      p_storage_bucket: bucket,
      p_storage_key: `${objectKey}-invalid`,
      p_storage_multipart_id: null,
      p_operation: "INVALID",
      p_reason: "must fail",
    });
    assert.ok(invalidOperation.error?.message.includes("DROP_CLEANUP_OPERATION_INVALID"));
    pass("invalid cleanup operation rejected");

    const invalidFinalize = await client.rpc("drop_finalize_s3_quarantine_upload", {
      p_session_id: sessionId,
      p_stored_bytes: TOTAL,
      p_manifest_sha256: manifest,
      p_object_etag: `object-etag-${unique}`,
      p_detected_mime_type: "application/octet-stream",
      p_quarantine_reason: "must fail because already completed",
    });
    assert.ok(invalidFinalize.error?.message.includes("DROP_S3_SESSION_NOT_FINALIZABLE"));
    pass("duplicate finalization rejected");

    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (anonKey) {
      const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const denied = await anon.from("drop_object_cleanup_tasks").select("id").eq("id", queued.id);
      assert.ok(denied.error, "Az anon kliensnek nem szabad olvasnia a cleanup táblát.");
      const deniedRpc = await anon.rpc("drop_complete_object_cleanup", { p_task_id: queued.id, p_success: true, p_error: null });
      assert.ok(deniedRpc.error, "Az anon kliensnek nem szabad cleanup RPC-t futtatnia.");
      pass("RLS and RPC privileges deny anon");
    }

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.4.0",
      checksPassed: checks.length,
      checks,
      sessionParts: 2,
      storedBytes: TOTAL,
      integrityType: "PART_MANIFEST_SHA256",
      fullFileSha256Claimed: false,
      quarantine: true,
      publicDownload: false,
      cleanupTasks: cleanupTaskIds.length,
      secretsExposed: false,
    }, null, 2));
  } finally {
    if (cleanupTaskIds.length) {
      const cleanupDelete = await client.from("drop_object_cleanup_tasks").delete().in("id", cleanupTaskIds);
      if (cleanupDelete.error) throw cleanupDelete.error;
    }
    if (packageId) {
      const packageDelete = await client.from("drop_packages").delete().eq("id", packageId);
      if (packageDelete.error) throw packageDelete.error;
    }
    const [packages, files, sessions, tasks] = await Promise.all([
      client.from("drop_packages").select("id", { count: "exact", head: true }).ilike("title", `${TEST_PREFIX}%`),
      client.from("drop_files").select("id", { count: "exact", head: true }).eq("storage_bucket", bucket),
      client.from("drop_upload_sessions").select("id", { count: "exact", head: true }).eq("storage_bucket", bucket),
      client.from("drop_object_cleanup_tasks").select("id", { count: "exact", head: true }).eq("storage_bucket", bucket),
    ]);
    for (const result of [packages, files, sessions, tasks]) if (result.error) throw result.error;
    assert.equal(packages.count || 0, 0);
    assert.equal(files.count || 0, 0);
    assert.equal(sessions.count || 0, 0);
    assert.equal(tasks.count || 0, 0);
    console.log(JSON.stringify({
      cleanupCompleted: true,
      testPackagesRetained: false,
      testFilesRetained: false,
      testSessionsRetained: false,
      cleanupTasksRetained: false,
    }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
