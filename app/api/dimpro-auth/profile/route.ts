import { NextRequest, NextResponse } from "next/server";
import { resolveDriveSsoConfig } from "@/app/lib/dimpro-auth/client-config";
import {
  getAppSessionByToken,
  updateAuthUserDisplayName,
} from "@/app/lib/dimpro-auth/repository";
import {
  getDimproAuthRequestIp,
  getDimproAuthUserAgent,
  newDimproAuthCorrelationId,
  validateSameOriginMutation,
} from "@/app/lib/dimpro-auth/security";
import { DIMPRO_APP_SESSION_COOKIE } from "@/app/lib/dimpro-auth/sso";
import { DimproAuthError } from "@/app/lib/dimpro-auth/types";
import {
  listAccessibleProjects,
  updateProjectMembershipDisplayName,
} from "@/app/lib/project-core/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChangedMembership = {
  projectId: string;
  membershipId: string;
  previousDisplayName: string;
};

export async function PATCH(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!validateSameOriginMutation(request.headers)) {
    return NextResponse.json(
      { ok: false, error: "AUTH_ORIGIN_DENIED", correlationId },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  const config = resolveDriveSsoConfig(request.headers.get("host"));
  const token = request.cookies.get(DIMPRO_APP_SESSION_COOKIE)?.value?.trim() || "";
  const session = config && token
    ? await getAppSessionByToken(token, config.clientId, true).catch(() => null)
    : null;
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "AUTH_REQUIRED", correlationId },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const body = await request.json().catch(() => null) as { displayName?: unknown } | null;
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  if (displayName.length < 2 || displayName.length > 160) {
    return NextResponse.json(
      {
        ok: false,
        error: "AUTH_PROFILE_DISPLAY_NAME_INVALID",
        message: "A név legalább 2, legfeljebb 160 karakter lehet.",
        correlationId,
      },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const changedMemberships: ChangedMembership[] = [];
  const rollbackMemberships = async () => {
    for (const changed of [...changedMemberships].reverse()) {
      await updateProjectMembershipDisplayName(
        changed.projectId,
        changed.membershipId,
        changed.previousDisplayName,
        session.user.id,
      ).catch(() => undefined);
    }
  };

  try {
    const projects = await listAccessibleProjects([session.user.id, session.user.email]);
    for (const project of projects) {
      if (project.membership.displayName === displayName) continue;
      const result = await updateProjectMembershipDisplayName(
        project.id,
        project.membership.id,
        displayName,
        session.user.id,
      );
      if (!result.ok) throw new Error(result.error);
      changedMemberships.push({
        projectId: project.id,
        membershipId: project.membership.id,
        previousDisplayName: result.previousDisplayName,
      });
    }

    const authResult = await updateAuthUserDisplayName({
      userId: session.user.id,
      displayName,
      ip: getDimproAuthRequestIp(request.headers),
      userAgent: getDimproAuthUserAgent(request.headers),
      correlationId,
      reason: "USER_REQUEST",
    });

    return NextResponse.json(
      {
        ok: true,
        user: authResult.user,
        syncedMemberships: changedMemberships.length,
        correlationId,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    await rollbackMemberships();
    if (error instanceof DimproAuthError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.publicMessage, correlationId },
        { status: error.status, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "AUTH_PROFILE_UPDATE_FAILED",
        message: error instanceof Error ? error.message : "A profilnév módosítása nem sikerült.",
        correlationId,
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
