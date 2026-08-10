import { type NextRequest, NextResponse } from "next/server";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import {
  acceptDropSpaceInvitation,
  listDropSpaceMemberships,
  listDropSpaces,
  resolveDropSpaceInvitation,
} from "@/app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "@/app/lib/drop/dropSpaceSecurity";
import {
  getDropSpaceRoleLabel,
  sendDropSpaceAcceptanceEmail,
} from "@/app/lib/drop/dropSpaceEmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ token: string }>;
};

function safeInvitation(context: Awaited<ReturnType<typeof resolveDropSpaceInvitation>>) {
  return {
    space: {
      publicCode: context.space.publicCode,
      name: context.space.name,
      description: context.space.description,
      status: context.space.status,
    },
    membership: {
      displayName: context.membership.displayName,
      email: context.membership.email,
      organizationName: context.membership.organizationName,
      role: context.membership.role,
      roleLabel: getDropSpaceRoleLabel(context.membership.role),
    },
    rolePermissions: context.rolePermissions,
    effectiveAccessEndsAt: context.effectiveAccessEndsAt,
    invitationExpiresAt: context.invitationExpiresAt,
    guestLicenseRequired: false,
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const { token } = await context.params;
    const invitation = await resolveDropSpaceInvitation(token);
    return NextResponse.json(
      { ok: true, version: "DROP 1.2.12", invitation: safeInvitation(invitation) },
      { headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const { token } = await context.params;
    const accepted = await acceptDropSpaceInvitation(token);
    const [spaces, memberships] = await Promise.all([
      listDropSpaces(200),
      listDropSpaceMemberships(accepted.space.id),
    ]);
    const spaceItem = spaces.find((item) => item.id === accepted.space.id) || null;
    const owner = memberships.find((item) => item.role === "owner") || null;
    const publicBase = (process.env.DROP_PUBLIC_BASE_URL || "https://drop.dimpro.hu").replace(/\/$/, "");
    const emailDelivery = await sendDropSpaceAcceptanceEmail({
      spaceName: accepted.space.name,
      spaceCode: accepted.space.publicCode,
      recipientName: accepted.membership.displayName,
      recipientEmail: accepted.membership.email,
      recipientRole: accepted.membership.role,
      accessEndsAt: accepted.effectiveAccessEndsAt,
      spaceUrl: `${publicBase}${accepted.redirectPath}`,
      ownerEmail: owner?.email || null,
      projectNames: spaceItem?.projects.map((project) => project.projectNameSnapshot) || [],
    }).then((sent) => ({ sent: true, messageId: sent.messageId, profileId: sent.profileId, error: null }))
      .catch((error) => ({
        sent: false,
        messageId: null,
        profileId: "drop",
        error: error instanceof Error ? error.message : "Az elfogadási visszaigazoló e-mail küldése sikertelen.",
      }));
    const maxAge = Math.max(1, Math.floor((new Date(accepted.sessionExpiresAt).getTime() - Date.now()) / 1000));
    const response = NextResponse.json(
      {
        ok: true,
        version: "DROP 1.2.12",
        accepted: {
          ...safeInvitation(accepted),
          acceptedAt: accepted.acceptedAt,
          sessionExpiresAt: accepted.sessionExpiresAt,
          redirectPath: accepted.redirectPath,
        },
        emailDelivery,
      },
      { status: 200, headers: dropNoStoreHeaders() },
    );
    response.cookies.set(DROP_SPACE_SESSION_COOKIE, accepted.sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge,
      priority: "high",
    });
    return response;
  } catch (error) {
    return dropErrorResponse(error);
  }
}
