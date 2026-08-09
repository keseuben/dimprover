import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { completeDropUpload } from "@/app/lib/drop/storage/dropUploadService";
import { readDropUploadBearerToken } from "@/app/lib/drop/storage/dropUploadToken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ uploadId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const rawToken = readDropUploadBearerToken(request.headers);
    const { uploadId } = await context.params;
    const result = await completeDropUpload({ uploadId, rawToken });
    return NextResponse.json(
      {
        ok: true,
        version: "DROP 1.2.11",
        result,
        warning: "A fájl privát karanténba került. Letöltés csak víruskereső és végleges biztonsági kiadás után engedélyezhető.",
      },
      { headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
