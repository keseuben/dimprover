import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import {
  createDimproSendEntitlementAdmin,
  createDimproSendUserAdmin,
  getDimproSendAdminOverview,
  linkLegacySendCodeAdmin,
  setDimproSendEntitlementStatusAdmin,
} from "@/app/lib/identity-core/admin";
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
    error: "Nincs jogosultság a DIMPRO Send entitlementek kezeléséhez.",
    code: "DIMPRO_IDENTITY_ADMIN_UNAUTHORIZED",
  }, 401);
}

export async function GET(request: Request) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    return dimproIdentityJson({
      ok: true,
      version: "IDENTITY CORE 0.1.0",
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
        linked: await linkLegacySendCodeAdmin(body),
      });
    }
    if (body.action === "createUser") {
      return dimproIdentityJson({
        ok: true,
        version: "IDENTITY CORE 0.1.0",
        created: await createDimproSendUserAdmin(body),
      }, 201);
    }
    const created = await createDimproSendEntitlementAdmin(body);
    return dimproIdentityJson({
      ok: true,
      version: "IDENTITY CORE 0.1.0",
      created,
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
      entitlement: await setDimproSendEntitlementStatusAdmin(body),
    });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
