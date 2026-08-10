import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import {
  createDimproLicenseAdmin,
  getDimproLicenseCenterOverview,
  updateDimproLicenseAdmin,
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
    error: "Nincs jogosultság a DIMPRO Licencközpont használatához.",
    code: "DIMPRO_LICENSE_CENTER_UNAUTHORIZED",
  }, 401);
}

export async function GET(request: Request) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    return dimproIdentityJson({
      ok: true,
      version: "LICENSE CENTER 0.3.0",
      identityCoreVersion: "0.2.0",
      ...(await getDimproLicenseCenterOverview()),
    });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const body = await readDimproIdentityJsonBody(request);
    return dimproIdentityJson({
      ok: true,
      license: await createDimproLicenseAdmin(body),
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
      license: await updateDimproLicenseAdmin(body),
    });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
