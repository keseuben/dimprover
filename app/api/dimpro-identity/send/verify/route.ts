import {
  dimproIdentityErrorResponse,
  dimproIdentityJson,
  readDimproIdentityJsonBody,
} from "@/app/lib/identity-core/api";
import {
  getDimproSendContextByEntitlementId,
  verifyDimproSendEntitlement,
} from "@/app/lib/identity-core/repository";
import {
  createDimproSendSession,
  normalizeDimproSendCode,
} from "@/app/lib/identity-core/security";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const body = await readDimproIdentityJsonBody(request);
    const code = normalizeDimproSendCode(body.code);
    if (!code) {
      throw new DimproIdentityError(
        "A DIMPRO Send küldési jogosultságkód formátuma érvénytelen.",
        "DIMPRO_SEND_CODE_INVALID",
        400,
      );
    }

    const result = await verifyDimproSendEntitlement(code, request.headers);
    if (!result.ok) return dimproIdentityJson(result, 403);

    const [sendSession, context] = await Promise.all([
      Promise.resolve(createDimproSendSession(result.entitlement.id)),
      getDimproSendContextByEntitlementId(result.entitlement.id),
    ]);
    return dimproIdentityJson({
      ...result,
      user: context.user,
      entitlement: context.entitlement,
      defaultRecipient: context.defaultRecipient,
      approvedRecipients: context.recipients,
      projects: context.projects,
      sendSession,
    });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
