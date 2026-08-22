import { NextRequest } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { readDevelopmentHandoff } from "@/app/lib/dev-center/handoff-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^A-Za-z0-9._-]/g, "_") || "benjadmin_handoff.md";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ handoffId: string }> }) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) {
    return Response.json({ ok: false, error: "A ChatGrid eszköz nincs párosítva." }, { status: 401 });
  }
  try {
    const { handoffId } = await context.params;
    const { item, content } = await readDevelopmentHandoff(handoffId);
    return new Response(content, {
      status: 200,
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": contentDisposition(item.fileName || `${item.chatSessionId}_atado.md`),
        "content-length": String(Buffer.byteLength(content, "utf8")),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-benjadmin-handoff-sha256": item.sha256,
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Az átadó nem tölthető le." }, { status: 404 });
  }
}
