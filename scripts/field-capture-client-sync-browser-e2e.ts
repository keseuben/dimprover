import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import puppeteer, { type Page } from "puppeteer";
import { getDimproIdentitySupabaseClient, getDimproSendContextByEntitlementId } from "../app/lib/identity-core/repository";
import { createDimproSendSession } from "../app/lib/identity-core/security";
import { deleteDropS3Object } from "../app/lib/drop/storage/dropS3Storage";

const BASE = process.env.TEREP_BROWSER_BASE?.trim() || "http://drop.dev.dimpro.hu:3157";
const FIXTURE = process.env.TEREP_IMAGE_FIXTURE?.trim() || "public/drop-app-icon-v099-192.png";
const ENTITLEMENT_ID = process.env.TEREP_TEST_ENTITLEMENT_ID?.trim() || "1419cf53-f49a-4818-a0c2-b87c0850a2e4";
const db = getDimproIdentitySupabaseClient();
const clientSessionId = `terep-browser-sync-${Date.now()}`;
let serverSessionId = "";
let stagingPackageId = "";

await access(FIXTURE);

async function cleanup() {
  const sessionResult = await db.from("field_capture_sessions")
    .select("id")
    .eq("client_session_id", clientSessionId)
    .maybeSingle();
  if (!sessionResult.error && sessionResult.data?.id) serverSessionId = String(sessionResult.data.id);

  if (serverSessionId) {
    const staging = await db.from("field_capture_staging_packages")
      .select("drop_package_id")
      .eq("session_id", serverSessionId)
      .maybeSingle();
    if (!staging.error && staging.data?.drop_package_id) stagingPackageId = String(staging.data.drop_package_id);
  }

  if (stagingPackageId) {
    const files = await db.from("drop_files")
      .select("id,storage_provider,storage_bucket,storage_key")
      .eq("package_id", stagingPackageId);
    if (!files.error) {
      for (const file of files.data || []) {
        if (file.storage_provider === "s3-compatible" && file.storage_key) {
          await deleteDropS3Object({ storageKey: String(file.storage_key), bucket: file.storage_bucket ? String(file.storage_bucket) : null }).catch(() => undefined);
        }
      }
    }
  }

  if (serverSessionId) await db.from("field_capture_sessions").delete().eq("id", serverSessionId);
  if (stagingPackageId) await db.from("drop_packages").delete().eq("id", stagingPackageId);

  const captureRemaining = serverSessionId
    ? await db.from("field_capture_sessions").select("id", { count: "exact", head: true }).eq("id", serverSessionId)
    : { count: 0, error: null };
  const packageRemaining = stagingPackageId
    ? await db.from("drop_packages").select("id", { count: "exact", head: true }).eq("id", stagingPackageId)
    : { count: 0, error: null };
  console.log(`CLEANUP capture=${captureRemaining.count || 0} package=${packageRemaining.count || 0}`);
  if ((captureRemaining.count || 0) !== 0 || (packageRemaining.count || 0) !== 0) process.exitCode = 2;
}

async function visibleButton(page: Page, text: string) {
  for (const button of await page.$$("button")) {
    const state = await button.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { text: (el.textContent || "").replace(/\s+/g, " ").trim(), visible: rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden" };
    });
    if (state.visible && state.text === text) return button;
  }
  return null;
}

async function main() {
  const context = await getDimproSendContextByEntitlementId(ENTITLEMENT_ID);
  assert.ok(context.user.id, "DEV Send user missing");
  assert.ok(context.entitlement.uploadRulesAcceptanceCount >= 3, "DEV rules acceptance count must be >= 3");
  assert.equal(context.entitlement.uploadRulesVersion, "DIMPRO-DROP-UPLOAD-HU-1.0");
  assert.ok(context.entitlement.uploadRulesLastAcceptedAt, "DEV rules acceptance timestamp missing");
  const sendSession = createDimproSendSession(ENTITLEMENT_ID);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP drop.dev.dimpro.hu 127.0.0.1"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

    await page.evaluateOnNewDocument((sessionId) => {
      window.localStorage.setItem("dimpro.fieldCapture.activeSession.v1", JSON.stringify({
        id: sessionId,
        createdAt: new Date().toISOString(),
        projectId: null,
        projectName: null,
        status: "ACTIVE",
      }));
      window.localStorage.removeItem("dimpro.fieldCapture.preCaptureDefaults.v1");
    }, clientSessionId);

    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (request.url().includes("/api/dimpro-identity/send/verify")) {
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            user: context.user,
            entitlement: context.entitlement,
            projects: context.projects,
            sendSession: { token: sendSession.token, expiresAt: sendSession.expiresAt, entitlementId: ENTITLEMENT_ID },
          }),
        });
        return;
      }
      void request.continue();
    });

    const response = await page.goto(`${BASE}/terep`, { waitUntil: "networkidle2", timeout: 60_000 });
    assert.equal(response?.status(), 200);
    const input = await page.$("input[placeholder=ABCD-123-456]");
    assert.ok(input); await input.type("TEST123456");
    const open = await visibleButton(page, "Terepi Gyorsrögzítő megnyitása");
    assert.ok(open); await open.click();
    await page.waitForFunction(() => (document.body.textContent || "").includes("Új terepi kép"), { timeout: 10_000 });

    const newPhoto = await visibleButton(page, "Új terepi kép");
    assert.ok(newPhoto); await newPhoto.click();
    await page.waitForFunction(() => (document.body.textContent || "").includes("Mit rögzítsen ehhez a képhez?"), { timeout: 5_000 });
    const gallery = await visibleButton(page, "Galéria");
    assert.ok(gallery);
    const chooserPromise = page.waitForFileChooser({ timeout: 10_000 });
    await gallery.click();
    const chooser = await chooserPromise;
    await chooser.accept([FIXTURE]);
    await page.waitForFunction(() => document.querySelectorAll("[data-field-capture-item]").length === 1, { timeout: 60_000 });

    const toReview = await visibleButton(page, "Tovább az ellenőrzéshez"); assert.ok(toReview); await toReview.click();
    const toSave = await visibleButton(page, "Tovább a mentéshez"); assert.ok(toSave); await toSave.click();
    await page.waitForFunction(() => Boolean(document.querySelector("[data-terep-sync-button]")), { timeout: 10_000 });
    const syncButton = await page.$("[data-terep-sync-button]");
    assert.ok(syncButton);
    assert.equal(await syncButton.evaluate((el) => (el as HTMLButtonElement).disabled), false, "sync button should be enabled with fresh rules and network");
    await syncButton.click();

    await page.waitForFunction(() => (document.body.textContent || "").includes("DIMPRO-ba mentve"), { timeout: 120_000 });
    await page.waitForFunction(() => (document.body.textContent || "").includes("Szerveres szinkron kész: 1/1 kép"), { timeout: 30_000 });
    assert.equal(await page.evaluate(() => (document.body.textContent || "").includes("Minden cél kész")), false);
    assert.equal(pageErrors.length, 0, pageErrors.join(" | "));
    assert.equal(consoleErrors.length, 0, consoleErrors.join(" | "));

    const session = await db.from("field_capture_sessions")
      .select("id")
      .eq("user_id", context.user.id)
      .eq("client_session_id", clientSessionId)
      .single();
    if (session.error) throw session.error;
    serverSessionId = String(session.data.id);
    const item = await db.from("field_capture_items")
      .select("id,status")
      .eq("session_id", serverSessionId)
      .single();
    if (item.error) throw item.error;
    assert.equal(item.data.status, "SERVER_STORED");
    const asset = await db.from("field_capture_asset_refs")
      .select("storage_status,storage_provider,storage_bucket,storage_key")
      .eq("capture_item_id", item.data.id)
      .single();
    if (asset.error) throw asset.error;
    assert.equal(asset.data.storage_status, "STORED");
    assert.ok(asset.data.storage_key);
    const staging = await db.from("field_capture_staging_packages")
      .select("drop_package_id,raw_capabilities_persisted")
      .eq("session_id", serverSessionId)
      .single();
    if (staging.error) throw staging.error;
    stagingPackageId = String(staging.data.drop_package_id);
    assert.equal(staging.data.raw_capabilities_persisted, false);

    console.log(JSON.stringify({
      ok: true,
      browserClientSync: true,
      captureOnly: true,
      serverStatus: item.data.status,
      assetStorageStatus: asset.data.storage_status,
      stagingPrivate: true,
      rawCapabilitiesPersisted: false,
      pageErrors: 0,
      consoleErrors: 0,
    }, null, 2));
  } finally {
    await browser.close();
    await cleanup();
  }
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
