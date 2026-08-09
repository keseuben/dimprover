import { NextRequest, NextResponse } from "next/server";
import {
  createDownloadInit,
  isDriveApiAuthorized,
  sanitizeDriveId,
  unauthorizedDriveResponse,
} from "@/app/lib/drive/driveApi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    fileId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await isDriveApiAuthorized(request.headers);
  if (!auth.ok) {
    return NextResponse.json(unauthorizedDriveResponse(), { status: 401 });
  }

  const params = await context.params;
  const fileId = sanitizeDriveId(params.fileId, "file");
  return NextResponse.json(await createDownloadInit(fileId, auth.clientId));
}
