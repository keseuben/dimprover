import assert from "node:assert/strict";
import http from "node:http";
import { access } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer";
import { createDropPackage } from "../app/lib/drop/dropRepository";
import {
  acceptDropSpaceInvitation,
  createDropSpace,
  inviteDropSpaceMember,
} from "../app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "../app/lib/drop/dropSpaceSecurity";

const port = Number(process.env.DROP_STORAGE_PRE_SQL_PORT || 3230);

function request(path: string, input: { method?: string; body?: unknown; cookie?: string; authorization?: string } = {}) {
  return new Promise<{ status: number; json: unknown; raw: string }>((resolve, reject) => {
    const payload = input.body === undefined ? null : JSON.stringify(input.body);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method: input.method || "GET",
      headers: {
        Host: "drop.dimpro.hu",
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...(input.cookie ? { Cookie: input.cookie } : {}),
        ...(input.authorization ? { Authorization: input.authorization } : {}),
      },
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json: unknown = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { /* raw retained */ }
        resolve({ status: res.statusCode || 0, json, raw });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  if (process.env.DROP_ALLOW_STORAGE_PRE_SQL_TEST !== "DROP-STORAGE-PRE-SQL-TEST") {
    throw new Error("Hiányzó DROP 0.3.3 pre-SQL tesztengedély.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(url && key);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unique = Date.now().toString(36);
  let spaceId: string | null = null;
  let packageId: string | null = null;
  let cleanupCompleted = false;
  const browserErrors: string[] = [];
  const consoleErrors: string[] = [];

  try {
    const createdSpace = await createDropSpace({
      name: `DROP 0.3.3 pre-SQL storage teszt ${unique}`,
      ownerLicenseId: `storage-pre-sql-license-${unique}`,
      ownerUserId: `storage-pre-sql-owner-${unique}`,
      ownerName: "Storage pre-SQL tesztgazda",
      ownerEmail: `storage-owner-${unique}@example.hu`,
      licenseEndsAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      accessExpiryMode: "license",
      maxMembers: 10,
      maxPackages: 100,
      storageQuotaBytes: 1024 ** 3,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
    });
    spaceId = createdSpace.space.id;
    const invitation = await inviteDropSpaceMember(spaceId, {
      displayName: "Storage pre-SQL közreműködő",
      email: `storage-guest-${unique}@example.hu`,
      role: "contributor",
    });
    const accepted = await acceptDropSpaceInvitation(invitation.rawInvitationToken);
    const createdPackage = await createDropPackage({
      mode: "file",
      title: `Storage pre-SQL csomag ${unique}`,
      description: "Automatikus pre-SQL tesztcsomag.",
      uploaderName: accepted.membership.displayName,
      uploaderEmail: accepted.membership.email,
      retentionDays: 7,
      recipients: [],
      groups: [],
      maxFileCount: 10,
      maxFileSizeBytes: 10 * 1024 * 1024,
      maxTotalSizeBytes: 50 * 1024 * 1024,
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
    packageId = createdPackage.package.id;
    const cookie = `${DROP_SPACE_SESSION_COOKIE}=${accepted.sessionToken}`;

    const filesResponse = await request(`/api/drop/spaces/packages/${packageId}/files`, { cookie });
    assert.equal(filesResponse.status, 200, filesResponse.raw);
    const filesPayload = filesResponse.json as {
      files?: unknown[];
      readiness?: { schemaReady?: boolean; storageCoreEnabled?: boolean; quarantineUploadEnabled?: boolean; quarantineUploadReady?: boolean; publicDownloadReady?: boolean };
    };
    assert.equal(filesPayload.files?.length, 0);
    assert.equal(filesPayload.readiness?.schemaReady, false);
    assert.equal(filesPayload.readiness?.storageCoreEnabled, false);
    assert.equal(filesPayload.readiness?.quarantineUploadEnabled, false);
    assert.equal(filesPayload.readiness?.quarantineUploadReady, false);
    assert.equal(filesPayload.readiness?.publicDownloadReady, false);

    const initBody = {
      fileName: "pre_sql_teszt.txt",
      sizeBytes: 16,
      mimeType: "text/plain",
      clientUploadId: `pre_sql_${unique}`,
      rulesAccepted: true,
      rulesVersion: "DIMPRO-DROP-UPLOAD-HU-1.0",
      rulesAcceptedAt: new Date().toISOString(),
    };
    const spaceInit = await request(`/api/drop/spaces/packages/${packageId}/uploads/init`, {
      method: "POST",
      cookie,
      body: initBody,
    });
    assert.equal(spaceInit.status, 503, spaceInit.raw);
    assert.equal((spaceInit.json as { code?: string }).code, "DROP_FEATURE_DISABLED");

    const capabilityInit = await request("/api/drop/access/uploads/init", {
      method: "POST",
      authorization: `Bearer ${createdPackage.rawTokens.upload}`,
      body: {
        ...initBody,
        clientUploadId: `capability_pre_sql_${unique}`,
        rulesAccepted: true,
        rulesVersion: "DIMPRO-DROP-UPLOAD-HU-1.0",
        rulesAcceptedAt: new Date().toISOString(),
        uploadedByName: "Külső pre-SQL feltöltő",
        uploadedByEmail: `external-${unique}@example.hu`,
      },
    });
    assert.equal(capabilityInit.status, 503, capabilityInit.raw);
    assert.equal((capabilityInit.json as { code?: string }).code, "DROP_FEATURE_DISABLED");

    const [fileCountResult, sessionCountResult, packageResult, spaceResult] = await Promise.all([
      client.from("drop_files").select("id", { count: "exact", head: true }).eq("package_id", packageId),
      client.from("drop_upload_sessions").select("id", { count: "exact", head: true }).eq("package_id", packageId),
      client.from("drop_packages").select("current_file_count,current_total_size_bytes").eq("id", packageId).single(),
      client.from("drop_spaces").select("current_storage_bytes").eq("id", spaceId).single(),
    ]);
    assert.equal(fileCountResult.error, null, fileCountResult.error?.message);
    assert.equal(sessionCountResult.error, null, sessionCountResult.error?.message);
    assert.equal(packageResult.error, null, packageResult.error?.message);
    assert.equal(spaceResult.error, null, spaceResult.error?.message);
    assert.equal(fileCountResult.count, 0);
    assert.equal(sessionCountResult.count, 0);
    assert.equal(packageResult.data.current_file_count, 0);
    assert.equal(packageResult.data.current_total_size_bytes, 0);
    assert.equal(spaceResult.data.current_storage_bytes, 0);

    let privateRootExists = true;
    try { await access("/var/lib/dimpro/drop"); } catch { privateRootExists = false; }
    assert.equal(privateRootExists, false, "A pre-SQL candidate nem hozhat létre éles privát tárhelymappát.");

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--host-resolver-rules=MAP drop.dimpro.hu 127.0.0.1",
      ],
    });
    try {
      const page = await browser.newPage();
      page.on("pageerror", (error) => browserErrors.push(error instanceof Error ? error.message : String(error)));
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      await page.setCookie({
        name: DROP_SPACE_SESSION_COOKIE,
        value: accepted.sessionToken,
        domain: "drop.dimpro.hu",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      });
      await page.goto(`http://drop.dimpro.hu:${port}/space/${createdSpace.space.publicCode}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForFunction(() => document.body.innerText.toLocaleLowerCase("hu-HU").includes("privát karanténfeltöltés"), { timeout: 30_000 });
      await page.waitForFunction(() => document.body.innerText.toLocaleLowerCase("hu-HU").includes("még nincs aktiválva"), { timeout: 30_000 });
      const spaceUi = await page.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find((node) => (node.textContent || "").includes("Fájlok kiválasztása"));
        return {
          panelVisible: document.body.innerText.toLocaleLowerCase("hu-HU").includes("privát karanténfeltöltés"),
          buttonDisabled: button instanceof HTMLButtonElement ? button.disabled : null,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        };
      });
      assert.equal(spaceUi.panelVisible, true);
      assert.equal(spaceUi.buttonDisabled, true);
      assert.equal(spaceUi.overflow, false);

      const capabilityPage = await browser.newPage();
      capabilityPage.on("pageerror", (error) => browserErrors.push(error instanceof Error ? error.message : String(error)));
      capabilityPage.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      await capabilityPage.goto(`http://drop.dimpro.hu:${port}/u/${encodeURIComponent(createdPackage.rawTokens.upload)}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await capabilityPage.waitForFunction(() => document.body.innerText.includes("A meghívólink érvényes"), { timeout: 30_000 });
      const capabilityUi = await capabilityPage.evaluate(() => ({
        valid: document.body.innerText.includes("A meghívólink érvényes"),
        uploadPanelVisible: document.body.innerText.includes("Feltöltő neve"),
        inactiveMessage: document.body.innerText.includes("feature flag") || document.body.innerText.includes("inaktív"),
      }));
      assert.equal(capabilityUi.valid, true);
      assert.equal(capabilityUi.uploadPanelVisible, false);
      assert.equal(capabilityUi.inactiveMessage, true);
      await capabilityPage.close();
      assert.deepEqual(browserErrors, []);
      assert.deepEqual(consoleErrors.filter((item) => !item.includes("favicon")), []);
    } finally {
      await browser.close();
    }

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.3-pre-sql",
      storageSchemaReady: false,
      storageCoreEnabled: false,
      quarantineUploadEnabled: false,
      spaceSessionInitStatus: spaceInit.status,
      capabilityInitStatus: capabilityInit.status,
      databaseFileCount: fileCountResult.count || 0,
      databaseSessionCount: sessionCountResult.count || 0,
      quotaReserved: false,
      privateStorageCreated: false,
      spaceUploadButtonDisabled: true,
      capabilityUploadPanelHidden: true,
      browserErrors: browserErrors.length,
      consoleErrors: consoleErrors.length,
    }, null, 2));
  } finally {
    if (packageId) {
      const { error } = await client.from("drop_packages").delete().eq("id", packageId);
      if (error) throw new Error(`Pre-SQL csomagtakarítási hiba: ${error.message}`);
    }
    if (spaceId) {
      const { error } = await client.from("drop_spaces").delete().eq("id", spaceId);
      if (error) throw new Error(`Pre-SQL tértakarítási hiba: ${error.message}`);
    }
    const [remainingPackage, remainingSpace] = await Promise.all([
      packageId ? client.from("drop_packages").select("id").eq("id", packageId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      spaceId ? client.from("drop_spaces").select("id").eq("id", spaceId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (remainingPackage.error) throw remainingPackage.error;
    if (remainingSpace.error) throw remainingSpace.error;
    assert.equal(remainingPackage.data, null);
    assert.equal(remainingSpace.data, null);
    cleanupCompleted = true;
    console.log(JSON.stringify({ cleanupCompleted, testPackageRetained: false, testSpaceRetained: false }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
