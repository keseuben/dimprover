import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceStorefrontErrorResponse } from "@/app/lib/commerce/storefront/api";
import {
  getCommerceStorefrontAdminState,
  updateCommerceStorefrontDefaultFulfillmentSource,
} from "@/app/lib/commerce/storefront/repository";
import { getAruterRepositoryMode } from "@/app/lib/aruter/repositoryFactory";
import { getStorefrontRepositoryProducts, resolveStorefrontTemplate } from "@/app/lib/aruter/storefrontPilot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function organizationId(request: NextRequest) {
  return request.headers.get("x-dimpro-organization-id")?.trim()
    || request.nextUrl.searchParams.get("organizationId")?.trim()
    || null;
}

function storefrontSlug(request: NextRequest, body?: Record<string, unknown>) {
  const fromBody = typeof body?.storefrontSlug === "string" ? body.storefrontSlug.trim() : "";
  return fromBody || request.nextUrl.searchParams.get("storefrontSlug")?.trim() || "";
}

export async function GET(request: NextRequest) {
  try {
    const slug = storefrontSlug(request);
    if (!slug) return NextResponse.json({ ok: false, error: "A storefrontSlug kötelező.", code: "COMMERCE_STOREFRONT_SLUG_REQUIRED" }, { status: 400 });
    const context = await resolveCommerceContext(organizationId(request));
    const data = await getCommerceStorefrontAdminState(context, { storefrontSlug: slug });
    const template = resolveStorefrontTemplate(slug);
    const externalProducts = (await getStorefrontRepositoryProducts())
      .filter((product) => product.isActive)
      .filter((product) => !template || product.template === template)
      .filter((product) => product.isPublicOffer !== false)
      .map((product) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        unit: product.unit,
        stockQuantity: product.stockQuantity,
        priceNet: product.priceNet,
        vatRate: product.vatRate,
      }));
    return NextResponse.json({
      ok: true,
      data: {
        ...data,
        externalCatalog: { repositoryMode: getAruterRepositoryMode(), products: externalProducts },
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return commerceStorefrontErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const slug = storefrontSlug(request, body);
    if (!slug) return NextResponse.json({ ok: false, error: "A storefrontSlug kötelező.", code: "COMMERCE_STOREFRONT_SLUG_REQUIRED" }, { status: 400 });
    const context = await resolveCommerceContext(organizationId(request));
    const defaultFulfillmentSourceId = typeof body.defaultFulfillmentSourceId === "string"
      ? body.defaultFulfillmentSourceId.trim() || null
      : null;
    const data = await updateCommerceStorefrontDefaultFulfillmentSource(context, {
      storefrontSlug: slug,
      defaultFulfillmentSourceId,
    });
    return NextResponse.json({ ok: true, data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return commerceStorefrontErrorResponse(error);
  }
}
