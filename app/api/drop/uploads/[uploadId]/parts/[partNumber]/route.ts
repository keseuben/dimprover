import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import {
  confirmDropS3UploadPart,
  createDropS3UploadPartUrl,
  receiveDropUploadPart,
} from "@/app/lib/drop/storage/dropUploadService";
import { readDropUploadBearerToken } from "@/app/lib/drop/storage/dropUploadToken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ uploadId: string; partNumber: string }> };

const ALLOWED_UPLOAD_PART_HOSTS = new Set(["drop.dimpro.hu", "www.drop.dimpro.hu", "drop.dev.dimpro.hu", "localhost", "127.0.0.1"]);

function isAllowedUploadPartHost(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = forwardedHost || request.headers.get("host") || "";
  const host = hostHeader.replace(/:\d+$/, "").toLocaleLowerCase("en-US");
  return ALLOWED_UPLOAD_PART_HOSTS.has(host);
}

async function resolveContext(request: NextRequest, context: RouteContext) {
  if (!isAllowedUploadPartHost(request)) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Ez a feltöltési útvonal csak a DIMPRO Drop hoston érhető el.", code: "DROP_UPLOAD_HOST_NOT_ALLOWED" },
        { status: 404, headers: dropNoStoreHeaders() },
      ),
    };
  }
  const { uploadId, partNumber: rawPartNumber } = await context.params;
  const partNumber = Number.parseInt(rawPartNumber, 10);
  if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Érvénytelen feltöltési rész sorszám.", code: "DROP_UPLOAD_PART_NUMBER_INVALID" },
        { status: 400, headers: dropNoStoreHeaders() },
      ),
    };
  }
  return { uploadId, partNumber, rawToken: readDropUploadBearerToken(request.headers) };
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const resolved = await resolveContext(request, context);
    if (resolved.error) return resolved.error;
    const signed = await createDropS3UploadPartUrl({
      uploadId: resolved.uploadId,
      partNumber: resolved.partNumber,
      rawToken: resolved.rawToken,
    });
    return NextResponse.json(
      { ok: true, version: "DROP 0.4.0", signed },
      { status: 200, headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const resolved = await resolveContext(request, context);
    if (resolved.error) return resolved.error;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const result = await confirmDropS3UploadPart({
      uploadId: resolved.uploadId,
      partNumber: resolved.partNumber,
      rawToken: resolved.rawToken,
      checksum: typeof body.checksum === "string" ? body.checksum : "",
      etag: typeof body.etag === "string" ? body.etag : null,
      receivedBytes: Number(body.receivedBytes || 0),
    });
    return NextResponse.json(
      { ok: true, version: "DROP 0.4.0", result },
      { status: 200, headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const resolved = await resolveContext(request, context);
    if (resolved.error) return resolved.error;
    const contentLengthHeader = request.headers.get("content-length");
    const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null;
    const result = await receiveDropUploadPart({
      uploadId: resolved.uploadId,
      partNumber: resolved.partNumber,
      rawToken: resolved.rawToken,
      body: request.body,
      contentLength: Number.isSafeInteger(contentLength) ? contentLength : null,
    });
    return NextResponse.json(
      { ok: true, version: "DROP 0.4.0", result },
      { status: 200, headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
