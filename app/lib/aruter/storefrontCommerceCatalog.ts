import "server-only";

import { createCommerceAdminClient } from "../commerce/core/server-db";
import type { AruterProduct, AruterTemplate, AruterUnit } from "./types";

type Row = Record<string, unknown>;

export type StorefrontCatalogMode = "repository" | "commerce";

const COMMERCE_UNIT_TO_ARUTER: Partial<Record<string, AruterUnit>> = {
  DB: "db",
  KG: "kg",
  M: "m",
  M2: "m2",
  M3: "m3",
  RAKLAP: "raklap",
  CSOMAG: "csomag",
  ZSAK: "zsák",
  LADA: "láda",
};

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

function nullableText(value: unknown) {
  const valueText = text(value);
  return valueText || null;
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function configuredCommerceTarget(businessSlug: string) {
  const configuredSlug = process.env.ARUTER_STOREFRONT_COMMERCE_BUSINESS_SLUG?.trim() || "";
  const organizationId = process.env.ARUTER_STOREFRONT_COMMERCE_ORGANIZATION_ID?.trim() || "";
  if (!configuredSlug || configuredSlug !== businessSlug || !organizationId) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) return null;
  return { organizationId };
}

export function getStorefrontCatalogMode(): StorefrontCatalogMode {
  return process.env.ARUTER_STOREFRONT_CATALOG_MODE?.trim().toLowerCase() === "commerce" ? "commerce" : "repository";
}

export async function listCommerceStorefrontCatalogProducts(input: {
  businessSlug: string;
  template: AruterTemplate;
  activeOnly?: boolean;
}): Promise<AruterProduct[]> {
  const businessSlug = input.businessSlug.trim();
  const target = configuredCommerceTarget(businessSlug);
  if (!target) return [];

  const client = createCommerceAdminClient();
  const storefrontResult = await client.from("commerce_storefronts")
    .select("id,default_fulfillment_source_id,status")
    .eq("organization_id", target.organizationId)
    .eq("slug", businessSlug)
    .eq("status", "ACTIVE")
    .is("deleted_at", null)
    .maybeSingle();
  if (storefrontResult.error) throw new Error(`STOREFRONT_COMMERCE_CATALOG_STOREFRONT:${storefrontResult.error.code || "DB"}`);
  if (!storefrontResult.data) return [];

  const storefrontId = text(storefrontResult.data.id);
  const defaultSourceId = nullableText(storefrontResult.data.default_fulfillment_source_id);
  let mappingsQuery = client.from("commerce_storefront_product_mappings")
    .select("external_product_id,external_sku,product_id,variant_id,fulfillment_source_id,active")
    .eq("organization_id", target.organizationId)
    .eq("storefront_id", storefrontId)
    .is("deleted_at", null)
    .order("external_product_id", { ascending: true });
  if (input.activeOnly !== false) mappingsQuery = mappingsQuery.eq("active", true);
  const mappingsResult = await mappingsQuery;
  if (mappingsResult.error) throw new Error(`STOREFRONT_COMMERCE_CATALOG_MAPPINGS:${mappingsResult.error.code || "DB"}`);
  const mappings = (mappingsResult.data || []) as Row[];
  if (!mappings.length) return [];

  const productIds = [...new Set(mappings.map((row) => text(row.product_id)).filter(Boolean))];
  const variantIds = [...new Set(mappings.map((row) => text(row.variant_id)).filter(Boolean))];
  const sourceIds = [...new Set(mappings
    .map((row) => nullableText(row.fulfillment_source_id) || defaultSourceId)
    .filter((value): value is string => Boolean(value)))];

  const [productsResult, variantsResult, pricesResult, identifiersResult] = await Promise.all([
    client.from("commerce_products")
      .select("id,name,description,category_id,status")
      .eq("organization_id", target.organizationId)
      .in("id", productIds)
      .eq("status", "ACTIVE")
      .is("deleted_at", null),
    client.from("commerce_product_variants")
      .select("id,product_id,name,sku,unit,status")
      .eq("organization_id", target.organizationId)
      .in("id", variantIds)
      .eq("status", "ACTIVE")
      .is("deleted_at", null),
    client.from("commerce_prices")
      .select("variant_id,currency,amount,vat_rate_basis_points,valid_from,valid_until,status,created_at")
      .eq("organization_id", target.organizationId)
      .in("variant_id", variantIds)
      .eq("currency", "HUF")
      .eq("status", "ACTIVE")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    client.from("commerce_product_identifiers")
      .select("product_id,variant_id,identifier_type,value,is_primary")
      .eq("organization_id", target.organizationId)
      .in("product_id", productIds)
      .eq("identifier_type", "EAN_GTIN")
      .is("deleted_at", null)
      .order("is_primary", { ascending: false }),
  ]);
  if (productsResult.error) throw new Error(`STOREFRONT_COMMERCE_CATALOG_PRODUCTS:${productsResult.error.code || "DB"}`);
  if (variantsResult.error) throw new Error(`STOREFRONT_COMMERCE_CATALOG_VARIANTS:${variantsResult.error.code || "DB"}`);
  if (pricesResult.error) throw new Error(`STOREFRONT_COMMERCE_CATALOG_PRICES:${pricesResult.error.code || "DB"}`);
  if (identifiersResult.error) throw new Error(`STOREFRONT_COMMERCE_CATALOG_IDENTIFIERS:${identifiersResult.error.code || "DB"}`);

  const products = new Map(((productsResult.data || []) as Row[]).map((row) => [text(row.id), row]));
  const variants = new Map(((variantsResult.data || []) as Row[]).map((row) => [text(row.id), row]));

  const categoryIds = [...new Set(((productsResult.data || []) as Row[]).map((row) => nullableText(row.category_id)).filter((value): value is string => Boolean(value)))];
  const categories = new Map<string, string>();
  if (categoryIds.length) {
    const categoryResult = await client.from("commerce_categories")
      .select("id,name")
      .eq("organization_id", target.organizationId)
      .in("id", categoryIds)
      .is("deleted_at", null);
    if (categoryResult.error) throw new Error(`STOREFRONT_COMMERCE_CATALOG_CATEGORIES:${categoryResult.error.code || "DB"}`);
    for (const row of (categoryResult.data || []) as Row[]) categories.set(text(row.id), text(row.name));
  }

  const sources = new Map<string, Row>();
  if (sourceIds.length) {
    const sourceResult = await client.from("commerce_inventory_sources")
      .select("id,code,name,source_type,active")
      .eq("organization_id", target.organizationId)
      .in("id", sourceIds)
      .eq("source_type", "INTERNAL")
      .eq("active", true)
      .is("deleted_at", null);
    if (sourceResult.error) throw new Error(`STOREFRONT_COMMERCE_CATALOG_SOURCES:${sourceResult.error.code || "DB"}`);
    for (const row of (sourceResult.data || []) as Row[]) sources.set(text(row.id), row);
  }

  const balances = new Map<string, number>();
  if (sourceIds.length) {
    const balanceResult = await client.from("commerce_inventory_balances")
      .select("source_id,variant_id,available_quantity")
      .eq("organization_id", target.organizationId)
      .in("source_id", sourceIds)
      .in("variant_id", variantIds)
      .eq("stock_status", "SELLABLE")
      .is("deleted_at", null);
    if (balanceResult.error) throw new Error(`STOREFRONT_COMMERCE_CATALOG_BALANCES:${balanceResult.error.code || "DB"}`);
    for (const row of (balanceResult.data || []) as Row[]) {
      const key = `${text(row.source_id)}|${text(row.variant_id)}`;
      balances.set(key, (balances.get(key) || 0) + numberValue(row.available_quantity));
    }
  }

  const now = Date.now();
  const prices = new Map<string, Row>();
  for (const row of (pricesResult.data || []) as Row[]) {
    const variantId = text(row.variant_id);
    if (!variantId || prices.has(variantId)) continue;
    const validFrom = nullableText(row.valid_from);
    const validUntil = nullableText(row.valid_until);
    if (validFrom && Date.parse(validFrom) > now) continue;
    if (validUntil && Date.parse(validUntil) < now) continue;
    prices.set(variantId, row);
  }

  const identifiers = (identifiersResult.data || []) as Row[];
  const output: AruterProduct[] = [];
  for (const mapping of mappings) {
    const externalProductId = text(mapping.external_product_id);
    const productId = text(mapping.product_id);
    const variantId = text(mapping.variant_id);
    const product = products.get(productId);
    const variant = variants.get(variantId);
    if (!externalProductId || !product || !variant || text(variant.product_id) !== productId) continue;
    const unit = COMMERCE_UNIT_TO_ARUTER[text(variant.unit).toUpperCase()];
    if (!unit) continue;
    const price = prices.get(variantId);
    if (!price) continue;
    const sourceId = nullableText(mapping.fulfillment_source_id) || defaultSourceId;
    const source = sourceId ? sources.get(sourceId) : null;
    const stockQuantity = sourceId && source ? Math.max(0, balances.get(`${sourceId}|${variantId}`) || 0) : 0;
    const identifier = identifiers.find((row) => text(row.variant_id) === variantId)
      || identifiers.find((row) => text(row.product_id) === productId && !nullableText(row.variant_id));
    const categoryId = nullableText(product.category_id);
    output.push({
      id: externalProductId,
      sku: nullableText(mapping.external_sku) || nullableText(variant.sku) || externalProductId,
      name: text(product.name) || text(variant.name) || externalProductId,
      description: nullableText(product.description) || undefined,
      category: categoryId ? categories.get(categoryId) || "Egyéb" : "Egyéb",
      template: input.template,
      unit,
      priceNet: numberValue(price.amount),
      vatRate: numberValue(price.vat_rate_basis_points) / 100,
      stockQuantity,
      storageZone: source ? text(source.code) || text(source.name) : "",
      barcode: identifier ? text(identifier.value) || undefined : undefined,
      isPublicOffer: true,
      isActive: true,
    });
  }
  return output;
}
