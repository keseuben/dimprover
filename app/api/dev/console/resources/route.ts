import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { developmentResourceHealth, listDevelopmentResources, saveDevelopmentResource, updateDevelopmentResource, validateDevelopmentResourceMetadata } from "@/app/lib/dev-center/development-resources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function unauthorized() {
  return json({ ok: false, error: "Nincs jogosultság a BENJADMIN Fejlesztési Tárhoz." }, 401);
}

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return unauthorized();
  try {
    const includeArchived = request.nextUrl.searchParams.get("archived") === "1";
    const [resources, health] = await Promise.all([listDevelopmentResources({ includeArchived }), developmentResourceHealth()]);
    return json({ ok: true, resources, health });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "A Fejlesztési Tár nem olvasható." }, 500);
  }
}

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers))) return unauthorized();
  try {
    const form = await request.formData();
    const moduleCode = String(form.get("module") || "altalanos");
    const title = String(form.get("title") || "");
    const description = String(form.get("description") || "");
    const tags = String(form.get("tags") || "");
    const priority = String(form.get("priority") || "normal") as "normal" | "important" | "critical";
    const source = String(form.get("source") || "BENJADMIN_UPLOAD");
    const version = String(form.get("version") || "");
    const requiredBeforeDevelopment = String(form.get("requiredBeforeDevelopment") || "") === "true";
    const documentType = String(form.get("documentType") || "") as "specification" | "concept" | "coding_guide" | "reference" | "handoff" | "other";
    validateDevelopmentResourceMetadata({ module: moduleCode, title, description, tags, version, documentType });
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    if (!files.length) return json({ ok: false, error: "Legalább egy fájl kiválasztása szükséges." }, 400);
    if (files.length > 20) return json({ ok: false, error: "Egyszerre legfeljebb 20 fájl tölthető fel." }, 400);
    const saved = [];
    for (const file of files) saved.push(await saveDevelopmentResource({ module: moduleCode, title: files.length === 1 ? title : `${title} · ${file.name}`, description, tags, priority, source, version, requiredBeforeDevelopment, documentType, file }));
    return json({ ok: true, resources: saved }, 201);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "A feltöltés sikertelen." }, 400);
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers))) return unauthorized();
  try {
    const body = await request.json() as { id?: string; title?: string; description?: string; tags?: string[]; priority?: "normal" | "important" | "critical"; source?: string; version?: string; requiredBeforeDevelopment?: boolean; documentType?: "specification" | "concept" | "coding_guide" | "reference" | "handoff" | "other"; archived?: boolean };
    if (!body.id) return json({ ok: false, error: "Hiányzó segédanyag-azonosító." }, 400);
    const resource = await updateDevelopmentResource(body.id, body);
    return json({ ok: true, resource });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "A segédanyag nem módosítható." }, 400);
  }
}
