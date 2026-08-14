import { Readable } from "node:stream";
import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { openDriveObjectPreviewContent } from "@/app/lib/drive-core/store";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = { params: Promise<{ projectId: string; documentId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeInlineFileName(value: string) {
  return value.replace(/[\r\n"\\/]/g, "_").slice(0, 240) || "dimpro-drive-preview";
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId, documentId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  const versionId = request.nextUrl.searchParams.get("versionId");
  const range = request.headers.get("range");

  try {
    const result = await openDriveObjectPreviewContent({
      projectId,
      documentId,
      versionId,
      range,
    });
    const source = result.object.body;
    const nodeStream = source instanceof Readable ? source : Readable.from(source);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    const headers = new Headers({
      "content-type": result.mimeType || result.object.contentType || "application/octet-stream",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(safeInlineFileName(result.fileName))}`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "accept-ranges": result.object.acceptRanges || "bytes",
    });
    if (result.object.contentLength > 0) headers.set("content-length", String(result.object.contentLength));
    if (result.object.contentRange) headers.set("content-range", result.object.contentRange);
    if (result.object.etag) headers.set("etag", result.object.etag);
    if (result.object.lastModified) headers.set("last-modified", result.object.lastModified);

    return new Response(webStream, {
      status: result.object.contentRange ? 206 : 200,
      headers,
    });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
