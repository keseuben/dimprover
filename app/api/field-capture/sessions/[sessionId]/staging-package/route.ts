import { dimproIdentityErrorResponse, dimproIdentityJson } from "@/app/lib/identity-core/api";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { assertFieldCaptureSessionOwner } from "@/app/lib/field-capture/serverRepository";
import { authorizeFieldCaptureRequest } from "@/app/lib/field-capture/serverService";
import { ensureFieldCaptureStagingPackage } from "@/app/lib/field-capture/stagingPackageService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params;
    if (!UUID_RE.test(sessionId)) {
      throw new DimproIdentityError(
        "A terepi staging munkamenet-azonosító érvénytelen.",
        "FIELD_CAPTURE_STAGING_SESSION_ID_INVALID",
        400,
      );
    }
    const authorized = await authorizeFieldCaptureRequest(request);
    const session = await assertFieldCaptureSessionOwner({
      sessionId,
      userId: authorized.context.user.id,
      entitlementId: authorized.context.entitlement.id,
    });
    const staging = await ensureFieldCaptureStagingPackage({ session, context: authorized.context });
    return dimproIdentityJson({
      ok: true,
      version: "FIELD_CAPTURE_STAGING_V010",
      staging,
    }, staging.reused ? 200 : 201);
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
