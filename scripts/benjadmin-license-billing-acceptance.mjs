import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/licenckozpont";
const host = "admin.dev.dimpro.hu";
const checks = [];
let capturedBillingPatch = null;

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

const unauthorized = await fetch(`${apiBase}/api/license/admin-billing`, { headers: { host } });
check("Számlázási bridge API hitelesítés nélkül blokkolt", unauthorized.status === 401, `status=${unauthorized.status}`);

const authorized = await fetch(`${apiBase}/api/license/admin-billing`, { headers: { host, "x-dimpro-license-admin-key": adminKey } });
const livePayload = await authorized.json().catch(() => ({}));
check("Számlázási bridge API adminnal elérhető", authorized.status === 200 && livePayload?.ok === true && Array.isArray(livePayload.billing), `status=${authorized.status}`);
const liveSerialized = JSON.stringify(livePayload);
const forbidden = ["stripeCustomerId", "stripeSubscriptionId", "licenseKey", "machineIdHash", "PRIVATE KEY", "SUPABASE_SERVICE_ROLE_KEY"];
check("Számlázási bridge API nem ad vissza érzékeny azonosítót", forbidden.every((term) => !liveSerialized.includes(term)), forbidden.filter((term) => liveSerialized.includes(term)).join(", "));

const centralFixture = {
  ok: true,
  users: [{ id: "11111111-1111-4111-8111-111111111111", public_user_code: "USR-BILL-01", full_name: "Számlázás Teszt", email: "billing@example.invalid", status: "active", email_verified_at: "2026-08-01T00:00:00.000Z" }],
  organizations: [],
  organizationMemberships: [],
  licenses: [{
    id: "22222222-2222-4222-8222-222222222222",
    public_license_code: "LIC-26-BILL-2468",
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
    legacy_license_ref: "legacy-billing-test",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-12T10:00:00.000Z",
  }],
  licenseModules: [],
  membershipModules: [],
  organizationInvitations: [],
  sendEntitlements: [],
};
const billingFixture = {
  ok: true,
  billing: [{
    legacyLicenseId: "legacy-billing-test",
    companyName: "Számlázás Teszt Kft.",
    legacyStatus: "active",
    startsAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2027-08-15T00:00:00.000Z",
    maxDevices: 4,
    planCode: "legacy-standard",
    billingInterval: "yearly",
    billingStatus: "active",
    subscriptionQuantity: 4,
    currentPeriodEnd: "2027-08-15T23:59:59.000Z",
    autoReleaseInactiveDevices: false,
    inactiveReleaseDays: 90,
    providerCustomerLinked: true,
    providerSubscriptionLinked: true,
    updatedAt: "2026-08-12T10:00:00.000Z",
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
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, contacts: [] }) });
      return;
    }
    if (url.includes("/api/license/admin-devices") && method === "GET") {
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, devices: [] }) });
      return;
    }
    if (url.includes("/api/license/admin-billing")) {
      if (method === "GET") {
        request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(billingFixture) });
        return;
      }
      if (method === "PATCH") {
        capturedBillingPatch = JSON.parse(request.postData() || "{}");
        request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, changed: true, billing: { ...billingFixture.billing[0], ...capturedBillingPatch }, changes: ["teszt"] }) });
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
  await page.waitForSelector('[data-testid="benjadmin-license-table"]', { timeout: 30000 });
  await page.click(".benjadmin-data-row-action");
  await page.waitForSelector('[data-testid="benjadmin-license-billing"]', { timeout: 10000 });

  const state = await page.$eval('[data-testid="benjadmin-license-billing"]', (root) => {
    const fields = Object.fromEntries(Array.from(root.querySelectorAll(".benjadmin-data-field")).map((field) => {
      const label = field.querySelector(":scope > span")?.textContent?.trim() || "";
      const control = field.querySelector("input,select");
      return [label, control?.value ?? ""];
    }));
    const sizes = Array.from(root.querySelectorAll("span,strong,small,label,code,b")).map((node) => parseFloat(getComputedStyle(node).fontSize)).filter(Number.isFinite);
    return {
      text: root.textContent || "",
      fields,
      minTextPx: sizes.length ? Math.min(...sizes) : 0,
    };
  });
  check("Előfizetés/számlázás panel a modern Licencközpont része", state.text.includes("Előfizetés és számlázási állapot") && state.text.includes("Átmeneti legacy bridge"), state.text.slice(0, 650));
  check("Központi és legacy csomageltérés látható", state.text.includes("professional") && state.text.includes("legacy-standard") && state.text.includes("Csomag eltérés"), state.text.slice(0, 650));
  check("Számlázási ciklus, állapot és mennyiség betöltődik", state.fields["Számlázási ciklus"] === "yearly" && state.fields["Fizetési állapot"] === "active" && state.fields["Előfizetési mennyiség"] === "4", JSON.stringify(state.fields));
  check("Fizetési szolgáltatói kapcsolat csak állapotként látható", state.text.includes("Fizetési ügyfélkapcsolatKapcsolva") && state.text.includes("Fizetési előfizetéskapcsolatKapcsolva") && !state.text.includes("cus_") && !state.text.includes("sub_"), state.text.slice(0, 650));
  check("Számlázási panel működési szövege legalább 12px", state.minTextPx >= 12, `min=${state.minTextPx}`);

  await page.evaluate(() => {
    const root = document.querySelector('[data-testid="benjadmin-license-billing"]');
    const field = (label) => Array.from(root?.querySelectorAll(".benjadmin-data-field") || []).find((item) => item.querySelector(":scope > span")?.textContent?.trim() === label);
    const quantity = field("Előfizetési mennyiség")?.querySelector("input");
    const autoRelease = field("Inaktív gép automatikus felszabadítása")?.querySelector("select");
    if (!quantity || !autoRelease) throw new Error("Számlázási mező hiányzik");
    const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    inputSetter?.call(quantity, "6");
    quantity.dispatchEvent(new Event("input", { bubbles: true }));
    quantity.dispatchEvent(new Event("change", { bubbles: true }));
    const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    selectSetter?.call(autoRelease, "yes");
    autoRelease.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const patchResponse = page.waitForResponse((response) => response.url().includes("/api/license/admin-billing") && response.request().method() === "PATCH", { timeout: 10000 });
  await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="benjadmin-license-billing"] button')).find((button) => (button.textContent || "").includes("Előfizetési adatok mentése"))?.click());
  await patchResponse;

  check("Számlázási PATCH pontos legacy licencazonosítót használ", capturedBillingPatch?.legacyLicenseId === "legacy-billing-test", JSON.stringify(capturedBillingPatch));
  check("Legacy csomag mentéskor a központi csomaghoz igazodik", capturedBillingPatch?.planCode === "professional", JSON.stringify(capturedBillingPatch));
  check("Módosított számlázási mennyiség és automatikus felszabadítás a PATCH-be kerül", capturedBillingPatch?.subscriptionQuantity === 6 && capturedBillingPatch?.autoReleaseInactiveDevices === true, JSON.stringify(capturedBillingPatch));
  const patchSerialized = JSON.stringify(capturedBillingPatch || {});
  check("Számlázási PATCH nem továbbít szolgáltatói vagy licenctitkot", forbidden.every((term) => !patchSerialized.includes(term)), forbidden.filter((term) => patchSerialized.includes(term)).join(", "));

  await page.evaluate(() => document.querySelector('[data-testid="benjadmin-topbar-theme-toggle"]')?.click());
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód számlázási panellel működik", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const viewportState = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, billing: Boolean(document.querySelector('[data-testid="benjadmin-license-billing"]')) }));
    check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, viewportState.scrollWidth <= viewportState.clientWidth + 1, JSON.stringify(viewportState));
    check(`${viewport.name} számlázási panel megmarad`, viewportState.billing, JSON.stringify(viewportState));
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
