const puppeteer = require("puppeteer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const baseUrl = process.env.DIMPRO_TEST_BASE_URL || "http://127.0.0.1:3000";
const host = process.env.DIMPRO_TEST_HOST || "app.dimpro.hu";
const browserBaseUrl = process.env.DIMPRO_BROWSER_BASE_URL || "https://app.dimpro.hu";
const meetingId = `ai-studio-ui-${Date.now()}`;
const pairingCode = crypto.randomBytes(4).toString("hex").toUpperCase();
const pairingHash = crypto.createHash("sha256").update(pairingCode).digest("hex");
const dataRoot = path.join(process.cwd(), ".dimprover", "data", "meeting-assistant");
const pairingFile = path.join(dataRoot, "pairings", `${pairingHash}.json`);
let organizerAccessToken = "";
let passed = 0;
let browser = null;

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed += 1;
  console.log(`OK ${String(passed).padStart(2, "0")} ${label}`);
}

async function clickByText(page, text) {
  const clicked = await page.evaluate((needle) => {
    const normalizedNeedle = needle.toLocaleLowerCase("hu-HU");
    const elements = [...document.querySelectorAll("button, a")];
    const target = elements.find((element) => (element.textContent || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("hu-HU").includes(normalizedNeedle));
    if (!(target instanceof HTMLElement)) return false;
    target.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Button/link not found: ${text}`);
}

async function textExists(page, text) {
  return page.evaluate((needle) => (document.body.innerText || "").toLocaleLowerCase("hu-HU").includes(needle.toLocaleLowerCase("hu-HU")), text);
}

async function waitForText(page, text, timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await textExists(page, text)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const state = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    bodyText: (document.body.innerText || "").slice(0, 1800),
  }));
  throw new Error(`Text not found: ${text}. Page state: ${JSON.stringify(state)}`);
}

async function waitForEnabledButton(page, text, timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const enabled = await page.evaluate((needle) => {
      const normalizedNeedle = needle.toLocaleLowerCase("hu-HU");
      const button = [...document.querySelectorAll("button")].find((item) =>
        (item.textContent || "").toLocaleLowerCase("hu-HU").includes(normalizedNeedle),
      );
      return button instanceof HTMLButtonElement && !button.disabled;
    }, text);
    if (enabled) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Enabled button not found: ${text}`);
}

function createPairingRecord() {
  fs.mkdirSync(path.dirname(pairingFile), { recursive: true });
  const now = new Date();
  fs.writeFileSync(pairingFile, `${JSON.stringify({
    version: 1,
    codeHash: pairingHash,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    issuedBy: "meeting-ai-ui-smoke",
    status: "active",
    consumedAt: "",
    meetingId: "",
    issuedTo: "",
  }, null, 2)}
`);
}

async function consumePairing() {
  const response = await fetch(`${baseUrl}/api/meeting-assistant/pairing`, {
    method: "POST",
    headers: { host, "content-type": "application/json" },
    body: JSON.stringify({ operation: "consume", meetingId, pairingCode }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.organizerAccessToken) {
    throw new Error(body?.error || `Pairing failed (${response.status}).`);
  }
  organizerAccessToken = body.organizerAccessToken;
}

function cleanup() {
  const paths = [
    pairingFile,
    path.join(dataRoot, "workspaces", `${meetingId}.json`),
  ];
  for (const file of paths) {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
  for (const dir of [path.join(dataRoot, "snapshots", meetingId), path.join(dataRoot, "uploads", meetingId)]) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
}

(async () => {
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  await page.setCacheEnabled(false);

  const failures = [];
  page.on("pageerror", (error) => failures.push(`pageerror:${error.message}`));
  page.on("requestfailed", (request) => failures.push(`requestfailed:${request.url()}:${request.failure()?.errorText || "unknown"}`));

  createPairingRecord();
  await consumePairing();
  ok(Boolean(organizerAccessToken), "organizer access token created through pairing flow");

  const response = await page.goto(`${browserBaseUrl}/teams/meeting-assistant/studio?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(organizerAccessToken)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await waitForText(page, "AI dokumentumműhely · emberi jóváhagyással", 60000);
  ok(response?.status() === 200, "token-protected AI studio returns HTTP 200");
  ok(await textExists(page, "AI dokumentumműhely · emberi jóváhagyással"), "full-screen AI studio is visible");
  ok(await textExists(page, "emberi jóváhagyással"), "human-approval principle is displayed");
  ok(await textExists(page, "Források"), "left source panel is visible");
  ok(await textExists(page, "Microsoft Teams-átirat"), "Teams transcript source card is visible");

  const tabLabels = ["Összefoglaló", "Átirat", "Döntések", "Feladatok", "Mellékletek", "Dokumentum-előnézet", "AI-előzmények"];
  const visibleTabs = await page.evaluate((labels) => labels.filter((label) => document.body.innerText.includes(label)), tabLabels);
  ok(visibleTabs.length === tabLabels.length, "all seven central workspace tabs are visible");

  const modelLabels = ["Gyors / takarékos", "Kiegyensúlyozott szakmai", "Prémium / magas pontosság", "Ellenőrző / audit"];
  const visibleModels = await page.evaluate((labels) => labels.filter((label) => document.body.innerText.includes(label)), modelLabels);
  ok(visibleModels.length === modelLabels.length, "all four AI model tiers are visible");

  const actionLabels = [
    "Átirat elemzése",
    "Témakörök felismerése",
    "Résztvevők felismerése",
    "Döntések kigyűjtése",
    "Feladatok kigyűjtése",
    "Határidők és felelősök ellenőrzése",
    "Rövid értekezleti összefoglaló",
    "Értekezleti összefoglaló készítése",
    "„Lényeg röviden” blokkok készítése",
    "Szerkesztett átirat készítése",
    "Teljes dokumentumcsomag szövegének elkészítése",
    "AI-ellenőrzés",
    "Nyelvi és szakmai finomítás",
    "Rövidebb változat készítése",
    "Részletesebb változat készítése",
  ];
  const visibleActions = await page.evaluate((labels) => labels.filter((label) => document.body.innerText.includes(label)), actionLabels);
  ok(visibleActions.length === actionLabels.length, "all fifteen manual AI operations are available");

  await waitForText(page, "Minimum", 60000);
  await waitForText(page, "Várható", 60000);
  await waitForText(page, "Maximum", 60000);
  ok(await textExists(page, "Költségbecslés"), "cost estimate section is visible");
  ok(await textExists(page, "Bemenet:"), "estimated input token count is visible");
  ok(await textExists(page, "Max. kimenet:"), "maximum output token count is visible");
  ok(await textExists(page, "Havi felhasználói keret"), "monthly AI budget indicator is visible");

  await clickByText(page, "Részletesebb változat készítése");
  await waitForText(page, "Részletesebb változat készítése", 30000);
  await waitForText(page, "külön jóváhagyás", 30000);
  ok(await textExists(page, "külön jóváhagyás"), "premium model requires separate approval indicator");

  await waitForEnabledButton(page, "Futtatás jóváhagyása", 60000);
  const runButtonEnabled = true;
  if (runButtonEnabled) {
    await clickByText(page, "Futtatás jóváhagyása");
    await waitForText(page, "AI-futtatás és költség jóváhagyása", 30000);
    ok(await textExists(page, "Engedélyezett maximum"), "run confirmation displays maximum approved cost");
    ok(await textExists(page, "Külön jóváhagyom a prémium"), "premium run confirmation contains a separate consent checkbox");
    await clickByText(page, "Mégse");
  } else {
    ok(await textExists(page, "OPENAI_API_KEY"), "missing API key is explicitly shown when run is unavailable");
    ok(true, "premium confirmation test skipped safely because API key is unavailable");
  }

  await clickByText(page, "Dokumentum-előnézet");
  await waitForText(page, "AI által támogatott, emberi jóváhagyásra váró tervezet", 30000);
  ok(await textExists(page, "emberi jóváhagyásra váró tervezet"), "document preview shows human-approval notice");

  await clickByText(page, "Összefoglaló");
  const textarea = await page.$("textarea");
  ok(Boolean(textarea), "editable document textarea is present");
  if (textarea) {
    await textarea.click({ clickCount: 3 });
    await textarea.type("TESZT AI DOKUMENTUMTERVEZET\n\nLÉNYEG RÖVIDEN\n– A tesztfelület szerkeszthető.");
    const value = await page.evaluate((element) => element.value, textarea);
    ok(value.includes("TESZT AI DOKUMENTUMTERVEZET"), "document draft is editable in the browser");
  }

  const collapseTitle = "AI-panel összecsukása";
  const collapseButton = await page.$(`button[title="${collapseTitle}"]`);
  ok(Boolean(collapseButton), "right AI panel has a collapse control");
  if (collapseButton) await collapseButton.click();
  await page.waitForSelector('button[title="AI-panel megnyitása"]', { timeout: 30000 });
  ok(Boolean(await page.$('button[title="AI-panel megnyitása"]')), "collapsed AI panel can be reopened");

  ok(failures.length === 0, "page has no browser runtime or failed-request errors");

  console.log(`AI document studio UI smoke completed successfully: ${passed} checks.`);
  await browser.close();
  browser = null;
  cleanup();
})().catch(async (error) => {
  console.error(error);
  if (browser) await browser.close().catch(() => undefined);
  cleanup();
  process.exitCode = 1;
});