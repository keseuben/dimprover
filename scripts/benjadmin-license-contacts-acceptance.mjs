import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/licenckozpont";
const host = "admin.dev.dimpro.hu";
const checks = [];
let capturedContactPatch = null;

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

const unauthorized = await fetch(`${apiBase}/api/license/admin-contacts`, { headers: { host } });
check("Kapcsolattartó API hitelesítés nélkül blokkolt", unauthorized.status === 401, `status=${unauthorized.status}`);

const authorized = await fetch(`${apiBase}/api/license/admin-contacts`, { headers: { host, "x-dimpro-license-admin-key": adminKey } });
const livePayload = await authorized.json().catch(() => ({}));
check("Kapcsolattartó API adminnal elérhető", authorized.status === 200 && livePayload?.ok === true && Array.isArray(livePayload.contacts), `status=${authorized.status}`);
const liveSerialized = JSON.stringify(livePayload);
const forbidden = ["licenseKey", "machineIdHash", "stripeCustomerId", "stripeSubscriptionId", "PRIVATE KEY", "SUPABASE_SERVICE_ROLE_KEY"];
check("Kapcsolattartó API nem ad vissza érzékeny legacy mezőt", forbidden.every((term) => !liveSerialized.includes(term)), forbidden.filter((term) => liveSerialized.includes(term)).join(", "));

const centralFixture = {
  ok: true,
  users: [{ id: "11111111-1111-4111-8111-111111111111", public_user_code: "USR-CNT-01", full_name: "Kapcsolat Teszt", email: "kapcsolat@example.invalid", status: "active", email_verified_at: "2026-08-01T00:00:00.000Z" }],
  organizations: [],
  organizationMemberships: [],
  licenses: [{
    id: "22222222-2222-4222-8222-222222222222",
    public_license_code: "LIC-26-CONT-2468",
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
    legacy_license_ref: "legacy-contact-test",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-12T10:00:00.000Z",
  }],
  licenseModules: [],
  membershipModules: [],
  organizationInvitations: [],
  sendEntitlements: [],
};
const contactFixture = {
  ok: true,
  contacts: [{
    legacyLicenseId: "legacy-contact-test",
    companyName: "Kapcsolat Teszt Kft.",
    contactName: "Elsődleges Kapcsolat",
    contactEmail: "elso@example.invalid",
    contactPhone: "+36 30 111 1111",
    secondaryContactName: "Másodlagos Kapcsolat",
    secondaryContactEmail: "masodik@example.invalid",
    secondaryContactPhone: "+36 30 222 2222",
    additionalContacts: [{ id: "contact-1", name: "Harmadik Kapcsolat", role: "Műszaki kapcsolattartó", email: "harmadik@example.invalid", phone: "+36 30 333 3333", receiveEmail: true, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }],
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
    if (url.includes("/api/license/admin-contacts")) {
      if (method === "GET") {
        request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(contactFixture) });
        return;
      }
      if (method === "PATCH") {
        capturedContactPatch = JSON.parse(request.postData() || "{}");
        request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, contact: { ...contactFixture.contacts[0], ...capturedContactPatch } }) });
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
  await page.waitForSelector("[data-testid=benjadmin-license-contacts]", { timeout: 10000 });

  const contactState = await page.$eval("[data-testid=benjadmin-license-contacts]", (root) => {
    const fields = Object.fromEntries(Array.from(root.querySelectorAll(".benjadmin-data-field")).map((field) => [field.querySelector(":scope > span")?.textContent?.trim(), field.querySelector("input")?.value ?? ""]));
    const sizes = Array.from(root.querySelectorAll("span,strong,small,label,code,th,td")).map((node) => parseFloat(getComputedStyle(node).fontSize)).filter(Number.isFinite);
    return {
      text: root.textContent || "",
      fields,
      additionalRows: root.querySelectorAll(".benjadmin-data-mini-table tbody tr").length,
      additionalValues: Array.from(root.querySelectorAll(".benjadmin-data-mini-table tbody tr")).map((row) => Array.from(row.querySelectorAll("input")).map((input) => input.type === "checkbox" ? input.checked : input.value)),
      minTextPx: sizes.length ? Math.min(...sizes) : 0,
    };
  });
  check("Kapcsolattartó panel a modern Licencközpont része", contactState.text.includes("Kapcsolattartók") && contactState.text.includes("Átmeneti legacy bridge"), contactState.text.slice(0, 500));
  check("Elsődleges és másodlagos kapcsolattartók betöltődnek", contactState.fields["Elsődleges kapcsolattartó neve"] === "Elsődleges Kapcsolat" && contactState.fields["Másodlagos kapcsolattartó neve"] === "Másodlagos Kapcsolat", JSON.stringify(contactState.fields));
  check("További értesítési kapcsolattartók megjelennek", contactState.additionalRows === 1 && contactState.additionalValues?.[0]?.[0] === "Harmadik Kapcsolat" && contactState.additionalValues?.[0]?.[1] === "Műszaki kapcsolattartó" && contactState.additionalValues?.[0]?.[4] === true, JSON.stringify(contactState.additionalValues));
  check("Biztonsági bridge magyarázat látható", contactState.text.includes("Nyers licenckulcs") && contactState.text.includes("Identity Core sémába migrálása külön fejlesztési lépés"));
  check("Kapcsolattartó panel működési szövege legalább 12px", contactState.minTextPx >= 12, `min=${contactState.minTextPx}`);

  await page.evaluate(() => {
    const root = document.querySelector("[data-testid=benjadmin-license-contacts]");
    const primary = Array.from(root?.querySelectorAll(".benjadmin-data-field") || []).find((field) => field.querySelector(":scope > span")?.textContent?.trim() === "Elsődleges kapcsolattartó neve")?.querySelector("input");
    if (!primary) throw new Error("Elsődleges kapcsolattartó mező hiányzik");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(primary, "Módosított Kapcsolat");
    primary.dispatchEvent(new Event("input", { bubbles: true }));
    primary.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const patchResponse = page.waitForResponse((response) => response.url().includes("/api/license/admin-contacts") && response.request().method() === "PATCH", { timeout: 10000 });
  await page.evaluate(() => Array.from(document.querySelectorAll("[data-testid=benjadmin-license-contacts] button")).find((button) => (button.textContent || "").includes("Kapcsolattartók mentése"))?.click());
  await patchResponse;
  check("Kapcsolattartó PATCH pontos legacy rekordazonosítót használ", capturedContactPatch?.legacyLicenseId === "legacy-contact-test", JSON.stringify(capturedContactPatch));
  check("Kapcsolattartó PATCH csak kapcsolattartói adatokat küld", capturedContactPatch?.contactName === "Módosított Kapcsolat" && Array.isArray(capturedContactPatch?.additionalContacts), JSON.stringify(capturedContactPatch));
  const patchSerialized = JSON.stringify(capturedContactPatch || {});
  check("Kapcsolattartó PATCH nem továbbít érzékeny licencmezőt", forbidden.every((term) => !patchSerialized.includes(term)), forbidden.filter((term) => patchSerialized.includes(term)).join(", "));

  await page.evaluate(() => document.querySelector("[data-testid=benjadmin-topbar-theme-toggle]")?.click());
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód kapcsolattartó panellel működik", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const state = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, contacts: Boolean(document.querySelector("[data-testid=benjadmin-license-contacts]")) }));
    check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
    check(`${viewport.name} kapcsolattartó panel megmarad`, state.contacts, JSON.stringify(state));
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
