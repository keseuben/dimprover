import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceProductErrorResponse } from "@/app/lib/commerce/product/api";
import { getCommerceProduct, updateCommerceProduct } from "@/app/lib/commerce/product/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ productId: string }> };

function requestedOrganizationId(request: NextRequest) {
  return request.headers.get("x-dimpro-organization-id")?.trim() || request.nextUrl.searchParams.get("organizationId")?.trim() || null;
}

export async function GET(request: NextRequest, routeContext: RouteContext) {
  try {
    const { productId } = await routeContext.params;
    const context = await resolveCommerceContext(requestedOrganizationId(request));
    const data = await getCommerceProduct(context, productId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return commerceProductErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, routeContext: RouteContext) {
  try {
    const { productId } = await routeContext.params;
    const context = await resolveCommerceContext(requestedOrganizationId(request));
    const body = await request.json() as Record<string, unknown>;
    const data = await updateCommerceProduct(context, productId, body);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return commerceProductErrorResponse(error);
  }
}
