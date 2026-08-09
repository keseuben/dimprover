import { dimproIdentityErrorResponse, dimproIdentityJson, readDimproIdentityJsonBody } from "@/app/lib/identity-core/api";
import { deactivateDimproSendContact, getDimproSendContextByEntitlementId, upsertDimproSendContact } from "@/app/lib/identity-core/repository";
import { readBearerToken, verifyDimproSendSession } from "@/app/lib/identity-core/security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const claims = verifyDimproSendSession(readBearerToken(request.headers));
    const context = await getDimproSendContextByEntitlementId(claims.entitlementId);
    return dimproIdentityJson({
      ok: true,
      contacts: context.recipients,
      editable: context.entitlement.recipientMode === "free_entry",
      maxSavedContacts: context.entitlement.maxSavedContacts,
    });
  } catch (error) { return dimproIdentityErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const claims = verifyDimproSendSession(readBearerToken(request.headers));
    const body = await readDimproIdentityJsonBody(request);
    const contact = await upsertDimproSendContact({
      entitlementId: claims.entitlementId,
      contactId: typeof body.contactId === "string" ? body.contactId : null,
      name: body.name,
      email: body.email,
      organizationName: body.organizationName,
      label: body.label,
    });
    return dimproIdentityJson({ ok: true, contact }, 201);
  } catch (error) { return dimproIdentityErrorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const claims = verifyDimproSendSession(readBearerToken(request.headers));
    const body = await readDimproIdentityJsonBody(request);
    const removed = await deactivateDimproSendContact(claims.entitlementId, String(body.contactId || ""));
    return dimproIdentityJson({ ok: true, removed });
  } catch (error) { return dimproIdentityErrorResponse(error); }
}
