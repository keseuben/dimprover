import {
  dimproIdentityErrorResponse,
  dimproIdentityJson,
  readDimproIdentityJsonBody,
} from "@/app/lib/identity-core/api";
import { verifyDimproProjectCode } from "@/app/lib/identity-core/repository";
import {
  normalizeDimproProjectCode,
  readBearerToken,
  verifyDimproSendSession,
} from "@/app/lib/identity-core/security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const claims = verifyDimproSendSession(readBearerToken(request.headers));
    const body = await readDimproIdentityJsonBody(request);
    const projectCode = normalizeDimproProjectCode(body.projectCode);
    if (!projectCode) {
      return dimproIdentityJson({ ok: false, error: "A projektkód nem használható." }, 403);
    }
    const result = await verifyDimproProjectCode(
      claims.entitlementId,
      projectCode,
      request.headers,
    );
    return dimproIdentityJson(result, result.ok ? 200 : 403);
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
