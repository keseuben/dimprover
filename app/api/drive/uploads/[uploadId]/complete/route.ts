import { NextRequest, NextResponse } from "next/server";
import {
  completeUploadSession,
  isDriveApiAuthorized,
  sanitizeDriveId,
  unauthorizedDriveResponse,
} from "@/app/lib/drive/driveApi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    uploadId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await isDriveApiAuthorized(request.headers);
  if (!auth.ok) {
    return NextResponse.json(unauthorizedDriveResponse(), { status: 401 });
  }

  const params = await context.params;
  const uploadId = sanitizeDriveId(params.uploadId, "upload");

  try {
    const result = await completeUploadSession(uploadId);
    return NextResponse.json({
      ok: true,
      mode: "upload-complete-preview",
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Upload lezárási hiba.",
      },
      { status: 404 },
    );
  }
}
