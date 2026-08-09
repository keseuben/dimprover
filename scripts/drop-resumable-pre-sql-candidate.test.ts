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

const port = Number(process.env.DROP_V034_PRE_SQL_PORT || 3233);

type RequestInput = {
  method?: string;
  json?: unknown;
  buffer?: Buffer;
  cookie?: string;
  authorization?: string;
};

function request(path: string, input: RequestInput = {}) {
  return new Promise<{ status: number; json: unknown; raw: string }>((resolve, reject) => {
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
          "Content-Type": input.buffer ? "application/octet-stream" : "application/json",
          "Content-Length": payload.length,
        } : {}),
        ...(input.cookie ? { Cookie: input.cookie } : {}),
        ...(input.authorization ? { Authorization: input.authorization } : {}),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json: unknown = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { /* raw retained */ }
        resolve({ status: response.statusCode || 0, json, raw });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  if (process.env.DROP_ALLOW_V034_PRE_SQL_TEST !== "DROP-V034-PRE-SQL-TEST") {
    throw new Error("Hiányzó DROP 0.3.4 pre-SQL tesztengedély.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(url && key);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unique = Date.now().toString(36);
  let spaceId: string | null = null;
  let packageId: string | null = null;
  let uploadSessionId: string | null = null;
  let storageKey: string | null = null;
  const browserErrors: string[] = [];
  const consoleErrors: string[] = [];

  try {
    const createdSpace = await createDropSpace({
      name: `DROP 0.3.4 pre-SQL teszt ${unique}`,
      ownerLicenseId: `drop-v034-pre-sql-license-${unique}`,
      ownerUserId: `drop-v034-pre-sql-owner-${unique}`,
      ownerName: "DROP 0.3.4 pre-SQL gazda",
      ownerEmail: `owner-${unique}@example.hu`,
      licenseEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      accessExpiryMode: "license",
      maxMembers: 5,
      maxPackages: 5,
      storageQuotaBytes: 1024 * 1024 * 1024,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
    });
    spaceId = createdSpace.space.id;
    const invitation = await inviteDropSpaceMember(spaceId, {
      displayName: "Pre-SQL közreműködő",
      email: `contributor-${unique}@example.hu`,
      role: "contributor",
    });
    const accepted = await acceptDropSpaceInvitation(invitation.rawInvitationToken);
    const created = await createDropPackage({
      mode: "file",
      title: `DROP 0.3.4 pre-SQL csomag ${unique}`,
      description: "A 500 MB-os mód aktiválás előtti védelmi tesztje.",
      uploaderName: accepted.membership.displayName,
      uploaderEmail: accepted.membership.email,
      retentionDays: 3,
      recipients: [],
      groups: [],
      maxFileCount: 10,
      maxFileSizeBytes: 500 * 1024 * 1024,
      maxTotalSizeBytes: 700 * 1024 * 1024,
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
    const notifyOff = await client.from("drop_packages").update({ notify_on_upload_complete: false }).eq("id", packageId);
    assert.equal(notifyOff.error, null, notifyOff.error?.message);
    const cookie = `${DROP_SPACE_SESSION_COOKIE}=${accepted.sessionToken}`;

    const largeInit = await request(`/api/drop/spaces/packages/${packageId}/uploads/init`, {
      method: "POST",
      cookie,
      json: {
        fileName: "meg-nem-engedelyezett-10mb.zip",
        sizeBytes: 10 * 1024 * 1024,
        mimeType: "application/zip",
        clientUploadId: `v034-large-${unique}`,
        rulesAccepted: true,
        rulesVersion: "DIMPRO-DROP-UPLOAD-HU-1.0",
        rulesAcceptedAt: new Date().toISOString(),
      },
    });
    assert.equal(largeInit.status, 413, largeInit.raw);
    assert.equal((largeInit.json as { code?: string }).code, "DROP_UPLOAD_FILE_TOO_LARGE");

    const afterLarge = await Promise.all([
      client.from("drop_files").select("id", { count: "exact", head: true }).eq("package_id", packageId),
      client.from("drop_upload_sessions").select("id", { count: "exact", head: true }).eq("package_id", packageId),
      client.from("drop_packages").select("current_file_count,current_total_size_bytes").eq("id", packageId).single(),
    ]);
    for (const result of afterLarge) assert.equal(result.error, null, result.error?.message);
    assert.equal(afterLarge[0].count || 0, 0);
    assert.equal(afterLarge[1].count || 0, 0);
    assert.equal(Number(afterLarge[2].data?.current_file_count), 0);
    assert.equal(Number(afterLarge[2].data?.current_total_size_bytes), 0);

    const content = Buffer.from("DROP 0.3.4 pre-SQL kompatibilis kisfájl.\n", "utf8");
    const smallInit = await request(`/api/drop/spaces/packages/${packageId}/uploads/init`, {
      method: "POST",
      cookie,
      json: {
        fileName: "pre-sql-kisfajl.txt",
        sizeBytes: content.length,
        mimeType: "text/plain",
        clientUploadId: `v034-small-${unique}`,
        rulesAccepted: true,
        rulesVersion: "DIMPRO-DROP-UPLOAD-HU-1.0",
        rulesAcceptedAt: new Date().toISOString(),
      },
    });
    assert.equal(smallInit.status, 201, smallInit.raw);
    const initialized = (smallInit.json as {
      initialized?: {
        protocol?: string;
        session: { id: string; totalParts?: number };
        uploadToken: string;
        uploadUrl: string;
        partUrlTemplate?: string;
        completeUrl: string;
      };
    }).initialized;
    assert.ok(initialized);
    assert.equal(initialized.protocol, "single");
    assert.equal(initialized.session.totalParts, 1);
    uploadSessionId = initialized.session.id;
    const bundle = await getDropUploadBundle(uploadSessionId);
    assert.ok(bundle);
    storageKey = bundle.file.storage_key;

    const forbiddenPart = await request(
      (initialized.partUrlTemplate || "").replace("{partNumber}", "1"),
      { method: "PUT", buffer: content, authorization: `Bearer ${initialized.uploadToken}` },
    );
    assert.equal(forbiddenPart.status, 503, forbiddenPart.raw);
    assert.equal((forbiddenPart.json as { code?: string }).code, "DROP_FEATURE_DISABLED");

    const contentResponse = await request(initialized.uploadUrl, {
      method: "PUT",
      buffer: content,
      authorization: `Bearer ${initialized.uploadToken}`,
    });
    assert.equal(contentResponse.status, 200, contentResponse.raw);
    const completeResponse = await request(initialized.completeUrl, {
      method: "POST",
      authorization: `Bearer ${initialized.uploadToken}`,
    });
    assert.equal(completeResponse.status, 200, completeResponse.raw);
    const completeResult = (completeResponse.json as { result?: { file?: { securityStatus?: string }; downloadable?: boolean } }).result;
    assert.equal(completeResult?.file?.securityStatus, "scanner_required");
    assert.equal(completeResult?.downloadable, false);
    assert.equal((await statDropQuarantineFile(storageKey)).sizeBytes, content.length);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP drop.dimpro.hu 127.0.0.1"],
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
      await page.goto(`http://drop.dimpro.hu:${port}/space/${createdSpace.space.publicCode}`, { waitUntil: "networkidle0", timeout: 60_000 });
      const spacePanel = await page.evaluate(() => {
        const label = [...document.querySelectorAll("p")].find((node) => (node.textContent || "").trim().toLocaleLowerCase("hu-HU") === "privát karanténfeltöltés");
        const panel = label?.parentElement?.parentElement?.parentElement;
        return {
          text: panel?.textContent || "",
          pageText: document.body.innerText,
        };
      });
      assert.equal(spacePanel.text.includes("500 MB"), false);
      assert.equal(spacePanel.pageText.includes("pre-sql-kisfajl.txt"), true);

      const capabilityPage = await browser.newPage();
      capabilityPage.on("pageerror", (error) => browserErrors.push(error instanceof Error ? error.message : String(error)));
      capabilityPage.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      await capabilityPage.goto(`http://drop.dimpro.hu:${port}/u/${encodeURIComponent(created.rawTokens.upload)}`, { waitUntil: "networkidle0", timeout: 60_000 });
      const capabilityText = await capabilityPage.evaluate(() => document.body.innerText);
      assert.equal(capabilityText.includes("500 MB"), false);
      assert.equal(capabilityText.includes("9 MB"), true);
      await capabilityPage.close();
    } finally {
      await browser.close();
    }
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(consoleErrors.filter((item) => !item.includes("favicon")), []);

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.4-pre-sql",
      databaseMarker: "DROP 0.3.3",
      resumableFeatureEnabled: false,
      tenMbInitializationStatus: largeInit.status,
      largeInitCreatedRecords: false,
      smallUploadProtocol: initialized.protocol,
      smallUploadQuarantined: true,
      partApiStatus: forbiddenPart.status,
      uiAdvertises500Mb: false,
      capabilityShows9Mb: true,
      browserErrors: browserErrors.length,
      consoleErrors: consoleErrors.length,
    }, null, 2));
  } finally {
    if (uploadSessionId || storageKey) {
      await removeDropStoredFile({ sessionId: uploadSessionId || undefined, storageKey: storageKey || undefined }).catch(() => undefined);
    }
    if (packageId) {
      const result = await client.from("drop_packages").delete().eq("id", packageId);
      if (result.error) throw result.error;
    }
    if (spaceId) {
      const result = await client.from("drop_spaces").delete().eq("id", spaceId);
      if (result.error) throw result.error;
    }
    const [spaces, packages, files] = await Promise.all([
      client.from("drop_spaces").select("id", { count: "exact", head: true }).ilike("name", "DROP 0.3.4 pre-SQL teszt%"),
      client.from("drop_packages").select("id", { count: "exact", head: true }).ilike("title", "DROP 0.3.4 pre-SQL csomag%"),
      client.from("drop_files").select("id", { count: "exact", head: true }).eq("display_name", "pre-sql-kisfajl.txt"),
    ]);
    for (const result of [spaces, packages, files]) if (result.error) throw result.error;
    assert.equal(spaces.count || 0, 0);
    assert.equal(packages.count || 0, 0);
    assert.equal(files.count || 0, 0);
    console.log(JSON.stringify({ cleanupCompleted: true, testFileRetained: false, testPackageRetained: false, testSpaceRetained: false }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
