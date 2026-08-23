import { NextRequest } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { getDevelopmentResourceContent } from "@/app/lib/dev-center/development-resources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ resourceId: string }> }) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) {
    return Response.json({ ok: false, error: "A ChatGrid eszköz nincs párosítva." }, { status: 401 });
  }
  try {
    const { resourceId } = await context.params;
    const { resource, bytes } = await getDevelopmentResourceContent(resourceId);
    const inlineRequested = request.nextUrl.searchParams.get("inline") === "1";
    const inlineSafe = ["pdf", "png", "jpg", "jpeg", "webp", "txt", "md", "json", "csv"].includes(resource.extension);
    const disposition = inlineRequested && inlineSafe ? "inline" : "attachment";
    return new Response(bytes, {
      headers: {
        "content-type": resource.mimeType || "application/octet-stream",
        "content-length": String(bytes.byteLength),
        "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(resource.originalName)}`,
        "x-benjadmin-resource-sha256": resource.sha256,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "A segédanyag nem olvasható." }, { status: 404 });
  }
}
