import { type NextRequest, NextResponse } from "next/server";
import { getDimproSendContextByEntitlementId } from "@/app/lib/identity-core/repository";
import { verifyDimproSendSession } from "@/app/lib/identity-core/security";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { createDropPublicSession } from "@/app/lib/drop/public/dropPublicRepository";
import { dropPublicSessionCookie } from "@/app/lib/drop/public/dropPublicSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertDropFeatureEnabled("sendEnabled");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Érvénytelen DIMPRO Send munkamenetkérés.", code: "DROP_SEND_SESSION_INPUT_INVALID" },
        { status: 400, headers: dropNoStoreHeaders() },
      );
    }
    if (body.website) {
      return NextResponse.json(
        { ok: false, error: "A robotvédelmi ellenőrzés sikertelen.", code: "DROP_PUBLIC_HONEYPOT_BLOCKED" },
        { status: 403, headers: dropNoStoreHeaders() },
      );
    }

    const claims = verifyDimproSendSession(body.sendSessionToken);
    const context = await getDimproSendContextByEntitlementId(claims.entitlementId);
    if (!context.entitlement.canUseStandardSend && !context.entitlement.canUseQuickImageSend) {
      return NextResponse.json(
        { ok: false, error: "A DIMPRO Send-jogosultság nem használható.", code: "DROP_SEND_ENTITLEMENT_NOT_ALLOWED" },
        { status: 403, headers: dropNoStoreHeaders() },
      );
    }

    const session = await createDropPublicSession({
      workflowType: "send",
      dimproSendEntitlementId: context.entitlement.id,
      headers: request.headers,
    });
    const response = NextResponse.json({
      ok: true,
      version: "DROP 1.2.12",
      session: {
        expiresAt: session.record.expiresAt,
        maxRecipients: context.entitlement.maxRecipients,
        defaultRetentionDays: 5,
        identityCore: true,
      },
      entitlementId: context.entitlement.id,
    }, { status: 201, headers: dropNoStoreHeaders() });
    response.cookies.set(dropPublicSessionCookie(session.rawToken, session.record.expiresAt));
    return response;
  } catch (error) {
    return dropErrorResponse(error);
  }
}
