import { dimproIdentityErrorResponse, dimproIdentityJson } from "@/app/lib/identity-core/api";
import { listDimproAllowedProjects } from "@/app/lib/identity-core/repository";
import {
  readBearerToken,
  verifyDimproSendSession,
} from "@/app/lib/identity-core/security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const claims = verifyDimproSendSession(readBearerToken(request.headers));
    const projects = await listDimproAllowedProjects(claims.entitlementId);
    return dimproIdentityJson({ ok: true, projects });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
