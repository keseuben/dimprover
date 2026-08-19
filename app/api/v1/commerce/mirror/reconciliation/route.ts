import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceOrderErrorResponse } from "@/app/lib/commerce/order/api";
import { listCommerceMirrorAttempts } from "@/app/lib/commerce/order/mirrorReconciliation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function organizationId(request: NextRequest) {
  return request.headers.get("x-dimpro-organization-id")?.trim() || request.nextUrl.searchParams.get("organizationId")?.trim() || null;
}

export async function GET(request: NextRequest) {
  try {
    const context = await resolveCommerceContext(organizationId(request));
    const data = await listCommerceMirrorAttempts(context, {
      state: request.nextUrl.searchParams.get("state") || undefined,
      limit: Number(request.nextUrl.searchParams.get("limit") || 50),
    });
    const summary = data.reduce((result, attempt) => {
      result[attempt.state] += 1;
      return result;
    }, { PENDING: 0, SUCCEEDED: 0, FAILED: 0 });
    return NextResponse.json({ ok: true, summary, data });
  } catch (error) {
    return commerceOrderErrorResponse(error);
  }
}
