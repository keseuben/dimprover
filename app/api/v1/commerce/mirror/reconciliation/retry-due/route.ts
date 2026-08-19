import { NextRequest, NextResponse } from "next/server";
import { retryDueAruterOrderCommerceMirrors } from "@/app/lib/aruter/commerceMirror";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceOrderErrorResponse } from "@/app/lib/commerce/order/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const organizationId = request.headers.get("x-dimpro-organization-id")?.trim() || request.nextUrl.searchParams.get("organizationId")?.trim() || null;
    const context = await resolveCommerceContext(organizationId);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const requestedLimit = Number(body.limit || 10);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(25, Math.floor(requestedLimit))) : 10;
    const data = await retryDueAruterOrderCommerceMirrors(context, { limit });
    return NextResponse.json({ ok: data.failed === 0, data }, { status: data.failed === 0 ? 200 : 207 });
  } catch (error) {
    return commerceOrderErrorResponse(error);
  }
}
