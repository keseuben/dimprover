import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/licenckozpont";
const checks = [];
let capturedMemberPatch = null;

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

const licenseId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const membershipId = "55555555-5555-4555-8555-555555555555";

const fixture = {
  ok: true,
  users: [{ id: userId, public_user_code: "USR-AI-MEMBER", full_name: "Tagsági AI Teszt", email: "member.ai@example.invalid", status: "active", email_verified_at: "2026-08-01T00:00:00.000Z" }],
  organizations: [{ id: organizationId, public_organization_code: "ORG-AI-TEST", display_name: "AI Teszt Szervezet", legal_name: "AI Teszt Szervezet Kft.", email: "office@example.invalid", status: "active" }],
  organizationMemberships: [{ id: membershipId, user_id: userId, organization_id: organizationId, role_code: "member", role_label: "Munkatárs", status: "active", joined_at: "2026-08-01T08:00:00.000Z", access_ends_at: null, is_primary: false }],
  licenses: [{ id: licenseId, public_license_code: "LIC-26-MEMB-2468", owner_type: "organization", owner_user_id: null, owner_organization_id: organizationId, product_code: "DIMPRO", plan_code: "ai-pro", status: "active", activated_at: "2026-08-01T08:00:00.000Z", expires_at: "2027-08-01T08:00:00.000Z", offline_grace_until: null, max_users: 20, max_devices: 20, legacy_license_ref: "LEGACY-MEMBER-AI", created_at: "2026-08-01T08:00:00.000Z", updated_at: "2026-08-12T10:00:00.000Z" }],
  licenseModules: [{ id: "66666666-6666-4666-8666-666666666666", license_id: licenseId, module_code: "AI_ASSISTANT", enabled: true, limits: { monthlyBudgetHuf: 25000 }, feature_flags: { daily_plan: true, weekly_summary: true, document_extract: true, decision_support: false }, valid_from: null, valid_until: null, created_at: "2026-08-01T08:00:00.000Z", updated_at: "2026-08-12T10:00:00.000Z" }],
  membershipModules: [{ id: "77777777-7777-4777-8777-777777777777", membership_id: membershipId, module_code: "AI_ASSISTANT", enabled: true, limits: { monthlyBudgetHuf: 5000, maxRequestsPerDay: 20, maxRequestsPerMonth: 300, accessExpiresAt: "2026-12-20T10:30:00.000Z", allowedScopes: ["personal", "hage"], allowedFeatures: ["daily_plan", "document_extract"], preservedMemberLimit: 91 }, created_at: "2026-08-01T08:00:00.000Z", updated_at: "2026-08-12T10:00:00.000Z" }],
  organizationInvitations: [],
  sendEntitlements: [],
};

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });

try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    const method = request.method();
    if (url.includes("/api/dimpro-identity/admin/licenses") && method === "GET") {
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) });
      return;
    }
    if (url.includes("/api/dimpro-identity/admin/send-entitlements") && method === "GET") {
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, entitlements: [] }) });
      return;
    }
    if (url.includes("/api/dimpro-identity/admin/membership-ai-policy") && method === "PATCH") {
      capturedMemberPatch = JSON.parse(request.postData() || "{}");
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, membershipAiPolicy: { id: fixture.membershipModules[0].id, membership_id: membershipId, module_code: "AI_ASSISTANT", enabled: true, limits: capturedMemberPatch } }) });
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
  await page.waitForSelector('[data-testid="benjadmin-license-drawer"]', { timeout: 10000 });
  await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="benjadmin-license-drawer"] button')).find((button) => (button.textContent || "").includes("AI keret"))?.click());
  await page.waitForSelector('[data-testid="benjadmin-member-ai-policy"]', { timeout: 10000 });

  const state = await page.$eval('[data-testid="benjadmin-member-ai-policy"]', (root) => {
    const inputFor = (label) => {
      const field = Array.from(root.querySelectorAll(".benjadmin-member-ai-policy__grid > label")).find((node) => node.querySelector(":scope > span")?.textContent?.trim() === label);
      return field?.querySelector("input")?.value ?? null;
    };
    const featureLabel = (text) => Array.from(root.querySelectorAll(".benjadmin-member-ai-policy__checks label")).find((node) => (node.textContent || "").includes(text));
    const scopeLabel = (text) => Array.from(root.querySelectorAll(".benjadmin-member-ai-policy__checks label")).find((node) => (node.textContent || "").includes(text));
    const sizes = Array.from(root.querySelectorAll("span,strong,small,label")).map((node) => parseFloat(getComputedStyle(node).fontSize)).filter(Number.isFinite);
    return {
      text: root.textContent || "",
      budget: inputFor("Havi felhasználói AI-keret (Ft)"),
      daily: inputFor("Napi AI-kérések"),
      monthly: inputFor("Havi AI-kérések"),
      personal: Boolean(scopeLabel("Személyes munkatér")?.querySelector("input")?.checked),
      hage: Boolean(scopeLabel("Szervezeti / HAGE")?.querySelector("input")?.checked),
      dailyPlan: Boolean(featureLabel("Mai feladatok")?.querySelector("input")?.checked),
      weekly: Boolean(featureLabel("Heti összefoglaló")?.querySelector("input")?.checked),
      decisionDisabled: Boolean(featureLabel("Döntési összefoglaló")?.querySelector("input")?.disabled),
      minPx: sizes.length ? Math.min(...sizes) : 0,
    };
  });

  check("Névre szóló AI-policy panel elérhető a szervezeti felhasználónál", state.text.includes("FELHASZNÁLÓI AI-POLICY") && state.text.includes("Tagsági AI Teszt"), state.text.slice(0, 500));
  check("Felhasználói AI költség- és kérésszám-keretek betöltődnek", state.budget === "5000" && state.daily === "20" && state.monthly === "300", JSON.stringify(state));
  check("Személyes és szervezeti scope betöltődik", state.personal && state.hage, JSON.stringify(state));
  check("Meglévő felhasználói AI feature-lista betöltődik", state.dailyPlan && !state.weekly, JSON.stringify(state));
  check("Licencszinten tiltott AI funkció nem kapcsolható vissza", state.decisionDisabled, JSON.stringify(state));
  check("Tagsági AI-policy működési szövege legalább 12px", state.minPx >= 12, `min=${state.minPx}`);

  await page.evaluate(() => {
    const root = document.querySelector('[data-testid="benjadmin-member-ai-policy"]');
    const field = Array.from(root?.querySelectorAll(".benjadmin-member-ai-policy__grid > label") || []).find((node) => node.querySelector(":scope > span")?.textContent?.trim() === "Havi felhasználói AI-keret (Ft)");
    const input = field?.querySelector("input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "6500");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    input?.dispatchEvent(new Event("change", { bubbles: true }));
    Array.from(root?.querySelectorAll(".benjadmin-member-ai-policy__checks label") || []).find((node) => (node.textContent || "").includes("Szervezeti / HAGE"))?.querySelector("input")?.click();
    Array.from(root?.querySelectorAll(".benjadmin-member-ai-policy__checks label") || []).find((node) => (node.textContent || "").includes("Heti összefoglaló"))?.querySelector("input")?.click();
  });
  const patchResponse = page.waitForResponse((response) => response.url().includes("/api/dimpro-identity/admin/membership-ai-policy") && response.request().method() === "PATCH", { timeout: 10000 });
  await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="benjadmin-member-ai-policy"] button')).find((button) => (button.textContent || "").includes("AI-policy mentése"))?.click());
  await patchResponse;

  check("Tagsági AI-policy a megfelelő licenchez és membershiphez kötött", capturedMemberPatch?.licenseId === licenseId && capturedMemberPatch?.membershipId === membershipId, JSON.stringify(capturedMemberPatch));
  check("Felhasználói havi AI-keret módosítása PATCH payloadba kerül", capturedMemberPatch?.monthlyBudgetHuf === 6500, JSON.stringify(capturedMemberPatch));
  check("Felhasználói scope szűkítés PATCH payloadba kerül", JSON.stringify(capturedMemberPatch?.allowedScopes) === JSON.stringify(["personal"]), JSON.stringify(capturedMemberPatch?.allowedScopes));
  check("Felhasználói feature bővítés a licenc engedélyein belül működik", capturedMemberPatch?.allowedFeatures?.includes("weekly_summary") && !capturedMemberPatch?.allowedFeatures?.includes("decision_support"), JSON.stringify(capturedMemberPatch?.allowedFeatures));
  check("Felhasználói request limitek megmaradnak", capturedMemberPatch?.maxRequestsPerDay === 20 && capturedMemberPatch?.maxRequestsPerMonth === 300, JSON.stringify(capturedMemberPatch));

  await page.evaluate(() => document.querySelector('[data-testid="benjadmin-topbar-theme-toggle"]')?.click());
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód névre szóló AI-policy panellel működik", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const viewportState = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, policy: Boolean(document.querySelector('[data-testid="benjadmin-member-ai-policy"]')) }));
    check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, viewportState.sw <= viewportState.cw + 1, JSON.stringify(viewportState));
    check(`${viewport.name} tagsági AI-policy panel megmarad`, viewportState.policy, JSON.stringify(viewportState));
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
