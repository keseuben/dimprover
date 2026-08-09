import assert from "node:assert/strict";
import http from "node:http";
import { createHash } from "node:crypto";
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

const port = Number(process.env.DROP_V034_RELEASE_PORT || 3234);
const RULES_VERSION = "DIMPRO-DROP-UPLOAD-HU-1.0";
const CHUNK_BYTES = 64 * 1024 * 1024;
const FILE_BYTES = CHUNK_BYTES + 1024 * 1024;

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
        try { json = raw ? JSON.parse(raw) : null; } catch { /* raw response kept */ }
        resolve({ status: response.statusCode || 0, json, raw });
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

async function main() {
  if (process.env.DROP_ALLOW_V034_RELEASE_TEST !== "DROP-V034-RELEASE-TEST") {
    throw new Error("Hiányzó DROP 0.3.4 release candidate tesztengedély.");
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
      name: `DROP 0.3.4 release candidate ${unique}`,
      ownerLicenseId: `drop-v034-release-license-${unique}`,
      ownerUserId: `drop-v034-release-owner-${unique}`,
      ownerName: "DROP 0.3.4 release gazda",
      ownerEmail: `owner-${unique}@example.hu`,
      licenseEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      accessExpiryMode: "license",
      maxMembers: 10,
      maxPackages: 10,
      storageQuotaBytes: 1024 * 1024 * 1024,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
    });
    spaceId = createdSpace.space.id;
    const invitation = await inviteDropSpaceMember(spaceId, {
      displayName: "Release közreműködő",
      email: `contributor-${unique}@example.hu`,
      role: "contributor",
    });
    const accepted = await acceptDropSpaceInvitation(invitation.rawInvitationToken);
    const created = await createDropPackage({
      mode: "file",
      title: `DROP 0.3.4 release csomag ${unique}`,
      description: "Candidate HTTP multipart és szabályzat teszt.",
      uploaderName: accepted.membership.displayName,
      uploaderEmail: accepted.membership.email,
      retentionDays: 7,
      recipients: [],
      groups: [],
      maxFileCount: 5,
      maxFileSizeBytes: 500 * 1024 * 1024,
      maxTotalSizeBytes: 800 * 1024 * 1024,
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
    const activePackageId = created.package.id;
    const disableMail = await client.from("drop_packages").update({ notify_on_upload_complete: false }).eq("id", activePackageId);
    assert.equal(disableMail.error, null, disableMail.error?.message);
    const cookie = `${DROP_SPACE_SESSION_COOKIE}=${accepted.sessionToken}`;

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
      await page.waitForFunction(() => document.body.innerText.includes("Feltöltési szabályok és biztonsági tájékoztató"), { timeout: 30_000 });
      const initialUi = await page.evaluate((rulesVersion) => {
        const body = document.body.innerText;
        const choose = [...document.querySelectorAll("button")].find((node) => (node.textContent || "").includes("Fájlok kiválasztása"));
        const checkbox = document.querySelector('input[type="checkbox"]');
        return {
          currentLimit: body.includes("500 MB / fájl"),
          futureLimit: body.includes("Hamarosan: akár 2 GB / fájl") && body.includes("hamarosan 1–2 GB-ra emelkedik"),
          rulesVersion: body.includes(rulesVersion),
          acceptanceText: body.includes("Elolvastam és elfogadom a feltöltési szabályokat"),
          checkboxChecked: checkbox instanceof HTMLInputElement ? checkbox.checked : null,
          chooseDisabled: choose instanceof HTMLButtonElement ? choose.disabled : null,
          noOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
        };
      }, RULES_VERSION);
      assert.deepEqual(initialUi, {
        currentLimit: true,
        futureLimit: true,
        rulesVersion: true,
        acceptanceText: true,
        checkboxChecked: false,
        chooseDisabled: true,
        noOverflow: true,
      });
      await page.click('input[type="checkbox"]');
      const acceptedUi = await page.evaluate(() => {
        const choose = [...document.querySelectorAll("button")].find((node) => (node.textContent || "").includes("Fájlok kiválasztása"));
        const checkbox = document.querySelector('input[type="checkbox"]');
        return {
          checkboxChecked: checkbox instanceof HTMLInputElement ? checkbox.checked : null,
          chooseDisabled: choose instanceof HTMLButtonElement ? choose.disabled : null,
        };
      });
      assert.deepEqual(acceptedUi, { checkboxChecked: true, chooseDisabled: false });

      const capabilityPage = await browser.newPage();
      capabilityPage.on("pageerror", (error) => browserErrors.push(error instanceof Error ? error.message : String(error)));
      capabilityPage.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      await capabilityPage.goto(`http://drop.dimpro.hu:${port}/u/${encodeURIComponent(created.rawTokens.upload)}`, { waitUntil: "networkidle0", timeout: 60_000 });
      await capabilityPage.waitForFunction(() => document.body.innerText.includes("Feltöltési szabályok és biztonsági tájékoztató"), { timeout: 30_000 });
      const capabilityUi = await capabilityPage.evaluate(() => {
        const body = document.body.innerText;
        const choose = [...document.querySelectorAll("button")].find((node) => (node.textContent || "").includes("Fájlok kiválasztása"));
        return {
          currentLimit: body.includes("500 MB / fájl"),
          futureLimit: body.includes("Hamarosan: akár 2 GB / fájl"),
          chooseDisabled: choose instanceof HTMLButtonElement ? choose.disabled : null,
        };
      });
      assert.deepEqual(capabilityUi, { currentLimit: true, futureLimit: true, chooseDisabled: true });
      await capabilityPage.close();
    } finally {
      await browser.close();
    }
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(consoleErrors.filter((item) => !item.includes("favicon")), []);

    const withoutRules = await request(`/api/drop/spaces/packages/${activePackageId}/uploads/init`, {
      method: "POST",
      cookie,
      json: {
        fileName: "candidate-65mb.txt",
        sizeBytes: FILE_BYTES,
        mimeType: "text/plain",
        clientUploadId: `candidate-${unique}`,
      },
    });
    assert.equal(withoutRules.status, 400, withoutRules.raw);
    assert.equal((withoutRules.json as { code?: string }).code, "DROP_UPLOAD_RULES_NOT_ACCEPTED");

    const content = Buffer.alloc(FILE_BYTES, 65);
    content[content.length - 1] = 10;
    const expectedSha256 = createHash("sha256").update(content).digest("hex");
    const initializedResponse = await request(`/api/drop/spaces/packages/${activePackageId}/uploads/init`, {
      method: "POST",
      cookie,
      json: {
        fileName: "candidate-65mb.txt",
        sizeBytes: content.length,
        mimeType: "text/plain",
        clientUploadId: `candidate-${unique}`,
        rulesAccepted: true,
        rulesVersion: RULES_VERSION,
        rulesAcceptedAt: new Date().toISOString(),
      },
    });
    assert.equal(initializedResponse.status, 201, initializedResponse.raw);
    assertNoStorageSecrets(initializedResponse.raw);
    const initialized = (initializedResponse.json as {
      initialized?: {
        protocol: string;
        session: { id: string; totalParts: number; chunkSizeBytes: number };
        uploadToken: string;
        partUrlTemplate: string;
        completeUrl: string;
        completedPartNumbers: number[];
      };
    }).initialized;
    assert.ok(initialized);
    assert.equal(initialized.protocol, "multipart");
    assert.equal(initialized.session.totalParts, 2);
    assert.equal(initialized.session.chunkSizeBytes, CHUNK_BYTES);
    uploadSessionId = initialized.session.id;
    const bundle = await getDropUploadBundle(uploadSessionId);
    assert.ok(bundle);
    storageKey = bundle.file.storage_key;

    const firstPart = await request(initialized.partUrlTemplate.replace("{partNumber}", "1"), {
      method: "PUT",
      buffer: content.subarray(0, CHUNK_BYTES),
      authorization: `Bearer ${initialized.uploadToken}`,
    });
    assert.equal(firstPart.status, 200, firstPart.raw);
    assertNoStorageSecrets(firstPart.raw);

    const resumedResponse = await request(`/api/drop/spaces/packages/${activePackageId}/uploads/init`, {
      method: "POST",
      cookie,
      json: {
        fileName: "candidate-65mb.txt",
        sizeBytes: content.length,
        mimeType: "text/plain",
        clientUploadId: `candidate-${unique}`,
        rulesAccepted: true,
        rulesVersion: RULES_VERSION,
        rulesAcceptedAt: new Date().toISOString(),
      },
    });
    assert.equal(resumedResponse.status, 201, resumedResponse.raw);
    const resumed = (resumedResponse.json as {
      initialized?: { session: { id: string }; uploadToken: string; partUrlTemplate: string; completeUrl: string; completedPartNumbers: number[] };
    }).initialized;
    assert.ok(resumed);
    assert.equal(resumed.session.id, uploadSessionId);
    assert.deepEqual(resumed.completedPartNumbers, [1]);

    const secondPart = await request(resumed.partUrlTemplate.replace("{partNumber}", "2"), {
      method: "PUT",
      buffer: content.subarray(CHUNK_BYTES),
      authorization: `Bearer ${resumed.uploadToken}`,
    });
    assert.equal(secondPart.status, 200, secondPart.raw);
    assertNoStorageSecrets(secondPart.raw);

    const completedResponse = await request(resumed.completeUrl, {
      method: "POST",
      authorization: `Bearer ${resumed.uploadToken}`,
    });
    assert.equal(completedResponse.status, 200, completedResponse.raw);
    assertNoStorageSecrets(completedResponse.raw);
    const completed = (completedResponse.json as {
      result?: { file?: { securityStatus?: string; sizeBytes?: number }; downloadable?: boolean; quarantineOnly?: boolean };
    }).result;
    assert.equal(completed?.file?.securityStatus, "scanner_required");
    assert.equal(completed?.file?.sizeBytes, FILE_BYTES);
    assert.equal(completed?.downloadable, false);
    assert.equal(completed?.quarantineOnly, true);
    assert.equal((await statDropQuarantineFile(storageKey)).sizeBytes, FILE_BYTES);

    const [dbFile, audits] = await Promise.all([
      client.from("drop_files").select("sha256,size_stored_bytes,security_status").eq("package_id", activePackageId).single(),
      client.from("drop_events").select("event_type,payload").eq("package_id", activePackageId).in("event_type", ["upload.rules_accepted", "upload.rules_reconfirmed"]).order("created_at"),
    ]);
    assert.equal(dbFile.error, null, dbFile.error?.message);
    assert.equal(audits.error, null, audits.error?.message);
    assert.equal(dbFile.data?.sha256, expectedSha256);
    assert.equal(Number(dbFile.data?.size_stored_bytes), FILE_BYTES);
    assert.equal(dbFile.data?.security_status, "scanner_required");
    assert.deepEqual(audits.data?.map((item) => item.event_type), ["upload.rules_accepted", "upload.rules_reconfirmed"]);

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.4",
      rulesVisible: true,
      rulesAcceptanceRequired: true,
      currentLimitVisible: "500 MB / fájl",
      roadmapVisible: "Hamarosan: akár 2 GB / fájl",
      rulesVersion: RULES_VERSION,
      uploadWithoutAcceptanceStatus: withoutRules.status,
      multipartFileBytes: FILE_BYTES,
      chunkBytes: CHUNK_BYTES,
      interruptionAfterPart: 1,
      resumedCompletedParts: resumed.completedPartNumbers,
      finalSha256Matches: dbFile.data?.sha256 === expectedSha256,
      quarantined: true,
      downloadable: false,
      browserErrors: browserErrors.length,
      consoleErrors: consoleErrors.length,
    }, null, 2));
  } finally {
    if (uploadSessionId || storageKey) {
      await removeDropStoredFile({ sessionId: uploadSessionId || undefined, storageKey: storageKey || undefined }).catch(() => undefined);
    }
    if (packageId) {
      const deleted = await client.from("drop_packages").delete().eq("id", packageId);
      if (deleted.error) throw deleted.error;
    }
    if (spaceId) {
      const deleted = await client.from("drop_spaces").delete().eq("id", spaceId);
      if (deleted.error) throw deleted.error;
    }
    const [spaces, packages, files] = await Promise.all([
      client.from("drop_spaces").select("id", { count: "exact", head: true }).ilike("name", "DROP 0.3.4 release candidate%"),
      client.from("drop_packages").select("id", { count: "exact", head: true }).ilike("title", "DROP 0.3.4 release csomag%"),
      client.from("drop_files").select("id", { count: "exact", head: true }).eq("display_name", "candidate-65mb.txt"),
    ]);
    for (const result of [spaces, packages, files]) if (result.error) throw result.error;
    assert.equal(spaces.count || 0, 0);
    assert.equal(packages.count || 0, 0);
    assert.equal(files.count || 0, 0);
    console.log(JSON.stringify({ cleanupCompleted: true, testStorageRetained: false, testPackageRetained: false, testSpaceRetained: false }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
