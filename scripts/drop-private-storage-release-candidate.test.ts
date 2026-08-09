import assert from "node:assert/strict";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer";
import { createDropPackage } from "../app/lib/drop/dropRepository";
import {
  acceptDropSpaceInvitation,
  createDropSpace,
  inviteDropSpaceMember,
} from "../app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "../app/lib/drop/dropSpaceSecurity";
import { getDropUploadBundle } from "../app/lib/drop/storage/dropStorageRepository";
import { removeDropStoredFile, statDropQuarantineFile } from "../app/lib/drop/storage/dropLocalStorage";

const port = Number(process.env.DROP_STORAGE_RELEASE_PORT || 3232);

type RequestInput = {
  method?: string;
  json?: unknown;
  buffer?: Buffer;
  cookie?: string;
  authorization?: string;
  contentType?: string;
};

function request(path: string, input: RequestInput = {}) {
  return new Promise<{ status: number; json: unknown; raw: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const payload = input.buffer ?? (input.json === undefined ? null : Buffer.from(JSON.stringify(input.json), "utf8"));
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method: input.method || "GET",
      headers: {
        Host: "drop.dimpro.hu",
        Accept: "application/json",
        ...(payload ? {
          "Content-Type": input.contentType || (input.buffer ? "application/octet-stream" : "application/json"),
          "Content-Length": payload.length,
        } : {}),
        ...(input.cookie ? { Cookie: input.cookie } : {}),
        ...(input.authorization ? { Authorization: input.authorization } : {}),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json: unknown = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { /* raw retained */ }
        resolve({ status: res.statusCode || 0, json, raw, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function assertNoStorageSecrets(raw: string) {
  for (const forbidden of ["storage_key", "storageKey", "storage_bucket", "storageBucket", "received_sha256", '"sha256"', "DROP_UPLOAD_SESSION_SECRET"]) {
    assert.equal(raw.includes(forbidden), false, `Tiltott belső mező az API-válaszban: ${forbidden}`);
  }
}

async function uploadThroughInitialized(initialized: {
  session: { id: string };
  uploadToken: string;
  uploadUrl: string;
  completeUrl: string;
}, content: Buffer) {
  const contentResponse = await request(initialized.uploadUrl, {
    method: "PUT",
    buffer: content,
    authorization: `Bearer ${initialized.uploadToken}`,
    contentType: "application/octet-stream",
  });
  assert.equal(contentResponse.status, 200, contentResponse.raw);
  assertNoStorageSecrets(contentResponse.raw);
  const contentJson = contentResponse.json as { status?: string; receivedBytes?: number };
  assert.equal(contentJson.status, "uploaded");
  assert.equal(contentJson.receivedBytes, content.length);

  const completeResponse = await request(initialized.completeUrl, {
    method: "POST",
    authorization: `Bearer ${initialized.uploadToken}`,
  });
  assert.equal(completeResponse.status, 200, completeResponse.raw);
  assertNoStorageSecrets(completeResponse.raw);
  const completeJson = completeResponse.json as {
    result?: {
      file?: { uploadStatus?: string; processingStatus?: string; virusScanStatus?: string; securityStatus?: string; sizeBytes?: number };
      downloadable?: boolean;
      quarantineOnly?: boolean;
    };
  };
  assert.equal(completeJson.result?.file?.uploadStatus, "processing");
  assert.equal(completeJson.result?.file?.processingStatus, "quarantined");
  assert.equal(completeJson.result?.file?.virusScanStatus, "scanner_required");
  assert.equal(completeJson.result?.file?.securityStatus, "scanner_required");
  assert.equal(completeJson.result?.file?.sizeBytes, content.length);
  assert.equal(completeJson.result?.downloadable, false);
  assert.equal(completeJson.result?.quarantineOnly, true);
}

async function main() {
  if (process.env.DROP_ALLOW_STORAGE_RELEASE_TEST !== "DROP-STORAGE-RELEASE-TEST") {
    throw new Error("Hiányzó DROP 0.3.3 candidate tesztengedély.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(url && key);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unique = Date.now().toString(36);
  let spaceId: string | null = null;
  let packageId: string | null = null;
  const sessionIds: string[] = [];
  const storageKeys: string[] = [];
  const browserErrors: string[] = [];
  const consoleErrors: string[] = [];

  try {
    const createdSpace = await createDropSpace({
      name: `DROP 0.3.3 candidate storage ${unique}`,
      ownerLicenseId: `drop-v033-candidate-license-${unique}`,
      ownerUserId: `drop-v033-candidate-owner-${unique}`,
      ownerName: "DROP 0.3.3 candidate gazda",
      ownerEmail: `owner-${unique}@example.hu`,
      licenseEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      accessExpiryMode: "license",
      maxMembers: 10,
      maxPackages: 10,
      storageQuotaBytes: 50 * 1024 * 1024,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
    });
    spaceId = createdSpace.space.id;
    const invitation = await inviteDropSpaceMember(spaceId, {
      displayName: "Candidate közreműködő",
      email: `candidate-${unique}@example.hu`,
      role: "contributor",
    });
    const accepted = await acceptDropSpaceInvitation(invitation.rawInvitationToken);
    const created = await createDropPackage({
      mode: "file",
      title: `Candidate storage csomag ${unique}`,
      description: "DROP 0.3.3 candidate HTTP teszt.",
      uploaderName: accepted.membership.displayName,
      uploaderEmail: accepted.membership.email,
      retentionDays: 7,
      recipients: [],
      groups: [],
      maxFileCount: 10,
      maxFileSizeBytes: 9 * 1024 * 1024,
      maxTotalSizeBytes: 30 * 1024 * 1024,
      spaceContext: {
        spaceId,
        createdByMembershipId: accepted.membership.id,
        visibility: "private",
        selectedMembershipIds: [],
      },
    }, {
      userId: `space-member:${accepted.membership.id}`,
      name: accepted.membership.displayName,
      email: accepted.membership.email,
    });
    packageId = created.package.id;
    const disableMail = await client.from("drop_packages").update({ notify_on_upload_complete: false }).eq("id", packageId);
    assert.equal(disableMail.error, null, disableMail.error?.message);
    const cookie = `${DROP_SPACE_SESSION_COOKIE}=${accepted.sessionToken}`;

    const filesBefore = await request(`/api/drop/spaces/packages/${packageId}/files`, { cookie });
    assert.equal(filesBefore.status, 200, filesBefore.raw);
    assertNoStorageSecrets(filesBefore.raw);
    const filesBeforeJson = filesBefore.json as { readiness?: Record<string, unknown>; package?: { canUpload?: boolean }; files?: unknown[] };
    assert.equal(filesBeforeJson.readiness?.schemaReady, true);
    assert.equal(filesBeforeJson.readiness?.storageCoreEnabled, true);
    assert.equal(filesBeforeJson.readiness?.quarantineUploadEnabled, true);
    assert.equal(filesBeforeJson.readiness?.quarantineUploadReady, true);
    assert.equal(filesBeforeJson.readiness?.publicDownloadReady, false);
    assert.equal(filesBeforeJson.package?.canUpload, true);
    assert.equal(filesBeforeJson.files?.length, 0);

    const spaceContent = Buffer.from("DROP 0.3.3 térsession HTTP karantén teszt.\n", "utf8");
    const spaceInit = await request(`/api/drop/spaces/packages/${packageId}/uploads/init`, {
      method: "POST",
      cookie,
      json: {
        fileName: "ter-session-teszt.txt",
        sizeBytes: spaceContent.length,
        mimeType: "text/plain",
        clientUploadId: `space-${unique}`,
        rulesAccepted: true,
        rulesVersion: "DIMPRO-DROP-UPLOAD-HU-1.0",
        rulesAcceptedAt: new Date().toISOString(),
      },
    });
    assert.equal(spaceInit.status, 201, spaceInit.raw);
    assertNoStorageSecrets(spaceInit.raw);
    const spaceInitialized = (spaceInit.json as { initialized?: { session: { id: string }; uploadToken: string; uploadUrl: string; completeUrl: string } }).initialized;
    assert.ok(spaceInitialized);
    sessionIds.push(spaceInitialized.session.id);
    const spaceBundle = await getDropUploadBundle(spaceInitialized.session.id);
    assert.ok(spaceBundle);
    storageKeys.push(spaceBundle.file.storage_key);
    await uploadThroughInitialized(spaceInitialized, spaceContent);

    const capabilityContent = Buffer.from("DROP 0.3.3 capability HTTP karantén teszt.\n", "utf8");
    const capabilityInit = await request("/api/drop/access/uploads/init", {
      method: "POST",
      authorization: `Bearer ${created.rawTokens.upload}`,
      json: {
        fileName: "capability-teszt.txt",
        sizeBytes: capabilityContent.length,
        mimeType: "text/plain",
        clientUploadId: `capability-${unique}`,
        rulesAccepted: true,
        rulesVersion: "DIMPRO-DROP-UPLOAD-HU-1.0",
        rulesAcceptedAt: new Date().toISOString(),
        uploadedByName: "Külső candidate feltöltő",
        uploadedByEmail: `external-${unique}@example.hu`,
      },
    });
    assert.equal(capabilityInit.status, 201, capabilityInit.raw);
    assertNoStorageSecrets(capabilityInit.raw);
    const capabilityInitialized = (capabilityInit.json as { initialized?: { session: { id: string }; uploadToken: string; uploadUrl: string; completeUrl: string } }).initialized;
    assert.ok(capabilityInitialized);
    sessionIds.push(capabilityInitialized.session.id);
    const capabilityBundle = await getDropUploadBundle(capabilityInitialized.session.id);
    assert.ok(capabilityBundle);
    storageKeys.push(capabilityBundle.file.storage_key);
    await uploadThroughInitialized(capabilityInitialized, capabilityContent);

    const [spaceStat, capabilityStat] = await Promise.all(storageKeys.map((storageKey) => statDropQuarantineFile(storageKey)));
    assert.equal(spaceStat.sizeBytes, spaceContent.length);
    assert.equal(capabilityStat.sizeBytes, capabilityContent.length);

    const filesAfter = await request(`/api/drop/spaces/packages/${packageId}/files`, { cookie });
    assert.equal(filesAfter.status, 200, filesAfter.raw);
    assertNoStorageSecrets(filesAfter.raw);
    const filesAfterJson = filesAfter.json as { files?: Array<Record<string, unknown>> };
    assert.equal(filesAfterJson.files?.length, 2);
    for (const file of filesAfterJson.files || []) {
      assert.equal(file.upload_status, "processing");
      assert.equal(file.processing_status, "quarantined");
      assert.equal(file.virus_scan_status, "scanner_required");
      assert.equal(file.security_status, "scanner_required");
      assert.equal("storage_key" in file, false);
      assert.equal("sha256" in file, false);
    }

    const dbFiles = await client.from("drop_files")
      .select("id,upload_status,processing_status,virus_scan_status,security_status,size_stored_bytes,storage_key")
      .eq("package_id", packageId)
      .order("created_at", { ascending: true });
    assert.equal(dbFiles.error, null, dbFiles.error?.message);
    assert.equal(dbFiles.data?.length, 2);
    assert.equal(dbFiles.data?.every((file) => file.upload_status === "processing" && file.processing_status === "quarantined" && file.virus_scan_status === "scanner_required" && file.security_status === "scanner_required"), true);

    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP drop.dimpro.hu 127.0.0.1"] });
    try {
      const page = await browser.newPage();
      page.on("pageerror", (error) => browserErrors.push(error instanceof Error ? error.message : String(error)));
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      await page.setCookie({ name: DROP_SPACE_SESSION_COOKIE, value: accepted.sessionToken, domain: "drop.dimpro.hu", path: "/", httpOnly: true, secure: false, sameSite: "Lax" });
      await page.goto(`http://drop.dimpro.hu:${port}/space/${createdSpace.space.publicCode}`, { waitUntil: "networkidle0", timeout: 60_000 });
      await page.waitForFunction(() => document.body.innerText.toLocaleLowerCase("hu-HU").includes("privát karanténfeltöltés"), { timeout: 30_000 });
      const spaceUi = await page.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find((node) => (node.textContent || "").includes("Fájlok kiválasztása"));
        const body = document.body.innerText.toLocaleLowerCase("hu-HU");
        return {
          panelVisible: body.includes("privát karanténfeltöltés"),
          buttonDisabled: button instanceof HTMLButtonElement ? button.disabled : null,
          scannerWarning: body.includes("vírusellenőrzés"),
          fileVisible: body.includes("ter-session-teszt.txt") && body.includes("capability-teszt.txt"),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        };
      });
      assert.equal(spaceUi.panelVisible, true);
      assert.equal(spaceUi.buttonDisabled, false);
      assert.equal(spaceUi.scannerWarning, true);
      assert.equal(spaceUi.fileVisible, true);
      assert.equal(spaceUi.overflow, false);

      const capabilityPage = await browser.newPage();
      capabilityPage.on("pageerror", (error) => browserErrors.push(error instanceof Error ? error.message : String(error)));
      capabilityPage.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      await capabilityPage.goto(`http://drop.dimpro.hu:${port}/u/${encodeURIComponent(created.rawTokens.upload)}`, { waitUntil: "networkidle0", timeout: 60_000 });
      await capabilityPage.waitForFunction(() => document.body.innerText.includes("A meghívólink érvényes"), { timeout: 30_000 });
      const capabilityUi = await capabilityPage.evaluate(() => {
        const body = document.body.innerText.toLocaleLowerCase("hu-HU");
        return {
          valid: body.includes("a meghívólink érvényes"),
          uploadPanelVisible: body.includes("feltöltő neve"),
          fileInputPresent: Boolean(document.querySelector('input[type="file"]')),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        };
      });
      assert.equal(capabilityUi.valid, true);
      assert.equal(capabilityUi.uploadPanelVisible, true);
      assert.equal(capabilityUi.fileInputPresent, true);
      assert.equal(capabilityUi.overflow, false);
      await capabilityPage.close();
    } finally {
      await browser.close();
    }
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(consoleErrors.filter((item) => !item.includes("favicon")), []);

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.3",
      spaceSessionUpload: true,
      capabilityUpload: true,
      fileCount: dbFiles.data?.length || 0,
      filesInPrivateQuarantine: 2,
      apiStorageSecretsExposed: false,
      scannerRequired: true,
      downloadable: false,
      maxUploadMb: 9,
      spaceUiEnabled: true,
      capabilityUiEnabled: true,
      browserErrors: browserErrors.length,
      consoleErrors: consoleErrors.length,
    }, null, 2));
  } finally {
    for (let i = 0; i < sessionIds.length; i += 1) {
      await removeDropStoredFile({ sessionId: sessionIds[i], storageKey: storageKeys[i] }).catch(() => undefined);
    }
    if (packageId) {
      const deleted = await client.from("drop_packages").delete().eq("id", packageId);
      if (deleted.error) throw new Error(`Candidate csomagtakarítási hiba: ${deleted.error.message}`);
    }
    if (spaceId) {
      const deleted = await client.from("drop_spaces").delete().eq("id", spaceId);
      if (deleted.error) throw new Error(`Candidate tértakarítási hiba: ${deleted.error.message}`);
    }
    const [remainingSpace, remainingPackage, remainingFiles] = await Promise.all([
      client.from("drop_spaces").select("id", { count: "exact", head: true }).ilike("name", "DROP 0.3.3 candidate storage%"),
      client.from("drop_packages").select("id", { count: "exact", head: true }).ilike("title", "Candidate storage csomag%"),
      client.from("drop_files").select("id", { count: "exact", head: true }).in("storage_key", storageKeys.length ? storageKeys : ["none"]),
    ]);
    for (const result of [remainingSpace, remainingPackage, remainingFiles]) if (result.error) throw result.error;
    assert.equal(remainingSpace.count || 0, 0);
    assert.equal(remainingPackage.count || 0, 0);
    assert.equal(remainingFiles.count || 0, 0);
    console.log(JSON.stringify({ cleanupCompleted: true, testFilesRetained: false, testPackageRetained: false, testSpaceRetained: false }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
