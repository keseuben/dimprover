import { dimproIdentityErrorResponse, dimproIdentityJson, readDimproIdentityJsonBody } from "@/app/lib/identity-core/api";
import { assertFieldCaptureSessionOwner, upsertFieldCaptureServerItem } from "@/app/lib/field-capture/serverRepository";
import { authorizeFieldCaptureRequest, parseFieldCaptureItemBody } from "@/app/lib/field-capture/serverService";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params;
    if (!UUID_RE.test(sessionId)) {
      throw new DimproIdentityError(
        "A szerveres terepi munkamenet-azonosító érvénytelen.",
        "FIELD_CAPTURE_SESSION_ID_INVALID",
        400,
      );
    }
    const authorized = await authorizeFieldCaptureRequest(request);
    await assertFieldCaptureSessionOwner({
      sessionId,
      userId: authorized.context.user.id,
      entitlementId: authorized.context.entitlement.id,
    });
    const input = parseFieldCaptureItemBody(await readDimproIdentityJsonBody(request));
    const item = await upsertFieldCaptureServerItem({
      sessionId,
      ...input,
    });
    return dimproIdentityJson({
      ok: true,
      version: "FIELD_CAPTURE_P7_V010",
      item,
      syncState: item.status,
    }, 201);
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
