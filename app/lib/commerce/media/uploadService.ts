import { randomUUID } from "node:crypto";
import type { PostgrestError } from "@supabase/supabase-js";
import { hasCommercePermission } from "../core/permissions";
import { createCommerceAdminClient } from "../core/server-db";
import type { CommerceContext } from "../core/types";
import { buildCommerceMediaStorageKey, headCommerceMediaObject, putCommerceMediaObject } from "./storage";
import { getCommerceMediaStorageConfig, CommerceMediaStorageConfigError } from "./storageConfig";
import {
  createCommerceMediaUploadToken,
  verifyCommerceMediaUploadToken,
  type CommerceMediaUploadTicket,
  type CommerceMediaUploadVariantTicket,
} from "./uploadToken";
import type { MediaVariantKind, MediaVisibility } from "./types";

type Row = Record<string, unknown>;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VARIANT_KINDS = new Set<MediaVariantKind>(["ORIGINAL", "WEB", "THUMBNAIL"]);

export class CommerceMediaUploadError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly causeCode?: string,
  ) { super(message); }
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
}
function dbError(message: string, error: PostgrestError | null): never {
  throw new CommerceMediaUploadError(message, "COMMERCE_MEDIA_DATABASE_ERROR", 503, error?.code);
}
function mapConfigError(error: unknown): never {
  if (error instanceof CommerceMediaStorageConfigError) throw new CommerceMediaUploadError(error.message, error.code, 503);
  throw error;
}
function requireWrite(context: CommerceContext) {
  if (!hasCommercePermission(context.permissions, "commerce.media.write")) {
    throw new CommerceMediaUploadError("Nincs médiafeltöltési jogosultság.", "COMMERCE_PERMISSION_DENIED", 403);
  }
}

async function verifyMediaTarget(context: CommerceContext, targetType: "PRODUCT" | "PRODUCT_VARIANT" | "GOODS_RECEIPT" | "GOODS_RECEIPT_ITEM", targetId: string) {
  const client = createCommerceAdminClient();
  const table = targetType === "PRODUCT" ? "commerce_products"
    : targetType === "PRODUCT_VARIANT" ? "commerce_product_variants"
      : targetType === "GOODS_RECEIPT" ? "commerce_goods_receipts"
        : "commerce_goods_receipt_items";
  const result = await client.from(table).select("id").eq("organization_id", context.organizationId).eq("id", targetId).is("archived_at", null).maybeSingle();
  if (result.error) dbError("A média célobjektuma nem ellenőrizhető.", result.error);
  if (!result.data) throw new CommerceMediaUploadError("A média célobjektuma nem található ebben a szervezetben.", "COMMERCE_MEDIA_TARGET_SCOPE_MISMATCH", 404);
}

function validateTicketContext(context: CommerceContext, ticket: CommerceMediaUploadTicket, assetId?: string, kind?: string) {
  if (ticket.organizationId !== context.organizationId || ticket.userId !== context.userId) {
    throw new CommerceMediaUploadError("A médiafeltöltési jegy másik felhasználóhoz vagy szervezethez tartozik.", "COMMERCE_MEDIA_UPLOAD_TICKET_SCOPE_MISMATCH", 403);
  }
  if (assetId && ticket.assetId !== assetId) throw new CommerceMediaUploadError("A médiafeltöltési jegy asset azonosítója eltér.", "COMMERCE_MEDIA_UPLOAD_TICKET_ASSET_MISMATCH", 400);
  if (kind && !ticket.variants.some((variant) => variant.kind === kind)) throw new CommerceMediaUploadError("A feltöltési változat nem része a jegynek.", "COMMERCE_MEDIA_UPLOAD_VARIANT_NOT_TICKETED", 400);
}

function parseToken(token: string) {
  try { return verifyCommerceMediaUploadToken(token); }
  catch (error) {
    const code = error instanceof Error ? error.message : "COMMERCE_MEDIA_UPLOAD_TOKEN_INVALID";
    throw new CommerceMediaUploadError(
      code === "COMMERCE_MEDIA_UPLOAD_TOKEN_EXPIRED" ? "A médiafeltöltési jegy lejárt." : "Érvénytelen médiafeltöltési jegy.",
      code.startsWith("COMMERCE_MEDIA_") ? code : "COMMERCE_MEDIA_UPLOAD_TOKEN_INVALID",
      401,
    );
  }
}

export async function initiateCommerceMediaUpload(context: CommerceContext, input: Record<string, unknown>) {
  requireWrite(context);
  let config;
  try { config = getCommerceMediaStorageConfig(); } catch (error) { mapConfigError(error); }
  const targetTypeRaw = text(input.targetType).toUpperCase();
  const targetType = targetTypeRaw === "PRODUCT_VARIANT" ? "PRODUCT_VARIANT"
    : targetTypeRaw === "PRODUCT" ? "PRODUCT"
      : targetTypeRaw === "GOODS_RECEIPT" ? "GOODS_RECEIPT"
        : targetTypeRaw === "GOODS_RECEIPT_ITEM" ? "GOODS_RECEIPT_ITEM"
          : null;
  const targetId = text(input.targetId);
  if (!targetType || !targetId) throw new CommerceMediaUploadError("A média célobjektuma kötelező.", "COMMERCE_MEDIA_TARGET_REQUIRED", 400);
  await verifyMediaTarget(context, targetType, targetId);
  const visibilityRaw = text(input.visibility).toUpperCase();
  const visibility: MediaVisibility = visibilityRaw === "PUBLIC" ? "PUBLIC" : "INTERNAL_ONLY";
  const retainOriginal = input.retainOriginal === true;
  const rawVariants = Array.isArray(input.variants) ? input.variants : [];
  const variants: CommerceMediaUploadVariantTicket[] = [];
  const assetId = randomUUID();
  for (const raw of rawVariants) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const kind = text(item.kind).toUpperCase() as MediaVariantKind;
    const mimeType = text(item.mimeType).toLowerCase();
    const sizeBytes = integer(item.sizeBytes);
    const width = integer(item.width) || null;
    const height = integer(item.height) || null;
    if (!VARIANT_KINDS.has(kind)) throw new CommerceMediaUploadError("Ismeretlen képváltozat.", "COMMERCE_MEDIA_VARIANT_KIND_INVALID", 400);
    if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new CommerceMediaUploadError("Nem támogatott termékkép-formátum.", "COMMERCE_MEDIA_MIME_TYPE_INVALID", 400);
    if (sizeBytes <= 0 || sizeBytes > config.maxUploadBytes) throw new CommerceMediaUploadError("A termékkép mérete nem engedélyezett.", "COMMERCE_MEDIA_UPLOAD_SIZE_INVALID", 413);
    if (!width || !height) throw new CommerceMediaUploadError("A termékkép méretadatai hiányoznak.", "COMMERCE_MEDIA_DIMENSIONS_REQUIRED", 400);
    if (variants.some((variant) => variant.kind === kind)) throw new CommerceMediaUploadError("Egy képváltozat csak egyszer szerepelhet.", "COMMERCE_MEDIA_VARIANT_DUPLICATE", 400);
    variants.push({
      kind,
      mimeType,
      sizeBytes,
      width,
      height,
      storageKey: buildCommerceMediaStorageKey({ organizationId: context.organizationId, assetId, kind, mimeType }),
    });
  }
  if (!variants.some((variant) => variant.kind === "WEB") || !variants.some((variant) => variant.kind === "THUMBNAIL")) {
    throw new CommerceMediaUploadError("WEB és THUMBNAIL változat kötelező.", "COMMERCE_MEDIA_REQUIRED_VARIANTS_MISSING", 400);
  }
  if (!retainOriginal && variants.some((variant) => variant.kind === "ORIGINAL")) {
    throw new CommerceMediaUploadError("Az eredeti kép megőrzése nincs engedélyezve ennél a feltöltésnél.", "COMMERCE_MEDIA_ORIGINAL_RETENTION_POLICY", 400);
  }
  if (retainOriginal && !variants.some((variant) => variant.kind === "ORIGINAL")) {
    throw new CommerceMediaUploadError("Az eredeti kép megőrzéséhez ORIGINAL változat szükséges.", "COMMERCE_MEDIA_ORIGINAL_VARIANT_REQUIRED", 400);
  }
  const ticket: CommerceMediaUploadTicket = {
    version: 1,
    organizationId: context.organizationId,
    userId: context.userId,
    assetId,
    targetType,
    targetId,
    visibility,
    retainOriginal,
    variants,
    expiresAt: new Date(Date.now() + config.uploadTokenTtlSeconds * 1000).toISOString(),
  };
  const token = createCommerceMediaUploadToken(ticket);
  return {
    assetId,
    token,
    expiresAt: ticket.expiresAt,
    maxUploadBytes: config.maxUploadBytes,
    storageMode: config.credentialSource,
    variants: variants.map((variant) => ({
      ...variant,
      method: "PUT" as const,
      uploadUrl: `/api/v1/commerce/media/uploads/${assetId}/${variant.kind.toLowerCase()}`,
      headers: { "content-type": variant.mimeType, "x-commerce-media-upload-token": token },
    })),
  };
}

export async function uploadCommerceMediaVariant(input: {
  context: CommerceContext;
  assetId: string;
  kind: string;
  token: string;
  contentType: string;
  contentLength: number;
  body: ReadableStream<Uint8Array> | null;
}) {
  requireWrite(input.context);
  const ticket = parseToken(input.token);
  const kind = input.kind.toUpperCase() as MediaVariantKind;
  validateTicketContext(input.context, ticket, input.assetId, kind);
  const variant = ticket.variants.find((item) => item.kind === kind);
  if (!variant) throw new CommerceMediaUploadError("A képváltozat nincs engedélyezve.", "COMMERCE_MEDIA_UPLOAD_VARIANT_NOT_TICKETED", 400);
  if (!input.body) throw new CommerceMediaUploadError("A feltöltött kép tartalma hiányzik.", "COMMERCE_MEDIA_UPLOAD_BODY_MISSING", 400);
  if (input.contentType.toLowerCase() !== variant.mimeType || input.contentLength !== variant.sizeBytes) {
    throw new CommerceMediaUploadError("A feltöltött kép fejléce eltér az előkészített változattól.", "COMMERCE_MEDIA_UPLOAD_METADATA_MISMATCH", 400);
  }
  try {
    const stored = await putCommerceMediaObject({ storageKey: variant.storageKey, mimeType: variant.mimeType, sizeBytes: variant.sizeBytes, body: input.body });
    return { assetId: ticket.assetId, kind, storageKey: stored.storageKey, etag: stored.etag };
  } catch (error) {
    if (error instanceof CommerceMediaUploadError) throw error;
    throw new CommerceMediaUploadError("A termékkép objektumtárhelyre mentése sikertelen.", "COMMERCE_MEDIA_OBJECT_UPLOAD_FAILED", 502, error instanceof Error ? error.message : undefined);
  }
}

export async function finalizeCommerceMediaUpload(context: CommerceContext, token: string) {
  requireWrite(context);
  const ticket = parseToken(token);
  validateTicketContext(context, ticket);
  await verifyMediaTarget(context, ticket.targetType, ticket.targetId);
  const client = createCommerceAdminClient();
  const existing = await client.from("commerce_media_assets").select("id,processing_status").eq("organization_id", context.organizationId).eq("id", ticket.assetId).maybeSingle();
  if (existing.error) dbError("A média asset állapota nem ellenőrizhető.", existing.error);
  if (existing.data) return { assetId: ticket.assetId, status: text((existing.data as Row).processing_status) || "READY", alreadyFinalized: true };

  for (const variant of ticket.variants) {
    let object;
    try { object = await headCommerceMediaObject(variant.storageKey); }
    catch (error) { throw new CommerceMediaUploadError("A feltöltött képváltozat nem található az objektumtárhelyen.", "COMMERCE_MEDIA_OBJECT_NOT_FOUND", 409, error instanceof Error ? error.message : undefined); }
    if (object.sizeBytes !== variant.sizeBytes || object.mimeType.toLowerCase() !== variant.mimeType) {
      throw new CommerceMediaUploadError("A feltöltött képváltozat objektumtárhelyi adatai eltérnek.", "COMMERCE_MEDIA_OBJECT_METADATA_MISMATCH", 409);
    }
  }
  const web = ticket.variants.find((variant) => variant.kind === "WEB");
  if (!web) throw new CommerceMediaUploadError("A WEB képváltozat hiányzik.", "COMMERCE_MEDIA_WEB_VARIANT_REQUIRED", 400);
  const result = await client.rpc("commerce_media_finalize_upload", {
    p_organization_id: context.organizationId,
    p_asset_id: ticket.assetId,
    p_primary_storage_key: web.storageKey,
    p_primary_mime_type: web.mimeType,
    p_primary_width: web.width,
    p_primary_height: web.height,
    p_primary_size_bytes: web.sizeBytes,
    p_visibility: ticket.visibility,
    p_retain_original: ticket.retainOriginal,
    p_variants: ticket.variants.map((variant) => ({ kind: variant.kind, storageKey: variant.storageKey, mimeType: variant.mimeType, width: variant.width, height: variant.height, sizeBytes: variant.sizeBytes })),
    p_links: [{ linkType: ticket.targetType, linkedEntityId: ticket.targetId, sortOrder: 0, primary: true }],
  });
  if (result.error) dbError("A médiafeltöltés adatbázis-finalizálása sikertelen.", result.error);
  return { ...(result.data as Row), alreadyFinalized: false };
}
