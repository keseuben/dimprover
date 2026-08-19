import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { addDecimal, compareDecimal, normalizeDecimal, normalizeMoney } from "../core/decimal";
import { createCommerceAdminClient } from "../core/server-db";
import { hasCommercePermission } from "../core/permissions";
import type { CommerceContext } from "../core/types";
import { IDENTIFIER_PRIORITY, normalizeProductIdentifier, validateProductIdentifier } from "./identifier";
import type { ProductIdentifierType, ProductStatus, UnitOfMeasure } from "./types";

type Row = Record<string, unknown>;

export type CommerceProductRecord = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  typeModel: string | null;
  categoryId: string | null;
  brandId: string | null;
  manufacturerId: string | null;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
};


export type CommerceProductListItem = CommerceProductRecord & {
  defaultVariantId: string | null;
  sku: string | null;
  unit: UnitOfMeasure | null;
  price: string | null;
  currency: string | null;
  internalAvailableQuantity: string;
  externalAvailableQuantity: string;
  externalSyncStatus: string | null;
  primaryMediaAssetId: string | null;
};

export type CommerceVariantRecord = {
  id: string;
  organizationId: string;
  productId: string;
  name: string;
  sku: string | null;
  unit: UnitOfMeasure;
  status: ProductStatus;
  attributes: Record<string, string | number | boolean | null>;
  createdAt: string;
  updatedAt: string;
};

export type CommerceIdentifierRecord = {
  id: string;
  organizationId: string;
  productId: string;
  variantId: string | null;
  type: ProductIdentifierType;
  value: string;
  normalizedValue: string;
  primary: boolean;
};

export type CommerceProductDetail = CommerceProductRecord & {
  variants: CommerceVariantRecord[];
  identifiers: CommerceIdentifierRecord[];
};

export class CommerceProductError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly causeCode?: string,
  ) {
    super(message);
  }
}

const STATUS_VALUES = new Set<ProductStatus>(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]);
const UNIT_VALUES = new Set<UnitOfMeasure>(["DB", "KG", "G", "M", "M2", "M3", "FM", "L", "CSOMAG", "PAR", "KESZLET"]);
const IDENTIFIER_TYPES = new Set<ProductIdentifierType>(["EAN_GTIN", "DIMPRO_QR", "DIMPRO_BARCODE", "SKU", "SUPPLIER_SKU"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function nullableText(value: unknown) {
  const v = text(value);
  return v || null;
}
function dbError(message: string, error: PostgrestError | null, status = 503): never {
  throw new CommerceProductError(message, "COMMERCE_PRODUCT_DATABASE_ERROR", status, error?.code);
}
function requirePermission(context: CommerceContext, permission: Parameters<typeof hasCommercePermission>[1]) {
  if (!hasCommercePermission(context.permissions, permission)) {
    throw new CommerceProductError("Nincs jogosultság ehhez a Commerce művelethez.", "COMMERCE_PERMISSION_DENIED", 403);
  }
}
function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "termek";
}
function mapProduct(row: Row): CommerceProductRecord {
  return {
    id: text(row.id), organizationId: text(row.organization_id), name: text(row.name), slug: text(row.slug),
    description: nullableText(row.description), typeModel: nullableText(row.type_model), categoryId: nullableText(row.category_id),
    brandId: nullableText(row.brand_id), manufacturerId: nullableText(row.manufacturer_id), status: text(row.status) as ProductStatus,
    createdAt: text(row.created_at), updatedAt: text(row.updated_at),
  };
}
function mapVariant(row: Row): CommerceVariantRecord {
  const rawAttributes = row.attributes;
  const attributes = rawAttributes && typeof rawAttributes === "object" && !Array.isArray(rawAttributes)
    ? rawAttributes as Record<string, string | number | boolean | null>
    : {};
  return {
    id: text(row.id), organizationId: text(row.organization_id), productId: text(row.product_id), name: text(row.name),
    sku: nullableText(row.sku), unit: text(row.unit) as UnitOfMeasure, status: text(row.status) as ProductStatus,
    attributes, createdAt: text(row.created_at), updatedAt: text(row.updated_at),
  };
}
function mapIdentifier(row: Row): CommerceIdentifierRecord {
  return {
    id: text(row.id), organizationId: text(row.organization_id), productId: text(row.product_id),
    variantId: nullableText(row.variant_id), type: text(row.identifier_type) as ProductIdentifierType,
    value: text(row.value), normalizedValue: text(row.normalized_value), primary: Boolean(row.is_primary),
  };
}

async function verifyScopedReference(client: SupabaseClient, context: CommerceContext, table: string, id: string | null) {
  if (!id) return;
  const result = await client.from(table).select("id").eq("id", id).eq("organization_id", context.organizationId).maybeSingle();
  if (result.error) dbError("A kapcsolódó Commerce törzsadat nem ellenőrizhető.", result.error);
  if (!result.data) throw new CommerceProductError("A kapcsolódó törzsadat nem található ebben a szervezetben.", "COMMERCE_REFERENCE_SCOPE_MISMATCH", 400);
}

export async function listCommerceProducts(context: CommerceContext, input: { query?: string; status?: string; limit?: number; offset?: number } = {}) {
  requirePermission(context, "commerce.product.read");
  const client = createCommerceAdminClient();
  const limit = Math.max(1, Math.min(200, Math.round(input.limit ?? 50)));
  const offset = Math.max(0, Math.round(input.offset ?? 0));
  let query = client.from("commerce_products")
    .select("id,organization_id,name,slug,description,type_model,category_id,brand_id,manufacturer_id,status,created_at,updated_at", { count: "exact" })
    .eq("organization_id", context.organizationId)
    .is("archived_at", null)
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);
  const search = text(input.query).replace(/[%_,().]/g, "");
  if (search) query = query.or(`name.ilike.%${search}%,type_model.ilike.%${search}%`);
  const requestedStatus = text(input.status).toUpperCase();
  if (requestedStatus && STATUS_VALUES.has(requestedStatus as ProductStatus)) query = query.eq("status", requestedStatus);
  const result = await query;
  if (result.error) dbError("A terméklista lekérése sikertelen.", result.error);
  const products = ((result.data || []) as Row[]).map(mapProduct);
  if (!products.length) return { items: [] as CommerceProductListItem[], total: result.count ?? 0, limit, offset };

  const productIds = products.map((product) => product.id);
  const variantsResult = await client.from("commerce_product_variants")
    .select("id,organization_id,product_id,name,sku,unit,attributes,status,created_at,updated_at")
    .eq("organization_id", context.organizationId)
    .in("product_id", productIds)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (variantsResult.error) dbError("A terméklista változatai nem tölthetők be.", variantsResult.error);
  const variants = ((variantsResult.data || []) as Row[]).map(mapVariant);
  const variantIds = variants.map((variant) => variant.id);
  if (!variantIds.length) {
    return {
      items: products.map((product) => ({ ...product, defaultVariantId:null, sku:null, unit:null, price:null, currency:null, internalAvailableQuantity:"0", externalAvailableQuantity:"0", externalSyncStatus:null, primaryMediaAssetId:null })),
      total: result.count ?? 0, limit, offset,
    };
  }

  const [pricesResult, balancesResult, externalResult, mediaLinksResult] = await Promise.all([
    client.from("commerce_prices")
      .select("variant_id,currency,amount,valid_from,valid_until,status,created_at")
      .eq("organization_id", context.organizationId).in("variant_id", variantIds).eq("status", "ACTIVE").is("archived_at", null).order("created_at", { ascending:false }),
    client.from("commerce_inventory_balances")
      .select("variant_id,available_quantity")
      .eq("organization_id", context.organizationId).in("variant_id", variantIds).eq("stock_status", "SELLABLE").is("archived_at", null),
    client.from("commerce_external_inventory_snapshots")
      .select("variant_id,quantity,sync_status,last_sync_at")
      .eq("organization_id", context.organizationId).in("variant_id", variantIds),
    client.from("commerce_media_links")
      .select("asset_id,linked_entity_id,is_primary,sort_order")
      .eq("organization_id", context.organizationId).eq("link_type", "PRODUCT").in("linked_entity_id", productIds).is("archived_at", null)
      .order("is_primary", { ascending:false }).order("sort_order", { ascending:true }),
  ]);
  if (pricesResult.error) dbError("A termékárak összesítése sikertelen.", pricesResult.error);
  if (balancesResult.error) dbError("A belső készlet összesítése sikertelen.", balancesResult.error);
  if (externalResult.error) dbError("A külső készlet összesítése sikertelen.", externalResult.error);
  if (mediaLinksResult.error) dbError("A termékképek összesítése sikertelen.", mediaLinksResult.error);

  const variantsByProduct = new Map<string, CommerceVariantRecord[]>();
  for (const variant of variants) variantsByProduct.set(variant.productId, [...(variantsByProduct.get(variant.productId) || []), variant]);
  const productByVariant = new Map(variants.map((variant) => [variant.id, variant.productId]));
  const internalByProduct = new Map<string, string>();
  for (const row of (balancesResult.data || []) as Row[]) {
    const productId = productByVariant.get(text(row.variant_id));
    if (!productId) continue;
    const quantity = normalizeDecimal(String(row.available_quantity ?? "0"));
    internalByProduct.set(productId, addDecimal(internalByProduct.get(productId) || "0", quantity));
  }
  const externalByProduct = new Map<string, string>();
  const externalStatusByProduct = new Map<string, string>();
  const syncRank: Record<string, number> = { LIVE:1, FRESH:2, STALE:3, ERROR:4, OFFLINE:5 };
  for (const row of (externalResult.data || []) as Row[]) {
    const productId = productByVariant.get(text(row.variant_id));
    if (!productId) continue;
    const quantity = normalizeDecimal(String(row.quantity ?? "0"));
    externalByProduct.set(productId, addDecimal(externalByProduct.get(productId) || "0", quantity));
    const status = text(row.sync_status).toUpperCase();
    const previous = externalStatusByProduct.get(productId);
    if (!previous || (syncRank[status] || 99) > (syncRank[previous] || 99)) externalStatusByProduct.set(productId, status);
  }
  const now = Date.now();
  const pricesByProduct = new Map<string, { price:string; currency:string }>();
  for (const row of (pricesResult.data || []) as Row[]) {
    const productId = productByVariant.get(text(row.variant_id));
    if (!productId) continue;
    const from = nullableText(row.valid_from);
    const until = nullableText(row.valid_until);
    if (from && Date.parse(from) > now) continue;
    if (until && Date.parse(until) < now) continue;
    const currency = text(row.currency) || "HUF";
    const amount = normalizeMoney(String(row.amount ?? "0"));
    const current = pricesByProduct.get(productId);
    if (!current || (currency === "HUF" && current.currency !== "HUF") || (currency === current.currency && compareDecimal(amount, current.price, 4) < 0)) {
      pricesByProduct.set(productId, { price:amount, currency });
    }
  }


  const mediaByProduct = new Map<string, string>();
  for (const row of (mediaLinksResult.data || []) as Row[]) {
    const productId = text(row.linked_entity_id);
    const assetId = text(row.asset_id);
    if (productId && assetId && !mediaByProduct.has(productId)) mediaByProduct.set(productId, assetId);
  }

  const items: CommerceProductListItem[] = products.map((product) => {
    const defaultVariant = variantsByProduct.get(product.id)?.[0] || null;
    const price = pricesByProduct.get(product.id) || null;
    return {
      ...product,
      defaultVariantId: defaultVariant?.id || null,
      sku: defaultVariant?.sku || null,
      unit: defaultVariant?.unit || null,
      price: price?.price || null,
      currency: price?.currency || null,
      internalAvailableQuantity: internalByProduct.get(product.id) || "0",
      externalAvailableQuantity: externalByProduct.get(product.id) || "0",
      externalSyncStatus: externalStatusByProduct.get(product.id) || null,
      primaryMediaAssetId: mediaByProduct.get(product.id) || null,
    };
  });
  return { items, total: result.count ?? 0, limit, offset };
}

export async function getCommerceProduct(context: CommerceContext, productIdInput: unknown): Promise<CommerceProductDetail> {
  requirePermission(context, "commerce.product.read");
  const productId = text(productIdInput);
  if (!productId) throw new CommerceProductError("A termékazonosító kötelező.", "COMMERCE_PRODUCT_ID_REQUIRED", 400);
  const client = createCommerceAdminClient();
  const [productResult, variantResult, identifierResult] = await Promise.all([
    client.from("commerce_products")
      .select("id,organization_id,name,slug,description,type_model,category_id,brand_id,manufacturer_id,status,created_at,updated_at")
      .eq("organization_id", context.organizationId).eq("id", productId).is("archived_at", null).maybeSingle(),
    client.from("commerce_product_variants")
      .select("id,organization_id,product_id,name,sku,unit,attributes,status,created_at,updated_at")
      .eq("organization_id", context.organizationId).eq("product_id", productId).is("archived_at", null).order("created_at"),
    client.from("commerce_product_identifiers")
      .select("id,organization_id,product_id,variant_id,identifier_type,value,normalized_value,is_primary")
      .eq("organization_id", context.organizationId).eq("product_id", productId).is("archived_at", null).order("created_at"),
  ]);
  if (productResult.error) dbError("A termék lekérése sikertelen.", productResult.error);
  if (!productResult.data) throw new CommerceProductError("A termék nem található.", "COMMERCE_PRODUCT_NOT_FOUND", 404);
  if (variantResult.error) dbError("A termékváltozatok lekérése sikertelen.", variantResult.error);
  if (identifierResult.error) dbError("A termékazonosítók lekérése sikertelen.", identifierResult.error);
  return {
    ...mapProduct(productResult.data as Row),
    variants: ((variantResult.data || []) as Row[]).map(mapVariant),
    identifiers: ((identifierResult.data || []) as Row[]).map(mapIdentifier),
  };
}

export async function createCommerceProduct(context: CommerceContext, input: Record<string, unknown>): Promise<CommerceProductDetail> {
  requirePermission(context, "commerce.product.write");
  const client = createCommerceAdminClient();
  const name = text(input.name);
  if (!name) throw new CommerceProductError("A terméknév kötelező.", "COMMERCE_PRODUCT_NAME_REQUIRED", 400);
  const categoryId = nullableText(input.categoryId);
  const brandId = nullableText(input.brandId);
  const manufacturerId = nullableText(input.manufacturerId);
  await Promise.all([
    verifyScopedReference(client, context, "commerce_categories", categoryId),
    verifyScopedReference(client, context, "commerce_brands", brandId),
    verifyScopedReference(client, context, "commerce_manufacturers", manufacturerId),
  ]);
  const requestedStatus = text(input.status).toUpperCase();
  const status: ProductStatus = STATUS_VALUES.has(requestedStatus as ProductStatus) ? requestedStatus as ProductStatus : "DRAFT";
  const slug = slugify(text(input.slug) || name);
  const rawVariant = input.defaultVariant && typeof input.defaultVariant === "object" && !Array.isArray(input.defaultVariant)
    ? input.defaultVariant as Record<string, unknown>
    : {};
  const unitCandidate = text(rawVariant.unit).toUpperCase();
  const unit: UnitOfMeasure = UNIT_VALUES.has(unitCandidate as UnitOfMeasure) ? unitCandidate as UnitOfMeasure : "DB";
  const sku = nullableText(rawVariant.sku);
  const identifiers: Array<{ type: ProductIdentifierType; value: string; normalizedValue: string; primary: boolean }> = [];
  const requestedIdentifiers = Array.isArray(input.identifiers) ? input.identifiers : [];
  for (const raw of requestedIdentifiers) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const identifier = raw as Record<string, unknown>;
    const type = text(identifier.type).toUpperCase() as ProductIdentifierType;
    if (!IDENTIFIER_TYPES.has(type)) throw new CommerceProductError("Ismeretlen termékazonosító típus.", "COMMERCE_IDENTIFIER_TYPE_INVALID", 400);
    const value = text(identifier.value);
    const validation = validateProductIdentifier(type, value);
    if (!validation.ok) throw new CommerceProductError("Érvénytelen termékazonosító.", validation.reason, 400);
    if (!identifiers.some((item) => item.type === type && item.normalizedValue === validation.normalized)) {
      identifiers.push({ type, value, normalizedValue: validation.normalized, primary: Boolean(identifier.primary) });
    }
  }
  if (sku) {
    const normalizedSku = normalizeProductIdentifier("SKU", sku);
    if (!identifiers.some((item) => item.type === "SKU" && item.normalizedValue === normalizedSku)) {
      identifiers.push({ type: "SKU", value: sku, normalizedValue: normalizedSku, primary: identifiers.length === 0 });
    }
  }
  const rpc = await client.rpc("commerce_product_create_atomic", {
    p_organization_id: context.organizationId,
    p_name: name,
    p_slug: slug,
    p_description: nullableText(input.description),
    p_type_model: nullableText(input.typeModel),
    p_category_id: categoryId,
    p_brand_id: brandId,
    p_manufacturer_id: manufacturerId,
    p_status: status,
    p_default_variant: {
      name: text(rawVariant.name) || name,
      sku,
      unit,
      attributes: rawVariant.attributes && typeof rawVariant.attributes === "object" && !Array.isArray(rawVariant.attributes) ? rawVariant.attributes : {},
    },
    p_identifiers: identifiers,
  });
  if (rpc.error) {
    const message = rpc.error.message || "";
    if (rpc.error.code === "23505") throw new CommerceProductError("A termék slug, cikkszám vagy azonosító már használatban van.", "COMMERCE_PRODUCT_DUPLICATE", 409, rpc.error.code);
    const known = [
      "COMMERCE_ORGANIZATION_NOT_ACTIVE","COMMERCE_PRODUCT_NAME_REQUIRED","COMMERCE_PRODUCT_SLUG_REQUIRED",
      "COMMERCE_PRODUCT_STATUS_INVALID","COMMERCE_CATEGORY_SCOPE_MISMATCH","COMMERCE_BRAND_SCOPE_MISMATCH",
      "COMMERCE_MANUFACTURER_SCOPE_MISMATCH","COMMERCE_VARIANT_UNIT_INVALID","COMMERCE_IDENTIFIERS_ARRAY_REQUIRED",
      "COMMERCE_IDENTIFIER_TYPE_INVALID","COMMERCE_IDENTIFIER_INVALID",
    ].find((code) => message.includes(code));
    if (known) throw new CommerceProductError("A termék adatai nem felelnek meg a Commerce szabályoknak.", known, 400, rpc.error.code);
    dbError("A termék atomi létrehozása sikertelen.", rpc.error);
  }
  const payload = rpc.data && typeof rpc.data === "object" && !Array.isArray(rpc.data) ? rpc.data as Row : null;
  const productId = text(payload?.productId);
  if (!productId) throw new CommerceProductError("A termék létrejött, de az azonosító nem érkezett vissza.", "COMMERCE_PRODUCT_CREATE_RESPONSE_INVALID", 500);
  return getCommerceProduct(context, productId);
}

export async function updateCommerceProduct(context: CommerceContext, productIdInput: unknown, input: Record<string, unknown>): Promise<CommerceProductDetail> {
  requirePermission(context, "commerce.product.write");
  const productId = text(productIdInput);
  if (!productId) throw new CommerceProductError("A termékazonosító kötelező.", "COMMERCE_PRODUCT_ID_REQUIRED", 400);
  const client = createCommerceAdminClient();
  const current = await client.from("commerce_products").select("id,name,slug").eq("organization_id", context.organizationId).eq("id", productId).is("archived_at", null).maybeSingle();
  if (current.error) dbError("A termék ellenőrzése sikertelen.", current.error);
  if (!current.data) throw new CommerceProductError("A termék nem található.", "COMMERCE_PRODUCT_NOT_FOUND", 404);
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = text(input.name);
    if (!name) throw new CommerceProductError("A terméknév nem lehet üres.", "COMMERCE_PRODUCT_NAME_REQUIRED", 400);
    patch.name = name;
  }
  if (input.slug !== undefined) patch.slug = slugify(text(input.slug) || text((current.data as Row).name));
  if (input.description !== undefined) patch.description = nullableText(input.description);
  if (input.typeModel !== undefined) patch.type_model = nullableText(input.typeModel);
  if (input.status !== undefined) {
    const status = text(input.status).toUpperCase();
    if (!STATUS_VALUES.has(status as ProductStatus)) throw new CommerceProductError("Ismeretlen termékállapot.", "COMMERCE_PRODUCT_STATUS_INVALID", 400);
    patch.status = status;
  }
  for (const [inputKey, dbKey, table] of [
    ["categoryId", "category_id", "commerce_categories"],
    ["brandId", "brand_id", "commerce_brands"],
    ["manufacturerId", "manufacturer_id", "commerce_manufacturers"],
  ] as const) {
    if (input[inputKey] !== undefined) {
      const id = nullableText(input[inputKey]);
      await verifyScopedReference(client, context, table, id);
      patch[dbKey] = id;
    }
  }
  if (!Object.keys(patch).length) return getCommerceProduct(context, productId);
  const result = await client.from("commerce_products").update(patch).eq("organization_id", context.organizationId).eq("id", productId).select("id").maybeSingle();
  if (result.error) {
    if (result.error.code === "23505") throw new CommerceProductError("Ilyen termék slug már létezik.", "COMMERCE_PRODUCT_DUPLICATE", 409, result.error.code);
    dbError("A termék módosítása sikertelen.", result.error);
  }
  if (!result.data) throw new CommerceProductError("A termék nem található.", "COMMERCE_PRODUCT_NOT_FOUND", 404);
  return getCommerceProduct(context, productId);
}

export async function resolveCommerceProductByCode(context: CommerceContext, codeInput: unknown) {
  requirePermission(context, "commerce.product.read");
  const code = text(codeInput);
  if (!code) throw new CommerceProductError("Az azonosító kód kötelező.", "COMMERCE_IDENTIFIER_REQUIRED", 400);
  const client = createCommerceAdminClient();
  const normalizedValues = [...new Set([
    normalizeProductIdentifier("EAN_GTIN", code),
    normalizeProductIdentifier("DIMPRO_QR", code),
  ].filter(Boolean))];
  const result = await client.from("commerce_product_identifiers")
    .select("id,organization_id,product_id,variant_id,identifier_type,value,normalized_value,is_primary")
    .eq("organization_id", context.organizationId)
    .in("normalized_value", normalizedValues)
    .is("archived_at", null);
  if (result.error) dbError("A termékazonosító keresése sikertelen.", result.error);
  const matches = ((result.data || []) as Row[]).map(mapIdentifier)
    .sort((a, b) => (IDENTIFIER_PRIORITY[a.type] ?? 99) - (IDENTIFIER_PRIORITY[b.type] ?? 99));
  const identifier = matches[0] || null;
  if (!identifier) return null;
  const product = await getCommerceProduct(context, identifier.productId);
  return { identifier, product, matchedBy: identifier.type };
}
