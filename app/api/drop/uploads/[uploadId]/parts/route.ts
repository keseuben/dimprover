import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { getDropUploadResumeState } from "@/app/lib/drop/storage/dropUploadService";
import { readDropUploadBearerToken } from "@/app/lib/drop/storage/dropUploadToken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ uploadId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { uploadId } = await context.params;
    const rawToken = readDropUploadBearerToken(request.headers);
    const state = await getDropUploadResumeState({ uploadId, rawToken });
    return NextResponse.json(
      {
        ok: true,
        version: "DROP 0.4.0",
        state,
      },
      { status: 200, headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
