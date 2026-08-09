import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { getMailProfilesSafeConfig } from "../app/lib/license/mail-profiles";

const port = Number(process.env.DROP_SPACE_INVITE_API_PORT || 3226);

function request(path: string, input: {
  host: "license.dimpro.hu" | "drop.dimpro.hu";
  method?: string;
  body?: unknown;
  adminKey?: string;
  cookie?: string;
  accept?: string;
}) {
  return new Promise<{ status: number; json: unknown; raw: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const payload = input.body === undefined ? null : JSON.stringify(input.body);
    const headers: Record<string, string | number> = {
      Host: input.host,
      Accept: input.accept || "application/json",
      ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
      ...(input.adminKey ? { "x-dimpro-license-admin-key": input.adminKey } : {}),
      ...(input.cookie ? { Cookie: input.cookie } : {}),
    };
    const req = http.request({ hostname: "127.0.0.1", port, path, method: input.method || "GET", headers }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json: unknown = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { /* HTML response */ }
        resolve({ status: res.statusCode || 0, json, raw, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  if (process.env.DROP_ALLOW_INVITE_API_TEST !== "DROP-INVITE-API-TEMPORARY-TEST") {
    throw new Error("Hiányzó ideiglenes API tesztengedély.");
  }
  const adminKey = (await readFile(".dimprover/license/admin-key.txt", "utf8")).trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(adminKey.length >= 20 && url && key);
  const mailConfig = await getMailProfilesSafeConfig();
  const testRecipient = mailConfig.testRecipients[0];
  assert.ok(testRecipient, "Nincs beállított SMTP tesztcímzett.");
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unique = Date.now().toString(36);
  const licenseEndsAt = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString();
  let spaceId: string | null = null;
  let cleanupCompleted = false;

  try {
    const createResponse = await request("/api/drop/admin/spaces", {
      host: "license.dimpro.hu",
      method: "POST",
      adminKey,
      body: {
        name: `E-mailes meghívó API teszttér ${unique}`,
        description: "Automatikus ideiglenes teszt.",
        ownerLicenseId: `invite-api-license-${unique}`,
        ownerUserId: `invite-api-owner-${unique}`,
        ownerName: "DIMPRO meghívó tesztgazda",
        ownerEmail: "info@dimpro.hu",
        licenseEndsAt,
        accessExpiryMode: "license",
        maxMembers: 10,
        maxPackages: 100,
        storageQuotaBytes: 1024 ** 3,
        allowGuestPackageCreation: true,
        allowGuestInvites: false,
      },
    });
    assert.equal(createResponse.status, 201, createResponse.raw);
    const created = createResponse.json as { created?: { space?: { id?: string; publicCode?: string } } };
    spaceId = created.created?.space?.id || null;
    const publicCode = created.created?.space?.publicCode || "";
    assert.ok(spaceId && publicCode);

    const publicAdminBlocked = await request(`/api/drop/admin/spaces/${spaceId}/members`, { host: "drop.dimpro.hu" });
    assert.equal(publicAdminBlocked.status, 404);

    const inviteResponse = await request(`/api/drop/admin/spaces/${spaceId}/members`, {
      host: "license.dimpro.hu",
      method: "POST",
      adminKey,
      body: {
        displayName: "DIMPRO e-mail tesztcímzett",
        email: testRecipient,
        organizationName: "DIMPRO teszt",
        role: "contributor",
      },
    });
    assert.equal(inviteResponse.status, 201, inviteResponse.raw);
    const invitePayload = inviteResponse.json as {
      invitation?: { invitationLink?: string; invitationExpiresAt?: string; guestLicenseRequired?: boolean };
      emailDelivery?: { sent?: boolean; profileId?: string; error?: string | null };
    };
    assert.equal(invitePayload.emailDelivery?.sent, true, invitePayload.emailDelivery?.error || "SMTP hiba");
    assert.equal(invitePayload.emailDelivery?.profileId, "drive");
    assert.equal(invitePayload.invitation?.guestLicenseRequired, false);
    const invitationLink = invitePayload.invitation?.invitationLink || "";
    const invitationUrl = new URL(invitationLink);
    const rawToken = decodeURIComponent(invitationUrl.pathname.replace(/^\/join\//, ""));
    assert.match(rawToken, /^dsp_i_/);
    const encodedToken = encodeURIComponent(rawToken);

    const invitePage = await request(`/join/${encodedToken}`, { host: "drop.dimpro.hu", accept: "text/html" });
    assert.equal(invitePage.status, 200);

    const resolveResponse = await request(`/api/drop/spaces/invitations/${encodedToken}`, { host: "drop.dimpro.hu" });
    assert.equal(resolveResponse.status, 200, resolveResponse.raw);
    const resolved = resolveResponse.json as { invitation?: { membership?: { role?: string }; guestLicenseRequired?: boolean } };
    assert.equal(resolved.invitation?.membership?.role, "contributor");
    assert.equal(resolved.invitation?.guestLicenseRequired, false);

    const acceptResponse = await request(`/api/drop/spaces/invitations/${encodedToken}`, {
      host: "drop.dimpro.hu",
      method: "POST",
      body: {},
    });
    assert.equal(acceptResponse.status, 200, acceptResponse.raw);
    const setCookie = Array.isArray(acceptResponse.headers["set-cookie"])
      ? acceptResponse.headers["set-cookie"][0]
      : acceptResponse.headers["set-cookie"] || "";
    assert.match(setCookie, /dimpro_drop_space_session=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=Lax/i);
    const cookie = setCookie.split(";", 1)[0];

    const sessionResponse = await request("/api/drop/spaces/session", { host: "drop.dimpro.hu", cookie });
    assert.equal(sessionResponse.status, 200, sessionResponse.raw);
    const sessionPayload = sessionResponse.json as {
      session?: { space?: { publicCode?: string }; membership?: { role?: string }; permissions?: string[]; fileUploadEnabled?: boolean };
    };
    assert.equal(sessionPayload.session?.space?.publicCode, publicCode);
    assert.equal(sessionPayload.session?.membership?.role, "contributor");
    assert.ok(sessionPayload.session?.permissions?.includes("package.create"));
    assert.equal(sessionPayload.session?.fileUploadEnabled, false);

    const workspacePage = await request(`/space/${encodeURIComponent(publicCode)}`, { host: "drop.dimpro.hu", cookie, accept: "text/html" });
    assert.equal(workspacePage.status, 200);

    const replayResponse = await request(`/api/drop/spaces/invitations/${encodedToken}`, {
      host: "drop.dimpro.hu",
      method: "POST",
      body: {},
    });
    assert.equal(replayResponse.status, 409);

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.1",
      emailSent: true,
      emailProfile: "drive",
      publicAdminApiBlocked: true,
      invitationPageStatus: invitePage.status,
      invitationResolved: true,
      invitationAccepted: true,
      secureHttpOnlyCookie: true,
      guestSessionResolved: true,
      contributorCanCreatePackage: true,
      fileUploadEnabled: false,
      invitationReplayBlocked: true,
    }, null, 2));
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
