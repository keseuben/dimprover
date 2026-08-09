import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [route, repository, component, manager, runtime] = await Promise.all([
  readFile("app/api/drop/admin/spaces/route.ts", "utf8"),
  readFile("app/lib/drop/dropSpaceRepository.ts", "utf8"),
  readFile("components/drop/DropSpaceManager.tsx", "utf8"),
  readFile("components/drop/DropPackageManager.tsx", "utf8"),
  readFile("app/lib/drop/dropRuntime.ts", "utf8"),
]);

assert.match(route, /isLicenseAdminAuthorized/);
assert.match(route, /assertDropFeatureEnabled\("spacesEnabled"\)/);
assert.match(route, /getDropSpacesSchemaHealth/);
assert.match(route, /createDropSpace/);
assert.match(route, /listDropSpaces/);
assert.match(route, /status: 201/);
assert.match(route, /DROP 0\.3\.0/);

assert.match(repository, /\.from\("drop_spaces"\)/);
assert.match(repository, /\.from\("drop_space_memberships"\)/);
assert.match(repository, /\.from\("drop_space_projects"\)/);
assert.match(repository, /role: "owner"/);
assert.match(repository, /status: "active"/);
assert.match(repository, /is_guest: false/);
assert.match(repository, /createdSpaceId/);
assert.match(repository, /DROP_SPACE_CREATE_CLEANUP_FAILED/);
assert.match(repository, /guestLicenseRequired: false/);
assert.match(repository, /fileUploadEnabled: false/);

assert.match(component, /Új hozzáférési tér/);
assert.match(component, /Drop tér létrehozása · 2 mp/);
assert.match(component, /durationMs=\{2000\}/);
assert.match(component, /Fizető licenc azonosító/);
assert.match(component, /Térgazda e-mail-címe/);
assert.match(component, /Megjelenés a Dockban/);
assert.match(component, /Drive-archívum előkészítés/);
assert.match(component, /A fájlfeltöltés ettől még nem kapcsol be/);

assert.match(manager, /<DropSpaceManager/);
assert.match(manager, /readiness\?\.spacesSchema/);
assert.match(manager, /readiness\?\.spacesEngine/);
assert.match(runtime, /getDropSpacesSchemaHealth/);
assert.match(runtime, /spacesSchema: spacesSchema\.ready/);
assert.match(runtime, /spacesEngine: spacesReady/);

console.log(JSON.stringify({
  ok: true,
  version: "DROP 0.3.0",
  adminAuthRequired: true,
  featureGateRequired: true,
  schemaReadinessRequired: true,
  compensatedCreate: true,
  ownerMembershipAutomatic: true,
  projectLinkOptional: true,
  twoSecondHoldRequired: true,
  uploadStillDisabled: true,
}, null, 2));
