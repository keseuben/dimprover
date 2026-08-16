import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import {
  getProjectDriveProvisioningState,
  provisionProjectDrive,
} from "@/app/lib/drive-core/projectProvisioning";

type RouteContext = { params: Promise<{ projectId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "project.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const provisioning = await getProjectDriveProvisioningState(projectId);
    return NextResponse.json({ ok: true, provisioning }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "project.update");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const provisioning = await provisionProjectDrive(projectId, access.actor.userId);
    return NextResponse.json({ ok: true, provisioning }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
