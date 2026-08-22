import { NextRequest, NextResponse } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { saveDevelopmentResource, validateDevelopmentResourceMetadata } from "@/app/lib/dev-center/development-resources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return NextResponse.json({ ok: false, error: "A ChatGrid eszköz nincs párosítva." }, { status: 401 });
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    if (!files.length || files.length > 20) return NextResponse.json({ ok: false, error: "1-20 fájl szükséges." }, { status: 400 });
    const shared = {
      module: String(form.get("module") || ""), title: String(form.get("title") || ""), description: String(form.get("description") || ""), tags: String(form.get("tags") || ""),
      priority: String(form.get("priority") || "normal") as "normal" | "important" | "critical", version: String(form.get("version") || ""),
      documentType: String(form.get("documentType") || "") as "specification" | "concept" | "coding_guide" | "reference" | "handoff" | "other",
      requiredBeforeDevelopment: String(form.get("requiredBeforeDevelopment") || "") === "true", source: "CHATGRID_CONTEXT_WORKSPACE",
    };
    validateDevelopmentResourceMetadata(shared);
    const saved = [];
    for (const file of files) saved.push(await saveDevelopmentResource({ ...shared, title: files.length === 1 ? shared.title : `${shared.title} · ${file.name}`, file }));
    return NextResponse.json({ ok: true, resources: saved }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A segédanyag nem tölthető fel." }, { status: 400 });
  }
}
