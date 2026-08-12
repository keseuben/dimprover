import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/licenckozpont";
const host = "admin.dev.dimpro.hu";
const checks = [];
const capturedDevicePatches = [];

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

const unauthorized = await fetch(`${apiBase}/api/license/admin-devices`, { headers: { host } });
check("Gépkötés API hitelesítés nélkül blokkolt", unauthorized.status === 401, `status=${unauthorized.status}`);

const authorized = await fetch(`${apiBase}/api/license/admin-devices`, { headers: { host, "x-dimpro-license-admin-key": adminKey } });
const livePayload = await authorized.json().catch(() => ({}));
check("Gépkötés API adminnal elérhető", authorized.status === 200 && livePayload?.ok === true && Array.isArray(livePayload.devices), `status=${authorized.status}`);
const liveSerialized = JSON.stringify(livePayload);
const forbidden = ["machineIdHash", "licenseKey", "stripeCustomerId", "stripeSubscriptionId", "PRIVATE KEY", "SUPABASE_SERVICE_ROLE_KEY"];
check("Gépkötés API nem ad vissza érzékeny legacy mezőt", forbidden.every((term) => !liveSerialized.includes(term)), forbidden.filter((term) => liveSerialized.includes(term)).join(", "));

const centralFixture = {
  ok: true,
  users: [{ id: "11111111-1111-4111-8111-111111111111", public_user_code: "USR-DEV-01", full_name: "Gépkötés Teszt", email: "gep@example.invalid", status: "active", email_verified_at: "2026-08-01T00:00:00.000Z" }],
  organizations: [],
  organizationMemberships: [],
  licenses: [{
    id: "22222222-2222-4222-8222-222222222222",
    public_license_code: "LIC-26-DEVC-2468",
    owner_type: "user",
    owner_user_id: "11111111-1111-4111-8111-111111111111",
    owner_organization_id: null,
    product_code: "DIMPRO",
    plan_code: "professional",
    status: "active",
    activated_at: "2026-08-01T00:00:00.000Z",
    expires_at: "2027-08-01T00:00:00.000Z",
    offline_grace_until: null,
    max_users: 1,
    max_devices: 3,
    legacy_license_ref: "legacy-device-test",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-12T10:00:00.000Z",
  }],
  licenseModules: [],
  membershipModules: [],
  organizationInvitations: [],
  sendEntitlements: [],
};
const contactFixture = { ok: true, contacts: [] };
const deviceFixture = {
  ok: true,
  devices: [{
    deviceId: "device-safe-1",
    legacyLicenseId: "legacy-device-test",
    machineHint: "••••89abcdef",
    appId: "dimpro-drive-desktop",
    firstActivatedAt: "2026-08-01T08:00:00.000Z",
    lastOnlineCheckAt: "2026-08-12T15:45:00.000Z",
    offlineGraceUntil: "2026-08-19T15:45:00.000Z",
    status: "active",
    userName: "Teszt Felhasználó",
    organizationUnit: "Projektvezetés",
    note: "Teszt laptop",
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-12T15:45:00.000Z",
  }],
};

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"],
});

try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    const method = request.method();
    if (url.includes("/api/dimpro-identity/admin/licenses") && method === "GET") {
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(centralFixture) });
      return;
    }
    if (url.includes("/api/dimpro-identity/admin/send-entitlements") && method === "GET") {
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, entitlements: [] }) });
      return;
    }
    if (url.includes("/api/license/admin-contacts") && method === "GET") {
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(contactFixture) });
      return;
    }
    if (url.includes("/api/license/admin-devices")) {
      if (method === "GET") {
        request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(deviceFixture) });
        return;
      }
      if (method === "PATCH") {
        const payload = JSON.parse(request.postData() || "{}");
        capturedDevicePatches.push(payload);
        request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, removed: payload.action === "remove", device: payload.action === "remove" ? null : { ...deviceFixture.devices[0], ...payload } }) });
        return;
      }
    }
    request.continue();
  });

  await page.evaluateOnNewDocument((key) => {
    localStorage.setItem("dimproLicenseAdminKey", key);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("dimpro-admin-theme", "dark");
  }, adminKey);

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-testid=benjadmin-license-table]", { timeout: 30000 });
  await page.click(".benjadmin-data-row-action");
  await page.waitForSelector("[data-testid=benjadmin-license-devices]", { timeout: 10000 });

  const state = await page.$eval("[data-testid=benjadmin-license-devices]", (root) => {
    const row = root.querySelector("tbody tr");
    const inputs = Array.from(row?.querySelectorAll("input") || []).map((input) => input.value);
    const buttons = Array.from(row?.querySelectorAll("button") || []).map((button) => button.getAttribute("title") || button.textContent || "");
    const sizes = Array.from(root.querySelectorAll("span,strong,small,label,code,th,td")).map((node) => parseFloat(getComputedStyle(node).fontSize)).filter(Number.isFinite);
    return {
      text: root.textContent || "",
      inputs,
      buttons,
      machineCell: row?.querySelector("td")?.textContent?.trim() || "",
      rows: root.querySelectorAll("tbody tr").length,
      minTextPx: sizes.length ? Math.min(...sizes) : 0,
    };
  });
  check("Gépkötés panel a modern Licencközpont része", state.text.includes("Gépkötések és aktivált eszközök") && state.text.includes("Biztonságos gépkötési nézet"), state.text.slice(0, 500));
  check("Maszkolt gépazonosító jelenik meg", state.machineCell === "••••89abcdef" && !state.text.includes("machine-id-hash-raw"), state.machineCell);
  check("Gépkötés metaadatok betöltődnek", state.inputs[0] === "Teszt Felhasználó" && state.inputs[1] === "Projektvezetés" && state.inputs[2] === "Teszt laptop", JSON.stringify(state.inputs));
  check("Gépkötés státusz és alkalmazás látható", state.text.includes("Aktív") && state.text.includes("dimpro-drive-desktop"), state.text.slice(0, 500));
  check("Mentés, tiltás és felszabadítás művelet elérhető", ["Gépadatok mentése", "Gép tiltása", "Gépkötés felszabadítása"].every((label) => state.buttons.includes(label)), JSON.stringify(state.buttons));
  check("Gépkötési panel működési szövege legalább 12px", state.minTextPx >= 12, `min=${state.minTextPx}`);

  await page.evaluate(() => {
    const root = document.querySelector("[data-testid=benjadmin-license-devices]");
    const input = root?.querySelector("tbody tr input");
    if (!input) throw new Error("Géphasználó mező hiányzik");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "Módosított Felhasználó");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const patchResponse = page.waitForResponse((response) => response.url().includes("/api/license/admin-devices") && response.request().method() === "PATCH", { timeout: 10000 });
  await page.evaluate(() => document.querySelector('[data-testid="benjadmin-license-devices"] button[title="Gépadatok mentése"]')?.click());
  await patchResponse;
  const patch = capturedDevicePatches[0];
  check("Gépkötés PATCH pontos legacy licenchez kötött", patch?.legacyLicenseId === "legacy-device-test" && patch?.deviceId === "device-safe-1", JSON.stringify(patch));
  check("Gépkötés PATCH csak biztonságos metaadatot küld", patch?.action === "updateMeta" && patch?.userName === "Módosított Felhasználó" && patch?.organizationUnit === "Projektvezetés" && patch?.note === "Teszt laptop", JSON.stringify(patch));
  const patchSerialized = JSON.stringify(patch || {});
  check("Gépkötés PATCH nem továbbít teljes géphash-t vagy licenckulcsot", forbidden.every((term) => !patchSerialized.includes(term)), forbidden.filter((term) => patchSerialized.includes(term)).join(", "));

  await page.waitForFunction(() => !document.querySelector('[data-testid="benjadmin-license-devices"] button[title="Gép tiltása"]')?.disabled, { timeout: 10000 });
  page.once("dialog", (dialog) => void dialog.accept());
  const statusResponse = page.waitForResponse((response) => response.url().includes("/api/license/admin-devices") && response.request().method() === "PATCH", { timeout: 10000 });
  await page.click('[data-testid="benjadmin-license-devices"] button[title="Gép tiltása"]');
  await statusResponse;
  const statusPatch = capturedDevicePatches.find((item) => item.action === "setStatus");
  check("Gép tiltása külön, pontos státusz PATCH-et készít", statusPatch?.legacyLicenseId === "legacy-device-test" && statusPatch?.deviceId === "device-safe-1" && statusPatch?.status === "blocked", JSON.stringify(statusPatch));

  await page.waitForFunction(() => !document.querySelector('[data-testid="benjadmin-license-devices"] button[title="Gépkötés felszabadítása"]')?.disabled, { timeout: 10000 });
  page.once("dialog", (dialog) => void dialog.accept());
  const removeResponse = page.waitForResponse((response) => response.url().includes("/api/license/admin-devices") && response.request().method() === "PATCH", { timeout: 10000 });
  await page.click('[data-testid="benjadmin-license-devices"] button[title="Gépkötés felszabadítása"]');
  await removeResponse;
  const removePatch = capturedDevicePatches.find((item) => item.action === "remove");
  check("Gépkötés felszabadítása külön, megerősített PATCH-et készít", removePatch?.legacyLicenseId === "legacy-device-test" && removePatch?.deviceId === "device-safe-1", JSON.stringify(removePatch));

  await page.evaluate(() => document.querySelector('[data-testid="benjadmin-topbar-theme-toggle"]')?.click());
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód gépkötés panellel működik", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const viewportState = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, devices: Boolean(document.querySelector('[data-testid="benjadmin-license-devices"]')) }));
    check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, viewportState.scrollWidth <= viewportState.clientWidth + 1, JSON.stringify(viewportState));
    check(`${viewport.name} gépkötés panel megmarad`, viewportState.devices, JSON.stringify(viewportState));
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
