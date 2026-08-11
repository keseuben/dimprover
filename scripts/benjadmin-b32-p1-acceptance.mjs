import fs from "node:fs";
import puppeteer from "puppeteer";

const key = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const checks = [];

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      host,
      ...(options.auth === false ? {} : { "x-dimpro-license-admin-key": key }),
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

let result = await api("/api/dev/engine/partner-projects");
check("partner registry GET available", result.status === 200 && result.payload?.ok === true, `status=${result.status}`);
const schemaReady = result.payload?.health?.ready === true;
if (schemaReady) {
  check("source-of-truth partner schema READY", result.payload?.health?.actualSchemaVersion === "0.1.0", `version=${result.payload?.health?.actualSchemaVersion}`);
  check("partner list is real source-of-truth data", Array.isArray(result.payload?.projects), `count=${result.payload?.projects?.length ?? "n/a"}`);
} else {
  check(
    "staged source-of-truth schema reported pending",
    Array.isArray(result.payload?.projects)
      && result.payload.projects.length === 0
      && (result.payload?.health?.errorCode === "PGRST205" || result.payload?.health?.errorCode === "PARTNER_SCHEMA_VERSION_MISMATCH"),
    `ready=${result.payload?.health?.ready} code=${result.payload?.health?.errorCode}`,
  );
}

result = await api("/api/dev/engine/partner-projects", {
  method: "POST",
  auth: false,
  body: JSON.stringify({ name: "Acceptance Partner", slug: "acceptance-partner", deliveryModel: "HANDOFF", dataClassification: "NORMAL" }),
});
check("unauthenticated partner create blocked", result.status === 401, `status=${result.status}`);

if (!schemaReady) {
  result = await api("/api/dev/engine/partner-projects", {
    method: "POST",
    body: JSON.stringify({
      name: "Acceptance Partner",
      slug: "acceptance-partner",
      partnerOrgId: "acceptance-org",
      deliveryModel: "HANDOFF",
      dataClassification: "NORMAL",
      createdBy: "B3.2 P1 acceptance",
      creationKey: "b32-p1-acceptance-no-write",
    }),
  });
  check("partner create fails closed while schema staged", result.status === 503 && result.payload?.code === "PARTNER_SCHEMA_NOT_READY", `status=${result.status} code=${result.payload?.code}`);
}

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"],
});

try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((adminKey) => {
    localStorage.setItem("dimproLicenseAdminKey", adminKey);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("dimpro-admin-theme", "dark");
    localStorage.setItem("dimpro-benjadmin-board-pinned", "false");
  }, key);

  async function openAt(width, height) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".operator-console.operator-compact", { timeout: 30000 });
    await page.$$eval(".operator-view-tabs button", (buttons) => {
      const button = buttons.find((item) => (item.textContent || "").trim() === "Partner fejlesztések");
      if (!button) throw new Error("Partner fejlesztések tab missing");
      button.click();
    });
    await page.waitForSelector("[data-testid=partner-development-panel]", { timeout: 30000 });
    await page.waitForFunction((ready) => {
      const text = document.querySelector("[data-testid=partner-schema-status]")?.textContent || "";
      return ready ? text.includes("SCHEMA READY") : text.includes("SCHEMA PENDING");
    }, { timeout: 30000 }, schemaReady);
  }

  await openAt(1440, 900);
  check("Partner fejlesztések tab visible", await page.$$eval(".operator-view-tabs button", (buttons) => buttons.some((item) => (item.textContent || "").trim() === "Partner fejlesztések")));
  const panelText = await page.$eval("[data-testid=partner-development-panel]", (el) => el.textContent || "");
  check("partner plane title visible", panelText.toUpperCase().includes("PARTNER DEVELOPMENT PLANE"));
  check("OutminAI default deny P2 policy visible", panelText.includes("OUTMINAI") && panelText.includes("DEFAULT DENY") && panelText.includes("P2 POLICY ACTIVE"));

  const formState = await page.evaluate(() => ({
    schemaText: document.querySelector("[data-testid=partner-schema-status]")?.textContent || "",
    controlsDisabled: Array.from(document.querySelectorAll(".operator-partner-create input, .operator-partner-create select")).every((node) => node.disabled === true),
    controlsEnabled: Array.from(document.querySelectorAll(".operator-partner-create input, .operator-partner-create select")).every((node) => node.disabled === false),
    emptyText: document.querySelector("[data-testid=partner-empty-state]")?.textContent || "",
  }));
  if (schemaReady) {
    check("source-of-truth schema READY visible", formState.schemaText.includes("SCHEMA READY"), formState.schemaText);
    check("partner form controls enabled when schema READY", formState.controlsEnabled === true, JSON.stringify(formState));
  } else {
    check("source-of-truth schema pending visible", formState.schemaText.includes("SCHEMA PENDING"), formState.schemaText);
    check("partner form controls disabled until schema ready", formState.controlsDisabled === true, JSON.stringify(formState));
    check("pending empty state explains staged migration", /migráció|schema/i.test(formState.emptyText), formState.emptyText);
  }

  const typography = await page.evaluate(() => {
    const selectors = [
      ".operator-partner-head p",
      ".operator-partner-metrics span",
      ".operator-partner-table th",
      ".operator-partner-table td",
      ".operator-partner-create label > span",
      ".operator-partner-create input",
      ".operator-partner-create select",
      ".operator-partner-create-button",
    ];
    return selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)).map((node) => ({ selector, size: Number.parseFloat(getComputedStyle(node).fontSize) })));
  });
  check("Partner view body typography is at least 12px", typography.length > 0 && typography.every((item) => item.size >= 12), JSON.stringify(typography.filter((item) => item.size < 12)));

  const desktop = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  check("desktop Partner view no horizontal overflow", desktop.scrollWidth <= desktop.clientWidth + 1, JSON.stringify(desktop));
  check("desktop Partner view fits one viewport", desktop.scrollHeight <= desktop.innerHeight + 1, JSON.stringify(desktop));

  await openAt(768, 1024);
  const tablet = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  check("tablet Partner view no horizontal overflow", tablet.scrollWidth <= tablet.clientWidth + 1, JSON.stringify(tablet));

  await openAt(390, 844);
  const phone = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  check("phone Partner view no horizontal overflow", phone.scrollWidth <= phone.clientWidth + 1, JSON.stringify(phone));

  console.log(JSON.stringify({ ok: true, schemaReady, passed: checks.length, failed: 0, checks }, null, 2));
} finally {
  await browser.close();
}
