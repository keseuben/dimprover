import { NextRequest, NextResponse } from "next/server";
import {
  isDriveApiAuthorized,
  sanitizeDriveId,
  saveUploadChunk,
  unauthorizedDriveResponse,
} from "@/app/lib/drive/driveApi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maxDevChunkBytes = 10 * 1024 * 1024;

type RouteContext = {
  params: Promise<{
    uploadId: string;
  }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await isDriveApiAuthorized(request.headers);
  if (!auth.ok) {
    return NextResponse.json(unauthorizedDriveResponse(), { status: 401 });
  }

  const params = await context.params;
  const uploadId = sanitizeDriveId(params.uploadId, "upload");
  const chunkIndexHeader = request.headers.get("x-dimpro-drive-chunk-index") || "0";
  const chunkIndex = Number.parseInt(chunkIndexHeader, 10);
  const bodyBuffer = Buffer.from(await request.arrayBuffer());

  if (bodyBuffer.length > maxDevChunkBytes) {
    return NextResponse.json(
      {
        ok: false,
        error: "A fejlesztői Drive API chunk mérete túl nagy.",
        maxDevChunkBytes,
      },
      { status: 413 },
    );
  }

  const session = await saveUploadChunk(
    uploadId,
    Number.isFinite(chunkIndex) ? chunkIndex : 0,
    bodyBuffer,
  );

  return NextResponse.json({
    ok: true,
    mode: "chunk-received-preview",
    uploadId,
    receivedBytes: bodyBuffer.length,
    session,
  });
}
