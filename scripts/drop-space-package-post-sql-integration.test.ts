import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createDropPackage } from "../app/lib/drop/dropRepository";
import {
  acceptDropSpaceInvitation,
  createDropSpace,
  inviteDropSpaceMember,
  listVisibleDropSpacePackages,
  resolveDropSpaceSession,
} from "../app/lib/drop/dropSpaceRepository";

async function expectRepositoryError(action: () => Promise<unknown>, code: string) {
  try {
    await action();
    assert.fail(`A műveletnek hibával kellett volna leállnia: ${code}`);
  } catch (error) {
    assert.equal((error as { code?: string }).code, code);
  }
}

async function main() {
  if (process.env.DROP_ALLOW_SPACE_PACKAGE_POST_SQL_TEST !== "DROP-SPACE-PACKAGE-POST-SQL-TEST") {
    throw new Error("Hiányzó DROP 0.3.2 utóaktiválási tesztengedély.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(url && key, "A Supabase szerveroldali környezet nincs beállítva.");
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const unique = Date.now().toString(36);
  const projectId = `drop-v032-project-${unique}`;
  const projectName = `DROP 0.3.2 tesztprojekt ${unique}`;
  let spaceId: string | null = null;
  let packageId: string | null = null;
  let cleanupCompleted = false;

  try {
    const createdSpace = await createDropSpace({
      name: `DROP 0.3.2 tércsomag integráció ${unique}`,
      ownerLicenseId: `drop-v032-license-${unique}`,
      ownerUserId: `drop-v032-owner-${unique}`,
      ownerName: "DIMPRO DROP 0.3.2 tesztgazda",
      ownerEmail: `owner-${unique}@example.hu`,
      licenseEndsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      accessExpiryMode: "license",
      maxMembers: 20,
      maxPackages: 50,
      storageQuotaBytes: 2 * 1024 ** 3,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
      project: {
        id: projectId,
        name: projectName,
        syncToDock: true,
        allowDockPackageCreation: true,
        archiveToDrive: true,
      },
    });
    spaceId = createdSpace.space.id;

    const contributorInvitation = await inviteDropSpaceMember(spaceId, {
      displayName: "Tércsomag közreműködő",
      email: `contributor-${unique}@example.hu`,
      role: "contributor",
    });
    const selectedViewerInvitation = await inviteDropSpaceMember(spaceId, {
      displayName: "Kiválasztott megtekintő",
      email: `selected-viewer-${unique}@example.hu`,
      role: "viewer",
    });
    const unselectedViewerInvitation = await inviteDropSpaceMember(spaceId, {
      displayName: "Nem kiválasztott megtekintő",
      email: `unselected-viewer-${unique}@example.hu`,
      role: "viewer",
    });

    const [contributorAccepted, selectedViewerAccepted, unselectedViewerAccepted] = await Promise.all([
      acceptDropSpaceInvitation(contributorInvitation.rawInvitationToken),
      acceptDropSpaceInvitation(selectedViewerInvitation.rawInvitationToken),
      acceptDropSpaceInvitation(unselectedViewerInvitation.rawInvitationToken),
    ]);

    const [contributorSession, selectedViewerSession, unselectedViewerSession] = await Promise.all([
      resolveDropSpaceSession(contributorAccepted.sessionToken),
      resolveDropSpaceSession(selectedViewerAccepted.sessionToken),
      resolveDropSpaceSession(unselectedViewerAccepted.sessionToken),
    ]);

    assert.ok(contributorSession.permissions.includes("package.create"));
    assert.ok(!selectedViewerSession.permissions.includes("package.create"));

    const created = await createDropPackage({
      mode: "file",
      title: `Tércsomag integráció ${unique}`,
      description: "Automatikus DROP 0.3.2 integrációs tesztcsomag.",
      projectId,
      projectName,
      uploaderName: contributorSession.membership.displayName,
      uploaderEmail: contributorSession.membership.email,
      retentionDays: 7,
      recipients: [],
      groups: [
        {
          name: "Teszt dokumentumok",
          code: "teszt-dokumentumok",
          description: "Fájlfeltöltés nélkül létrehozott csoport.",
          sortOrder: 0,
          sequenceStart: 1,
        },
      ],
      spaceContext: {
        spaceId,
        createdByMembershipId: contributorSession.membership.id,
        visibility: "selected_members",
        selectedMembershipIds: [selectedViewerSession.membership.id],
      },
    }, {
      userId: `space-member:${contributorSession.membership.id}`,
      name: contributorSession.membership.displayName,
      email: contributorSession.membership.email,
      organizationId: createdSpace.space.organizationId || undefined,
    });
    packageId = created.package.id;

    assert.equal(created.package.space_id, spaceId);
    assert.equal(created.package.created_by_membership_id, contributorSession.membership.id);
    assert.equal(created.package.visibility, "selected_members");
    assert.match(created.pin, /^\d{6}$/);
    assert.match(created.links.view, /^https:\/\/drop\.dimpro\.hu\/p\//);
    assert.match(created.links.upload, /^https:\/\/drop\.dimpro\.hu\/u\//);

    const [creatorVisible, selectedVisible, unselectedVisible] = await Promise.all([
      listVisibleDropSpacePackages(contributorSession),
      listVisibleDropSpacePackages(selectedViewerSession),
      listVisibleDropSpacePackages(unselectedViewerSession),
    ]);
    assert.equal(creatorVisible.some((item) => item.id === packageId), true);
    assert.equal(selectedVisible.some((item) => item.id === packageId), true);
    assert.equal(unselectedVisible.some((item) => item.id === packageId), false);

    const { data: packageMembers, error: packageMembersError } = await client
      .from("drop_package_members")
      .select("membership_id,can_view,can_upload,can_download,can_comment,shared_by_membership_id")
      .eq("package_id", packageId)
      .order("created_at", { ascending: true });
    assert.equal(packageMembersError, null, packageMembersError?.message);
    assert.equal(packageMembers?.length, 2);
    const creatorAccess = packageMembers?.find((row) => row.membership_id === contributorSession.membership.id);
    const selectedAccess = packageMembers?.find((row) => row.membership_id === selectedViewerSession.membership.id);
    assert.deepEqual(
      creatorAccess && {
        canView: creatorAccess.can_view,
        canUpload: creatorAccess.can_upload,
        canDownload: creatorAccess.can_download,
        canComment: creatorAccess.can_comment,
      },
      { canView: true, canUpload: true, canDownload: true, canComment: true },
    );
    assert.deepEqual(
      selectedAccess && {
        canView: selectedAccess.can_view,
        canUpload: selectedAccess.can_upload,
        canDownload: selectedAccess.can_download,
        canComment: selectedAccess.can_comment,
      },
      { canView: true, canUpload: false, canDownload: true, canComment: false },
    );

    const [packageRowResult, tokenRowsResult, eventRowsResult, fileCountResult] = await Promise.all([
      client.from("drop_packages")
        .select("id,pin_hash,pin_salt,space_id,created_by_membership_id,visibility")
        .eq("id", packageId)
        .single(),
      client.from("drop_access_tokens")
        .select("purpose,token_hash,token_hint,metadata")
        .eq("package_id", packageId),
      client.from("drop_events")
        .select("event_type,payload")
        .eq("package_id", packageId)
        .eq("event_type", "package.created"),
      client.from("drop_files")
        .select("id", { count: "exact", head: true })
        .eq("package_id", packageId),
    ]);
    assert.equal(packageRowResult.error, null, packageRowResult.error?.message);
    assert.equal(tokenRowsResult.error, null, tokenRowsResult.error?.message);
    assert.equal(eventRowsResult.error, null, eventRowsResult.error?.message);
    assert.equal(fileCountResult.error, null, fileCountResult.error?.message);
    assert.notEqual(packageRowResult.data?.pin_hash, created.pin);
    assert.ok(packageRowResult.data?.pin_salt);
    assert.equal(tokenRowsResult.data?.length, 4);
    for (const row of tokenRowsResult.data || []) {
      const rawToken = created.rawTokens[row.purpose as keyof typeof created.rawTokens];
      assert.notEqual(row.token_hash, rawToken);
      assert.ok(row.token_hint);
      assert.equal(JSON.stringify(row.metadata).includes(rawToken), false);
    }
    assert.equal(eventRowsResult.data?.length, 1);
    const eventText = JSON.stringify(eventRowsResult.data?.[0]?.payload || {});
    assert.equal(eventText.includes(created.pin), false);
    for (const rawToken of Object.values(created.rawTokens)) assert.equal(eventText.includes(rawToken), false);
    assert.equal(fileCountResult.count || 0, 0);

    await expectRepositoryError(() => createDropPackage({
      mode: "file",
      title: `Tiltott megtekintői csomag ${unique}`,
      description: "A megtekintő nem hozhat létre csomagot.",
      uploaderName: selectedViewerSession.membership.displayName,
      uploaderEmail: selectedViewerSession.membership.email,
      retentionDays: 7,
      recipients: [],
      groups: [],
      spaceContext: {
        spaceId: createdSpace.space.id,
        createdByMembershipId: selectedViewerSession.membership.id,
        visibility: "private",
        selectedMembershipIds: [],
      },
    }, {
      userId: `space-member:${selectedViewerSession.membership.id}`,
      name: selectedViewerSession.membership.displayName,
      email: selectedViewerSession.membership.email,
    }), "DROP_SPACE_PACKAGE_CREATE_FORBIDDEN");

    await expectRepositoryError(() => createDropPackage({
      mode: "file",
      title: `Tiltott projektcsomag ${unique}`,
      description: "Nem kapcsolt projekt nem használható.",
      projectId: `unlinked-project-${unique}`,
      projectName: "Nem kapcsolt projekt",
      uploaderName: contributorSession.membership.displayName,
      uploaderEmail: contributorSession.membership.email,
      retentionDays: 7,
      recipients: [],
      groups: [],
      spaceContext: {
        spaceId: createdSpace.space.id,
        createdByMembershipId: contributorSession.membership.id,
        visibility: "private",
        selectedMembershipIds: [],
      },
    }, {
      userId: `space-member:${contributorSession.membership.id}`,
      name: contributorSession.membership.displayName,
      email: contributorSession.membership.email,
    }), "DROP_SPACE_PROJECT_NOT_LINKED");

    const { count: finalPackageCount, error: finalPackageCountError } = await client
      .from("drop_packages")
      .select("id", { count: "exact", head: true })
      .eq("space_id", spaceId);
    assert.equal(finalPackageCountError, null, finalPackageCountError?.message);
    assert.equal(finalPackageCount, 1, "A tiltott műveletek nem hagyhatnak részleges csomagot.");

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.2",
      atomicSpacePackageCreated: true,
      selectedMemberSharingPersisted: true,
      creatorSeesOwnPackage: true,
      selectedViewerSeesPackage: true,
      unselectedViewerBlocked: true,
      viewerPackageCreationBlocked: true,
      unlinkedProjectBlocked: true,
      packageMemberCount: packageMembers?.length || 0,
      capabilityTokenCount: tokenRowsResult.data?.length || 0,
      rawCredentialsPersisted: false,
      fileCount: fileCountResult.count || 0,
    }, null, 2));
  } finally {
    if (packageId) {
      const { error } = await client.from("drop_packages").delete().eq("id", packageId);
      if (error) throw new Error(`DROP 0.3.2 csomagtakarítási hiba: ${error.message}`);
    }
    if (spaceId) {
      const { error } = await client.from("drop_spaces").delete().eq("id", spaceId);
      if (error) throw new Error(`DROP 0.3.2 tértakarítási hiba: ${error.message}`);
      const [{ data: remainingSpace, error: spaceVerifyError }, { data: remainingPackage, error: packageVerifyError }] = await Promise.all([
        client.from("drop_spaces").select("id").eq("id", spaceId).maybeSingle(),
        packageId
          ? client.from("drop_packages").select("id").eq("id", packageId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (spaceVerifyError) throw spaceVerifyError;
      if (packageVerifyError) throw packageVerifyError;
      assert.equal(remainingSpace, null);
      assert.equal(remainingPackage, null);
      cleanupCompleted = true;
    }
    console.log(JSON.stringify({ cleanupCompleted, testSpaceRetained: false, testPackageRetained: false }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
