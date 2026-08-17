import { type NextRequest, NextResponse } from "next/server";
import { validateDropAccessToken } from "@/app/lib/drop/dropAccess";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { createDropRobotAuthFingerprint, issueDropUploadIntents } from "@/app/lib/drop/robot/dropRobotGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bearer(headers: Headers) {
  const match = (headers.get("authorization") || "").trim().match(/^Bearer\s+([^\s]{20,1200})$/i);
  if (!match) throw Object.assign(new Error("Hiányzó feltöltési capability-token."), { code: "DROP_UPLOAD_CAPABILITY_MISSING", status: 401 });
  return match[1];
}

export async function POST(request: NextRequest) {
  try {
    const rawToken = bearer(request.headers);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const grant = await validateDropAccessToken({ rawToken, expectedPurpose: "upload", headers: request.headers });
    const issued = await issueDropUploadIntents({
      packageId: grant.packageId,
      authorizationMode: "capability_token",
      authFingerprint: createDropRobotAuthFingerprint("capability_token", rawToken),
      headers: request.headers,
      count: Number(body?.count || 1),
    });
    return NextResponse.json({ ok: true, version: "DROP 1.2.13", ...issued }, { status: 201, headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}
