import { dimproIdentityErrorResponse, dimproIdentityJson, readDimproIdentityJsonBody } from "@/app/lib/identity-core/api";
import { upsertFieldCaptureServerSession } from "@/app/lib/field-capture/serverRepository";
import {
  authorizeFieldCaptureRequest,
  parseFieldCaptureSessionBody,
  resolveAuthorizedProjectCoreId,
} from "@/app/lib/field-capture/serverService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { context } = await authorizeFieldCaptureRequest(request);
    const input = parseFieldCaptureSessionBody(await readDimproIdentityJsonBody(request));
    const projectCoreId = await resolveAuthorizedProjectCoreId(context, input.projectId);
    const session = await upsertFieldCaptureServerSession({
      clientSessionId: input.clientSessionId,
      userId: context.user.id,
      entitlementId: context.entitlement.id,
      projectCoreId,
      defaults: input.defaults,
    });
    return dimproIdentityJson({
      ok: true,
      version: "FIELD_CAPTURE_P7_V010",
      session,
    }, 201);
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
