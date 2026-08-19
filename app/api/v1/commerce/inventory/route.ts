import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceInventoryErrorResponse } from "@/app/lib/commerce/inventory/api";
import { listCommerceInventory } from "@/app/lib/commerce/inventory/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const organizationId = request.headers.get("x-dimpro-organization-id")?.trim() || request.nextUrl.searchParams.get("organizationId")?.trim() || null;
    const context = await resolveCommerceContext(organizationId);
    const data = await listCommerceInventory(context, {
      variantId: request.nextUrl.searchParams.get("variantId") || undefined,
      sourceId: request.nextUrl.searchParams.get("sourceId") || undefined,
      warehouseId: request.nextUrl.searchParams.get("warehouseId") || undefined,
      stockStatus: request.nextUrl.searchParams.get("stockStatus") || undefined,
    });
    return NextResponse.json({ ok:true, data });
  } catch (error) {
    return commerceInventoryErrorResponse(error);
  }
}
