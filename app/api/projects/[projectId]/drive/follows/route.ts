import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { listDriveTreeForAccess, requireDriveDocumentAccess } from "@/app/lib/drive-core/store";
import {
  DEFAULT_FOLLOW_PREFERENCES,
  FOLLOW_FREQUENCIES,
  deleteDriveDocumentFollow,
  listDriveDocumentFollows,
  upsertDriveDocumentFollow,
  type DriveFollowPreferences,
} from "@/app/lib/drive-core/followRepository";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { validateSameOriginMutation } from "@/app/lib/dimpro-auth/security";

type Context = { params: Promise<{ projectId: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function visibleFollows(projectId: string, userId: string, access: Awaited<ReturnType<typeof requireProjectPermission>>) {
  if (!access.ok) return [];
  const [tree, rows] = await Promise.all([
    listDriveTreeForAccess(projectId, access.access),
    listDriveDocumentFollows(projectId, userId),
  ]);
  const visible = new Set(tree.documents.map((document) => document.id));
  return rows.filter((row) => visible.has(row.documentId)).map(({ userId: _userId, ...row }) => {
    void _userId;
    return row;
  });
}

export async function GET(request: NextRequest, context: Context) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const follows = await visibleFollows(projectId, access.actor.userId, access);
    return NextResponse.json({ ok: true, follows }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, context: Context) {
  if (!validateSameOriginMutation(request.headers)) return NextResponse.json({ ok: false, error: "ORIGIN_DENIED" }, { status: 403 });
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const documentId = typeof body?.documentId === "string" ? body.documentId.trim() : "";
  if (!documentId || documentId.length > 160 || typeof body?.follow !== "boolean") {
    return NextResponse.json({ ok: false, error: "A documentId és follow mezők kötelezők." }, { status: 400 });
  }
  const preferences = { ...DEFAULT_FOLLOW_PREFERENCES };
  if (body.preferences !== undefined) {
    if (body.preferences === null || typeof body.preferences !== "object" || Array.isArray(body.preferences)) {
      return NextResponse.json({ ok: false, error: "Érvénytelen követési beállítások." }, { status: 400 });
    }
    const value = body.preferences as Record<string, unknown>;
    if (Object.keys(value).some((key) => !["notifyVersions","notifyRevisions","notifyApprovals","digestFrequency"].includes(key))) {
      return NextResponse.json({ ok: false, error: "Ismeretlen értesítési beállítás." }, { status: 400 });
    }
    for (const key of ["notifyVersions","notifyRevisions","notifyApprovals"] as const) {
      if (value[key] !== undefined) {
        if (typeof value[key] !== "boolean") return NextResponse.json({ ok: false, error: "Érvénytelen logikai beállítás." }, { status: 400 });
        preferences[key] = value[key] as boolean;
      }
    }
    if (value.digestFrequency !== undefined) {
      if (!FOLLOW_FREQUENCIES.includes(value.digestFrequency as DriveFollowPreferences["digestFrequency"])) {
        return NextResponse.json({ ok: false, error: "Érvénytelen értesítési gyakoriság." }, { status: 400 });
      }
      preferences.digestFrequency = value.digestFrequency as DriveFollowPreferences["digestFrequency"];
    }
  }

  try {
    await requireDriveDocumentAccess(projectId, documentId, access.access);
    if (body.follow) {
      await upsertDriveDocumentFollow({ projectId, documentId, userId: access.actor.userId, preferences });
    } else {
      await deleteDriveDocumentFollow(projectId, documentId, access.actor.userId);
    }
    const follows = await visibleFollows(projectId, access.actor.userId, access);
    return NextResponse.json({ ok: true, follows }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
