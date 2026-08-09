import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createDropPackage } from "../app/lib/drop/dropRepository";
import { acceptDropSpaceInvitation, createDropSpace, inviteDropSpaceMember } from "../app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "../app/lib/drop/dropSpaceSecurity";
import { getDropUploadBundle } from "../app/lib/drop/storage/dropStorageRepository";
import { removeDropStoredFile, statDropQuarantineFile } from "../app/lib/drop/storage/dropLocalStorage";

async function jsonRequest(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const raw = await response.text();
  let json: unknown = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { /* raw retained */ }
  return { status: response.status, raw, json };
}

async function main() {
  if (process.env.DROP_ALLOW_STORAGE_HTTPS_TEST !== "DROP-STORAGE-HTTPS-TEST") throw new Error("Hiányzó HTTPS tesztengedély.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(url && key);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unique = Date.now().toString(36);
  let spaceId: string | null = null;
  let packageId: string | null = null;
  let sessionId: string | null = null;
  let storageKey: string | null = null;

  try {
    const createdSpace = await createDropSpace({
      name: `DROP 0.3.3 HTTPS storage ${unique}`,
      ownerLicenseId: `drop-v033-https-license-${unique}`,
      ownerUserId: `drop-v033-https-owner-${unique}`,
      ownerName: "DROP 0.3.3 HTTPS gazda",
      ownerEmail: `owner-${unique}@example.hu`,
      licenseEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      accessExpiryMode: "license",
      maxMembers: 5,
      maxPackages: 5,
      storageQuotaBytes: 20 * 1024 * 1024,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
    });
    spaceId = createdSpace.space.id;
    const invitation = await inviteDropSpaceMember(spaceId, {
      displayName: "HTTPS közreműködő",
      email: `https-${unique}@example.hu`,
      role: "contributor",
    });
    const accepted = await acceptDropSpaceInvitation(invitation.rawInvitationToken);
    const created = await createDropPackage({
      mode: "file",
      title: `HTTPS storage csomag ${unique}`,
      description: "Nginx/TLS streaming teszt.",
      uploaderName: accepted.membership.displayName,
      uploaderEmail: accepted.membership.email,
      retentionDays: 2,
      recipients: [],
      groups: [],
      maxFileCount: 5,
      maxFileSizeBytes: 9 * 1024 * 1024,
      maxTotalSizeBytes: 10 * 1024 * 1024,
      spaceContext: { spaceId, createdByMembershipId: accepted.membership.id, visibility: "private", selectedMembershipIds: [] },
    }, {
      userId: `space-member:${accepted.membership.id}`,
      name: accepted.membership.displayName,
      email: accepted.membership.email,
    });
    packageId = created.package.id;
    await client.from("drop_packages").update({ notify_on_upload_complete: false }).eq("id", packageId);
    const cookie = `${DROP_SPACE_SESSION_COOKIE}=${accepted.sessionToken}`;
    const content = Buffer.from("DROP 0.3.3 HTTPS Nginx streaming teszt.\n", "utf8");

    const initializedResponse = await jsonRequest(`https://drop.dimpro.hu/api/drop/spaces/packages/${packageId}/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        fileName: "https-nginx-teszt.txt",
        sizeBytes: content.length,
        mimeType: "text/plain",
        clientUploadId: `https-${unique}`,
        rulesAccepted: true,
        rulesVersion: "DIMPRO-DROP-UPLOAD-HU-1.0",
        rulesAcceptedAt: new Date().toISOString(),
      }),
    });
    assert.equal(initializedResponse.status, 201, initializedResponse.raw);
    const initialized = (initializedResponse.json as { initialized?: { session: { id: string }; uploadToken: string; uploadUrl: string; completeUrl: string } }).initialized;
    assert.ok(initialized);
    sessionId = initialized.session.id;
    const bundle = await getDropUploadBundle(sessionId);
    assert.ok(bundle);
    storageKey = bundle.file.storage_key;

    const contentResponse = await jsonRequest(`https://drop.dimpro.hu${initialized.uploadUrl}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${initialized.uploadToken}`, "content-type": "application/octet-stream", "content-length": String(content.length) },
      body: content,
    });
    assert.equal(contentResponse.status, 200, contentResponse.raw);
    assert.equal(contentResponse.raw.includes('"sha256"'), false);

    const completeResponse = await jsonRequest(`https://drop.dimpro.hu${initialized.completeUrl}`, {
      method: "POST",
      headers: { authorization: `Bearer ${initialized.uploadToken}` },
    });
    assert.equal(completeResponse.status, 200, completeResponse.raw);
    const result = (completeResponse.json as { result?: { file?: { securityStatus?: string }; downloadable?: boolean } }).result;
    assert.equal(result?.file?.securityStatus, "scanner_required");
    assert.equal(result?.downloadable, false);
    const fileStat = await statDropQuarantineFile(storageKey);
    assert.equal(fileStat.sizeBytes, content.length);

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.3",
      httpsTls: true,
      nginxProxy: true,
      streamingUpload: true,
      status: "scanner_required",
      downloadable: false,
      fileBytes: content.length,
    }, null, 2));
  } finally {
    if (sessionId || storageKey) await removeDropStoredFile({ sessionId: sessionId || undefined, storageKey: storageKey || undefined }).catch(() => undefined);
    if (packageId) await client.from("drop_packages").delete().eq("id", packageId);
    if (spaceId) await client.from("drop_spaces").delete().eq("id", spaceId);
    const [spaces, packages, files] = await Promise.all([
      client.from("drop_spaces").select("id", { count: "exact", head: true }).ilike("name", "DROP 0.3.3 HTTPS storage%"),
      client.from("drop_packages").select("id", { count: "exact", head: true }).ilike("title", "HTTPS storage csomag%"),
      client.from("drop_files").select("id", { count: "exact", head: true }).eq("display_name", "https-nginx-teszt.txt"),
    ]);
    for (const item of [spaces, packages, files]) if (item.error) throw item.error;
    assert.equal(spaces.count || 0, 0);
    assert.equal(packages.count || 0, 0);
    assert.equal(files.count || 0, 0);
    console.log(JSON.stringify({ cleanupCompleted: true, testFileRetained: false, testPackageRetained: false, testSpaceRetained: false }, null, 2));
  }
}

void main().catch((error) => { console.error(error); process.exit(1); });
