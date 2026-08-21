import assert from "node:assert/strict";
import { access, rm } from "node:fs/promises";
import sharp from "sharp";
import puppeteer, { type Page } from "puppeteer";
import { getDimproIdentitySupabaseClient, getDimproSendContextByEntitlementId } from "../app/lib/identity-core/repository";
import { createDimproSendSession } from "../app/lib/identity-core/security";
import { deleteDropS3Object } from "../app/lib/drop/storage/dropS3Storage";
import { deleteDriveObject } from "../app/lib/drive-core/s3ObjectStorage";
import { storeFieldCaptureItemInProjectContent } from "../app/lib/field-capture/projectDriveService";

const BASE = process.env.TEREP_BROWSER_BASE?.trim() || "http://drop.dev.dimpro.hu:3157";
const WORKER_BASE = process.env.TEREP_WORKER_BASE?.trim() || "http://127.0.0.1:3100";
const FIXTURE = `/tmp/terep-p91-project-${Date.now()}.png`;
const PROJECT_CORE_ID = process.env.TEREP_P91_TEST_PROJECT_CORE_ID?.trim() || "project-040c0035-191";
const ENTITLEMENT_ID = process.env.TEREP_TEST_ENTITLEMENT_ID?.trim() || "1419cf53-f49a-4818-a0c2-b87c0850a2e4";
const db = getDimproIdentitySupabaseClient();
const WORKER_SECRET = process.env.DROP_WORKER_SECRET?.trim() || "";
async function runScanWorkerHttp() {
  assert.ok(WORKER_SECRET.length >= 32, "DROP worker secret missing");
  const response = await fetch(`${WORKER_BASE}/api/drop/worker/run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-host": "license.dimpro.hu",
      "x-dimpro-drop-worker-secret": WORKER_SECRET,
    },
    body: JSON.stringify({ limit: 2, scanOnly: true }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  assert.equal(response.status, 200, String(payload.error || payload.code || "DROP worker HTTP failed"));
  assert.equal(payload.ok, true, String(payload.error || payload.code || "DROP worker failed"));
  return payload;
}
const clientSessionId = `terep-p91-project-${Date.now()}`;
let serverSessionId = "";
let stagingPackageId = "";
let contentObjectId = "";
let contentRefId = "";
let driveStorageKey = "";
let driveStorageBucket = "";


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

  if (contentRefId) await db.from("dimpro_content_refs").delete().eq("id", contentRefId);
  if (contentObjectId) {
    const refs = await db.from("dimpro_content_refs").select("id", { count: "exact", head: true }).eq("content_object_id", contentObjectId).eq("status", "ACTIVE");
    if (!refs.error && (refs.count || 0) === 0) {
      if (driveStorageKey) await deleteDriveObject({ storageKey: driveStorageKey, bucket: driveStorageBucket || null }).catch(() => undefined);
      await db.from("dimpro_content_objects").delete().eq("id", contentObjectId);
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
  const contentRefRemaining = contentRefId ? await db.from("dimpro_content_refs").select("id", { count: "exact", head: true }).eq("id", contentRefId) : { count: 0, error: null };
  console.log(`CLEANUP capture=${captureRemaining.count || 0} package=${packageRemaining.count || 0} projectRef=${contentRefRemaining.count || 0}`);
  await rm(FIXTURE, { force: true }).catch(() => undefined);
  if ((captureRemaining.count || 0) !== 0 || (packageRemaining.count || 0) !== 0 || (contentRefRemaining.count || 0) !== 0) process.exitCode = 2;
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
  const seed = Date.now();
  await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: seed % 251, g: (seed >> 3) % 251, b: (seed >> 7) % 251, alpha: 1 } } }).png().toFile(FIXTURE);
  await access(FIXTURE);
  const context = await getDimproSendContextByEntitlementId(ENTITLEMENT_ID);
  assert.ok(context.user.id, "DEV Send user missing");
  assert.ok(context.entitlement.uploadRulesAcceptanceCount >= 3, "DEV rules acceptance count must be >= 3");
  assert.equal(context.entitlement.uploadRulesVersion, "DIMPRO-DROP-UPLOAD-HU-1.0");
  assert.ok(context.entitlement.uploadRulesLastAcceptedAt, "DEV rules acceptance timestamp missing");
  const sendSession = createDimproSendSession(ENTITLEMENT_ID);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP drop.dev.dimpro.hu 127.0.0.1", `--unsafely-treat-insecure-origin-as-secure=${BASE}`, "--disable-web-security"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const networkTrace: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text().replace(/https?:\/\/[^\s"']+/g, (value) => value.split("?")[0])); });
    page.on("response", (response) => { const method = response.request().method(); if (["PUT", "PATCH", "POST"].includes(method) || response.url().includes("/api/field-capture/") || response.url().includes("/api/drop/")) networkTrace.push(`RES ${response.status()} ${method} ${response.url().split("?")[0]}`); });
    page.on("requestfailed", (request) => { const method = request.method(); if (["PUT", "PATCH", "POST"].includes(method) || request.url().includes("/api/field-capture/") || request.url().includes("/api/drop/")) networkTrace.push(`FAIL ${method} ${request.url().split("?")[0]} ${request.failure()?.errorText || "unknown"}`); });

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
      if (["PUT", "PATCH", "POST"].includes(request.method())) networkTrace.push(`REQ ${request.method()} ${request.url().split("?")[0]}`);
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

    try { await page.waitForFunction(() => (document.body.textContent || "").includes("Szerveres szinkron kész: 1/1 kép"), { timeout: 30_000 }); } catch (error) { const bodyText = await page.evaluate(() => (document.body.textContent || "").replace(/\s+/g, " " ).trim().slice(-2200)); console.error("SYNC_TIMEOUT_UI", bodyText); console.error("SYNC_NETWORK_TRACE", networkTrace.join(" | ")); console.error("SYNC_CONSOLE_ERRORS", consoleErrors.join(" | ")); console.error("SYNC_PAGE_ERRORS", pageErrors.join(" | ")); throw error; }
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

    // P9.1 service-layer E2E: a Send entitlementben jelenleg nincs project mapping,
    // ezért nem hamisítunk projektjogot. A már szerverre mentett QA capture sessiont
    // egy létező, ugyanazon DEV userhez tartozó canonical QA Project Core projekthez kötjük.
    assert.equal(context.projects.length, 0, "A P9.1 teszt nem kerülheti meg csendben a Send project mappinget.");
    const project = await db.from("project_core_projects").select("id,status").eq("id", PROJECT_CORE_ID).single();
    if (project.error) throw project.error;
    assert.ok(["DRAFT", "ACTIVE", "CLOSING"].includes(String(project.data.status)));
    const membership = await db.from("project_core_memberships").select("role,status").eq("project_id", PROJECT_CORE_ID).eq("user_id", context.user.id).eq("status", "ACTIVE").single();
    if (membership.error) throw membership.error;
    assert.ok(["OWNER", "PROJECT_MANAGER", "CONTRIBUTOR"].includes(String(membership.data.role)));
    const sessionBind = await db.from("field_capture_sessions").update({ project_id: PROJECT_CORE_ID, updated_at: new Date().toISOString() }).eq("id", serverSessionId);
    if (sessionBind.error) throw sessionBind.error;
    const destination = await db.from("field_capture_destinations").upsert({
      capture_item_id: item.data.id,
      target: "PROJECT_DRIVE",
      folder_id: null,
      ownership: "PROJECT",
      status: "PENDING",
      retained_independently: true,
      detail: { scope: "PROJECT_ROOT", p9Stage: "P9.1", e2e: true },
      updated_at: new Date().toISOString(),
    }, { onConflict: "capture_item_id,target" });
    if (destination.error) throw destination.error;

    const dropFileResult = await db.from("drop_files").select("id,upload_status,processing_status,security_status,virus_scan_status").eq("package_id", stagingPackageId).single();
    if (dropFileResult.error) throw dropFileResult.error;
    let clean = dropFileResult.data;
    for (let cycle = 0; cycle < 3 && !(clean.upload_status === "ready" && clean.processing_status === "ready" && clean.security_status === "clean" && clean.virus_scan_status === "clean"); cycle += 1) {
      const worker = await runScanWorkerHttp();
      assert.equal(worker.ok, true);
      const refreshed = await db.from("drop_files").select("id,upload_status,processing_status,security_status,virus_scan_status").eq("id", clean.id).single();
      if (refreshed.error) throw refreshed.error;
      clean = refreshed.data;
    }
    for (let i = 0; i < 40 && !(clean.upload_status === "ready" && clean.processing_status === "ready" && clean.security_status === "clean" && clean.virus_scan_status === "clean"); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const next = await db.from("drop_files").select("id,upload_status,processing_status,security_status,virus_scan_status").eq("id", clean.id).single();
      if (next.error) throw next.error;
      clean = next.data;
    }
    assert.equal(clean.upload_status, "ready");
    assert.equal(clean.processing_status, "ready");
    assert.equal(clean.security_status, "clean");
    assert.equal(clean.virus_scan_status, "clean");

    const boundSession = await db.from("field_capture_sessions").select("id,client_session_id,user_id,entitlement_id,project_id,status,started_at,closed_at,updated_at").eq("id", serverSessionId).single();
    if (boundSession.error) throw boundSession.error;
    const sessionValue = {
      id: String(boundSession.data.id), clientSessionId: String(boundSession.data.client_session_id), userId: String(boundSession.data.user_id), entitlementId: String(boundSession.data.entitlement_id), projectId: boundSession.data.project_id ? String(boundSession.data.project_id) : null,
      status: boundSession.data.status as "ACTIVE" | "CLOSED" | "ARCHIVED", startedAt: String(boundSession.data.started_at), closedAt: boundSession.data.closed_at ? String(boundSession.data.closed_at) : null, updatedAt: String(boundSession.data.updated_at),
    };
    const first = await storeFieldCaptureItemInProjectContent({ session: sessionValue, itemId: String(item.data.id), userId: context.user.id, userEmail: context.user.email });
    const second = await storeFieldCaptureItemInProjectContent({ session: sessionValue, itemId: String(item.data.id), userId: context.user.id, userEmail: context.user.email });
    assert.equal(first.stored, true); assert.equal(first.projectContentBound, true); assert.equal(first.projectDriveTreeBound, false); assert.equal(first.ownership, "PROJECT"); assert.equal(first.scope, "PROJECT_ROOT");
    assert.equal(first.contentObjectId, second.contentObjectId); assert.equal(first.contentRefId, second.contentRefId); assert.equal(second.copied, false);
    contentObjectId = first.contentObjectId; contentRefId = first.contentRefId;
    const object = await db.from("dimpro_content_objects").select("storage_bucket,storage_key,sha256,size_bytes").eq("id", contentObjectId).single(); if (object.error) throw object.error;
    driveStorageBucket=String(object.data.storage_bucket); driveStorageKey=String(object.data.storage_key);
    assert.equal(object.data.sha256, first.sha256); assert.equal(Number(object.data.size_bytes), first.sizeBytes);
    const projectRef = await db.from("dimpro_content_refs").select("owner_type,owner_user_id,owner_project_id,folder_id,retained_independently").eq("id", contentRefId).single(); if(projectRef.error) throw projectRef.error;
    assert.equal(projectRef.data.owner_type, "PROJECT"); assert.equal(projectRef.data.owner_user_id, null); assert.equal(projectRef.data.owner_project_id, PROJECT_CORE_ID); assert.equal(projectRef.data.folder_id, null); assert.equal(projectRef.data.retained_independently, true);
    const projectDestination = await db.from("field_capture_destinations").select("status,ownership,folder_id,detail").eq("capture_item_id", item.data.id).eq("target", "PROJECT_DRIVE").single(); if(projectDestination.error) throw projectDestination.error;
    assert.equal(projectDestination.data.status, "STORED"); assert.equal(projectDestination.data.ownership, "PROJECT"); assert.equal(projectDestination.data.folder_id, null); assert.equal(projectDestination.data.detail?.projectDriveTreeBound, false);
    const queue = await db.from("field_capture_sync_queue").select("status,payload_meta").eq("session_id", serverSessionId).eq("device_local_id", clientSessionId).eq("operation", "SYNC_PROJECT_DRIVE_CONTENT").maybeSingle();
    // operation device_local_id is the capture item client id, therefore query by operation/session when the synthetic local id differs.
    const queueFallback = queue.data ? queue : await db.from("field_capture_sync_queue").select("status,payload_meta").eq("session_id", serverSessionId).eq("operation", "SYNC_PROJECT_DRIVE_CONTENT").single();
    if (queueFallback.error) throw queueFallback.error;
    assert.equal(queueFallback.data?.status, "DONE"); assert.equal(queueFallback.data?.payload_meta?.rawTokenPersisted, false); assert.equal(queueFallback.data?.payload_meta?.projectDriveTreeBound, false);
    const audit = await db.from("field_capture_events").select("event_type,payload").eq("session_id", serverSessionId).eq("capture_item_id", item.data.id).eq("event_type", "PROJECT_DRIVE_CONTENT_STORED"); if(audit.error) throw audit.error;
    assert.ok((audit.data || []).length >= 1); assert.ok((audit.data || []).every((row) => row.payload?.rawTokenPersisted === false && row.payload?.projectDriveTreeBound === false));

    console.log(JSON.stringify({
      ok: true,
      browserClientSync: true,
      captureOnly: false,
      p91ProjectContent: true,
      projectId: PROJECT_CORE_ID,
      projectRole: membership.data.role,
      projectContentBound: true,
      projectDriveTreeBound: false,
      contentObjectId,
      contentRefId,
      firstCopied: first.copied,
      retryCopied: second.copied,
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
