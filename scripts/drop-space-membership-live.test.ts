import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  acceptDropSpaceInvitation,
  createDropSpace,
  inviteDropSpaceMember,
  listDropSpaceMemberships,
  resolveDropSpaceInvitation,
  resolveDropSpaceSession,
} from "../app/lib/drop/dropSpaceRepository";

async function expectError(action: () => Promise<unknown>, code: string) {
  try {
    await action();
    assert.fail(`A műveletnek hibával kellett volna leállnia: ${code}`);
  } catch (error) {
    assert.equal((error as { code?: string }).code, code);
  }
}

async function main() {
  if (process.env.DROP_ALLOW_SPACE_MEMBER_TEST !== "DROP-SPACE-MEMBER-TEMPORARY-TEST") {
    throw new Error("Hiányzó ideiglenes tesztengedély.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(url && key);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unique = Date.now().toString(36);
  const licenseEndsAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  let spaceId: string | null = null;
  let cleanupCompleted = false;

  try {
    const created = await createDropSpace({
      name: `Tagsági integrációs teszttér ${unique}`,
      ownerLicenseId: `member-test-license-${unique}`,
      ownerUserId: `member-test-owner-${unique}`,
      ownerName: "DIMPRO tagsági tesztgazda",
      ownerEmail: `owner-${unique}@example.hu`,
      licenseEndsAt,
      accessExpiryMode: "license",
      maxMembers: 10,
      maxPackages: 100,
      storageQuotaBytes: 1024 ** 3,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
    });
    spaceId = created.space.id;

    const first = await inviteDropSpaceMember(spaceId, {
      displayName: "Külső közreműködő",
      email: `guest-${unique}@example.hu`,
      organizationName: "Külső Teszt Kft.",
      role: "contributor",
    });
    assert.equal(first.membership.status, "invited");
    assert.equal(first.membership.isGuest, true);
    assert.equal(first.guestLicenseRequired, false);
    assert.ok(first.rolePermissions.includes("package.create"));
    assert.match(first.invitationLink, /^https:\/\/drop\.dimpro\.hu\/join\/dsp_i_/);

    const firstResolved = await resolveDropSpaceInvitation(first.rawInvitationToken);
    assert.equal(firstResolved.membership.id, first.membership.id);
    assert.equal(firstResolved.membership.role, "contributor");

    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await inviteDropSpaceMember(spaceId, {
      displayName: "Külső közreműködő",
      email: `guest-${unique}@example.hu`,
      organizationName: "Külső Teszt Kft.",
      role: "contributor",
    });
    assert.equal(second.membership.id, first.membership.id, "Az újraküldés nem hozhat létre második tagságot.");
    assert.notEqual(second.rawInvitationToken, first.rawInvitationToken);
    await expectError(() => resolveDropSpaceInvitation(first.rawInvitationToken), "DROP_SPACE_INVITATION_REPLACED");

    const accepted = await acceptDropSpaceInvitation(second.rawInvitationToken);
    assert.equal(accepted.membership.status, "active");
    assert.ok(accepted.membership.acceptedAt);
    assert.match(accepted.sessionToken, /^dsp_s_/);
    assert.equal(accepted.redirectPath, `/space/${created.space.publicCode}`);

    await expectError(() => resolveDropSpaceInvitation(second.rawInvitationToken), "DROP_SPACE_INVITATION_CONSUMED");
    const session = await resolveDropSpaceSession(accepted.sessionToken);
    assert.equal(session.membership.status, "active");
    assert.equal(session.membership.role, "contributor");
    assert.ok(session.permissions.includes("package.create"));
    assert.equal(session.packageCount, 0);

    const members = await listDropSpaceMemberships(spaceId);
    assert.equal(members.length, 2);
    assert.equal(members.filter((member) => member.role === "owner").length, 1);
    assert.equal(members.filter((member) => member.role === "contributor").length, 1);

    const { error: revokeError } = await client
      .from("drop_space_memberships")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", accepted.membership.id);
    assert.equal(revokeError, null, revokeError?.message);
    await expectError(() => resolveDropSpaceSession(accepted.sessionToken), "DROP_SPACE_SESSION_INVALID");

    console.log(JSON.stringify({
      ok: true,
      invitationCreated: true,
      invitationReissued: true,
      oldInvitationInvalidated: true,
      invitationAccepted: true,
      invitationReplayBlocked: true,
      guestSessionCreated: true,
      revokedSessionBlocked: true,
      memberCount: members.length,
      guestLicenseRequired: false,
      fileUploadEnabled: false,
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
