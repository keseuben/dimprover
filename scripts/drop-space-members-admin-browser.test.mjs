import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";

const port = Number(process.env.DROP_SPACE_BROWSER_PORT || 3226);
const baseUrl = process.env.DROP_SPACE_BROWSER_BASE_URL || `http://license.dimpro.hu:${port}`;
const adminKey = (await readFile(".dimprover/license/admin-key.txt", "utf8")).trim();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
assert.ok(adminKey.length >= 20 && url && key);
const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

function apiRequest(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: {
        Host: "license.dimpro.hu",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "x-dimpro-license-admin-key": adminKey,
      },
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(raw) }));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

const unique = Date.now().toString(36);
const title = `Tagságkezelő UI teszttér ${unique}`;
let spaceId = null;
let cleanupCompleted = false;
const browserErrors = [];
const consoleErrors = [];

try {
  const created = await apiRequest("/api/drop/admin/spaces", {
    name: title,
    ownerLicenseId: `ui-member-license-${unique}`,
    ownerUserId: `ui-member-owner-${unique}`,
    ownerName: "UI teszt térgazda",
    ownerEmail: `ui-owner-${unique}@example.hu`,
    licenseEndsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    accessExpiryMode: "license",
    maxMembers: 10,
    maxPackages: 100,
    storageQuotaBytes: 1024 ** 3,
    allowGuestPackageCreation: true,
    allowGuestInvites: false,
  });
  assert.equal(created.status, 201);
  spaceId = created.json?.created?.space?.id || null;
  assert.ok(spaceId);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--host-resolver-rules=MAP license.dimpro.hu 127.0.0.1,MAP drop.dimpro.hu 127.0.0.1",
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.evaluateOnNewDocument((value) => {
      localStorage.setItem("dimproLicenseAdminKey", value);
      localStorage.setItem("dimpro-admin-theme", "light");
    }, adminKey);
    await page.goto(`${baseUrl}/drive/drop`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction((spaceTitle) => document.body.innerText.includes(spaceTitle), { timeout: 30_000 }, title);

    const clicked = await page.evaluate((spaceTitle) => {
      const articles = [...document.querySelectorAll("article")];
      const card = articles.find((article) => (article.textContent || "").includes(spaceTitle));
      const button = [...(card?.querySelectorAll("button") || [])].find((item) => (item.textContent || "").includes("Tagok kezelése"));
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    }, title);
    assert.equal(clicked, true);
    await page.waitForFunction(() => document.body.innerText.includes("tagságok") && document.body.innerText.includes("UI teszt térgazda"), { timeout: 30_000 });

    const opened = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((item) => (item.textContent || "").includes("Új meghívás"));
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    });
    assert.equal(opened, true);
    await page.waitForFunction(() => document.body.innerText.includes("Meghívó küldése · 2 mp"), { timeout: 15_000 });

    const result = await page.evaluate(() => {
      const text = document.body.innerText.toLocaleLowerCase("hu-HU");
      return {
        hasOwner: text.includes("ui teszt térgazda"),
        hasOwnerRole: text.includes("térgazda"),
        hasInviteForm: text.includes("meghívott neve") && text.includes("szerepkör"),
        hasContributorRole: text.includes("közreműködő – saját csomag"),
        hasHoldAction: text.includes("meghívó küldése · 2 mp"),
        hasLicenseNote: text.includes("külön fizetős licenc nélkül"),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      };
    });
    assert.equal(result.hasOwner, true);
    assert.equal(result.hasOwnerRole, true);
    assert.equal(result.hasInviteForm, true);
    assert.equal(result.hasContributorRole, true);
    assert.equal(result.hasHoldAction, true);
    assert.equal(result.hasLicenseNote, true);
    assert.equal(result.horizontalOverflow, false);
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(consoleErrors.filter((item) => !item.includes("favicon")), []);

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.1",
      memberPanelOpened: true,
      ownerMembershipVisible: true,
      invitationFormVisible: true,
      contributorRoleVisible: true,
      twoSecondHoldVisible: true,
      browserErrors: browserErrors.length,
      consoleErrors: consoleErrors.length,
      horizontalOverflow: false,
    }, null, 2));
  } finally {
    await browser.close();
  }
} finally {
  if (spaceId) {
    const { error } = await client.from("drop_spaces").delete().eq("id", spaceId);
    if (error) throw new Error(`Takarítási hiba: ${error.message}`);
    const { data, error: verifyError } = await client.from("drop_spaces").select("id").eq("id", spaceId).maybeSingle();
    if (verifyError) throw verifyError;
    assert.equal(data, null);
    cleanupCompleted = true;
  }
  console.log(JSON.stringify({ cleanupCompleted, testSpaceRetained: false }, null, 2));
}
