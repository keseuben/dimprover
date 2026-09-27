import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { uploadDriveObjectThroughServer } from "@/app/lib/drive-core/store";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = { params: Promise<{ projectId: string; uploadId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

async function* requestBodyChunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { projectId, uploadId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  const contentLength = Number(request.headers.get("content-length") || "");
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    return NextResponse.json(
      { ok: false, error: "A böngészős fájlfeltöltéshez érvényes Content-Length fejléc szükséges." },
      { status: 411 },
    );
  }
  if (!request.body) {
    return NextResponse.json({ ok: false, error: "A feltöltési kérés nem tartalmaz fájlt." }, { status: 400 });
  }

  try {
    const result = await uploadDriveObjectThroughServer({
      projectId,
      uploadId,
      actorUserId: access.actor.userId,
      contentLength,
      contentType: request.headers.get("content-type"),
      body: requestBodyChunks(request.body),
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
