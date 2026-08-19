import { createHmac, timingSafeEqual } from "node:crypto";
import { getCommerceMediaStorageConfig } from "./storageConfig";
import type { MediaVariantKind, MediaVisibility } from "./types";

export type CommerceMediaUploadVariantTicket = {
  kind: MediaVariantKind;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
};

export type CommerceMediaUploadTicket = {
  version: 1;
  organizationId: string;
  userId: string;
  assetId: string;
  targetType: "PRODUCT" | "PRODUCT_VARIANT" | "GOODS_RECEIPT" | "GOODS_RECEIPT_ITEM";
  targetId: string;
  visibility: MediaVisibility;
  retainOriginal: boolean;
  variants: CommerceMediaUploadVariantTicket[];
  expiresAt: string;
};

function b64url(input: string | Buffer) { return Buffer.from(input).toString("base64url"); }
function sign(encoded: string, secret: string) { return createHmac("sha256", secret).update(encoded).digest("base64url"); }

export function createCommerceMediaUploadToken(ticket: CommerceMediaUploadTicket) {
  const { uploadSecret } = getCommerceMediaStorageConfig();
  const payload = b64url(JSON.stringify(ticket));
  return `${payload}.${sign(payload, uploadSecret)}`;
}

export function verifyCommerceMediaUploadToken(token: string): CommerceMediaUploadTicket {
  const { uploadSecret } = getCommerceMediaStorageConfig();
  const [payload, signature, extra] = token.trim().split(".");
  if (!payload || !signature || extra) throw new Error("COMMERCE_MEDIA_UPLOAD_TOKEN_INVALID");
  const expected = sign(payload, uploadSecret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error("COMMERCE_MEDIA_UPLOAD_TOKEN_INVALID");
  let ticket: CommerceMediaUploadTicket;
  try { ticket = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CommerceMediaUploadTicket; }
  catch { throw new Error("COMMERCE_MEDIA_UPLOAD_TOKEN_INVALID"); }
  if (ticket.version !== 1 || Date.parse(ticket.expiresAt) <= Date.now()) throw new Error("COMMERCE_MEDIA_UPLOAD_TOKEN_EXPIRED");
  return ticket;
}
