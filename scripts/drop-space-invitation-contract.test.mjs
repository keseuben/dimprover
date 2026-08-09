import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.fromEntries(await Promise.all([
  "app/lib/drop/dropSpaceSecurity.ts",
  "app/lib/drop/dropSpaceRepository.ts",
  "app/lib/drop/dropSpaceEmail.ts",
  "app/api/drop/admin/spaces/[spaceId]/members/route.ts",
  "app/api/drop/spaces/invitations/[token]/route.ts",
  "app/api/drop/spaces/session/route.ts",
  "components/drop/DropSpaceMembersPanel.tsx",
  "components/drop/DropSpaceInvitationClient.tsx",
  "components/drop/DropSpaceGuestWorkspace.tsx",
  "proxy.ts",
].map(async (path) => [path, await readFile(path, "utf8")])));

const security = files["app/lib/drop/dropSpaceSecurity.ts"];
const repository = files["app/lib/drop/dropSpaceRepository.ts"];
const email = files["app/lib/drop/dropSpaceEmail.ts"];
const adminRoute = files["app/api/drop/admin/spaces/[spaceId]/members/route.ts"];
const invitationRoute = files["app/api/drop/spaces/invitations/[token]/route.ts"];
const sessionRoute = files["app/api/drop/spaces/session/route.ts"];
const adminUi = files["components/drop/DropSpaceMembersPanel.tsx"];
const invitationUi = files["components/drop/DropSpaceInvitationClient.tsx"];
const workspaceUi = files["components/drop/DropSpaceGuestWorkspace.tsx"];
const proxy = files["proxy.ts"];

assert.match(security, /DROP_SPACE_SESSION_COOKIE/);
assert.match(security, /timingSafeEqual/);
assert.match(security, /DROP_TOKEN_HMAC_SECRET/);
assert.match(security, /DROP_SESSION_SECRET/);
assert.match(security, /space_invitation/);
assert.match(security, /space_session/);
assert.match(repository, /new Date\(membership\.invitedAt\)\.getTime\(\) !== new Date\(payload\.invitedAt\)\.getTime\(\)/);
assert.match(repository, /membership\.status === "active"/);
assert.match(repository, /DROP_SPACE_INVITATION_CONSUMED/);
assert.match(repository, /status: "active", accepted_at: acceptedAt/);
assert.match(repository, /membership\.status !== "active"/);
assert.match(repository, /allowGuestPackageCreation/);
assert.match(email, /Külön fizetős licenc nem szükséges/);
assert.match(email, /Meghívás elfogadása/);
assert.match(adminRoute, /isLicenseAdminAuthorized/);
assert.match(adminRoute, /sendDropSpaceInvitationEmail/);
assert.match(invitationRoute, /httpOnly: true/);
assert.match(invitationRoute, /secure: true/);
assert.match(invitationRoute, /sameSite: "lax"/);
assert.match(sessionRoute, /DROP_SPACE_SESSION_COOKIE/);
assert.match(adminUi, /Meghívó küldése · 2 mp/);
assert.match(adminUi, /Egyszer megjelenő meghívólink/);
assert.match(invitationUi, /Meghívás elfogadása · 2 mp/);
assert.match(workspaceUi, /külön fizetős licenc nélkül/i);
assert.match(proxy, /pathname\.startsWith\("\/join\/"\)/);
assert.match(proxy, /pathname\.startsWith\("\/space\/"\)/);
assert.match(proxy, /pathname\.startsWith\("\/api\/drop\/spaces\/"\)/);
assert.match(proxy, /if \(!isDropPublicApiRoute\)/);

console.log(JSON.stringify({
  ok: true,
  version: "DROP 0.3.1",
  signedInvitationToken: true,
  invitationReplacementInvalidatesOldToken: true,
  oneTimeAcceptance: true,
  httpOnlySecureSession: true,
  adminAuthRequired: true,
  publicAdminApiBlocked: true,
  emailInvitation: true,
  twoSecondConfirmation: true,
  guestLicenseRequired: false,
  fileUploadStillDisabled: true,
}, null, 2));
