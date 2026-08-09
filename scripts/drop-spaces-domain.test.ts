import assert from "node:assert/strict";
import {
  canCreatePackageInDropSpace,
  canLinkProjectToDropSpace,
  dropSpaceMembershipHasPermission,
  permissionsForDropSpaceRole,
  resolveDropSpaceAccessWindow,
  resolveMembershipAccessEnd,
} from "../app/lib/drop/dropSpacePermissions";
import { buildDropSpacePreview, parseDropCreateSpaceInput } from "../app/lib/drop/dropSpaceValidation";
import type { DropSpace, DropSpaceMembership } from "../app/lib/drop/dropSpaceTypes";

function membership(
  spaceId: string,
  role: DropSpaceMembership["role"],
  overrides: Partial<DropSpaceMembership> = {},
): DropSpaceMembership {
  return {
    id: `membership-${role}`,
    spaceId,
    userId: null,
    email: `${role}@example.hu`,
    displayName: role,
    organizationName: null,
    role,
    status: "active",
    isGuest: role !== "owner" && role !== "space_admin",
    invitedByMembershipId: null,
    invitedAt: "2026-08-01T12:00:00.000Z",
    acceptedAt: "2026-08-01T12:05:00.000Z",
    accessEndsAt: null,
    lastOpenedAt: null,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

function baseSpace(overrides: Partial<DropSpace> = {}): DropSpace {
  return {
    id: "space-1",
    publicCode: "DSP-26-TEST0001",
    name: "Teszt Drop tér",
    description: "Projektalapú hozzáférési tér",
    organizationId: "org-1",
    ownerLicenseId: "license-1",
    ownerUserId: "owner-1",
    status: "active",
    accessExpiryMode: "license",
    accessEndsAt: null,
    licenseEndsAt: "2027-02-01T00:00:00.000Z",
    projectEndsAt: null,
    graceEndsAt: "2027-03-03T00:00:00.000Z",
    maxMembers: 100,
    maxPackages: 1000,
    storageQuotaBytes: 10 * 1024 ** 3,
    currentStorageBytes: 0,
    allowGuestPackageCreation: true,
    allowGuestInvites: false,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    archivedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

async function main() {
  const space = baseSpace();
  const owner = membership(space.id, "owner", { isGuest: false });
  const admin = membership(space.id, "space_admin", { isGuest: false });
  const contributor = membership(space.id, "contributor");
  const uploader = membership(space.id, "uploader");
  const viewer = membership(space.id, "viewer");
  const now = new Date("2026-08-01T18:00:00.000Z");

  assert.ok(permissionsForDropSpaceRole("owner").includes("space.manage_members"));
  assert.ok(permissionsForDropSpaceRole("space_admin").includes("drive.archive"));
  assert.ok(permissionsForDropSpaceRole("contributor").includes("package.create"));
  assert.equal(permissionsForDropSpaceRole("uploader").includes("package.create"), false);
  assert.equal(permissionsForDropSpaceRole("viewer").includes("file.upload"), false);

  assert.equal(canCreatePackageInDropSpace(space, owner, now), true);
  assert.equal(canCreatePackageInDropSpace(space, contributor, now), true);
  assert.equal(canCreatePackageInDropSpace(space, uploader, now), false);
  assert.equal(canCreatePackageInDropSpace(space, viewer, now), false);
  assert.equal(canLinkProjectToDropSpace(space, owner, now), true);
  assert.equal(canLinkProjectToDropSpace(space, admin, now), true);
  assert.equal(canLinkProjectToDropSpace(space, contributor, now), false);

  const guestCreationDisabled = baseSpace({ allowGuestPackageCreation: false });
  assert.equal(canCreatePackageInDropSpace(guestCreationDisabled, contributor, now), false);
  assert.equal(canCreatePackageInDropSpace(guestCreationDisabled, owner, now), true);

  const projectLimited = baseSpace({
    accessExpiryMode: "project",
    projectEndsAt: "2026-12-31T23:59:59.000Z",
  });
  const projectWindow = resolveDropSpaceAccessWindow(projectLimited, now);
  assert.equal(projectWindow.source, "project");
  assert.equal(projectWindow.effectiveEndsAt, "2026-12-31T23:59:59.000Z");
  assert.equal(projectWindow.runtimeMode, "writable");

  const projectBeyondLicense = baseSpace({
    accessExpiryMode: "project",
    projectEndsAt: "2028-01-01T00:00:00.000Z",
  });
  const licenseWindow = resolveDropSpaceAccessWindow(projectBeyondLicense, now);
  assert.equal(licenseWindow.source, "license", "A fizető licenc mindig felső időkorlát.");

  const membershipLimited = membership(space.id, "contributor", {
    accessEndsAt: "2026-09-01T00:00:00.000Z",
  });
  assert.equal(resolveMembershipAccessEnd(space, membershipLimited), "2026-09-01T00:00:00.000Z");
  assert.equal(canCreatePackageInDropSpace(space, membershipLimited, new Date("2026-09-02T00:00:00.000Z")), false);

  const readOnlySpace = baseSpace({ status: "read_only" });
  assert.equal(dropSpaceMembershipHasPermission(readOnlySpace, viewer, "file.download", now), true);
  assert.equal(dropSpaceMembershipHasPermission(readOnlySpace, contributor, "file.upload", now), false);
  assert.equal(dropSpaceMembershipHasPermission(readOnlySpace, admin, "space.update", now), false);

  const preview = buildDropSpacePreview({
    name: "Szekszárd projekt Drop tér",
    description: "A projektpartnerek saját csomagokat hozhatnak létre.",
    ownerLicenseId: "license-hage",
    licenseEndsAt: "2027-02-01T00:00:00.000Z",
    accessExpiryMode: "project",
    projectEndsAt: "2026-12-31T23:59:59.000Z",
    allowGuestPackageCreation: true,
    allowGuestInvites: false,
  });
  assert.match(preview.publicCode, /^DSP-\d{2}-[A-F0-9]{8}$/);
  assert.equal(preview.effectiveEndSource, "project");
  assert.equal(preview.databaseWritesPerformed, false);

  assert.throws(() => parseDropCreateSpaceInput({
    name: "Fix idő hibás",
    ownerLicenseId: "license-1",
    licenseEndsAt: "2026-12-01T00:00:00.000Z",
    accessExpiryMode: "fixed",
  }), /Fix lejárati módnál/);

  assert.throws(() => parseDropCreateSpaceInput({
    name: "Licencen túlnyúló tér",
    ownerLicenseId: "license-1",
    licenseEndsAt: "2026-12-01T00:00:00.000Z",
    accessExpiryMode: "fixed",
    accessEndsAt: "2027-01-01T00:00:00.000Z",
  }), /nem nyúlhat túl/);

  console.log(JSON.stringify({
    ok: true,
    version: "DROP 0.3.0-staged",
    roleCount: 5,
    permissionCount: permissionsForDropSpaceRole("owner").length,
    guestLicenseRequired: false,
    guestPackageCreationSupported: true,
    licenseAlwaysUpperLimit: true,
    projectDockLinkPrepared: true,
    driveArchivePrepared: true,
    databaseWritesPerformed: false,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
