import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { finalizeDropPublicPackage } from "@/app/lib/drop/public/dropPublicFinalizeService";
import { DROP_PUBLIC_SESSION_COOKIE } from "@/app/lib/drop/public/dropPublicSession";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
type Context = { params: Promise<{ packageId: string }> };
export async function POST(request: NextRequest, context: Context) {
  try {
    const { packageId } = await context.params;
    const rawSession = request.cookies.get(DROP_PUBLIC_SESSION_COOKIE)?.value?.trim() || "";
    const result = await finalizeDropPublicPackage({ rawSession, headers: request.headers, packageId });
    return NextResponse.json({ ok: true, version: "DROP 1.2.11", result }, { headers: dropNoStoreHeaders() });
  } catch (error) { return dropErrorResponse(error); }
}
