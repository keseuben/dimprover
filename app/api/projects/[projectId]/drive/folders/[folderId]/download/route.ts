import { Readable } from "node:stream";
import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { openDriveFolderZip } from "@/app/lib/drive-core/store";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = { params: Promise<{ projectId: string; folderId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function safeDownloadName(value: string) {
  return value.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "DIMPRO_Drive.zip";
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId, folderId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  try {
    const archive = await openDriveFolderZip({
      projectId,
      folderId,
      actorUserId: access.actor.userId,
      actorDisplayName: access.actor.displayName,
      projectCode: access.access.project.code,
      projectName: access.access.project.name,
      clientId: request.headers.get("x-dimpro-drive-client-id"),
    });
    const nodeStream = archive.stream as unknown as Readable;
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return new Response(webStream, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeDownloadName(archive.fileName))}`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
        "x-dimpro-drive-zip-files": String(archive.sourceFileCount),
        "x-dimpro-drive-zip-skipped": String(archive.skippedFileCount),
        "x-dimpro-drive-download-package-id": archive.packageId,
        "x-dimpro-drive-document-register": archive.registerFileName,
      },
    });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
