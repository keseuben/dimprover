import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import {
  createDimproOrganizationInvitationAdmin,
  getDimproOrganizationInvitation,
  revokeDimproOrganizationInvitationAdmin,
} from "@/app/lib/identity-core/invitations";
import { sendDimproOrganizationInvitationEmail } from "@/app/lib/identity-core/invitation-email";
import {
  dimproIdentityErrorResponse,
  dimproIdentityJson,
  readDimproIdentityJsonBody,
} from "@/app/lib/identity-core/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return dimproIdentityJson({
    ok: false,
    error: "Nincs jogosultság a szervezeti meghívások kezeléséhez.",
    code: "DIMPRO_ORGANIZATION_INVITATION_ADMIN_UNAUTHORIZED",
  }, 401);
}

function appOrigin(request: Request) {
  const host = new URL(request.url).hostname.toLowerCase();
  if (host.endsWith(".dev.dimpro.hu") || host === "dev.dimpro.hu") return "https://app.dev.dimpro.hu";
  const configured = process.env.DIMPRO_APP_ORIGIN?.trim();
  return configured && /^https:\/\//i.test(configured) ? configured.replace(/\/+$/, "") : "https://app.dimpro.hu";
}

export async function POST(request: Request) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const body = await readDimproIdentityJsonBody(request);
    const created = await createDimproOrganizationInvitationAdmin(body);
    const invitationUrl = `${appOrigin(request)}/account/meghivas?token=${encodeURIComponent(created.rawToken)}`;
    const preview = await getDimproOrganizationInvitation(created.rawToken);
    let emailDelivery: { sent: boolean; messageId?: string; error?: string } = { sent: false };
    try {
      const sent = await sendDimproOrganizationInvitationEmail({
        recipientName: preview.fullName,
        recipientEmail: preview.email,
        organizationName: preview.organization.name,
        roleLabel: preview.roleLabel || preview.roleCode,
        invitationUrl,
        expiresAt: preview.expiresAt,
        moduleCodes: preview.moduleCodes,
      });
      emailDelivery = { sent: true, messageId: sent.messageId };
    } catch (error) {
      emailDelivery = {
        sent: false,
        error: error instanceof Error ? error.message : "A meghívó e-mail küldése sikertelen.",
      };
    }
    return dimproIdentityJson({
      ok: true,
      version: "IDENTITY CORE 0.2.0",
      invitation: created.invitation,
      invitationUrl,
      seatUsage: created.seatUsage,
      emailDelivery,
      note: emailDelivery.sent
        ? "A szervezeti meghívó elkészült és az e-mailt elküldtük."
        : "A meghívó elkészült, de az e-mail nem ment ki. Az egyszer megjelenő meghívólink kézzel átadható.",
    }, 201);
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const body = await readDimproIdentityJsonBody(request);
    return dimproIdentityJson({
      ok: true,
      version: "IDENTITY CORE 0.2.0",
      invitation: await revokeDimproOrganizationInvitationAdmin(body.invitationId),
    });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
