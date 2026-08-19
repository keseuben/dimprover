import { NextRequest, NextResponse } from "next/server";
import { retryAruterOrderCommerceMirror } from "@/app/lib/aruter/commerceMirror";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceOrderErrorResponse } from "@/app/lib/commerce/order/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;
type RouteContext = { params: Promise<{ attemptId: string }> };

export async function POST(request: NextRequest, routeContext: RouteContext) {
  try {
    const { attemptId } = await routeContext.params;
    const organizationId = request.headers.get("x-dimpro-organization-id")?.trim() || request.nextUrl.searchParams.get("organizationId")?.trim() || null;
    const context = await resolveCommerceContext(organizationId);
    const data = await retryAruterOrderCommerceMirror(context, attemptId);
    return NextResponse.json({ ok: data.mirrored, data }, { status: data.mirrored ? 200 : 409 });
  } catch (error) {
    return commerceOrderErrorResponse(error);
  }
}
