import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { resolveDropSpaceSession } from "@/app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "@/app/lib/drop/dropSpaceSecurity";
import { initializeDropSpaceUpload } from "@/app/lib/drop/storage/dropUploadService";
import { countActiveDropUploadSessions, findReusableDropUpload } from "@/app/lib/drop/storage/dropStorageRepository";
import { consumeDropUploadIntent, createDropRobotAuthFingerprint, getDropRobotGuardConfig } from "@/app/lib/drop/robot/dropRobotGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ packageId: string }> };

function robotInput(body: Record<string, unknown> | null) {
  const value = body?.robotGuard as Record<string, unknown> | null | undefined;
  return { intentToken: value?.intentToken, honeypot: value?.website };
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const rawSession = request.cookies.get(DROP_SPACE_SESSION_COOKIE)?.value?.trim();
    if (!rawSession) return NextResponse.json({ ok: false, error: "Nincs aktív Drop tér munkamenet.", code: "DROP_SPACE_SESSION_MISSING" }, { status: 401, headers: dropNoStoreHeaders() });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const [{ packageId }, session] = await Promise.all([context.params, resolveDropSpaceSession(rawSession)]);
    const clientUploadId = typeof body?.clientUploadId === "string" ? body.clientUploadId.trim().slice(0, 120) : "";
    const reusable = clientUploadId ? await findReusableDropUpload({ packageId, clientUploadId }) : null;
    if (!reusable) {
      const active = await countActiveDropUploadSessions(packageId);
      const limit = getDropRobotGuardConfig().activeUploadSessionLimit;
      if (active >= limit) throw Object.assign(new Error(`A csomagban egyszerre legfeljebb ${limit} aktív feltöltés futhat.`), { code: "DROP_ACTIVE_UPLOAD_SESSION_LIMIT", status: 429 });
    }
    const robot = robotInput(body);
    await consumeDropUploadIntent({
      rawToken: robot.intentToken,
      packageId,
      authorizationMode: "space_session",
      authFingerprint: createDropRobotAuthFingerprint("space_session", rawSession),
      honeypot: robot.honeypot,
      headers: request.headers,
    });
    const initialized = await initializeDropSpaceUpload({ session, packageId, body });
    return NextResponse.json({ ok: true, version: "DROP 1.2.11", initialized, warning: "A feltöltési intent egyszer használható. A fájl karanténba kerül, letölteni csak vírusellenőrzés után lehet." }, { status: 201, headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}
