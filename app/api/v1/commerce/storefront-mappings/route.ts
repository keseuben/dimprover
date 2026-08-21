import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceStorefrontErrorResponse } from "@/app/lib/commerce/storefront/api";
import {
  listCommerceStorefrontProductMappings,
  upsertCommerceStorefrontProductMapping,
} from "@/app/lib/commerce/storefront/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function requestedOrganizationId(request: NextRequest) {
  return request.headers.get("x-dimpro-organization-id")?.trim()
    || request.nextUrl.searchParams.get("organizationId")?.trim()
    || null;
}

export async function GET(request: NextRequest) {
  try {
    const context = await resolveCommerceContext(requestedOrganizationId(request));
    const data = await listCommerceStorefrontProductMappings(context, {
      storefrontSlug: request.nextUrl.searchParams.get("storefrontSlug") || undefined,
      externalProductId: request.nextUrl.searchParams.get("externalProductId") || undefined,
      activeOnly: request.nextUrl.searchParams.get("activeOnly") !== "0",
    });
    return NextResponse.json({ ok: true, data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return commerceStorefrontErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await resolveCommerceContext(requestedOrganizationId(request));
    const body = await request.json() as Record<string, unknown>;
    const data = await upsertCommerceStorefrontProductMapping(context, body);
    return NextResponse.json({ ok: true, data }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return commerceStorefrontErrorResponse(error);
  }
}
