import { dimproIdentityErrorResponse, dimproIdentityJson } from "@/app/lib/identity-core/api";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { storeFieldCaptureItemInProjectContent } from "@/app/lib/field-capture/projectDriveService";
import { assertFieldCaptureSessionOwner } from "@/app/lib/field-capture/serverRepository";
import { authorizeFieldCaptureRequest } from "@/app/lib/field-capture/serverService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: { params: Promise<{ sessionId: string; itemId: string }> }) {
  try {
    const { sessionId, itemId } = await context.params;
    if (!UUID_RE.test(sessionId) || !UUID_RE.test(itemId)) {
      throw new DimproIdentityError(
        "A Projektkapu Drive content mentési azonosító érvénytelen.",
        "FIELD_CAPTURE_PROJECT_DRIVE_ID_INVALID",
        400,
      );
    }
    const authorized = await authorizeFieldCaptureRequest(request);
    const session = await assertFieldCaptureSessionOwner({
      sessionId,
      userId: authorized.context.user.id,
      entitlementId: authorized.context.entitlement.id,
    });
    const result = await storeFieldCaptureItemInProjectContent({
      session,
      itemId,
      userId: authorized.context.user.id,
      userEmail: authorized.context.user.email,
    });
    return dimproIdentityJson({
      ok: true,
      version: "FIELD_CAPTURE_P91_PROJECT_CONTENT_V010",
      stage: "P9.1",
      uiEnabled: false,
      ...result,
    });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
