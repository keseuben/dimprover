import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  createDropSpace,
  getDropSpacesSchemaHealth,
  listDropSpaces,
} from "../app/lib/drop/dropSpaceRepository";

async function main() {
  const consent = "DROP-SPACES-TEMPORARY-TEST";
  if (process.env.DROP_ALLOW_SPACES_INTEGRATION !== consent) {
    throw new Error(`A teszthez szükséges: DROP_ALLOW_SPACES_INTEGRATION=${consent}`);
  }

  const schema = await getDropSpacesSchemaHealth();
  assert.equal(schema.ready, true, "A DROP 0.3.0 séma nem kész.");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(supabaseUrl && serviceKey);
  const client = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-drop-spaces-live-test" } },
  });

  const unique = Date.now().toString(36);
  const licenseEnd = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  const graceEnd = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000).toISOString();
  let spaceId: string | null = null;
  let cleanupCompleted = false;

  try {
    const created = await createDropSpace({
      name: `DROP 0.3.0 integrációs teszttér ${unique}`,
      description: "Automatikus ideiglenes tér; a teszt végén törlődik.",
      organizationId: `test-org-${unique}`,
      ownerLicenseId: `test-license-${unique}`,
      ownerUserId: `test-owner-${unique}`,
      ownerName: "DIMPRO teszt térgazda",
      ownerEmail: `drop-space-${unique}@example.hu`,
      ownerOrganizationName: "DIMPRO teszt szervezet",
      licenseEndsAt: licenseEnd,
      accessExpiryMode: "license",
      graceEndsAt: graceEnd,
      maxMembers: 25,
      maxPackages: 250,
      storageQuotaBytes: 5 * 1024 ** 3,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
      project: {
        id: `test-project-${unique}`,
        name: "DROP integrációs tesztprojekt",
        syncToDock: true,
        allowDockPackageCreation: true,
        archiveToDrive: true,
        driveTargetFolderId: `test-drive-folder-${unique}`,
      },
    });
    spaceId = created.space.id;

    assert.match(created.space.publicCode, /^DSP-\d{2}-[A-F0-9]{8}$/);
    assert.equal(created.space.status, "active");
    assert.equal(created.ownerMembership.role, "owner");
    assert.equal(created.ownerMembership.status, "active");
    assert.equal(created.ownerMembership.isGuest, false);
    assert.equal(created.project?.syncToDock, true);
    assert.equal(created.project?.archiveToDrive, true);
    assert.equal(created.accessWindow.runtimeMode, "writable");
    assert.equal(created.guestLicenseRequired, false);
    assert.equal(created.fileUploadEnabled, false);

    const spaces = await listDropSpaces(100);
    const listed = spaces.find((space) => space.id === spaceId);
    assert.ok(listed, "A létrehozott tér nem jelent meg a listában.");
    assert.equal(listed.memberCount, 1);
    assert.equal(listed.projectCount, 1);
    assert.equal(listed.packageCount, 0);
    assert.equal(listed.ownerMembership?.status, "active");
    assert.equal(listed.projects[0]?.syncToDock, true);
    assert.equal(listed.projects[0]?.archiveToDrive, true);

    const [membershipCount, projectCount, packageCount] = await Promise.all([
      client.from("drop_space_memberships").select("id", { count: "exact", head: true }).eq("space_id", spaceId),
      client.from("drop_space_projects").select("id", { count: "exact", head: true }).eq("space_id", spaceId),
      client.from("drop_packages").select("id", { count: "exact", head: true }).eq("space_id", spaceId),
    ]);
    assert.equal(membershipCount.error, null, membershipCount.error?.message);
    assert.equal(projectCount.error, null, projectCount.error?.message);
    assert.equal(packageCount.error, null, packageCount.error?.message);
    assert.equal(membershipCount.count, 1);
    assert.equal(projectCount.count, 1);
    assert.equal(packageCount.count, 0);

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.0",
      schemaReady: true,
      spaceCreated: true,
      ownerMembershipCreated: true,
      projectLinkCreated: true,
      listedMemberCount: listed.memberCount,
      listedProjectCount: listed.projectCount,
      listedPackageCount: listed.packageCount,
      guestLicenseRequired: false,
      fileUploadEnabled: false,
    }, null, 2));
  } finally {
    if (spaceId) {
      const { error } = await client.from("drop_spaces").delete().eq("id", spaceId);
      if (error) throw new Error(`DROP_SPACES_TEST_CLEANUP_FAILED: ${error.message}`);
      const { data, error: verifyError } = await client.from("drop_spaces").select("id").eq("id", spaceId).maybeSingle();
      if (verifyError) throw new Error(`DROP_SPACES_TEST_CLEANUP_VERIFY_FAILED: ${verifyError.message}`);
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
