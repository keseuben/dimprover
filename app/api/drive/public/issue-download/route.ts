import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { resolveDriveIssueAccessDownload } from "@/app/lib/drive-core/issueAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Hiányzó kiadási hozzáférési token." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const resolved = await resolveDriveIssueAccessDownload(token);
    const response = NextResponse.redirect(resolved.url, 307);
    response.headers.set("cache-control", "no-store, max-age=0");
    response.headers.set("pragma", "no-cache");
    response.headers.set("referrer-policy", "no-referrer");
    return response;
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
