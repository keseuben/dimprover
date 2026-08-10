import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import {
  createDimproSendEntitlementAdmin,
  createDimproSendUserAdmin,
  getDimproSendAdminOverview,
  getDimproSendCodeDeliveryContextAdmin,
  linkLegacySendCodeAdmin,
  recordDimproSendCodeDeliveryAuditAdmin,
  rotateDimproSendEntitlementCodeAdmin,
  setDimproSendEntitlementStatusAdmin,
} from "@/app/lib/identity-core/admin";
import {
  dimproIdentityErrorResponse,
  dimproIdentityJson,
  readDimproIdentityJsonBody,
} from "@/app/lib/identity-core/api";
import { sendDimproSendCodeEmail } from "@/app/lib/identity-core/send-code-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return dimproIdentityJson({
    ok: false,
    error: "Nincs jogosultság a DIMPRO Send entitlementek kezeléséhez.",
    code: "DIMPRO_IDENTITY_ADMIN_UNAUTHORIZED",
  }, 401);
}

type DeliveryContext = Awaited<ReturnType<typeof getDimproSendCodeDeliveryContextAdmin>>;

async function deliverSendCode(context: DeliveryContext, rawCode: string, trigger: "created" | "rotated") {
  let emailDelivery: { sent: boolean; to: string; messageId?: string; error?: string; auditError?: string } = {
    sent: false,
    to: context.recipientEmail,
  };
  try {
    const sent = await sendDimproSendCodeEmail({
      recipientName: context.recipientName,
      recipientEmail: context.recipientEmail,
      organizationName: context.organizationName,
      sendCode: rawCode,
      expiresAt: context.expiresAt,
      canUseStandardSend: context.canUseStandardSend,
      canUseQuickImageSend: context.canUseQuickImageSend,
      canUseProjectDrop: context.canUseProjectDrop,
    });
    emailDelivery = { sent: true, to: context.recipientEmail, messageId: sent.messageId };
  } catch (error) {
    emailDelivery = {
      sent: false,
      to: context.recipientEmail,
      error: error instanceof Error ? error.message : "A Send-kód e-mail küldése ismeretlen okból sikertelen.",
    };
  }
  try {
    await recordDimproSendCodeDeliveryAuditAdmin({
      entitlementId: context.entitlementId,
      userId: context.userId,
      licenseId: context.licenseId,
      sent: emailDelivery.sent,
      messageId: emailDelivery.messageId,
      error: emailDelivery.error,
      trigger,
    });
  } catch (auditError) {
    emailDelivery.auditError = auditError instanceof Error ? auditError.message : "A kézbesítési audit nem írható.";
  }
  return emailDelivery;
}

export async function GET(request: Request) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    return dimproIdentityJson({
      ok: true,
      version: "IDENTITY CORE 0.2.2",
      ...(await getDimproSendAdminOverview()),
    });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const body = await readDimproIdentityJsonBody(request);
    if (body.action === "linkLegacy") {
      return dimproIdentityJson({
        ok: true,
        version: "IDENTITY CORE 0.2.2",
        linked: await linkLegacySendCodeAdmin(body),
      });
    }
    if (body.action === "createUser") {
      return dimproIdentityJson({
        ok: true,
        version: "IDENTITY CORE 0.2.2",
        created: await createDimproSendUserAdmin(body),
      }, 201);
    }
    if (body.action === "rotateCode") {
      const rotated = await rotateDimproSendEntitlementCodeAdmin(body);
      const emailDelivery = await deliverSendCode(rotated, rotated.rawCode, "rotated");
      return dimproIdentityJson({
        ok: true,
        version: "IDENTITY CORE 0.2.2",
        rotated,
        emailDelivery,
      });
    }
    const created = await createDimproSendEntitlementAdmin(body);
    if (!created.entitlementId) {
      return dimproIdentityJson({
        ok: true,
        version: "IDENTITY CORE 0.2.2",
        created,
        emailDelivery: { sent: false, error: "A Send entitlement létrejött, de a kézbesítéshez szükséges azonosító hiányzik." },
      }, 201);
    }
    const context = await getDimproSendCodeDeliveryContextAdmin(created.entitlementId);
    const emailDelivery = await deliverSendCode(context, created.rawCode, "created");
    return dimproIdentityJson({
      ok: true,
      version: "IDENTITY CORE 0.2.2",
      created,
      emailDelivery,
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
      version: "IDENTITY CORE 0.2.2",
      entitlement: await setDimproSendEntitlementStatusAdmin(body),
    });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
