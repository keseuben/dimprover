import { dimproIdentityErrorResponse, dimproIdentityJson, readDimproIdentityJsonBody } from "@/app/lib/identity-core/api";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { finalizeFieldCaptureServerSession } from "@/app/lib/field-capture/serverRepository";
import { authorizeFieldCaptureRequest } from "@/app/lib/field-capture/serverService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params;
    if (!UUID_RE.test(sessionId)) {
      throw new DimproIdentityError(
        "A lezárandó terepi munkamenet-azonosító érvénytelen.",
        "FIELD_CAPTURE_FINALIZE_SESSION_ID_INVALID",
        400,
      );
    }
    const authorized = await authorizeFieldCaptureRequest(request);
    const body = await readDimproIdentityJsonBody(request);
    const expectedItemCount = Number(body.expectedItemCount);
    const result = await finalizeFieldCaptureServerSession({
      sessionId,
      userId: authorized.context.user.id,
      entitlementId: authorized.context.entitlement.id,
      expectedItemCount,
    });
    return dimproIdentityJson({
      ok: true,
      version: "FIELD_CAPTURE_FINALIZE_V010",
      finalized: true,
      ...result,
    });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
