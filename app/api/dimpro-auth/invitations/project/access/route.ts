import { NextRequest, NextResponse } from "next/server";
import { resolveDriveSsoConfig } from "@/app/lib/dimpro-auth/client-config";
import { revokeProjectAccess } from "@/app/lib/dimpro-auth/invitations";
import { getAppSessionByToken, recordAuthAuditEvent } from "@/app/lib/dimpro-auth/repository";
import { newDimproAuthCorrelationId, validateSameOriginMutation } from "@/app/lib/dimpro-auth/security";
import { DIMPRO_APP_SESSION_COOKIE } from "@/app/lib/dimpro-auth/sso";
import { DimproAuthError } from "@/app/lib/dimpro-auth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function uuid(value: unknown) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text) ? text : "";
}

export async function DELETE(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!validateSameOriginMutation(request.headers)) {
    return NextResponse.json({ ok: false, error: "AUTH_ORIGIN_DENIED", correlationId }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  const config = resolveDriveSsoConfig(request.headers.get("host"));
  if (!config) return NextResponse.json({ ok: false, error: "AUTH_HOST_NOT_ALLOWED", correlationId }, { status: 404, headers: { "cache-control": "no-store" } });
  const token = request.cookies.get(DIMPRO_APP_SESSION_COOKIE)?.value?.trim() || "";
  const session = token ? await getAppSessionByToken(token, config.clientId, true).catch(() => null) : null;
  if (!session) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED", correlationId }, { status: 401, headers: { "cache-control": "no-store" } });

  const body = await request.json().catch(() => null) as { userId?: unknown; projectId?: unknown } | null;
  const userId = uuid(body?.userId);
  const projectId = uuid(body?.projectId);
  if (!userId || !projectId) return NextResponse.json({ ok: false, error: "AUTH_PROJECT_ACCESS_INPUT_INVALID", correlationId }, { status: 400, headers: { "cache-control": "no-store" } });

  try {
    const revokedCount = await revokeProjectAccess(session.user.id, userId, projectId);
    await recordAuthAuditEvent({
      eventType: "PROJECT_ACCESS_REVOKE",
      userId: session.user.id,
      method: "DIMPRO_AUTH_SCOPE",
      result: revokedCount > 0 ? "SUCCESS" : "NOOP",
      correlationId,
      metadata: { targetUserId: userId, projectId, revokedCount },
    });
    return NextResponse.json({ ok: true, revokedCount, correlationId }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DimproAuthError) return NextResponse.json({ ok: false, error: error.code, message: error.publicMessage, correlationId }, { status: error.status, headers: { "cache-control": "no-store" } });
    return NextResponse.json({ ok: false, error: "AUTH_PROJECT_ACCESS_REVOKE_FAILED", correlationId }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
