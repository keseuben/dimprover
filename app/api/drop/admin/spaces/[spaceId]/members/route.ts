import { type NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import {
  inviteDropSpaceMember,
  listDropSpaceMemberships,
  listDropSpaces,
  type DropInviteSpaceMemberInput,
} from "@/app/lib/drop/dropSpaceRepository";
import { sendDropSpaceInvitationEmail } from "@/app/lib/drop/dropSpaceEmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ spaceId: string }>;
};

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Nincs jogosultság a Drop tér tagságainak kezeléséhez.", code: "DROP_SPACE_ADMIN_UNAUTHORIZED" },
    { status: 401, headers: dropNoStoreHeaders() },
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const { spaceId } = await context.params;
    const members = await listDropSpaceMemberships(spaceId);
    return NextResponse.json(
      { ok: true, version: "DROP 0.3.1", members },
      { headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const { spaceId } = await context.params;
    const body = await request.json().catch(() => null) as DropInviteSpaceMemberInput | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Érvénytelen Drop tér meghívási kérés.", code: "DROP_SPACE_INVITATION_INPUT_INVALID" },
        { status: 400, headers: dropNoStoreHeaders() },
      );
    }

    const invitation = await inviteDropSpaceMember(spaceId, body);
    const [members, spaces] = await Promise.all([
      listDropSpaceMemberships(spaceId),
      listDropSpaces(100),
    ]);
    const owner = members.find((member) => member.role === "owner") || null;
    const spaceListItem = spaces.find((space) => space.id === spaceId) || null;

    const emailDelivery = await sendDropSpaceInvitationEmail({
      spaceName: invitation.space.name,
      spaceCode: invitation.space.publicCode,
      recipientName: invitation.membership.displayName,
      recipientEmail: invitation.membership.email,
      recipientRole: invitation.membership.role,
      invitationLink: invitation.invitationLink,
      invitationExpiresAt: invitation.invitationExpiresAt,
      accessEndsAt: invitation.membership.accessEndsAt || invitation.space.licenseEndsAt,
      ownerName: owner?.displayName || "DIMPRO térgazda",
      ownerEmail: owner?.email || null,
      projectNames: spaceListItem?.projects.map((project) => project.projectNameSnapshot) || [],
    }).then((sent) => ({
      sent: true,
      messageId: sent.messageId,
      profileId: sent.profileId,
      error: null,
    })).catch((error) => ({
      sent: false,
      messageId: null,
      profileId: "drop",
      error: error instanceof Error ? error.message : "A térmeghívó e-mail küldése sikertelen.",
    }));

    return NextResponse.json(
      {
        ok: true,
        version: "DROP 0.3.1",
        invitation: {
          membership: invitation.membership,
          invitationLink: invitation.invitationLink,
          invitationExpiresAt: invitation.invitationExpiresAt,
          rolePermissions: invitation.rolePermissions,
          guestLicenseRequired: invitation.guestLicenseRequired,
        },
        emailDelivery,
        note: emailDelivery.sent
          ? "A Drop tér tagsági meghívó elkészült és az e-mailt elküldtük."
          : "A tagsági meghívó elkészült, de az e-mail küldése sikertelen. Az egyszer megjelenő link kézzel átadható.",
      },
      { status: 201, headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
