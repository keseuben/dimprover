import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const port = Number(process.env.DROP_SPACES_API_PORT || 3225);
const adminKey = (await readFile(".dimprover/license/admin-key.txt", "utf8")).trim();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
assert.ok(adminKey.length >= 20);
assert.ok(supabaseUrl && serviceKey);
const client = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

function request(path, { method = "GET", body, authorized = true } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      Host: "license.dimpro.hu",
      Accept: "application/json",
      ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
      ...(authorized ? { "x-dimpro-license-admin-key": adminKey } : {}),
    };
    const req = http.request({ hostname: "127.0.0.1", port, path, method, headers }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { /* raw response retained */ }
        resolve({ status: res.statusCode, json, raw, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const unique = Date.now().toString(36);
const licenseEndsAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
const graceEndsAt = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000).toISOString();
let spaceId = null;
let cleanupCompleted = false;

try {
  const unauthorized = await request("/api/drop/admin/spaces", { authorized: false });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.json?.code, "DROP_SPACE_ADMIN_UNAUTHORIZED");

  const createdResponse = await request("/api/drop/admin/spaces", {
    method: "POST",
    body: {
      name: `Candidate API teszttér ${unique}`,
      description: "Ideiglenes candidate API teszt.",
      organizationId: `candidate-org-${unique}`,
      ownerLicenseId: `candidate-license-${unique}`,
      ownerUserId: `candidate-owner-${unique}`,
      ownerName: "Candidate térgazda",
      ownerEmail: `candidate-${unique}@example.hu`,
      ownerOrganizationName: "Candidate teszt Kft.",
      licenseEndsAt,
      accessExpiryMode: "license",
      graceEndsAt,
      maxMembers: 30,
      maxPackages: 300,
      storageQuotaBytes: 4 * 1024 ** 3,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
      project: {
        id: `candidate-project-${unique}`,
        name: "Candidate tesztprojekt",
        syncToDock: true,
        allowDockPackageCreation: true,
        archiveToDrive: false,
      },
    },
  });
  assert.equal(createdResponse.status, 201, createdResponse.raw);
  assert.equal(createdResponse.json?.ok, true);
  assert.equal(createdResponse.json?.version, "DROP 0.3.0");
  spaceId = createdResponse.json?.created?.space?.id || null;
  assert.ok(spaceId);
  assert.equal(createdResponse.json?.created?.ownerMembership?.role, "owner");
  assert.equal(createdResponse.json?.created?.ownerMembership?.status, "active");
  assert.equal(createdResponse.json?.created?.project?.syncToDock, true);
  assert.equal(createdResponse.json?.created?.fileUploadEnabled, false);

  const listResponse = await request("/api/drop/admin/spaces");
  assert.equal(listResponse.status, 200, listResponse.raw);
  assert.equal(listResponse.json?.ok, true);
  const listed = listResponse.json?.spaces?.find((space) => space.id === spaceId);
  assert.ok(listed, "A candidate API listában nem jelent meg a teszttér.");
  assert.equal(listed.memberCount, 1);
  assert.equal(listed.projectCount, 1);
  assert.equal(listed.packageCount, 0);
  assert.equal(listed.runtimeMode, "writable");

  console.log(JSON.stringify({
    ok: true,
    unauthorizedBlocked: true,
    createStatus: createdResponse.status,
    listStatus: listResponse.status,
    ownerMembershipCreated: true,
    projectLinkCreated: true,
    fileUploadEnabled: false,
  }, null, 2));
} finally {
  if (spaceId) {
    const { error } = await client.from("drop_spaces").delete().eq("id", spaceId);
    if (error) throw new Error(`DROP_SPACES_API_TEST_CLEANUP_FAILED: ${error.message}`);
    const { data, error: verifyError } = await client.from("drop_spaces").select("id").eq("id", spaceId).maybeSingle();
    if (verifyError) throw new Error(`DROP_SPACES_API_TEST_CLEANUP_VERIFY_FAILED: ${verifyError.message}`);
    assert.equal(data, null);
    cleanupCompleted = true;
  }
  console.log(JSON.stringify({ cleanupCompleted, testSpaceRetained: false }, null, 2));
}
