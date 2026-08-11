import fs from "node:fs";
import puppeteer from "puppeteer";

const key = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const fixture = {
  name: "B3.2 P1 Runtime Acceptance",
  slug: "b32-p1-runtime-acceptance",
  partnerOrgId: "b32-p1-runtime-acceptance",
  deliveryModel: "HANDOFF",
  dataClassification: "NORMAL",
  createdBy: "B3.2 P1 runtime acceptance",
  creationKey: "b32-p1-runtime-acceptance-20260811",
};
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
check("partner schema READY", result.status === 200 && result.payload?.health?.ready === true, `status=${result.status} ready=${result.payload?.health?.ready}`);
check("partner schema version >= P1", ["0.1.0", "0.2.0"].includes(result.payload?.health?.actualSchemaVersion), `version=${result.payload?.health?.actualSchemaVersion}`);

result = await api("/api/dev/engine/partner-projects", {
  method: "POST",
  auth: false,
  body: JSON.stringify(fixture),
});
check("unauthenticated create remains blocked", result.status === 401, `status=${result.status}`);

const first = await api("/api/dev/engine/partner-projects", { method: "POST", body: JSON.stringify(fixture) });
check("authenticated draft create succeeds", [200, 201].includes(first.status) && first.payload?.ok === true, `status=${first.status}`);
const projectId = first.payload?.result?.projectId || first.payload?.project?.projectId || "";
const projectCode = first.payload?.result?.projectCode || first.payload?.project?.projectCode || "";
check("draft create returns stable project identity", Boolean(projectId) && /^PART-[0-9]{4,}$/.test(projectCode), `projectCode=${projectCode}`);
check("draft defaults to OutminAI and internal NONE", first.payload?.project?.defaultWorkerCode === "OUTMINAI" && first.payload?.project?.internalEngineAccess === "NONE", `worker=${first.payload?.project?.defaultWorkerCode} access=${first.payload?.project?.internalEngineAccess}`);

const second = await api("/api/dev/engine/partner-projects", { method: "POST", body: JSON.stringify(fixture) });
const secondId = second.payload?.result?.projectId || second.payload?.project?.projectId || "";
const secondCode = second.payload?.result?.projectCode || second.payload?.project?.projectCode || "";
check("duplicate creation key is idempotent", second.status === 200 && second.payload?.result?.idempotent === true, `status=${second.status} idempotent=${second.payload?.result?.idempotent}`);
check("idempotent retry keeps same identity", secondId === projectId && secondCode === projectCode, `sameId=${secondId === projectId} sameCode=${secondCode === projectCode}`);

const detail = await api(`/api/dev/engine/partner-projects/${encodeURIComponent(projectId)}`);
check("created partner project is readable", detail.status === 200 && detail.payload?.project?.projectId === projectId, `status=${detail.status}`);
check("read model keeps HANDOFF/NORMAL", detail.payload?.project?.deliveryModel === "HANDOFF" && detail.payload?.project?.dataClassification === "NORMAL");

const list = await api("/api/dev/engine/partner-projects");
check("created project appears in partner list", Array.isArray(list.payload?.projects) && list.payload.projects.some((item) => item.projectId === projectId));

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
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".operator-console.operator-compact", { timeout: 30000 });
  await page.$$eval(".operator-view-tabs button", (buttons) => {
    const button = buttons.find((item) => (item.textContent || "").trim() === "Partner fejlesztések");
    if (!button) throw new Error("Partner fejlesztések tab missing");
    button.click();
  });
  await page.waitForSelector("[data-testid=partner-development-panel]", { timeout: 30000 });
  await page.waitForFunction(() => (document.querySelector("[data-testid=partner-schema-status]")?.textContent || "").includes("SCHEMA READY"), { timeout: 30000 });
  await page.waitForFunction((name) => (document.querySelector("[data-testid=partner-development-panel]")?.textContent || "").includes(name), { timeout: 30000 }, fixture.name);

  const state = await page.evaluate((name) => ({
    panelText: document.querySelector("[data-testid=partner-development-panel]")?.textContent || "",
    inputsEnabled: Array.from(document.querySelectorAll(".operator-partner-create input, .operator-partner-create select")).every((node) => node.disabled === false),
    rowCount: document.querySelectorAll("[data-testid=partner-project-table] tbody tr").length,
    hasFixture: Array.from(document.querySelectorAll("[data-testid=partner-project-table] tbody tr")).some((row) => (row.textContent || "").includes(name)),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }), fixture.name);
  check("Operator UI shows SCHEMA READY", state.panelText.includes("SCHEMA READY"));
  check("Operator UI form controls enabled after schema READY", state.inputsEnabled === true, `inputsEnabled=${state.inputsEnabled}`);
  await page.type(".operator-partner-create input", "UI Enable Probe");
  await page.waitForFunction(() => document.querySelector(".operator-partner-create-button")?.disabled === false, { timeout: 5000 });
  check("Operator UI draft button enables after required fields", await page.$eval(".operator-partner-create-button", (button) => button.disabled === false));
  check("Operator UI renders created project", state.rowCount >= 1 && state.hasFixture, `rows=${state.rowCount}`);
  check("Operator UI keeps OutminAI default-deny P2 policy", state.panelText.includes("OUTMINAI") && state.panelText.includes("DEFAULT DENY") && state.panelText.includes("P2"));
  check("desktop partner READY view fits one viewport", state.scrollWidth <= state.clientWidth + 1 && state.scrollHeight <= state.innerHeight + 1, JSON.stringify(state));
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, projectId, projectCode, passed: checks.length, failed: 0, checks }, null, 2));
