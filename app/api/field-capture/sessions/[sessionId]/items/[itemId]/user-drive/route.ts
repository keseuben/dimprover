import { dimproIdentityErrorResponse, dimproIdentityJson } from "@/app/lib/identity-core/api";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { assertFieldCaptureSessionOwner } from "@/app/lib/field-capture/serverRepository";
import { authorizeFieldCaptureRequest } from "@/app/lib/field-capture/serverService";
import { storeFieldCaptureItemInUserDrive } from "@/app/lib/field-capture/userDriveService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: { params: Promise<{ sessionId: string; itemId: string }> }) {
  try {
    const { sessionId, itemId } = await context.params;
    if (!UUID_RE.test(sessionId) || !UUID_RE.test(itemId)) {
      throw new DimproIdentityError("A Saját Drive mentési azonosító érvénytelen.", "FIELD_CAPTURE_USER_DRIVE_ID_INVALID", 400);
    }
    const authorized = await authorizeFieldCaptureRequest(request);
    const session = await assertFieldCaptureSessionOwner({
      sessionId,
      userId: authorized.context.user.id,
      entitlementId: authorized.context.entitlement.id,
    });
    const result = await storeFieldCaptureItemInUserDrive({
      session,
      itemId,
      userId: authorized.context.user.id,
    });
    return dimproIdentityJson({ ok: true, version: "FIELD_CAPTURE_P8_USER_DRIVE_V010", ...result });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
