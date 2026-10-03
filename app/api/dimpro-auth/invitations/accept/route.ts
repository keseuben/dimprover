import { NextRequest, NextResponse } from "next/server";
import { driveSsoConfigForEnvironment, resolveCentralDimproAuthEnvironmentFromHost } from "@/app/lib/dimpro-auth/client-config";
import { acceptProjectInvitation } from "@/app/lib/dimpro-auth/invitations";
import { recordAuthAuditEvent } from "@/app/lib/dimpro-auth/repository";
import { getDimproAuthRequestIp, getDimproAuthUserAgent, newDimproAuthCorrelationId, validateSameOriginMutation } from "@/app/lib/dimpro-auth/security";
import { DimproAuthError } from "@/app/lib/dimpro-auth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  const environment = resolveCentralDimproAuthEnvironmentFromHost(request.headers.get("host"));
  if (!environment) return NextResponse.json({ ok: false, error: "AUTH_HOST_NOT_ALLOWED", correlationId }, { status: 404, headers: { "cache-control": "no-store" } });
  if (!validateSameOriginMutation(request.headers)) return NextResponse.json({ ok: false, error: "AUTH_ORIGIN_DENIED", correlationId }, { status: 403, headers: { "cache-control": "no-store" } });
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  try {
    const accepted = await acceptProjectInvitation(token);
    await recordAuthAuditEvent({
      eventType: "PROJECT_INVITATION_ACCEPT",
      userId: accepted.userId,
      method: "DIMPRO_AUTH_INVITATION",
      result: "SUCCESS",
      ip: getDimproAuthRequestIp(request.headers),
      userAgent: getDimproAuthUserAgent(request.headers),
      correlationId,
      metadata: { invitationId: accepted.invitationId, projectId: accepted.projectId, roleCode: accepted.roleCode },
    });
    const drive = driveSsoConfigForEnvironment(environment);
    const nextUrl = new URL("/api/dimpro-auth/start", drive.redirectUri).origin + "/api/dimpro-auth/start?return_to=%2Fdrive";
    return NextResponse.json({ ok: true, accepted, nextUrl, correlationId }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DimproAuthError) return NextResponse.json({ ok: false, error: error.code, message: error.publicMessage, correlationId }, { status: error.status, headers: { "cache-control": "no-store" } });
    console.error("DIMPRO project invitation accept failed", correlationId, error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ ok: false, error: "AUTH_INVITATION_ACCEPT_FAILED", correlationId }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
