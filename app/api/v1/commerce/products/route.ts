import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceProductErrorResponse } from "@/app/lib/commerce/product/api";
import { createCommerceProduct, listCommerceProducts } from "@/app/lib/commerce/product/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function requestedOrganizationId(request: NextRequest) {
  return request.headers.get("x-dimpro-organization-id")?.trim() || request.nextUrl.searchParams.get("organizationId")?.trim() || null;
}

export async function GET(request: NextRequest) {
  try {
    const context = await resolveCommerceContext(requestedOrganizationId(request));
    const data = await listCommerceProducts(context, {
      query: request.nextUrl.searchParams.get("q") || undefined,
      status: request.nextUrl.searchParams.get("status") || undefined,
      limit: Number(request.nextUrl.searchParams.get("limit") || 50),
      offset: Number(request.nextUrl.searchParams.get("offset") || 0),
    });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return commerceProductErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await resolveCommerceContext(requestedOrganizationId(request));
    const body = await request.json() as Record<string, unknown>;
    const data = await createCommerceProduct(context, body);
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    return commerceProductErrorResponse(error);
  }
}
