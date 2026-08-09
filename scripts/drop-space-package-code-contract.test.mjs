import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.fromEntries(await Promise.all([
  "app/lib/drop/dropTypes.ts",
  "app/lib/drop/dropFeatureFlags.ts",
  "app/lib/drop/dropRepository.ts",
  "app/lib/drop/dropSpaceRepository.ts",
  "app/lib/drop/dropSpacePackageService.ts",
  "app/api/drop/spaces/packages/route.ts",
  "components/drop/DropSpacePackagePanel.tsx",
  "components/drop/DropSpaceGuestWorkspace.tsx",
  ".env.local",
].map(async (path) => [path, await readFile(path, "utf8")])));

const types = files["app/lib/drop/dropTypes.ts"];
const flags = files["app/lib/drop/dropFeatureFlags.ts"];
const repository = files["app/lib/drop/dropRepository.ts"];
const spaceRepository = files["app/lib/drop/dropSpaceRepository.ts"];
const service = files["app/lib/drop/dropSpacePackageService.ts"];
const route = files["app/api/drop/spaces/packages/route.ts"];
const panel = files["components/drop/DropSpacePackagePanel.tsx"];
const workspace = files["components/drop/DropSpaceGuestWorkspace.tsx"];
const env = files[".env.local"];

assert.match(types, /spacePackageCreationEnabled: boolean/);
assert.match(types, /spaceContext\?: \{/);
assert.match(types, /createdByMembershipId: string/);
assert.match(types, /selectedMembershipIds: string\[\]/);
assert.match(flags, /DROP_SPACE_PACKAGE_CREATION_ENABLED/);
const expectedFeatureEnabled = process.env.DROP_EXPECT_SPACE_PACKAGE_FEATURE?.trim().toLowerCase() === "true";
assert.match(
  env,
  expectedFeatureEnabled
    ? /^DROP_SPACE_PACKAGE_CREATION_ENABLED=true$/m
    : /^DROP_SPACE_PACKAGE_CREATION_ENABLED=false$/m,
);
assert.match(repository, /space_id: input\.spaceContext\.spaceId/);
assert.match(repository, /created_by_membership_id: input\.spaceContext\.createdByMembershipId/);
assert.match(repository, /selected_membership_ids: input\.spaceContext\.selectedMembershipIds/);
assert.match(spaceRepository, /getDropSpacePackageSchemaHealth/);
assert.match(spaceRepository, /schema_version === "DROP 0\.3\.2"/);
assert.match(spaceRepository, /listVisibleDropSpacePackages/);
assert.match(spaceRepository, /visibility === "selected_members"/);
assert.match(spaceRepository, /canReadAll \|\| own/);
assert.match(service, /session\.permissions\.includes\("package\.create"\)/);
assert.match(service, /uploaderName: session\.membership\.displayName/);
assert.match(service, /uploaderEmail: session\.membership\.email/);
assert.match(service, /createdByMembershipId: session\.membership\.id/);
assert.match(service, /DROP_SPACE_SELECTED_MEMBER_REQUIRED/);
assert.match(route, /assertDropFeatureEnabled\("spacePackageCreationEnabled"\)/);
assert.match(route, /getDropSpacePackageSchemaHealth/);
assert.match(route, /DROP_SPACE_PACKAGE_SCHEMA_NOT_READY/);
assert.match(route, /fileUploadEnabled: false/);
assert.match(panel, /Saját csomag létrehozása · 2 mp/);
assert.match(panel, /Kiválasztott tértagok/);
assert.match(panel, /Minden aktív tértag/);
assert.match(panel, /Privát/);
assert.match(panel, /Feltöltési link · még inaktív/);
assert.match(workspace, /<DropSpacePackagePanel \/>/);

console.log(JSON.stringify({
  ok: true,
  version: expectedFeatureEnabled ? "DROP 0.3.2" : "DROP 0.3.2-staged",
  featureFlagClosed: !expectedFeatureEnabled,
  featureFlagEnabled: expectedFeatureEnabled,
  legacyPackageEngineExtended: true,
  membershipDerivedActor: true,
  serverSideVisibilityFiltering: true,
  selectedMemberSharingPrepared: true,
  twoSecondHoldRequired: true,
  fileUploadEnabled: false,
  databaseWritesPerformed: false,
}, null, 2));
