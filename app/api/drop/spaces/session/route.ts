import { type NextRequest, NextResponse } from "next/server";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { resolveDropSpaceSession } from "@/app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "@/app/lib/drop/dropSpaceSecurity";
import { getDropSpaceRoleLabel } from "@/app/lib/drop/dropSpaceEmail";
import { getDropGlobalUploadReadiness } from "@/app/lib/drop/storage/dropUploadService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const rawSession = request.cookies.get(DROP_SPACE_SESSION_COOKIE)?.value?.trim();
    if (!rawSession) {
      return NextResponse.json(
        { ok: false, error: "Nincs aktív Drop tér munkamenet.", code: "DROP_SPACE_SESSION_MISSING" },
        { status: 401, headers: dropNoStoreHeaders() },
      );
    }
    const [session, uploadReadiness] = await Promise.all([
      resolveDropSpaceSession(rawSession),
      getDropGlobalUploadReadiness(),
    ]);
    return NextResponse.json(
      {
        ok: true,
        version: "DROP 1.2.13",
        session: {
          space: {
            publicCode: session.space.publicCode,
            name: session.space.name,
            description: session.space.description,
            status: session.space.status,
          },
          membership: {
            displayName: session.membership.displayName,
            email: session.membership.email,
            organizationName: session.membership.organizationName,
            role: session.membership.role,
            roleLabel: getDropSpaceRoleLabel(session.membership.role),
          },
          permissions: session.permissions,
          effectiveAccessEndsAt: session.effectiveAccessEndsAt,
          runtimeMode: session.runtimeMode,
          projects: session.projects.map((project) => ({
            projectId: project.projectId,
            projectName: project.projectNameSnapshot,
            syncToDock: project.syncToDock,
            archiveToDrive: project.archiveToDrive,
          })),
          packageCount: session.packageCount,
          fileUploadEnabled: uploadReadiness.uploadReady,
          uploadReadiness,
        },
      },
      { headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function DELETE() {
  const response = NextResponse.json(
    { ok: true, version: "DROP 1.2.13", signedOut: true },
    { headers: dropNoStoreHeaders() },
  );
  response.cookies.set(DROP_SPACE_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
