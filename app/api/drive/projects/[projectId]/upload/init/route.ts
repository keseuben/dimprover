import { NextRequest, NextResponse } from "next/server";
import {
  createUploadSession,
  isDriveApiAuthorized,
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

type UploadInitBody = {
  fileName?: string;
  relativePath?: string;
  fileSizeBytes?: number;
  mimeType?: string;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await isDriveApiAuthorized(request.headers);
  if (!auth.ok) {
    return NextResponse.json(unauthorizedDriveResponse(), { status: 401 });
  }

  const params = await context.params;
  const body = (await request.json().catch(() => ({}))) as UploadInitBody;
  const session = await createUploadSession({
    projectId: sanitizeDriveId(params.projectId, "DIMPRO_DEMO"),
    fileName: body.fileName || "feltoltes.bin",
    relativePath: body.relativePath || body.fileName || "feltoltes.bin",
    fileSizeBytes: Number(body.fileSizeBytes || 0),
    mimeType: body.mimeType || "application/octet-stream",
    clientId: auth.clientId,
  });

  return NextResponse.json({
    ok: true,
    mode: "upload-init-preview",
    session,
    nextEndpoint: `/api/drive/uploads/${session.uploadId}/chunk`,
  });
}
