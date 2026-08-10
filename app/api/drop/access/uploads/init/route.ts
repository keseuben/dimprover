import { type NextRequest, NextResponse } from "next/server";
import { validateDropAccessToken } from "@/app/lib/drop/dropAccess";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { initializeDropCapabilityUpload } from "@/app/lib/drop/storage/dropUploadService";
import { countActiveDropUploadSessions, findReusableDropUpload } from "@/app/lib/drop/storage/dropStorageRepository";
import { consumeDropUploadIntent, createDropRobotAuthFingerprint, getDropRobotGuardConfig } from "@/app/lib/drop/robot/dropRobotGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readCapabilityBearer(headers: Headers) {
  const authorization = headers.get("authorization")?.trim() || "";
  const match = authorization.match(/^Bearer\s+([^\s]{20,1200})$/i);
  if (!match) throw Object.assign(new Error("Hiányzó vagy érvénytelen feltöltési capability-token."), { code: "DROP_UPLOAD_CAPABILITY_MISSING", status: 401 });
  return match[1];
}

function robotInput(body: Record<string, unknown> | null) {
  const value = body?.robotGuard as Record<string, unknown> | null | undefined;
  return { intentToken: value?.intentToken, honeypot: value?.website };
}

export async function POST(request: NextRequest) {
  try {
    const rawToken = readCapabilityBearer(request.headers);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const grant = await validateDropAccessToken({ rawToken, expectedPurpose: "upload", headers: request.headers });
    const clientUploadId = typeof body?.clientUploadId === "string" ? body.clientUploadId.trim().slice(0, 120) : "";
    const reusable = clientUploadId ? await findReusableDropUpload({ packageId: grant.packageId, clientUploadId }) : null;
    if (!reusable) {
      const active = await countActiveDropUploadSessions(grant.packageId);
      const limit = getDropRobotGuardConfig().activeUploadSessionLimit;
      if (active >= limit) throw Object.assign(new Error(`A csomagban egyszerre legfeljebb ${limit} aktív feltöltés futhat.`), { code: "DROP_ACTIVE_UPLOAD_SESSION_LIMIT", status: 429 });
    }
    const robot = robotInput(body);
    await consumeDropUploadIntent({
      rawToken: robot.intentToken,
      packageId: grant.packageId,
      authorizationMode: "capability_token",
      authFingerprint: createDropRobotAuthFingerprint("capability_token", rawToken),
      honeypot: robot.honeypot,
      headers: request.headers,
    });
    const initialized = await initializeDropCapabilityUpload({ grant, body });
    return NextResponse.json({ ok: true, version: "DROP 1.2.12", initialized, warning: "A fájl privát karanténba kerül. Vírusellenőrzés előtt nem tölthető le." }, { status: 201, headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}
