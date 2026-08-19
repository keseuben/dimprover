import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceInventoryErrorResponse } from "@/app/lib/commerce/inventory/api";
import { expireDueCommerceInventoryReservations } from "@/app/lib/commerce/inventory/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const organizationId = request.headers.get("x-dimpro-organization-id")?.trim()
      || request.nextUrl.searchParams.get("organizationId")?.trim()
      || null;
    const context = await resolveCommerceContext(organizationId);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const requested = Number(body.limit || 50);
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(100, Math.floor(requested))) : 50;
    const data = await expireDueCommerceInventoryReservations(context, { limit });
    return NextResponse.json({ ok:true, data });
  } catch (error) {
    return commerceInventoryErrorResponse(error);
  }
}
