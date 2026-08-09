import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { receiveDropUploadContent } from "@/app/lib/drop/storage/dropUploadService";
import { readDropUploadBearerToken } from "@/app/lib/drop/storage/dropUploadToken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ uploadId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const rawToken = readDropUploadBearerToken(request.headers);
    const { uploadId } = await context.params;
    const contentLengthValue = request.headers.get("content-length");
    const contentLength = contentLengthValue ? Number(contentLengthValue) : null;
    const result = await receiveDropUploadContent({
      uploadId,
      rawToken,
      body: request.body,
      contentLength: Number.isFinite(contentLength) ? contentLength : null,
    });
    return NextResponse.json(
      {
        ok: true,
        version: "DROP 0.4.0",
        uploadId,
        receivedBytes: result.receivedBytes,
        status: "uploaded",
        next: `/api/drop/uploads/${uploadId}/complete`,
      },
      { headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
