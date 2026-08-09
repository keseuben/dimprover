import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer";
import { createDropPackage } from "../app/lib/drop/dropRepository";
import { acceptDropSpaceInvitation, createDropSpace, inviteDropSpaceMember } from "../app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "../app/lib/drop/dropSpaceSecurity";

const RULES_VERSION = "DIMPRO-DROP-UPLOAD-HU-1.0";

async function main() {
  if (process.env.DROP_ALLOW_V034_LIVE_UI_TEST !== "DROP-V034-LIVE-UI-TEST") {
    throw new Error("Hiányzó DROP 0.3.4 éles UI tesztengedély.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(url && key);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unique = Date.now().toString(36);
  let spaceId: string | null = null;
  let packageId: string | null = null;
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  try {
    const space = await createDropSpace({
      name: `DROP 0.3.4 éles UI ${unique}`,
      ownerLicenseId: `drop-v034-ui-license-${unique}`,
      ownerUserId: `drop-v034-ui-owner-${unique}`,
      ownerName: "DROP UI tesztgazda",
      ownerEmail: `owner-${unique}@example.hu`,
      licenseEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      accessExpiryMode: "license",
      maxMembers: 5,
      maxPackages: 5,
      storageQuotaBytes: 1024 * 1024 * 1024,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
    });
    spaceId = space.space.id;
    const invitation = await inviteDropSpaceMember(spaceId, {
      displayName: "Éles UI közreműködő",
      email: `contributor-${unique}@example.hu`,
      role: "contributor",
    });
    const accepted = await acceptDropSpaceInvitation(invitation.rawInvitationToken);
    const created = await createDropPackage({
      mode: "file",
      title: `DROP 0.3.4 éles UI csomag ${unique}`,
      description: "Felhasználói szabályzat és kártyák éles böngészőtesztje.",
      uploaderName: accepted.membership.displayName,
      uploaderEmail: accepted.membership.email,
      retentionDays: 3,
      recipients: [],
      groups: [],
      maxFileCount: 3,
      maxFileSizeBytes: 500 * 1024 * 1024,
      maxTotalSizeBytes: 800 * 1024 * 1024,
      spaceContext: {
        spaceId,
        createdByMembershipId: accepted.membership.id,
        visibility: "private",
        selectedMembershipIds: [],
      },
    }, {
      userId: `space-member:${accepted.membership.id}`,
      name: accepted.membership.displayName,
      email: accepted.membership.email,
    });
    packageId = created.package.id;
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    try {
      const page = await browser.newPage();
      page.on("pageerror", (error) => pageErrors.push(error instanceof Error ? error.message : String(error)));
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      await page.setCookie({
        name: DROP_SPACE_SESSION_COOKIE,
        value: accepted.sessionToken,
        domain: "drop.dimpro.hu",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      });
      await page.goto(`https://drop.dimpro.hu/space/${space.space.publicCode}`, { waitUntil: "networkidle0", timeout: 60_000 });
      await page.waitForFunction(() => document.body.innerText.includes("Feltöltési szabályok és biztonsági tájékoztató"), { timeout: 30_000 });
      const before = await page.evaluate((rulesVersion) => {
        const body = document.body.innerText;
        const checkbox = document.querySelector('input[type="checkbox"]');
        const choose = [...document.querySelectorAll("button")].find((button) => (button.textContent || "").includes("Fájlok kiválasztása"));
        return {
          current: body.includes("500 MB / fájl"),
          roadmap: body.includes("Hamarosan: akár 2 GB / fájl") && body.includes("hamarosan 1–2 GB-ra emelkedik"),
          version: body.includes(rulesVersion),
          accepted: checkbox instanceof HTMLInputElement ? checkbox.checked : null,
          chooseDisabled: choose instanceof HTMLButtonElement ? choose.disabled : null,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        };
      }, RULES_VERSION);
      assert.deepEqual(before, { current: true, roadmap: true, version: true, accepted: false, chooseDisabled: true, overflow: false });
      await page.click('input[type="checkbox"]');
      const after = await page.evaluate(() => {
        const checkbox = document.querySelector('input[type="checkbox"]');
        const choose = [...document.querySelectorAll("button")].find((button) => (button.textContent || "").includes("Fájlok kiválasztása"));
        return {
          accepted: checkbox instanceof HTMLInputElement ? checkbox.checked : null,
          chooseDisabled: choose instanceof HTMLButtonElement ? choose.disabled : null,
        };
      });
      assert.deepEqual(after, { accepted: true, chooseDisabled: false });

      const capability = await browser.newPage();
      capability.on("pageerror", (error) => pageErrors.push(error instanceof Error ? error.message : String(error)));
      capability.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      await capability.goto(`https://drop.dimpro.hu/u/${encodeURIComponent(created.rawTokens.upload)}`, { waitUntil: "networkidle0", timeout: 60_000 });
      await capability.waitForFunction(() => document.body.innerText.includes("Feltöltési szabályok és biztonsági tájékoztató"), { timeout: 30_000 });
      const cap = await capability.evaluate(() => {
        const body = document.body.innerText;
        const checkbox = document.querySelector('input[type="checkbox"]');
        const choose = [...document.querySelectorAll("button")].find((button) => (button.textContent || "").includes("Fájlok kiválasztása"));
        return {
          current: body.includes("500 MB / fájl"),
          roadmap: body.includes("Hamarosan: akár 2 GB / fájl"),
          accepted: checkbox instanceof HTMLInputElement ? checkbox.checked : null,
          chooseDisabled: choose instanceof HTMLButtonElement ? choose.disabled : null,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        };
      });
      assert.deepEqual(cap, { current: true, roadmap: true, accepted: false, chooseDisabled: true, overflow: false });
      await capability.close();
    } finally {
      await browser.close();
    }
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors.filter((item) => !item.includes("favicon")), []);
    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.4",
      liveSpaceUi: true,
      liveCapabilityUi: true,
      currentLimitVisible: true,
      twoGbRoadmapVisible: true,
      rulesVersionVisible: true,
      acceptanceInitiallyUnchecked: true,
      fileChoiceBlockedUntilAcceptance: true,
      responsiveOverflow: false,
      browserErrors: pageErrors.length,
      consoleErrors: consoleErrors.length,
    }, null, 2));
  } finally {
    if (packageId) {
      const deleted = await client.from("drop_packages").delete().eq("id", packageId);
      if (deleted.error) throw deleted.error;
    }
    if (spaceId) {
      const deleted = await client.from("drop_spaces").delete().eq("id", spaceId);
      if (deleted.error) throw deleted.error;
    }
    const [spaces, packages] = await Promise.all([
      client.from("drop_spaces").select("id", { count: "exact", head: true }).ilike("name", "DROP 0.3.4 éles UI%"),
      client.from("drop_packages").select("id", { count: "exact", head: true }).ilike("title", "DROP 0.3.4 éles UI csomag%"),
    ]);
    for (const result of [spaces, packages]) if (result.error) throw result.error;
    assert.equal(spaces.count || 0, 0);
    assert.equal(packages.count || 0, 0);
    console.log(JSON.stringify({ cleanupCompleted: true, testPackageRetained: false, testSpaceRetained: false }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
