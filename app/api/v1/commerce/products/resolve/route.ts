import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceProductErrorResponse } from "@/app/lib/commerce/product/api";
import { resolveCommerceProductByCode } from "@/app/lib/commerce/product/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const organizationId = request.headers.get("x-dimpro-organization-id")?.trim() || request.nextUrl.searchParams.get("organizationId")?.trim() || null;
    const context = await resolveCommerceContext(organizationId);
    const data = await resolveCommerceProductByCode(context, request.nextUrl.searchParams.get("code"));
    if (!data) return NextResponse.json({ ok: false, error: "Nincs találat.", code: "COMMERCE_PRODUCT_NOT_RESOLVED" }, { status: 404 });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return commerceProductErrorResponse(error);
  }
}
