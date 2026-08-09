import { NextRequest, NextResponse } from "next/server";
import {
  isDriveApiAuthorized,
  listDriveFiles,
  sanitizeDriveId,
  unauthorizedDriveResponse,
} from "@/app/lib/drive/driveApi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await isDriveApiAuthorized(request.headers);
  if (!auth.ok) {
    return NextResponse.json(unauthorizedDriveResponse(), { status: 401 });
  }

  const params = await context.params;
  const projectId = sanitizeDriveId(params.projectId, "DIMPRO_DEMO");
  const files = await listDriveFiles(projectId);

  return NextResponse.json({
    ok: true,
    authMode: auth.mode,
    projectId,
    files,
  });
}
