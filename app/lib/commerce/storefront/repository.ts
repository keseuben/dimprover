import type { PostgrestError } from "@supabase/supabase-js";
import { addDecimal, compareDecimal, normalizeQuantity } from "../core/decimal";
import { hasCommercePermission } from "../core/permissions";
import { createCommerceAdminClient } from "../core/server-db";
import type { CommerceContext } from "../core/types";
import type {
  CommerceFulfillmentRequirement,
  CommerceFulfillmentSourceSelection,
  CommerceStorefrontMappingResolution,
  CommerceStorefrontProductMapping,
} from "./types";

type Row = Record<string, unknown>;

type StorefrontRecord = {
  id: string;
  organizationId: string;
  slug: string;
  status: string;
  defaultFulfillmentSourceId: string | null;
};

type InventorySourceRecord = {
  id: string;
  code: string;
  name: string;
};

export class CommerceStorefrontError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly causeCode?: string,
  ) {
    super(message);
  }
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

function nullableText(value: unknown) {
  const valueText = text(value);
  return valueText || null;
}

function dbError(message: string, error: PostgrestError | null, status = 503): never {
  throw new CommerceStorefrontError(message, "COMMERCE_STOREFRONT_DATABASE_ERROR", status, error?.code);
}

function requireRead(context: CommerceContext) {
  if (!hasCommercePermission(context.permissions, "commerce.product.read")) {
    throw new CommerceStorefrontError("Nincs Storefront mapping olvasási jogosultság.", "COMMERCE_PERMISSION_DENIED", 403);
  }
}

function requireWrite(context: CommerceContext) {
  if (!hasCommercePermission(context.permissions, "commerce.product.write")) {
    throw new CommerceStorefrontError("Nincs Storefront mapping módosítási jogosultság.", "COMMERCE_PERMISSION_DENIED", 403);
  }
}

function requireInventoryRead(context: CommerceContext) {
  if (!hasCommercePermission(context.permissions, "commerce.inventory.read")) {
    throw new CommerceStorefrontError("Nincs készletforrás-feloldási jogosultság.", "COMMERCE_PERMISSION_DENIED", 403);
  }
}

function mapStorefront(row: Row): StorefrontRecord {
  return {
    id: text(row.id),
    organizationId: text(row.organization_id),
    slug: text(row.slug),
    status: text(row.status),
    defaultFulfillmentSourceId: nullableText(row.default_fulfillment_source_id),
  };
}

function mapMapping(row: Row): CommerceStorefrontProductMapping {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  return {
    id: text(row.id),
    organizationId: text(row.organization_id),
    storefrontId: text(row.storefront_id),
    externalProductId: text(row.external_product_id),
    externalSku: nullableText(row.external_sku),
    productId: text(row.product_id),
    variantId: text(row.variant_id),
    fulfillmentSourceId: nullableText(row.fulfillment_source_id),
    active: Boolean(row.active),
    metadata,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    deletedAt: nullableText(row.deleted_at),
    archivedAt: nullableText(row.archived_at),
  };
}

async function findStorefront(context: CommerceContext, storefrontSlugInput: unknown) {
  const storefrontSlug = text(storefrontSlugInput);
  if (!storefrontSlug) return null;
  const client = createCommerceAdminClient();
  const result = await client
    .from("commerce_storefronts")
    .select("id,organization_id,slug,status,default_fulfillment_source_id")
    .eq("organization_id", context.organizationId)
    .eq("slug", storefrontSlug)
    .is("deleted_at", null)
    .maybeSingle();
  if (result.error) dbError("A Commerce Storefront nem olvasható.", result.error);
  return result.data ? mapStorefront(result.data as Row) : null;
}

async function requireStorefront(context: CommerceContext, storefrontSlugInput: unknown) {
  const storefront = await findStorefront(context, storefrontSlugInput);
  if (!storefront) {
    throw new CommerceStorefrontError("A Commerce Storefront nem található.", "COMMERCE_STOREFRONT_NOT_FOUND", 404);
  }
  if (storefront.status !== "ACTIVE") {
    throw new CommerceStorefrontError("A Commerce Storefront nem aktív.", "COMMERCE_STOREFRONT_NOT_ACTIVE", 409);
  }
  return storefront;
}

async function verifyMappingTargets(
  context: CommerceContext,
  input: { productId: string; variantId: string; fulfillmentSourceId: string | null },
) {
  const client = createCommerceAdminClient();
  const [productResult, variantResult, sourceResult] = await Promise.all([
    client.from("commerce_products")
      .select("id,status")
      .eq("organization_id", context.organizationId)
      .eq("id", input.productId)
      .is("deleted_at", null)
      .maybeSingle(),
    client.from("commerce_product_variants")
      .select("id,product_id,status")
      .eq("organization_id", context.organizationId)
      .eq("id", input.variantId)
      .is("deleted_at", null)
      .maybeSingle(),
    input.fulfillmentSourceId
      ? client.from("commerce_inventory_sources")
        .select("id,source_type,active")
        .eq("organization_id", context.organizationId)
        .eq("id", input.fulfillmentSourceId)
        .is("deleted_at", null)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (productResult.error) dbError("A mapping terméke nem ellenőrizhető.", productResult.error);
  if (variantResult.error) dbError("A mapping termékváltozata nem ellenőrizhető.", variantResult.error);
  if (sourceResult.error) dbError("A mapping fulfillment forrása nem ellenőrizhető.", sourceResult.error as PostgrestError);
  if (!productResult.data) throw new CommerceStorefrontError("A mapping terméke nem található.", "COMMERCE_STOREFRONT_PRODUCT_NOT_FOUND", 404);
  if (!variantResult.data) throw new CommerceStorefrontError("A mapping termékváltozata nem található.", "COMMERCE_STOREFRONT_VARIANT_NOT_FOUND", 404);
  if (text(variantResult.data.product_id) !== input.productId) {
    throw new CommerceStorefrontError("A termékváltozat nem a megadott termékhez tartozik.", "COMMERCE_STOREFRONT_PRODUCT_VARIANT_MISMATCH", 400);
  }
  if (input.fulfillmentSourceId) {
    if (!sourceResult.data || text(sourceResult.data.source_type) !== "INTERNAL" || !Boolean(sourceResult.data.active)) {
      throw new CommerceStorefrontError("A fulfillment forrás nem aktív belső készletforrás.", "COMMERCE_STOREFRONT_FULFILLMENT_SOURCE_INVALID", 400);
    }
  }
}

export async function listCommerceStorefrontProductMappings(
  context: CommerceContext,
  input: { storefrontSlug?: string; externalProductId?: string; activeOnly?: boolean } = {},
) {
  requireRead(context);
  const client = createCommerceAdminClient();
  let storefrontId: string | null = null;
  if (text(input.storefrontSlug)) {
    const storefront = await requireStorefront(context, input.storefrontSlug);
    storefrontId = storefront.id;
  }
  let query = client.from("commerce_storefront_product_mappings")
    .select("id,organization_id,storefront_id,external_product_id,external_sku,product_id,variant_id,fulfillment_source_id,active,metadata,created_at,updated_at,deleted_at,archived_at")
    .eq("organization_id", context.organizationId)
    .is("deleted_at", null)
    .order("external_product_id", { ascending: true });
  if (storefrontId) query = query.eq("storefront_id", storefrontId);
  if (text(input.externalProductId)) query = query.eq("external_product_id", text(input.externalProductId));
  if (input.activeOnly !== false) query = query.eq("active", true);
  const result = await query;
  if (result.error) dbError("A Storefront termékmappingek nem olvashatók.", result.error);
  return ((result.data || []) as Row[]).map(mapMapping);
}

export async function upsertCommerceStorefrontProductMapping(context: CommerceContext, input: Record<string, unknown>) {
  requireWrite(context);
  const storefront = await requireStorefront(context, input.storefrontSlug);
  const externalProductId = text(input.externalProductId);
  const externalSku = nullableText(input.externalSku);
  const productId = text(input.productId);
  const variantId = text(input.variantId);
  const fulfillmentSourceId = nullableText(input.fulfillmentSourceId);
  if (!externalProductId || !productId || !variantId) {
    throw new CommerceStorefrontError(
      "A storefrontSlug, externalProductId, productId és variantId kötelező.",
      "COMMERCE_STOREFRONT_MAPPING_REQUIRED_FIELDS",
      400,
    );
  }
  if (externalProductId.length > 180 || (externalSku && externalSku.length > 180)) {
    throw new CommerceStorefrontError("A külső termékazonosító túl hosszú.", "COMMERCE_STOREFRONT_MAPPING_EXTERNAL_ID_INVALID", 400);
  }
  await verifyMappingTargets(context, { productId, variantId, fulfillmentSourceId });
  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
    ? input.metadata as Record<string, unknown>
    : {};
  const active = input.active === undefined ? true : Boolean(input.active);
  const client = createCommerceAdminClient();
  const existing = await client.from("commerce_storefront_product_mappings")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("storefront_id", storefront.id)
    .eq("external_product_id", externalProductId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing.error) dbError("A meglévő Storefront mapping nem ellenőrizhető.", existing.error);
  const payload = {
    organization_id: context.organizationId,
    storefront_id: storefront.id,
    external_product_id: externalProductId,
    external_sku: externalSku,
    product_id: productId,
    variant_id: variantId,
    fulfillment_source_id: fulfillmentSourceId,
    active,
    metadata,
  };
  const result = existing.data
    ? await client.from("commerce_storefront_product_mappings")
      .update(payload)
      .eq("organization_id", context.organizationId)
      .eq("id", text(existing.data.id))
      .select("*")
      .single()
    : await client.from("commerce_storefront_product_mappings").insert(payload).select("*").single();
  if (result.error) {
    if (result.error.code === "23505") {
      throw new CommerceStorefrontError("Ehhez a Storefronthoz már létezik ütköző termékmapping.", "COMMERCE_STOREFRONT_MAPPING_DUPLICATE", 409, result.error.code);
    }
    dbError("A Storefront termékmapping mentése sikertelen.", result.error);
  }
  return mapMapping(result.data as Row);
}

export async function resolveCommerceStorefrontProductMapping(
  context: CommerceContext,
  input: { storefrontSlug: string; externalProductId?: string | null; externalSku?: string | null },
): Promise<CommerceStorefrontMappingResolution | null> {
  requireRead(context);
  const storefront = await findStorefront(context, input.storefrontSlug);
  if (!storefront || storefront.status !== "ACTIVE") return null;
  const externalProductId = text(input.externalProductId);
  const externalSku = text(input.externalSku);
  if (!externalProductId && !externalSku) return null;
  const client = createCommerceAdminClient();
  let mappingRow: Row | null = null;
  let matchedBy: CommerceStorefrontMappingResolution["matchedBy"] = "EXTERNAL_PRODUCT_ID";
  if (externalProductId) {
    const byProduct = await client.from("commerce_storefront_product_mappings")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("storefront_id", storefront.id)
      .eq("external_product_id", externalProductId)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (byProduct.error) dbError("A Storefront termékmapping feloldása sikertelen.", byProduct.error);
    mappingRow = byProduct.data as Row | null;
  }
  if (!mappingRow && externalSku) {
    const bySku = await client.from("commerce_storefront_product_mappings")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("storefront_id", storefront.id)
      .ilike("external_sku", externalSku)
      .eq("active", true)
      .is("deleted_at", null)
      .limit(2);
    if (bySku.error) dbError("A Storefront SKU mapping feloldása sikertelen.", bySku.error);
    const rows = (bySku.data || []) as Row[];
    if (rows.length > 1) {
      throw new CommerceStorefrontError("A Storefront SKU több mappingre mutat.", "COMMERCE_STOREFRONT_MAPPING_AMBIGUOUS", 409);
    }
    mappingRow = rows[0] || null;
    matchedBy = "EXTERNAL_SKU";
  }
  if (!mappingRow) return null;
  const mapping = mapMapping(mappingRow);
  const [productResult, variantResult] = await Promise.all([
    client.from("commerce_products")
      .select("id,name,status")
      .eq("organization_id", context.organizationId)
      .eq("id", mapping.productId)
      .eq("status", "ACTIVE")
      .is("deleted_at", null)
      .maybeSingle(),
    client.from("commerce_product_variants")
      .select("id,product_id,name,sku,unit,status")
      .eq("organization_id", context.organizationId)
      .eq("id", mapping.variantId)
      .eq("status", "ACTIVE")
      .is("deleted_at", null)
      .maybeSingle(),
  ]);
  if (productResult.error) dbError("A mapping Commerce terméke nem olvasható.", productResult.error);
  if (variantResult.error) dbError("A mapping Commerce termékváltozata nem olvasható.", variantResult.error);
  if (!productResult.data || !variantResult.data || text(variantResult.data.product_id) !== mapping.productId) return null;
  return {
    storefrontId: storefront.id,
    storefrontSlug: storefront.slug,
    mapping,
    product: { id: text(productResult.data.id), name: text(productResult.data.name), status: text(productResult.data.status) },
    variant: {
      id: text(variantResult.data.id),
      productId: text(variantResult.data.product_id),
      name: text(variantResult.data.name),
      sku: nullableText(variantResult.data.sku),
      unit: text(variantResult.data.unit),
      status: text(variantResult.data.status),
    },
    matchedBy,
  };
}

function aggregateRequirements(requirements: CommerceFulfillmentRequirement[]) {
  const aggregated = new Map<string, string>();
  for (const requirement of requirements) {
    const variantId = text(requirement.variantId);
    if (!variantId) continue;
    let quantity: string;
    try {
      quantity = normalizeQuantity(text(requirement.quantity).replace(",", "."));
    } catch {
      throw new CommerceStorefrontError("A fulfillment mennyiség hibás.", "COMMERCE_STOREFRONT_FULFILLMENT_QUANTITY_INVALID", 400);
    }
    if (compareDecimal(quantity, "0") <= 0) {
      throw new CommerceStorefrontError("A fulfillment mennyiség legyen pozitív.", "COMMERCE_STOREFRONT_FULFILLMENT_QUANTITY_INVALID", 400);
    }
    aggregated.set(variantId, addDecimal(aggregated.get(variantId) || "0", quantity));
  }
  return aggregated;
}

function emptySelection(reason: CommerceFulfillmentSourceSelection["reason"]): CommerceFulfillmentSourceSelection {
  return { sourceId: null, sourceCode: null, sourceName: null, selectedBy: "NONE", reservationReady: false, reason, shortages: [] };
}

export async function resolveCommerceStorefrontFulfillmentSource(
  context: CommerceContext,
  input: {
    storefrontSlug?: string | null;
    configuredSourceId?: string | null;
    preferredSourceIds?: Array<string | null | undefined>;
    requirements: CommerceFulfillmentRequirement[];
    autoSelect?: boolean;
  },
): Promise<CommerceFulfillmentSourceSelection> {
  requireInventoryRead(context);
  const requirements = aggregateRequirements(input.requirements);
  if (!requirements.size) return emptySelection("NO_REQUIREMENTS");
  const storefront = text(input.storefrontSlug) ? await findStorefront(context, input.storefrontSlug) : null;
  const configuredSourceId = text(input.configuredSourceId);
  const mappedSourceIds = [...new Set((input.preferredSourceIds || []).map(text).filter(Boolean))];
  if (!configuredSourceId && mappedSourceIds.length > 1) return emptySelection("MAPPING_SOURCE_CONFLICT");

  const client = createCommerceAdminClient();
  const sourceResult = await client.from("commerce_inventory_sources")
    .select("id,code,name")
    .eq("organization_id", context.organizationId)
    .eq("source_type", "INTERNAL")
    .eq("active", true)
    .is("deleted_at", null)
    .order("code", { ascending: true });
  if (sourceResult.error) dbError("A fulfillment készletforrások nem olvashatók.", sourceResult.error);
  const sources = ((sourceResult.data || []) as Row[]).map((row): InventorySourceRecord => ({ id: text(row.id), code: text(row.code), name: text(row.name) }));
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  const orderedCandidates: Array<{ id: string; selectedBy: Exclude<CommerceFulfillmentSourceSelection["selectedBy"], "NONE"> }> = [];
  const pushCandidate = (id: string | null | undefined, selectedBy: Exclude<CommerceFulfillmentSourceSelection["selectedBy"], "NONE">) => {
    const value = text(id);
    if (value && !orderedCandidates.some((candidate) => candidate.id === value)) orderedCandidates.push({ id: value, selectedBy });
  };
  pushCandidate(configuredSourceId, "CONFIGURED");
  pushCandidate(mappedSourceIds[0], "MAPPING");
  pushCandidate(storefront?.defaultFulfillmentSourceId, "STOREFRONT_DEFAULT");
  if (input.autoSelect) {
    for (const source of sources) pushCandidate(source.id, "AUTO_STOCK");
  }
  if (!orderedCandidates.length) return emptySelection("NO_ELIGIBLE_SOURCE");

  const candidateIds = orderedCandidates.map((candidate) => candidate.id).filter((id) => sourceById.has(id));
  if (!candidateIds.length) return emptySelection("SOURCE_NOT_AVAILABLE");
  const variantIds = [...requirements.keys()];
  const balancesResult = await client.from("commerce_inventory_balances")
    .select("source_id,variant_id,available_quantity")
    .eq("organization_id", context.organizationId)
    .eq("stock_status", "SELLABLE")
    .in("source_id", candidateIds)
    .in("variant_id", variantIds)
    .is("deleted_at", null);
  if (balancesResult.error) dbError("A fulfillment készletegyenlegek nem olvashatók.", balancesResult.error);
  const available = new Map<string, string>();
  for (const row of (balancesResult.data || []) as Row[]) {
    available.set(`${text(row.source_id)}|${text(row.variant_id)}`, text(row.available_quantity) || "0");
  }

  let firstInsufficient: CommerceFulfillmentSourceSelection | null = null;
  for (const candidate of orderedCandidates) {
    const source = sourceById.get(candidate.id);
    if (!source) continue;
    const shortages = [...requirements.entries()]
      .map(([variantId, required]) => ({
        variantId,
        required,
        available: available.get(`${source.id}|${variantId}`) || "0",
      }))
      .filter((item) => compareDecimal(item.available, item.required) < 0);
    if (!shortages.length) {
      return {
        sourceId: source.id,
        sourceCode: source.code,
        sourceName: source.name,
        selectedBy: candidate.selectedBy,
        reservationReady: true,
        reason: "SELECTED",
        shortages: [],
      };
    }
    if (!firstInsufficient) {
      firstInsufficient = {
        sourceId: source.id,
        sourceCode: source.code,
        sourceName: source.name,
        selectedBy: candidate.selectedBy,
        reservationReady: false,
        reason: "INSUFFICIENT_STOCK",
        shortages,
      };
    }
    if (candidate.selectedBy === "CONFIGURED") return firstInsufficient;
  }
  return firstInsufficient || emptySelection("NO_ELIGIBLE_SOURCE");
}
