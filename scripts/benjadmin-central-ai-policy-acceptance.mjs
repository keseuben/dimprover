import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/licenckozpont";
const checks = [];
let capturedPatch = null;

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

const fixture = {
  ok: true,
  users: [{ id: "11111111-1111-4111-8111-111111111111", public_user_code: "USR-AI-01", full_name: "AI Teszt Felhasználó", email: "ai.teszt@example.invalid", status: "active", email_verified_at: "2026-08-01T00:00:00.000Z" }],
  organizations: [],
  organizationMemberships: [],
  licenses: [{
    id: "22222222-2222-4222-8222-222222222222",
    public_license_code: "LIC-26-A234-B567",
    owner_type: "user",
    owner_user_id: "11111111-1111-4111-8111-111111111111",
    owner_organization_id: null,
    product_code: "DIMPRO",
    plan_code: "ai-pro",
    status: "active",
    activated_at: "2026-08-01T10:15:30.000Z",
    expires_at: "2027-08-01T10:15:30.000Z",
    offline_grace_until: null,
    max_users: 1,
    max_devices: 3,
    legacy_license_ref: "LEGACY-AI-TEST",
    created_at: "2026-08-01T10:15:30.000Z",
    updated_at: "2026-08-12T10:00:00.000Z",
  }],
  licenseModules: [{
    id: "33333333-3333-4333-8333-333333333333",
    license_id: "22222222-2222-4222-8222-222222222222",
    module_code: "AI_ASSISTANT",
    enabled: true,
    limits: {
      monthlyBudgetHuf: 25000,
      maxSingleRequestHuf: 180,
      monthlyTokenBudget: 1200000,
      maxRequestsPerDay: 40,
      maxRequestsPerMonth: 700,
      preservedCustomLimit: 77,
    },
    feature_flags: {
      daily_plan: true,
      decision_support: false,
      preservedCustomFlag: true,
    },
    valid_from: "2026-08-01T10:15:30.000Z",
    valid_until: "2026-12-31T18:45:15.000Z",
    created_at: "2026-08-01T10:15:30.000Z",
    updated_at: "2026-08-12T10:00:00.000Z",
  }],
  membershipModules: [],
  organizationInvitations: [],
  sendEntitlements: [],
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
    if (url.includes("/api/dimpro-identity/admin/licenses")) {
      if (method === "GET") {
        request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) });
        return;
      }
      if (method === "PATCH") {
        capturedPatch = JSON.parse(request.postData() || "{}");
        request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, license: fixture.licenses[0] }) });
        return;
      }
    }
    if (url.includes("/api/dimpro-identity/admin/send-entitlements") && method === "GET") {
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, entitlements: [] }) });
      return;
    }
    request.continue();
  });

  await page.evaluateOnNewDocument((key) => {
    localStorage.setItem("dimproLicenseAdminKey", key);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("dimpro-admin-theme", "dark");
    localStorage.setItem("dimpro-benjadmin-board-pinned", "false");
  }, adminKey);

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="benjadmin-license-table"]', { timeout: 30000 });
  await page.click(".benjadmin-data-row-action");
  await page.waitForSelector('[data-testid="benjadmin-ai-policy"]', { timeout: 10000 });

  const policy = await page.$eval('[data-testid="benjadmin-ai-policy"]', (root) => {
    const findField = (label) => {
      const field = Array.from(root.querySelectorAll(".benjadmin-data-field")).find((item) => item.querySelector(":scope > span")?.textContent?.trim() === label);
      return field?.querySelector("input")?.value ?? null;
    };
    const decision = Array.from(root.querySelectorAll(".benjadmin-data-check-grid label")).find((item) => (item.textContent || "").includes("Döntési összefoglaló"));
    const sizes = Array.from(root.querySelectorAll("span,strong,small,label,code")).map((node) => parseFloat(getComputedStyle(node).fontSize)).filter(Number.isFinite);
    return {
      text: root.textContent || "",
      monthlyBudget: findField("Havi AI-keret (Ft)"),
      maxSingle: findField("Egy AI-kérés maximuma (Ft)"),
      tokenBudget: findField("Havi tokenkeret"),
      dailyRequests: findField("Napi AI-kérések"),
      monthlyRequests: findField("Havi AI-kérések"),
      featureCount: root.querySelectorAll(".benjadmin-data-check-grid label").length,
      decisionChecked: Boolean(decision?.querySelector("input")?.checked),
      minTextPx: sizes.length ? Math.min(...sizes) : 0,
    };
  });

  check("Identity Core AI policy panel megjelenik", policy.text.includes("AI finanszírozás és keretek") && policy.text.includes("Identity Core policy"), policy.text.slice(0, 500));
  check("Központi AI pénzügyi és tokenkeretek betöltődnek", policy.monthlyBudget === "25000" && policy.maxSingle === "180" && policy.tokenBudget === "1200000", JSON.stringify(policy));
  check("Központi AI kérésszám-keretek betöltődnek", policy.dailyRequests === "40" && policy.monthlyRequests === "700", JSON.stringify(policy));
  check("Nyolc AI funkciókapcsoló megmarad", policy.featureCount === 8, `count=${policy.featureCount}`);
  check("Meglévő feature flag állapot betöltődik", policy.decisionChecked === false, `decisionChecked=${policy.decisionChecked}`);
  check("Runtime bridge átmeneti állapota egyértelmű", policy.text.includes("Identity Core policy-t is olvassa") && policy.text.includes("prefer") && policy.text.includes("biztonsági felső korlát"));
  check("AI policy működési szövege legalább 12px", policy.minTextPx >= 12, `min=${policy.minTextPx}`);

  await page.evaluate(() => {
    const root = document.querySelector('[data-testid="benjadmin-ai-policy"]');
    const field = Array.from(root?.querySelectorAll(".benjadmin-data-field") || []).find((item) => item.querySelector(":scope > span")?.textContent?.trim() === "Havi AI-keret (Ft)");
    const input = field?.querySelector("input");
    if (!input) throw new Error("Havi AI-keret mező hiányzik");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "30000");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const decision = Array.from(root?.querySelectorAll(".benjadmin-data-check-grid label") || []).find((item) => (item.textContent || "").includes("Döntési összefoglaló"));
    decision?.querySelector("input")?.click();
  });
  const patchResponse = page.waitForResponse((response) => response.url().includes("/api/dimpro-identity/admin/licenses") && response.request().method() === "PATCH", { timeout: 10000 });
  await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="benjadmin-license-drawer"] button')).find((button) => (button.textContent || "").includes("Licenc mentése"))?.click());
  await patchResponse;

  const aiModule = capturedPatch?.modules?.find((item) => item.moduleCode === "AI_ASSISTANT");
  check("AI policy PATCH az Identity Core modulmetadatát használja", Boolean(aiModule), JSON.stringify(capturedPatch));
  check("Módosított havi AI-keret bekerül a PATCH-be", aiModule?.limits?.monthlyBudgetHuf === 30000, JSON.stringify(aiModule?.limits));
  check("Ismeretlen limits mező megőrződik", aiModule?.limits?.preservedCustomLimit === 77, JSON.stringify(aiModule?.limits));
  check("Ismeretlen feature flag megőrződik", aiModule?.featureFlags?.preservedCustomFlag === true, JSON.stringify(aiModule?.featureFlags));
  check("Meglévő feature flag módosítható", aiModule?.featureFlags?.decision_support === true, JSON.stringify(aiModule?.featureFlags));
  check("Modul érvényességi időpontjai veszteség nélkül megmaradnak", aiModule?.validFrom === "2026-08-01T10:15:30.000Z" && aiModule?.validUntil === "2026-12-31T18:45:15.000Z", JSON.stringify({ validFrom: aiModule?.validFrom, validUntil: aiModule?.validUntil }));

  await page.evaluate(() => document.querySelector('[data-testid="benjadmin-topbar-theme-toggle"]')?.click());
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód AI policy panellel működik", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const state = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, policy: Boolean(document.querySelector('[data-testid="benjadmin-ai-policy"]')) }));
    check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
    check(`${viewport.name} AI policy panel megmarad`, state.policy, JSON.stringify(state));
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
