import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer";
import {
  createDropSpace,
  inviteDropSpaceMember,
} from "../app/lib/drop/dropSpaceRepository";

async function main() {
  if (process.env.DROP_ALLOW_LIVE_INVITE_BROWSER !== "DROP-LIVE-INVITE-BROWSER-TEST") {
    throw new Error("Hiányzó élő böngészőteszt-engedély.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(url && key);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unique = Date.now().toString(36);
  const spaceName = `Éles meghívó böngészőteszt ${unique}`;
  const guestName = "Éles teszt közreműködő";
  let spaceId: string | null = null;
  let cleanupCompleted = false;
  const browserErrors: string[] = [];
  const consoleErrors: string[] = [];

  try {
    const created = await createDropSpace({
      name: spaceName,
      description: "Ideiglenes HTTPS böngészőteszt.",
      ownerLicenseId: `live-browser-license-${unique}`,
      ownerUserId: `live-browser-owner-${unique}`,
      ownerName: "DIMPRO éles tesztgazda",
      ownerEmail: `live-owner-${unique}@example.hu`,
      licenseEndsAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      accessExpiryMode: "license",
      maxMembers: 10,
      maxPackages: 100,
      storageQuotaBytes: 1024 ** 3,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
    });
    spaceId = created.space.id;
    const invitation = await inviteDropSpaceMember(spaceId, {
      displayName: guestName,
      email: `live-guest-${unique}@example.hu`,
      organizationName: "Éles Teszt Kft.",
      role: "contributor",
    });

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
      page.on("pageerror", (error) => browserErrors.push(error instanceof Error ? error.message : String(error)));
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      await page.goto(invitation.invitationLink, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForFunction((title, guest) => {
        const text = document.body.innerText;
        return text.includes(title) && text.includes(guest) && text.includes("Közreműködő");
      }, { timeout: 30_000 }, spaceName, guestName);

      const started = await page.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find((item) => (item.textContent || "").includes("Meghívás elfogadása"));
        if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
        button.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerId: 91,
          pointerType: "mouse",
          isPrimary: true,
          buttons: 1,
        }));
        return true;
      });
      assert.equal(started, true);
      await page.waitForFunction((publicCode) => window.location.pathname === `/space/${publicCode}`, { timeout: 30_000 }, created.space.publicCode);
      await page.waitForFunction((title, guest) => {
        const text = document.body.innerText;
        return text.includes(title) && text.includes(guest) && text.includes("Saját csomag készítése");
      }, { timeout: 30_000 }, spaceName, guestName);

      const cookies = await page.cookies("https://drop.dimpro.hu");
      const sessionCookie = cookies.find((cookie) => cookie.name === "dimpro_drop_space_session");
      assert.ok(sessionCookie, "A vendég session-cookie hiányzik.");
      assert.equal(sessionCookie.httpOnly, true);
      assert.equal(sessionCookie.secure, true);
      assert.equal(sessionCookie.sameSite, "Lax");

      const workspace = await page.evaluate(() => ({
        hasContributorRole: document.body.innerText.includes("Közreműködő"),
        hasPackageCreate: document.body.innerText.includes("Saját csomag készítése"),
        hasUploadClosed: document.body.innerText.includes("központi Storage-kapu még zárva van"),
        hasNoPaidLicenseNote: document.body.innerText.includes("külön fizetős licenc nélkül"),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      }));
      assert.equal(workspace.hasContributorRole, true);
      assert.equal(workspace.hasPackageCreate, true);
      assert.equal(workspace.hasUploadClosed, true);
      assert.equal(workspace.hasNoPaidLicenseNote, true);
      assert.equal(workspace.horizontalOverflow, false);

      const replayStatus = await page.evaluate(async (rawToken) => {
        const response = await fetch(`/api/drop/spaces/invitations/${encodeURIComponent(rawToken)}`, { method: "POST" });
        return response.status;
      }, invitation.rawInvitationToken);
      assert.equal(replayStatus, 409);
      assert.deepEqual(browserErrors, []);
      const unexpectedConsoleErrors = consoleErrors.filter((item) => !item.includes("favicon") && !item.includes("409 (Conflict)"));
      assert.deepEqual(unexpectedConsoleErrors, []);

      console.log(JSON.stringify({
        ok: true,
        version: "DROP 0.3.1",
        invitationRendered: true,
        twoSecondAcceptanceCompleted: true,
        secureHttpOnlyCookieStored: true,
        workspaceRedirected: true,
        contributorPermissionVisible: true,
        uploadGateClosed: true,
        invitationReplayBlocked: true,
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
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
