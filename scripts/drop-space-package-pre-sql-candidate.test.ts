import assert from "node:assert/strict";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer";
import {
  acceptDropSpaceInvitation,
  createDropSpace,
  inviteDropSpaceMember,
} from "../app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "../app/lib/drop/dropSpaceSecurity";

const port = Number(process.env.DROP_SPACE_PACKAGE_TEST_PORT || 3227);

function request(path: string, input: { method?: string; body?: unknown; cookie?: string } = {}) {
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
      },
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = null;
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
  if (process.env.DROP_ALLOW_PRE_SQL_PACKAGE_TEST !== "DROP-PRE-SQL-PACKAGE-TEST") {
    throw new Error("Hiányzó pre-SQL tesztengedély.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(url && key);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unique = Date.now().toString(36);
  let spaceId: string | null = null;
  let cleanupCompleted = false;
  const browserErrors: string[] = [];
  const consoleErrors: string[] = [];

  try {
    const createdSpace = await createDropSpace({
      name: `Pre-SQL tércsomag teszt ${unique}`,
      ownerLicenseId: `pre-sql-license-${unique}`,
      ownerUserId: `pre-sql-owner-${unique}`,
      ownerName: "Pre-SQL tesztgazda",
      ownerEmail: `pre-sql-owner-${unique}@example.hu`,
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
      displayName: "Pre-SQL közreműködő",
      email: `pre-sql-guest-${unique}@example.hu`,
      role: "contributor",
    });
    const accepted = await acceptDropSpaceInvitation(invitation.rawInvitationToken);
    const cookie = `${DROP_SPACE_SESSION_COOKIE}=${accepted.sessionToken}`;

    const getResponse = await request("/api/drop/spaces/packages", { cookie });
    assert.equal(getResponse.status, 200, getResponse.raw);
    const getPayload = getResponse.json as {
      creation?: { ready?: boolean; schemaReady?: boolean; featureEnabled?: boolean; fileUploadEnabled?: boolean };
      packages?: unknown[];
    };
    assert.equal(getPayload.creation?.ready, false);
    assert.equal(getPayload.creation?.schemaReady, false);
    assert.equal(getPayload.creation?.featureEnabled, false);
    assert.equal(getPayload.creation?.fileUploadEnabled, false);
    assert.equal(getPayload.packages?.length, 0);

    const postResponse = await request("/api/drop/spaces/packages", {
      method: "POST",
      cookie,
      body: {
        mode: "file",
        title: "Tiltott pre-SQL csomag",
        retentionDays: 7,
        visibility: "private",
      },
    });
    assert.equal(postResponse.status, 503);
    const postPayload = postResponse.json as { code?: string };
    assert.equal(postPayload.code, "DROP_FEATURE_DISABLED");

    const { count: packageCount, error: countError } = await client
      .from("drop_packages")
      .select("id", { count: "exact", head: true })
      .eq("space_id", spaceId);
    assert.equal(countError, null, countError?.message);
    assert.equal(packageCount, 0);

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
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
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
      await page.waitForFunction(() => document.body.innerText.includes("Saját és megosztott csomagok"), { timeout: 30_000 });
      await page.waitForFunction(() => document.body.innerText.includes("DROP 0.3.2 atomi tércsomag-migráció még nincs alkalmazva"), { timeout: 30_000 });
      const ui = await page.evaluate(() => {
        const createButton = [...document.querySelectorAll("button")].find((button) => (button.textContent || "").includes("Új saját csomag"));
        return {
          panelVisible: document.body.innerText.includes("Saját és megosztott csomagok"),
          migrationWarningVisible: document.body.innerText.includes("DROP 0.3.2 atomi tércsomag-migráció még nincs alkalmazva"),
          createButtonDisabled: createButton instanceof HTMLButtonElement ? createButton.disabled : null,
          uploadClosed: document.body.innerText.includes("Fájlt még ebben a csomagban sem lehet feltölteni"),
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        };
      });
      assert.equal(ui.panelVisible, true);
      assert.equal(ui.migrationWarningVisible, true);
      assert.equal(ui.createButtonDisabled, true);
      assert.equal(ui.uploadClosed, true);
      assert.equal(ui.horizontalOverflow, false);
      assert.deepEqual(browserErrors, []);
      assert.deepEqual(consoleErrors.filter((item) => !item.includes("favicon")), []);
    } finally {
      await browser.close();
    }

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.2-pre-sql",
      packageListApiStatus: getResponse.status,
      creationReady: false,
      schemaReady: false,
      featureEnabled: false,
      postBlockedStatus: postResponse.status,
      noPackageCreated: true,
      packagePanelVisible: true,
      createButtonDisabled: true,
      fileUploadEnabled: false,
      browserErrors: browserErrors.length,
      consoleErrors: consoleErrors.length,
    }, null, 2));
  } finally {
    if (spaceId) {
      const { error } = await client.from("drop_spaces").delete().eq("id", spaceId);
      if (error) throw new Error(`Takarítási hiba: ${error.message}`);
      const { data, error: verifyError } = await client.from("drop_spaces").select("id").eq("id", spaceId).maybeSingle();
      if (verifyError) throw verifyError;
      assert.equal(data, null);
      cleanupCompleted = true;
    }
    console.log(JSON.stringify({ cleanupCompleted, testSpaceRetained: false }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
