import { NextRequest, NextResponse } from "next/server";
import { isDriveApiAuthorized, sanitizeDriveId, unauthorizedDriveResponse } from "@/app/lib/drive/driveApi";
import { createSignedUploadContractPlan } from "@/app/lib/drive/storageRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SignedUploadBody = {
  projectId?: string;
  fileName?: string;
  relativePath?: string;
  fileSizeBytes?: number;
  mimeType?: string;
};

export async function POST(request: NextRequest) {
  const auth = await isDriveApiAuthorized(request.headers);
  if (!auth.ok) {
    return NextResponse.json(unauthorizedDriveResponse(), {
      status: 401,
      headers: { "cache-control": "no-store" },
    });
  }

  const body = (await request.json().catch(() => ({}))) as SignedUploadBody;
  const contract = createSignedUploadContractPlan({
    projectId: sanitizeDriveId(body.projectId || "DIMPRO_DEMO", "DIMPRO_DEMO"),
    fileName: body.fileName || "feltoltes.bin",
    relativePath: body.relativePath || body.fileName || "feltoltes.bin",
    fileSizeBytes: Number(body.fileSizeBytes || 0),
    mimeType: body.mimeType || "application/octet-stream",
    clientId: auth.clientId,
  });

  return NextResponse.json(contract, {
    headers: { "cache-control": "no-store" },
  });
}
