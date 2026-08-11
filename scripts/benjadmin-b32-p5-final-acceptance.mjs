import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer";

try { process.loadEnvFile?.(".env.local"); } catch {}

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const uiBase = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
const checks = [];

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

async function api(path, { method = "GET", body, auth = true, extraHeaders = {} } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      host,
      ...(auth ? { "x-dimpro-license-admin-key": adminKey } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

if (!supabaseUrl || !serviceKey) throw new Error("DEV Supabase service-role environment missing");
const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

let result = await api("/api/dev/engine/partner-projects", { auth: false });
check("Partnerprojekt olvasás hitelesítés nélkül blokkolt", result.status === 401, `status=${result.status}`);
result = await api("/api/dev/engine/partner-handoffs", { auth: false });
check("Partnerátadás olvasás hitelesítés nélkül blokkolt", result.status === 401, `status=${result.status}`);
result = await api("/api/dev/engine/partner-projects", { method: "POST", auth: false, body: {} });
check("Partnerprojekt írás hitelesítés nélkül blokkolt", result.status === 401, `status=${result.status}`);
result = await api("/api/dev/engine/partner-handoffs", { method: "POST", auth: false, body: {} });
check("Partnerátadás írás hitelesítés nélkül blokkolt", result.status === 401, `status=${result.status}`);
result = await api("/api/dev/engine/partner-projects/nemletezo/provision", { method: "POST", auth: false, body: {} });
check("Kiépítés (provisioning) hitelesítés nélkül blokkolt", result.status === 401, `status=${result.status}`);
result = await api("/api/dev/engine/partner-handoffs/nemletezo", { method: "PATCH", auth: false, body: { action: "ACCEPT" } });
check("Átadási állapotváltás hitelesítés nélkül blokkolt", result.status === 401, `status=${result.status}`);

const partner = await api("/api/dev/engine/partner-projects");
check("Partnerfejlesztési séma READY", partner.status === 200 && partner.payload?.health?.ready === true && partner.payload?.health?.actualSchemaVersion === "0.2.0", `status=${partner.status} version=${partner.payload?.health?.actualSchemaVersion}`);
check("P2 futási izoláció READY", partner.payload?.runtimeIsolation?.ready === true && partner.payload?.runtimeIsolation?.blockers?.length === 0, `stage=${partner.payload?.runtimeIsolation?.stage}`);
check("Partner acceptance után tiszta projektállapot", Array.isArray(partner.payload?.projects) && partner.payload.projects.length === 0, `projects=${partner.payload?.projects?.length || 0}`);
const handoffs = await api("/api/dev/engine/partner-handoffs");
check("P4 átadási API adminnal elérhető", handoffs.status === 200 && handoffs.payload?.ok === true, `status=${handoffs.status}`);
check("Partner acceptance után tiszta átadási állapot", Array.isArray(handoffs.payload?.handoffs) && handoffs.payload.handoffs.length === 0, `handoffs=${handoffs.payload?.handoffs?.length || 0}`);

const environments = await db.from("dev_center_environments").select("code,read_only,status").order("code");
if (environments.error) throw new Error(environments.error.message);
const partnerEnvironments = (environments.data || []).filter((item) => String(item.code || "").startsWith("PART-"));
check("Acceptance nem hagy árva partnerkörnyezetet", partnerEnvironments.length === 0, JSON.stringify(partnerEnvironments));
const production = (environments.data || []).find((item) => item.code === "PRODUCTION");
check("PRODUCTION környezet továbbra is csak olvasható", production?.read_only === true, JSON.stringify(production || {}));

const expectedTabs = [
  "Áttekintés",
  "Feladatok (taskok)",
  "Csapat",
  "Fejlesztők (worker-ek)",
  "Környezetek",
  "Vezérlés (Control)",
  "Partner fejlesztések",
  "Kiadások (release)",
  "Napló / audit",
  "Licenc / AI",
];
const forbiddenEnglishFirst = [
  "TASK QUEUE",
  "BENAI WORKER-EK",
  "PARTNER DEVELOPMENT PLANE",
  "PARTNER REGISTRY",
  "Draft registry",
  "Release Központ",
  "CONTROL PLANE",
  "Schema ",
];

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"],
});

try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((key) => {
    localStorage.setItem("dimproLicenseAdminKey", key);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("dimpro-admin-theme", "dark");
    localStorage.setItem("dimpro-benjadmin-board-pinned", "false");
  }, adminKey);

  async function open(width, height) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(uiBase, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".operator-console.operator-compact", { timeout: 30000 });
  }

  async function select(label) {
    await page.$$eval(".operator-view-tabs button", (buttons, target) => {
      const button = buttons.find((item) => (item.textContent || "").trim() === target);
      if (!button) throw new Error(`Hiányzó BENJADMIN nézet: ${target}`);
      button.click();
    }, label);
    await new Promise((resolve) => setTimeout(resolve, 160));
  }

  await open(1440, 900);
  const tabs = await page.$$eval(".operator-view-tabs button", (buttons) => buttons.map((item) => (item.textContent || "").trim()));
  check("Mind a 10 fő BENJADMIN nézet elérhető", expectedTabs.every((label) => tabs.includes(label)), JSON.stringify(tabs));
  check("Magyar elsődleges főmenü-elnevezések aktívak", tabs.includes("Vezérlés (Control)") && tabs.includes("Feladatok (taskok)") && tabs.includes("Fejlesztők (worker-ek)") && tabs.includes("Kiadások (release)"));

  const combinedTexts = [];
  for (const label of expectedTabs) {
    await select(label);
    const view = await page.evaluate(() => ({
      text: document.querySelector(".operator-table-stage")?.textContent || "",
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    combinedTexts.push(view.text);
    check(`${label} desktop vízszintes túlcsordulás nélkül`, view.scrollWidth <= view.clientWidth + 1, JSON.stringify({ scrollWidth: view.scrollWidth, clientWidth: view.clientWidth }));
    check(`${label} desktop egy viewportban`, view.scrollHeight <= view.innerHeight + 1, JSON.stringify({ scrollHeight: view.scrollHeight, innerHeight: view.innerHeight }));
  }
  const combined = combinedTexts.join("\n");
  check("Régi angol-elsődleges BENJADMIN címkék eltűntek", forbiddenEnglishFirst.every((term) => !combined.includes(term)), forbiddenEnglishFirst.filter((term) => combined.includes(term)).join(", "));
  check("Nyers titokjelölés nem jelenik meg az UI-ban", !/-----BEGIN .*PRIVATE KEY-----|SUPABASE_SERVICE_ROLE_KEY|x-dimpro-worker-token/i.test(combined));

  await select("Partner fejlesztések");
  const partnerUi = await page.evaluate(() => ({
    text: document.querySelector("[data-testid=partner-development-panel]")?.textContent || "",
    p4: document.querySelector("[data-testid=partner-handoff-panel]")?.textContent || "",
    tooSmall: Array.from(document.querySelectorAll("[data-testid=partner-development-panel] *")).filter((node) => {
      const size = Number.parseFloat(getComputedStyle(node).fontSize || "0");
      return size > 0 && size < 12 && node.textContent?.trim();
    }).slice(0, 12).map((node) => ({ text: node.textContent?.trim().slice(0, 36), size: getComputedStyle(node).fontSize })),
  }));
  check("P4 Partnerátadás panel a végleges Partner nézet része", partnerUi.p4.includes("Átadási életciklus (handoff)"));
  check("OutminAI alapértelmezett tiltás látható", partnerUi.text.includes("ALAPÉRTELMEZETT TILTÁS (DEFAULT DENY)"));
  check("Partner UI magyar elsődleges", partnerUi.text.includes("PARTNER FEJLESZTÉSI SÍK") && partnerUi.text.includes("PARTNERNYILVÁNTARTÁS") && partnerUi.text.includes("Átadási modell (delivery model)"));
  check("Partner UI törzsszöveg minimum 12 px", partnerUi.tooSmall.length === 0, JSON.stringify(partnerUi.tooSmall));

  await select("Vezérlés (Control)");
  const controlText = await page.$eval(".operator-control-plane-panel", (node) => node.textContent || "");
  check("Vezérlési sík (Control Plane) magyar elsődleges", controlText.includes("VEZÉRLÉSI SÍK (Control Plane)"));
  check("PROD START csak olvasható maradt", controlText.includes("PROD START") && controlText.includes("CSAK OLVASHATÓ (READ ONLY)"));

  for (const viewport of [
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobil", width: 390, height: 844 },
  ]) {
    await open(viewport.width, viewport.height);
    for (const label of ["Áttekintés", "Partner fejlesztések", "Vezérlés (Control)", "Kiadások (release)", "Licenc / AI"]) {
      await select(label);
      const sizes = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      check(`${viewport.name} ${label} vízszintes túlcsordulás nélkül`, sizes.scrollWidth <= sizes.clientWidth + 1, JSON.stringify(sizes));
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0, checks }, null, 2));
