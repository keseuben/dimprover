import { NextRequest, NextResponse } from "next/server";
import { CommerceContextError, resolveCommerceContext } from "@/app/lib/commerce/core/server-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const organizationId =
      request.headers.get("x-dimpro-organization-id")?.trim()
      || request.nextUrl.searchParams.get("organizationId")?.trim()
      || null;
    const context = await resolveCommerceContext(organizationId);
    return NextResponse.json({ ok: true, context });
  } catch (error) {
    if (error instanceof CommerceContextError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { ok: false, error: "A Commerce context lekérése váratlan hibával leállt.", code: "COMMERCE_CONTEXT_UNEXPECTED" },
      { status: 500 },
    );
  }
}
