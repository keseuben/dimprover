import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { cancelDropUpload } from "@/app/lib/drop/storage/dropUploadService";
import { readDropUploadBearerToken } from "@/app/lib/drop/storage/dropUploadToken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ uploadId: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const rawToken = readDropUploadBearerToken(request.headers);
    const { uploadId } = await context.params;
    const body = await request.json().catch(() => null) as { reason?: string } | null;
    const result = await cancelDropUpload({
      uploadId,
      rawToken,
      reason: body?.reason,
    });
    return NextResponse.json(
      {
        ok: true,
        version: "DROP 0.4.0",
        status: result?.session?.status || "failed",
        reservationReleased: Boolean(result?.reservationReleased),
      },
      { headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
