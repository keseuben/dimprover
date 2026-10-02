import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import {
  getDriveFolderPasswordGateStatus,
  requireDriveFolderAclAccess,
} from "@/app/lib/drive-core/folderAccess";
import { hashDriveFolderPassword } from "@/app/lib/drive-core/folderPasswordCrypto";
import {
  clearDriveFolderPasswordRecord,
  getDriveFolderPasswordRecord,
  publicDriveFolderPasswordConfig,
  setDriveFolderPasswordRecord,
} from "@/app/lib/drive-core/folderPasswordRepository";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = { params: Promise<{ projectId: string; folderId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId, folderId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "project.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  try {
    await requireDriveFolderAclAccess(projectId, folderId, access.access);
    const [status, record] = await Promise.all([
      getDriveFolderPasswordGateStatus(projectId, folderId),
      getDriveFolderPasswordRecord(projectId, folderId),
    ]);
    return NextResponse.json({
      ok: true,
      status,
      config: record ? publicDriveFolderPasswordConfig(record) : null,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { projectId, folderId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "project.update");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }

  try {
    await requireDriveFolderAclAccess(projectId, folderId, access.access);
    const passwordHash = hashDriveFolderPassword(body.password);
    const unlockTtlMinutes = Math.max(5, Math.min(1440, Math.round(Number(body.unlockTtlMinutes) || 120)));
    const config = await setDriveFolderPasswordRecord({
      projectId,
      folderId,
      passwordHash,
      unlockTtlMinutes,
      actorUserId: access.actor.userId,
    });
    const status = await getDriveFolderPasswordGateStatus(projectId, folderId);
    return NextResponse.json({ ok: true, config, status }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { projectId, folderId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "project.update");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  try {
    await requireDriveFolderAclAccess(projectId, folderId, access.access);
    const result = await clearDriveFolderPasswordRecord(projectId, folderId, access.actor.userId);
    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
