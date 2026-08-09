import assert from "node:assert/strict";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import puppeteer, { type ElementHandle, type Page } from "puppeteer";
import {
  acceptDropSpaceInvitation,
  createDropSpace,
  inviteDropSpaceMember,
} from "../app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "../app/lib/drop/dropSpaceSecurity";

const port = Number(process.env.DROP_SPACE_PACKAGE_RELEASE_PORT || 3228);

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

async function findButton(page: Page, text: string) {
  const handle = await page.evaluateHandle((needle) => {
    return [...document.querySelectorAll("button")]
      .find((button) => (button.textContent || "").includes(needle)) || null;
  }, text);
  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    throw new Error(`Nem található gomb: ${text}`);
  }
  return element as ElementHandle<HTMLButtonElement>;
}

async function holdButton(page: Page, text: string, durationMs = 2250) {
  const button = await findButton(page, text);
  const disabled = await button.evaluate((node) => node.disabled);
  assert.equal(disabled, false, `A gomb letiltott: ${text}`);
  await button.evaluate((node) => {
    node.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: 91,
      pointerType: "mouse",
      isPrimary: true,
      buttons: 1,
    }));
  });
  await new Promise((resolve) => setTimeout(resolve, 1850));
  const progress = await button.evaluate((node) => Number(node.getAttribute("data-hold-progress") || "0"));
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, durationMs - 1850)));
  try {
    await button.evaluate((node) => {
      if (!node.isConnected) return;
      node.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        pointerId: 91,
        pointerType: "mouse",
        isPrimary: true,
        buttons: 0,
      }));
    });
  } catch {
    // Sikeres létrehozás után az űrlap eltűnhet.
  }
  await button.dispose().catch(() => undefined);
  return progress;
}

async function setField(page: Page, labelText: string, value: string) {
  const changed = await page.evaluate(({ labelText: needle, value: nextValue }) => {
    const label = [...document.querySelectorAll("label")]
      .find((item) => (item.textContent || "").includes(needle));
    const field = label?.querySelector("input,textarea,select");
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
    setter?.call(field, nextValue);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, { labelText, value });
  assert.equal(changed, true, `Nem található mező: ${labelText}`);
}

async function main() {
  if (process.env.DROP_ALLOW_SPACE_PACKAGE_RELEASE_TEST !== "DROP-SPACE-PACKAGE-RELEASE-TEST") {
    throw new Error("Hiányzó DROP 0.3.2 candidate böngészőteszt-engedély.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(url && key);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const unique = Date.now().toString(36);
  const title = `Candidate saját tércsomag ${unique}`;
  const projectId = `candidate-v032-project-${unique}`;
  let spaceId: string | null = null;
  let packageId: string | null = null;
  let cleanupCompleted = false;
  const browserErrors: string[] = [];
  const consoleErrors: string[] = [];

  try {
    const createdSpace = await createDropSpace({
      name: `Candidate tércsomag böngészőteszt ${unique}`,
      ownerLicenseId: `candidate-v032-license-${unique}`,
      ownerUserId: `candidate-v032-owner-${unique}`,
      ownerName: "Candidate tesztgazda",
      ownerEmail: `candidate-owner-${unique}@example.hu`,
      licenseEndsAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      accessExpiryMode: "license",
      maxMembers: 10,
      maxPackages: 100,
      storageQuotaBytes: 1024 ** 3,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
      project: {
        id: projectId,
        name: `Candidate tesztprojekt ${unique}`,
        syncToDock: true,
        allowDockPackageCreation: true,
        archiveToDrive: true,
      },
    });
    spaceId = createdSpace.space.id;

    const contributorInvitation = await inviteDropSpaceMember(spaceId, {
      displayName: "Candidate közreműködő",
      email: `candidate-contributor-${unique}@example.hu`,
      role: "contributor",
    });
    const viewerInvitation = await inviteDropSpaceMember(spaceId, {
      displayName: "Candidate kiválasztott megtekintő",
      email: `candidate-viewer-${unique}@example.hu`,
      role: "viewer",
    });
    const [contributorAccepted, viewerAccepted] = await Promise.all([
      acceptDropSpaceInvitation(contributorInvitation.rawInvitationToken),
      acceptDropSpaceInvitation(viewerInvitation.rawInvitationToken),
    ]);
    const contributorCookie = `${DROP_SPACE_SESSION_COOKIE}=${contributorAccepted.sessionToken}`;
    const viewerCookie = `${DROP_SPACE_SESSION_COOKIE}=${viewerAccepted.sessionToken}`;

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
        value: contributorAccepted.sessionToken,
        domain: "drop.dimpro.hu",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      });
      await page.goto(`http://drop.dimpro.hu:${port}/space/${createdSpace.space.publicCode}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForFunction(() => document.body.innerText.includes("Saját és megosztott csomagok"), { timeout: 30_000 });
      await page.waitForFunction(() => document.body.innerText.includes("A térbeli csomagkészítés aktív"), { timeout: 30_000 });

      const newPackageButton = await findButton(page, "Új saját csomag");
      assert.equal(await newPackageButton.evaluate((node) => node.disabled), false);
      await newPackageButton.click();
      await newPackageButton.dispose();
      await page.waitForFunction(() => document.body.innerText.includes("Új saját tércsomag"), { timeout: 10_000 });

      await setField(page, "Csomag címe", title);
      await setField(page, "Projekt", projectId);
      await setField(page, "Leírás", "Candidate böngészőből létrehozott kiválasztott tagsági csomag.");
      await setField(page, "Logikai csoportok", "Tervek\nHelyszíni fotók");

      const selected = await page.evaluate((viewerName) => {
        const label = [...document.querySelectorAll("label")]
          .find((item) => (item.textContent || "").includes(viewerName));
        const checkbox = label?.querySelector('input[type="checkbox"]');
        if (!(checkbox instanceof HTMLInputElement)) return false;
        checkbox.click();
        return checkbox.checked;
      }, "Candidate kiválasztott megtekintő");
      assert.equal(selected, true);

      const responsePromise = page.waitForResponse(
        (response) => response.request().method() === "POST"
          && response.url().endsWith("/api/drop/spaces/packages")
          && response.status() === 201,
        { timeout: 30_000 },
      );
      const progress = await holdButton(page, "Saját csomag létrehozása · 2 mp");
      assert.ok(progress >= 85, `A 2 mp-es nyomva tartás progressze hibás: ${progress}`);
      const response = await responsePromise;
      const payload = await response.json() as {
        created?: { package?: { id?: string; public_code?: string }; pin?: string; links?: { view?: string; upload?: string } };
      };
      packageId = payload.created?.package?.id || null;
      assert.ok(packageId);
      assert.match(payload.created?.pin || "", /^\d{6}$/);
      assert.match(payload.created?.links?.view || "", /^https:\/\/drop\.dimpro\.hu\/p\//);
      assert.match(payload.created?.links?.upload || "", /^https:\/\/drop\.dimpro\.hu\/u\//);

      await page.waitForFunction((packageTitle) => {
        const text = document.body.innerText.toLocaleLowerCase("hu-HU");
        return text.includes("egyszeri biztonsági átadás")
          && text.includes(String(packageTitle).toLocaleLowerCase("hu-HU"))
          && text.includes("megtekintési link");
      }, { timeout: 20_000 }, title);
      await page.waitForFunction((packageTitle) => {
        const text = document.body.innerText.toLocaleLowerCase("hu-HU");
        return text.includes("látható tércsomagok")
          && text.includes(String(packageTitle).toLocaleLowerCase("hu-HU"))
          && text.includes("saját csomag");
      }, { timeout: 20_000 }, title);

      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        uploadClosed: document.body.innerText.includes("Fájlt még ebben a csomagban sem lehet feltölteni"),
      }));
      assert.equal(layout.overflow, false);
      assert.equal(layout.uploadClosed, true);
    } finally {
      await browser.close();
    }

    const [creatorListResponse, viewerListResponse] = await Promise.all([
      request("/api/drop/spaces/packages", { cookie: contributorCookie }),
      request("/api/drop/spaces/packages", { cookie: viewerCookie }),
    ]);
    assert.equal(creatorListResponse.status, 200, creatorListResponse.raw);
    assert.equal(viewerListResponse.status, 200, viewerListResponse.raw);
    const creatorPayload = creatorListResponse.json as { packages?: Array<{ id: string; title: string; isOwn: boolean }>; creation?: { ready?: boolean; fileUploadEnabled?: boolean } };
    const viewerPayload = viewerListResponse.json as { packages?: Array<{ id: string; title: string; isOwn: boolean }>; creation?: { permissionGranted?: boolean } };
    assert.equal(creatorPayload.creation?.ready, true);
    assert.equal(creatorPayload.creation?.fileUploadEnabled, false);
    assert.equal(creatorPayload.packages?.some((item) => item.id === packageId && item.isOwn), true);
    assert.equal(viewerPayload.creation?.permissionGranted, false);
    assert.equal(viewerPayload.packages?.some((item) => item.id === packageId && !item.isOwn), true);

    const { count: fileCount, error: fileCountError } = await client
      .from("drop_files")
      .select("id", { count: "exact", head: true })
      .eq("package_id", packageId);
    assert.equal(fileCountError, null, fileCountError?.message);
    assert.equal(fileCount, 0);
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(consoleErrors.filter((item) => !item.includes("favicon")), []);

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.2",
      candidatePort: port,
      packagePanelReady: true,
      twoSecondCreateCompleted: true,
      packageCreatedViaBrowser: true,
      oneTimePinAndLinksRendered: true,
      creatorListVisible: true,
      selectedViewerListVisible: true,
      viewerCreatePermissionDenied: true,
      fileUploadEnabled: false,
      fileCount: fileCount || 0,
      browserErrors: browserErrors.length,
      consoleErrors: consoleErrors.length,
      horizontalOverflow: false,
    }, null, 2));
  } finally {
    if (packageId) {
      const { error } = await client.from("drop_packages").delete().eq("id", packageId);
      if (error) throw new Error(`Candidate csomagtakarítási hiba: ${error.message}`);
    }
    if (spaceId) {
      const { error } = await client.from("drop_spaces").delete().eq("id", spaceId);
      if (error) throw new Error(`Candidate tértakarítási hiba: ${error.message}`);
      const [{ data: remainingSpace, error: spaceVerifyError }, { data: remainingPackage, error: packageVerifyError }] = await Promise.all([
        client.from("drop_spaces").select("id").eq("id", spaceId).maybeSingle(),
        packageId
          ? client.from("drop_packages").select("id").eq("id", packageId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (spaceVerifyError) throw spaceVerifyError;
      if (packageVerifyError) throw packageVerifyError;
      assert.equal(remainingSpace, null);
      assert.equal(remainingPackage, null);
      cleanupCompleted = true;
    }
    console.log(JSON.stringify({ cleanupCompleted, testSpaceRetained: false, testPackageRetained: false }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
