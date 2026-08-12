import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer";

try { process.loadEnvFile?.(".env.local"); } catch {}

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const adminBase = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const consoleUrl = `${adminBase}/dev-console`;
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
const checks = [];

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

async function api(path, auth = true) {
  const response = await fetch(`${apiBase}${path}`, { headers: { host, ...(auth ? { "x-dimpro-license-admin-key": adminKey } : {}) } });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("json") ? await response.json().catch(() => ({})) : null;
  if (response.body && !contentType.includes("json")) await response.body.cancel().catch(() => undefined);
  return { status: response.status, payload, contentType };
}

if (!supabaseUrl || !serviceKey) throw new Error("DEV Supabase service-role environment missing");
const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const fixtureIds = [];
const fixtureTag = `console-v1-${Date.now()}`;

async function addFixture(workerCode, source, summary, kind) {
  const id = crypto.randomUUID();
  const result = await db.from("dev_center_live_worklog").insert({
    id,
    worker_code: workerCode,
    phase: kind === "DECISION" ? "decision" : kind === "BUILD_EVENT" ? "build" : "development",
    level: "info",
    summary,
    detail: `BENJADMIN Fejlesztői Konzol V1 acceptance · ${fixtureTag}`,
    source,
    metadata: { kind, acceptanceFixture: fixtureTag },
  });
  if (result.error) throw new Error(`Fixture insert failed: ${result.error.message}`);
  fixtureIds.push(id);
}

async function cleanup() {
  if (!fixtureIds.length) return;
  const result = await db.from("dev_center_live_worklog").delete().in("id", fixtureIds);
  if (result.error) console.error(`CLEANUP WARN: ${result.error.message}`);
}

async function clickButtonText(page, text) {
  const handle = await page.evaluateHandle((label) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find((node) => (node.textContent || "").includes(label)) || null;
  }, text);
  const element = handle.asElement();
  if (!element) throw new Error(`Button not found: ${text}`);
  await element.click();
  await handle.dispose();
}

async function ctrlAltSpace(page) {
  await page.keyboard.down("Control");
  await page.keyboard.down("Alt");
  await page.keyboard.press("Space");
  await page.keyboard.up("Alt");
  await page.keyboard.up("Control");
}

try {
  for (const path of ["/api/dev/console/live", "/api/dev/console/messages", "/api/dev/console/resources", "/api/dev/console/context", "/api/dev/console/stream"]) {
    const result = await api(path, false);
    check(`Unauth 401 · ${path}`, result.status === 401, `status=${result.status}`);
  }

  const [live, messages, resources, context, stream] = await Promise.all([
    api("/api/dev/console/live"),
    api("/api/dev/console/messages"),
    api("/api/dev/console/resources"),
    api("/api/dev/console/context"),
    api("/api/dev/console/stream"),
  ]);
  check("Live API valós B3 adatokat ad", live.status === 200 && live.payload?.ok && Array.isArray(live.payload?.live?.workers) && Array.isArray(live.payload?.live?.tasks), `status=${live.status}`);
  check("Messages API valós munkanaplót ad", messages.status === 200 && messages.payload?.ok && Array.isArray(messages.payload?.messages), `status=${messages.status}`);
  check("Fejlesztési Tár API READY", resources.status === 200 && resources.payload?.ok && resources.payload?.health?.ready === true, JSON.stringify(resources.payload?.health || {}));
  check("Runtime context titokmentes DEV kontextust ad", context.status === 200 && context.payload?.ok && context.payload?.context?.environment === "DEV" && context.payload?.context?.productionDefault === "READ_ONLY" && !JSON.stringify(context.payload).match(/service_role|licenseKey|password|private.?key/i), JSON.stringify(context.payload?.context || {}));
  check("SSE endpoint text/event-stream", stream.status === 200 && stream.contentType.includes("text/event-stream"), `${stream.status} ${stream.contentType}`);

  await addFixture("ARMINAI", "worker", "CONSOLE-V1 Ármin-AI bal oldali acceptance", "TASK_UPDATE");
  await addFixture("BENAI", "benai", "CONSOLE-V1 Ben-AI középső acceptance", "TASK_ASSIGNMENT");
  await addFixture("JAZMINAI", "worker", "CONSOLE-V1 Jázmin-AI jobb oldali acceptance", "TEST_RESULT");
  await addFixture(null, "benjadmin", "CONSOLE-V1 BENJADMIN vezetői acceptance", "DECISION");
  await addFixture("OUTMINAI", "worker", "CONSOLE-V1 Outmin-AI partner acceptance", "TASK_UPDATE");

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
  try {
    const page = await browser.newPage();
    await page.setBypassServiceWorker(true);
    await page.evaluateOnNewDocument((key) => {
      localStorage.setItem("dimproLicenseAdminKey", key);
      sessionStorage.setItem("dimproBenjadminSession", "active");
      localStorage.setItem("dimpro-admin-theme", "dark");
      localStorage.setItem("dimpro-benjadmin-board-pinned", "false");
      localStorage.setItem("benjadmin-developer-console-theme", "dark");
    }, adminKey);
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(adminBase, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('[data-testid="benjadmin-developer-console-button"]', { timeout: 30000 });
    check("Admin felső gomb elérhető", true);

    const popupPromise = new Promise((resolve) => browser.once("targetcreated", resolve));
    await page.click('[data-testid="benjadmin-developer-console-button"]');
    const popupTarget = await Promise.race([popupPromise, new Promise((resolve) => setTimeout(() => resolve(null), 5000))]);
    check("Fejlesztői Konzol külön ablakban nyitható", Boolean(popupTarget));
    const popupPage = popupTarget && typeof popupTarget.page === "function" ? await popupTarget.page() : null;
    if (popupPage) await popupPage.close();

    await page.goto(consoleUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('[data-testid="benjadmin-developer-console"]', { timeout: 30000 });
    await page.waitForFunction(() => document.body.textContent?.includes("CONSOLE-V1 Ármin-AI bal oldali acceptance"), { timeout: 30000 });
    await page.waitForFunction(() => {
      const expected = ["Benjadmin avatar", "Ben-AI avatar", "Ármin-AI avatar", "Jázmin-AI avatar", "Outmin-AI avatar"];
      const images = Array.from(document.querySelectorAll("[data-testid=\"benjadmin-developer-console\"] img"));
      return expected.every((alt) => images.some((img) => img.alt === alt && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0));
    }, { timeout: 15000 });


    const desktop = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="benjadmin-developer-console"]');
      const rows = Array.from(root?.querySelectorAll("article") || []);
      const find = (needle) => rows.find((node) => (node.textContent || "").includes(needle));
      const armin = find("CONSOLE-V1 Ármin-AI bal oldali acceptance");
      const ben = find("CONSOLE-V1 Ben-AI középső acceptance");
      const jazmin = find("CONSOLE-V1 Jázmin-AI jobb oldali acceptance");
      const owner = find("CONSOLE-V1 BENJADMIN vezetői acceptance");
      const centerX = window.innerWidth / 2;
      const rect = (node) => node ? node.getBoundingClientRect().toJSON() : null;
      const images = Array.from(root?.querySelectorAll("img") || []).map((img) => ({ alt: img.alt, complete: img.complete, w: img.naturalWidth, h: img.naturalHeight }));
      return {
        text: root?.textContent || "",
        armin: rect(armin), ben: rect(ben), jazmin: rect(jazmin), owner: rect(owner), centerX,
        images,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        theme: root?.getAttribute("data-console-theme") || "",
      };
    });
    check("Desktop 1440×900 one-workspace vízszintes overflow nélkül", desktop.scrollWidth <= desktop.clientWidth + 1, JSON.stringify({ sw: desktop.scrollWidth, cw: desktop.clientWidth }));
    check("Ármin-AI balra igazított", desktop.armin && desktop.armin.x < desktop.centerX - 80, JSON.stringify(desktop.armin));
    check("Jázmin-AI jobbra igazított", desktop.jazmin && desktop.jazmin.right > desktop.centerX + 80, JSON.stringify(desktop.jazmin));
    check("Ben-AI középre igazított", desktop.ben && Math.abs((desktop.ben.x + desktop.ben.width / 2) - desktop.centerX) < 130, JSON.stringify(desktop.ben));
    check("BENJADMIN · VEZETŐ középen megjelenik", desktop.owner && Math.abs((desktop.owner.x + desktop.owner.width / 2) - desktop.centerX) < 130 && desktop.text.includes("VEZETŐ"), JSON.stringify(desktop.owner));
    check("Outmin-AI külön partner sávban látható", desktop.text.includes("PARTNER FEJLESZTÉSI SÍK") && desktop.text.includes("CONSOLE-V1 Outmin-AI partner acceptance"), "");
    const requiredAvatarAlts = ["Benjadmin avatar", "Ben-AI avatar", "Ármin-AI avatar", "Jázmin-AI avatar", "Outmin-AI avatar"];
    check("Hexagon csapatképek betöltődnek", requiredAvatarAlts.every((alt) => desktop.images.some((item) => item.alt === alt && item.complete && item.w > 0 && item.h > 0)), JSON.stringify(desktop.images.filter((item) => requiredAvatarAlts.includes(item.alt))));

    const composerState = await page.evaluate(() => {
      const composer = document.querySelector('[data-testid="benjadmin-developer-composer"]');
      const leader = composer?.querySelector('[aria-label="BENJADMIN · VEZETŐ"]');
      const avatar = leader?.querySelector('img[alt="Benjadmin avatar"]');
      const targetButtons = composer?.querySelector('div[class*=targetButtons]');
      const textarea = composer?.querySelector('textarea');
      const messageBody = document.querySelector('[data-message-id] div[class*=messageBody]');
      const projectLabel = document.querySelector('aside button span');
      const rect = (node) => node ? node.getBoundingClientRect().toJSON() : null;
      return {
        composer: rect(composer), leader: rect(leader), avatar: rect(avatar), targetButtons: rect(targetButtons), textarea: rect(textarea),
        messageFont: messageBody ? Number.parseFloat(getComputedStyle(messageBody).fontSize || '0') : 0,
        inputFont: textarea ? Number.parseFloat(getComputedStyle(textarea).fontSize || '0') : 0,
        projectFont: projectLabel ? Number.parseFloat(getComputedStyle(projectLabel).fontSize || '0') : 0,
      };
    });
    check("BENJADMIN avatar a beviteli mező bal oldalán mindkét alsó sorba belenyúlik", composerState.leader && composerState.targetButtons && composerState.textarea && composerState.leader.top <= composerState.targetButtons.top + 2 && composerState.leader.bottom >= composerState.textarea.bottom - 2 && composerState.leader.right <= composerState.textarea.left, JSON.stringify(composerState));
    check("BENJADMIN composer avatar jól látható desktop méretben", composerState.avatar && composerState.avatar.width >= 60 && composerState.avatar.height >= 60, JSON.stringify(composerState.avatar));
    check("Konzol fő szöveg és beviteli mező nagyobb, laptopon is olvasható", composerState.messageFont >= 13 && composerState.inputFont >= 13 && composerState.projectFont >= 11, JSON.stringify(composerState));

    const clockBefore = await page.$eval("header time", (node) => node.textContent || "");
    await page.$eval('[data-testid="benjadmin-developer-console"]', (node) => node.setAttribute("data-acceptance-marker", "persist"));
    await new Promise((resolve) => setTimeout(resolve, 1350));
    const clockAfter = await page.$eval("header time", (node) => node.textContent || "");
    const noReload = await page.$eval('[data-testid="benjadmin-developer-console"]', (node) => node.getAttribute("data-acceptance-marker"));
    check("Óra másodpercenként frissül", clockBefore !== clockAfter, `${clockBefore} -> ${clockAfter}`);
    check("Másodperces frissítés nem tölti újra az oldalt", noReload === "persist", String(noReload));

    for (const themeLabel of ["Világos", "Sötét", "Sunlight"]) {
      await clickButtonText(page, themeLabel);
      const expected = themeLabel === "Világos" ? "light" : themeLabel === "Sötét" ? "dark" : "sunlight";
      await page.waitForFunction((value) => document.querySelector('[data-testid="benjadmin-developer-console"]')?.getAttribute("data-console-theme") === value, {}, expected);
    }
    check("Világos / Sötét / Sunlight mód mind működik", true);

    await clickButtonText(page, "ChatGPT Parancstár");
    await page.waitForFunction(() => document.body.textContent?.includes("AKTUÁLIS MUNKAMENET PROMPT"));
    const commandState = await page.evaluate(() => ({ text: document.body.textContent || "", copyButtons: Array.from(document.querySelectorAll("button")).filter((node) => (node.textContent || "").includes("Másolás") || (node.textContent || "").includes("Másolva")).length }));
    check("ChatGPT Parancstár teljes parancslistával és másolás gombokkal", commandState.text.includes("DEV START") && commandState.text.includes("PROD explicit műveleti sablon") && commandState.copyButtons >= 8, `copyButtons=${commandState.copyButtons}`);
    await page.evaluate(() => Array.from(document.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === "Parancstár bezárása")?.click());

    await clickButtonText(page, "Fejlesztési Tár");
    await page.waitForFunction(() => document.body.textContent?.includes("PDF · kép · logó · ZIP · kód · segédanyag"));
    const resourceState = await page.evaluate(() => ({ text: document.body.textContent || "", fileInput: Boolean(document.querySelector('input[type="file"][multiple]')) }));
    check("Fejlesztési Tár feltöltő és kötelező segédanyag logika látható", resourceState.fileInput && resourceState.text.includes("Kötelezően olvasandó fejlesztés előtt") && resourceState.text.includes("Húzd ide a fájlokat"), "");
    await page.evaluate(() => Array.from(document.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === "Fejlesztési Tár bezárása")?.click());

    await ctrlAltSpace(page);
    await page.waitForSelector('.benjadmin-protective[data-mode="privacy"]', { timeout: 10000 });
    check("Ctrl+Alt+Space takaróképernyő a Konzolból működik", true);
    await ctrlAltSpace(page);
    await page.waitForSelector('[data-testid="benjadmin-developer-console"]', { timeout: 10000 });
    check("Ctrl+Alt+Space takaróról visszaáll", true);

    await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const laptopState = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="benjadmin-developer-console"]');
      const textarea = root?.querySelector('textarea');
      const leader = root?.querySelector('[aria-label="BENJADMIN · VEZETŐ"]');
      return {
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        sh: document.documentElement.scrollHeight,
        ih: window.innerHeight,
        inputFont: textarea ? Number.parseFloat(getComputedStyle(textarea).fontSize || '0') : 0,
        leaderVisible: Boolean(leader && leader.getBoundingClientRect().width > 0 && leader.getBoundingClientRect().height > 0),
      };
    });
    check("Laptop 1366×768 nincs teljes oldali vízszintes overflow", laptopState.sw <= laptopState.cw + 1, JSON.stringify(laptopState));
    check("Laptop 1366×768 nagyobb beviteli betű és BENJADMIN avatar látható", laptopState.inputFont >= 13 && laptopState.leaderVisible, JSON.stringify(laptopState));

    for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
      await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
      await new Promise((resolve) => setTimeout(resolve, 250));
      const state = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, composer: Boolean(document.querySelector('textarea[placeholder*="fejlesztői csapatnak"]')), outmin: (document.body.textContent || "").includes("OUTMIN-AI") }));
      check(`${viewport.name} teljes oldal vízszintes overflow nélkül`, state.sw <= state.cw + 1, JSON.stringify(state));
      check(`${viewport.name} csevegő / composer / Outmin megmarad`, state.composer && state.outmin, JSON.stringify(state));
    }

    const manifestResponse = await fetch(`${apiBase}/benjadmin-console.webmanifest`, { headers: { host } });
    const manifest = await manifestResponse.json().catch(() => ({}));
    check("Külön BENJADMIN Konzol PWA manifest standalone", manifestResponse.status === 200 && manifest.display === "standalone" && manifest.start_url === "/admin/dev-console", JSON.stringify({ status: manifestResponse.status, display: manifest.display, start_url: manifest.start_url }));
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
} finally {
  await cleanup();
}
