import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { resolveDropSpaceSession } from "@/app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "@/app/lib/drop/dropSpaceSecurity";
import { assertDropSpacePackageUploadAccess } from "@/app/lib/drop/storage/dropUploadService";
import { createDropRobotAuthFingerprint, issueDropUploadIntents } from "@/app/lib/drop/robot/dropRobotGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ packageId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const rawSession = request.cookies.get(DROP_SPACE_SESSION_COOKIE)?.value?.trim();
    if (!rawSession) throw Object.assign(new Error("Nincs aktív Drop tér munkamenet."), { code: "DROP_SPACE_SESSION_MISSING", status: 401 });
    const [{ packageId }, session, body] = await Promise.all([context.params, resolveDropSpaceSession(rawSession), request.json().catch(() => null) as Promise<Record<string, unknown> | null>]);
    await assertDropSpacePackageUploadAccess(session, packageId);
    const issued = await issueDropUploadIntents({
      packageId,
      authorizationMode: "space_session",
      authFingerprint: createDropRobotAuthFingerprint("space_session", rawSession),
      headers: request.headers,
      count: Number(body?.count || 1),
    });
    return NextResponse.json({ ok: true, version: "DROP 1.2.12", ...issued }, { status: 201, headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}
