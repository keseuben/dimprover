import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { createDropPackage } from "../app/lib/drop/dropRepository";
import { createDropSpace, inviteDropSpaceMember, acceptDropSpaceInvitation } from "../app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "../app/lib/drop/dropSpaceSecurity";
import { getDropUploadBundle } from "../app/lib/drop/storage/dropStorageRepository";
import { deleteDropS3Object, headDropS3Object } from "../app/lib/drop/storage/dropS3Storage";

const PORT = Number(process.env.DROP_V050_CANDIDATE_PORT || 3132);
const RULES_VERSION = "DIMPRO-DROP-UPLOAD-HU-1.0";
const EICAR = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*", "utf8");
const CLEAN = Buffer.from("DIMPRO DROP 0.5.0 clean ClamAV E2E test file.\n", "utf8");

type JsonObject = Record<string, unknown>;
type ApiResult = { status: number; raw: string; json: JsonObject | null; headers: http.IncomingHttpHeaders };
type InitializedUpload = {
  storageProvider: string;
  protocol: string;
  session: { id: string; totalParts: number };
  partSignUrlTemplate: string;
  uploadToken: string;
  completeUrl: string;
};
type SignedPartResponse = { signed?: { url?: string } };
type CompleteResponse = { result?: { file?: { virusScanStatus?: string } } };
type DownloadResponse = {
  ok?: boolean;
  security?: { virusScanStatus?: string; fullFileSha256Verified?: boolean };
  download?: { url?: string };
};

function api(path: string, input: { method?: string; host?: string; json?: unknown; cookie?: string; authorization?: string; workerSecret?: string } = {}) {
  return new Promise<ApiResult>((resolve, reject) => {
    const payload = input.json === undefined ? null : Buffer.from(JSON.stringify(input.json), "utf8");
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path,
      method: input.method || "GET",
      timeout: 120_000,
      headers: {
        Host: input.host || "drop.dimpro.hu",
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
        ...(input.cookie ? { Cookie: input.cookie } : {}),
        ...(input.authorization ? { Authorization: input.authorization } : {}),
        ...(input.workerSecret ? { "x-dimpro-drop-worker-secret": input.workerSecret } : {}),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json: JsonObject | null = null;
        try { json = raw ? JSON.parse(raw) : null; } catch {}
        resolve({ status: res.statusCode || 0, raw, json, headers: res.headers });
      });
    });
    req.on("timeout", () => req.destroy(new Error("DROP 0.5.0 candidate API timeout.")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function assertNoSecrets(value: string) {
  for (const forbidden of ["secretAccessKey", "DIMPRO_DROP_S3_SECRET_ACCESS_KEY", "DIMPRO_DROP_S3_ACCESS_KEY_ID", "storage_multipart_id"]) {
    assert.equal(value.includes(forbidden), false, `Secret/internal value exposed: ${forbidden}`);
  }
}

async function objectMissing(storageKey: string, bucket: string) {
  try { await headDropS3Object({ storageKey, bucket }); return false; } catch { return true; }
}

async function uploadSinglePart(input: { packageId: string; cookie: string; name: string; body: Buffer; clientUploadId: string }) {
  const init = await api(`/api/drop/spaces/packages/${input.packageId}/uploads/init`, {
    method: "POST",
    cookie: input.cookie,
    json: {
      fileName: input.name,
      sizeBytes: input.body.length,
      mimeType: "text/plain",
      clientUploadId: input.clientUploadId,
      rulesAccepted: true,
      rulesVersion: RULES_VERSION,
      rulesAcceptedAt: new Date().toISOString(),
    },
  });
  assert.equal(init.status, 201, init.raw);
  assertNoSecrets(init.raw);
  const initialized = init.json?.initialized as InitializedUpload | undefined;
  assert.ok(initialized);
  assert.equal(initialized.storageProvider, "s3-compatible");
  assert.equal(initialized.protocol, "multipart");
  assert.equal(initialized.session.totalParts, 1);

  const signPath = String(initialized.partSignUrlTemplate).replace("{partNumber}", "1");
  const sign = await api(signPath, { method: "POST", authorization: `Bearer ${initialized.uploadToken}` });
  assert.equal(sign.status, 200, sign.raw);
  assertNoSecrets(sign.raw);
  const signedUrl = (sign.json as SignedPartResponse | null)?.signed?.url;
  assert.ok(signedUrl);
  const put = await fetch(signedUrl, { method: "PUT", headers: { "content-type": "application/octet-stream" }, body: new Uint8Array(input.body) });
  assert.ok(put.ok, `Signed PUT failed: ${put.status}`);
  const etag = put.headers.get("etag")?.replace(/^\"|\"$/g, "") || "";
  assert.ok(etag);
  const checksum = createHash("sha256").update(input.body).digest("hex");
  const confirm = await api(signPath, {
    method: "PATCH",
    authorization: `Bearer ${initialized.uploadToken}`,
    json: { checksum, etag, receivedBytes: input.body.length },
  });
  assert.equal(confirm.status, 200, confirm.raw);
  const complete = await api(initialized.completeUrl, { method: "POST", authorization: `Bearer ${initialized.uploadToken}` });
  assert.equal(complete.status, 200, complete.raw);
  assert.equal((complete.json as CompleteResponse | null)?.result?.file?.virusScanStatus, "scanner_required");
  const bundle = await getDropUploadBundle(initialized.session.id);
  assert.ok(bundle);
  return { fileId: bundle.file.id, sessionId: initialized.session.id, storageKey: bundle.file.storage_key, bucket: bundle.file.storage_bucket, checksum };
}

async function main() {
  if (process.env.DROP_ALLOW_V050_POST_SQL_E2E !== "DROP-V050-POST-SQL-E2E") throw new Error("Missing explicit DROP 0.5.0 E2E permission.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const workerSecret = process.env.DROP_WORKER_SECRET?.trim();
  assert.ok(url && key && workerSecret);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unique = Date.now().toString(36);
  let spaceId: string | null = null;
  let packageId: string | null = null;
  const objects: Array<{ storageKey: string; bucket: string }> = [];
  let cleanFileId = "";
  let infectedFileId = "";

  try {
    const space = await createDropSpace({
      name: `DROP 0.5.0 worker E2E ${unique}`,
      ownerLicenseId: `drop-v050-license-${unique}`,
      ownerUserId: `drop-v050-owner-${unique}`,
      ownerName: "DROP 0.5.0 E2E owner",
      ownerEmail: `owner-${unique}@example.hu`,
      licenseEndsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      accessExpiryMode: "license",
      maxMembers: 5,
      maxPackages: 5,
      storageQuotaBytes: 64 * 1024 * 1024,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
    });
    spaceId = space.space.id;
    const invitation = await inviteDropSpaceMember(spaceId, { displayName: "DROP E2E contributor", email: `contributor-${unique}@example.hu`, role: "contributor" });
    const accepted = await acceptDropSpaceInvitation(invitation.rawInvitationToken);
    const created = await createDropPackage({
      mode: "file",
      title: `DROP 0.5.0 scan E2E ${unique}`,
      description: "Clean, EICAR, signed download and retention report gate test.",
      uploaderName: accepted.membership.displayName,
      uploaderEmail: accepted.membership.email,
      retentionDays: 3,
      recipients: [],
      groups: [],
      maxFileCount: 5,
      maxFileSizeBytes: 10 * 1024 * 1024,
      maxTotalSizeBytes: 32 * 1024 * 1024,
      spaceContext: { spaceId, createdByMembershipId: accepted.membership.id, visibility: "private", selectedMembershipIds: [] },
    }, { userId: `space-member:${accepted.membership.id}`, name: accepted.membership.displayName, email: accepted.membership.email });
    packageId = created.package.id;
    await client.from("drop_packages").update({ notify_on_upload_complete: false }).eq("id", packageId);
    const cookie = `${DROP_SPACE_SESSION_COOKIE}=${accepted.sessionToken}`;

    const clean = await uploadSinglePart({ packageId, cookie, name: `clean-${unique}.txt`, body: CLEAN, clientUploadId: `clean-${unique}` });
    cleanFileId = clean.fileId;
    objects.push({ storageKey: clean.storageKey, bucket: clean.bucket });
    const infected = await uploadSinglePart({ packageId, cookie, name: `eicar-${unique}.txt`, body: EICAR, clientUploadId: `eicar-${unique}` });
    infectedFileId = infected.fileId;
    objects.push({ storageKey: infected.storageKey, bucket: infected.bucket });

    const worker = await api("/api/drop/worker/run", { method: "POST", host: "127.0.0.1", workerSecret, json: { limit: 4 } });
    assert.equal(worker.status, 200, worker.raw);
    assertNoSecrets(worker.raw);
    assert.equal(worker.json?.ok, true);
    assert.ok(Number(worker.json?.claimedScanJobs) >= 2, worker.raw);

    const [cleanRow, infectedRow] = await Promise.all([
      client.from("drop_files").select("*").eq("id", cleanFileId).single(),
      client.from("drop_files").select("*").eq("id", infectedFileId).single(),
    ]);
    assert.equal(cleanRow.error, null, cleanRow.error?.message);
    assert.equal(infectedRow.error, null, infectedRow.error?.message);
    assert.equal(cleanRow.data.virus_scan_status, "clean");
    assert.equal(cleanRow.data.security_status, "clean");
    assert.equal(cleanRow.data.processing_status, "ready");
    assert.equal(cleanRow.data.upload_status, "ready");
    assert.equal(cleanRow.data.integrity_type, "FILE_SHA256");
    assert.equal(cleanRow.data.sha256, createHash("sha256").update(CLEAN).digest("hex"));
    assert.ok(cleanRow.data.download_ready_at);
    assert.equal(infectedRow.data.virus_scan_status, "infected");
    assert.equal(infectedRow.data.security_status, "infected");
    assert.equal(infectedRow.data.processing_status, "deleted");
    assert.equal(infectedRow.data.upload_status, "deleted");
    assert.ok(infectedRow.data.deleted_at);
    assert.equal(infectedRow.data.scan_signature_name, "Eicar-Test-Signature");
    assert.equal(await objectMissing(infected.storageKey, infected.bucket), true);
    assert.equal(await objectMissing(clean.storageKey, clean.bucket), false);

    const download = await api(`/api/drop/downloads/file/${cleanFileId}`, { method: "POST", host: "drop.dimpro.hu", json: { token: created.rawTokens.download } });
    assert.equal(download.status, 200, download.raw);
    assertNoSecrets(download.raw);
    const downloadPayload = download.json as DownloadResponse | null;
    assert.equal(downloadPayload?.ok, true);
    assert.equal(downloadPayload?.security?.virusScanStatus, "clean");
    assert.equal(downloadPayload?.security?.fullFileSha256Verified, true);
    assert.ok(downloadPayload?.download?.url);
    const signedDownload = await fetch(downloadPayload.download.url);
    assert.ok(signedDownload.ok, `Signed GET failed: ${signedDownload.status}`);
    const received = Buffer.from(await signedDownload.arrayBuffer());
    assert.deepEqual(received, CLEAN);

    const infectedDownload = await api(`/api/drop/downloads/file/${infectedFileId}`, { method: "POST", host: "drop.dimpro.hu", json: { token: created.rawTokens.download } });
    assert.ok([404, 409].includes(infectedDownload.status), infectedDownload.raw);

    const beforeRetention = await headDropS3Object({ storageKey: clean.storageKey, bucket: clean.bucket });
    assert.equal(beforeRetention.sizeBytes, CLEAN.length);
    const packageUpdate = await client.from("drop_packages").update({ status: "deleting", final_report_status: "not_requested" }).eq("id", packageId);
    assert.equal(packageUpdate.error, null, packageUpdate.error?.message);
    const retention = await api("/api/drop/worker/run", { method: "POST", host: "localhost", workerSecret, json: { limit: 2 } });
    assert.equal(retention.status, 200, retention.raw);
    const lifecycleValue = retention.json?.lifecycle;
    const lifecycleItems = Array.isArray(lifecycleValue) ? lifecycleValue as Array<Record<string, unknown>> : [];
    assert.ok(lifecycleItems.some((item) => item.packageId === packageId && item.status === "report-blocked"), retention.raw);
    const reportState = await client.from("drop_packages").select("final_report_status,status").eq("id", packageId).single();
    assert.equal(reportState.error, null, reportState.error?.message);
    assert.equal(reportState.data.final_report_status, "queued");
    assert.equal(reportState.data.status, "deleting");
    assert.equal(await objectMissing(clean.storageKey, clean.bucket), false);

    const downloads = await client.from("drop_downloads").select("id,status,file_id").eq("package_id", packageId);
    assert.equal(downloads.error, null, downloads.error?.message);
    assert.ok((downloads.data?.length || 0) >= 1);
    const scanEvents = await client.from("drop_events").select("event_type").eq("package_id", packageId).in("event_type", ["file.scan_clean", "file.scan_infected", "file.download_url_issued"]);
    assert.equal(scanEvents.error, null, scanEvents.error?.message);
    assert.deepEqual(new Set(scanEvents.data?.map((row) => row.event_type)), new Set(["file.scan_clean", "file.scan_infected", "file.download_url_issued"]));

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.5.0",
      candidatePort: PORT,
      schemaReady: true,
      clamdClean: true,
      eicarDetected: true,
      infectedObjectDeleted: true,
      fullFileSha256Stored: true,
      cleanSignedDownload: true,
      infectedDownloadBlocked: true,
      downloadAuditCreated: true,
      retentionReportGateBlockedDeletion: true,
      cleanObjectRetainedUntilReport: true,
      secretsExposed: false,
    }, null, 2));
  } finally {
    for (const object of objects) await deleteDropS3Object(object).catch(() => undefined);
    if (packageId) await client.from("drop_object_cleanup_tasks").delete().eq("package_id", packageId);
    if (packageId) await client.from("drop_packages").delete().eq("id", packageId);
    if (spaceId) await client.from("drop_spaces").delete().eq("id", spaceId);
    const [spaces, packages, files, jobs, downloads, cleanup] = await Promise.all([
      client.from("drop_spaces").select("id", { count: "exact", head: true }).ilike("name", "DROP 0.5.0 worker E2E%"),
      client.from("drop_packages").select("id", { count: "exact", head: true }).ilike("title", "DROP 0.5.0 scan E2E%"),
      client.from("drop_files").select("id", { count: "exact", head: true }).in("id", [cleanFileId, infectedFileId].filter(Boolean)),
      client.from("drop_jobs").select("id", { count: "exact", head: true }).eq("package_id", packageId || "00000000-0000-0000-0000-000000000000"),
      client.from("drop_downloads").select("id", { count: "exact", head: true }).eq("package_id", packageId || "00000000-0000-0000-0000-000000000000"),
      client.from("drop_object_cleanup_tasks").select("id", { count: "exact", head: true }).eq("package_id", packageId || "00000000-0000-0000-0000-000000000000"),
    ]);
    for (const result of [spaces, packages, files, jobs, downloads, cleanup]) if (result.error) throw result.error;
    assert.equal(spaces.count || 0, 0);
    assert.equal(packages.count || 0, 0);
    assert.equal(files.count || 0, 0);
    assert.equal(jobs.count || 0, 0);
    assert.equal(downloads.count || 0, 0);
    assert.equal(cleanup.count || 0, 0);
    console.log(JSON.stringify({ cleanupCompleted: true, databaseResidue: 0, s3Residue: 0 }, null, 2));
  }
}

void main().catch((error) => { console.error(error instanceof Error ? error.stack || error.message : error); process.exit(1); });
