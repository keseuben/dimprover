import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { issueDropFileDownload, issueDropFileInline } from "@/app/lib/drop/download/dropDownloadService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_HOSTS = new Set(["drop.dimpro.hu", "www.drop.dimpro.hu", "localhost", "127.0.0.1"]);

type RouteContext = { params: Promise<{ fileId: string }> };

function requestHost(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("host") || "")
    .replace(/:\d+$/, "")
    .toLocaleLowerCase("en-US");
}

function hidden() {
  return NextResponse.json(
    { ok: false, error: "Az útvonal nem található.", code: "DROP_ROUTE_NOT_FOUND" },
    { status: 404, headers: dropNoStoreHeaders() },
  );
}


export async function GET(request: NextRequest, context: RouteContext) {
  if (!ALLOWED_HOSTS.has(requestHost(request))) return hidden();
  try {
    const { fileId } = await context.params;
    const rawToken = request.nextUrl.searchParams.get("token")?.trim() || "";
    if (!/^[0-9a-f-]{36}$/i.test(fileId) || !rawToken || rawToken.length > 180) return hidden();
    const result = await issueDropFileInline({ rawToken, fileId, headers: request.headers });
    return NextResponse.redirect(result.url, { status: 302, headers: { ...dropNoStoreHeaders(), "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" } });
  } catch (error) { return dropErrorResponse(error); }
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!ALLOWED_HOSTS.has(requestHost(request))) return hidden();
  try {
    const { fileId } = await context.params;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const rawToken = String(body?.token || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) {
      return NextResponse.json(
        { ok: false, error: "Érvénytelen DROP fájlazonosító.", code: "DROP_FILE_ID_INVALID" },
        { status: 400, headers: dropNoStoreHeaders() },
      );
    }
    if (!rawToken || rawToken.length > 180) {
      return NextResponse.json(
        { ok: false, error: "Hiányzó vagy hibás letöltési token.", code: "DROP_INVALID_TOKEN_INPUT" },
        { status: 400, headers: dropNoStoreHeaders() },
      );
    }
    const result = await issueDropFileDownload({ rawToken, fileId, headers: request.headers });
    return NextResponse.json({ ok: true, ...result }, { status: 200, headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}
