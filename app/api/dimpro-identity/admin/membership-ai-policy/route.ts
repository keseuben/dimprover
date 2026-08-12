import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { updateDimproMembershipAiPolicyAdmin } from "@/app/lib/identity-core/admin";
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
    error: "Nincs jogosultság a felhasználói AI-policy kezeléséhez.",
    code: "DIMPRO_AI_MEMBER_POLICY_ADMIN_UNAUTHORIZED",
  }, 401);
}

export async function PATCH(request: Request) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const body = await readDimproIdentityJsonBody(request);
    return dimproIdentityJson({
      ok: true,
      version: "IDENTITY CORE 0.2.0",
      membershipAiPolicy: await updateDimproMembershipAiPolicyAdmin(body),
    });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
