import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createCommerceAdminClient } from "../commerce/core/server-db";
import type { CommerceOrderStatus } from "../commerce/order/types";
import type { AruterOrder } from "./types";
import { resolveStorefrontCommerceTarget } from "./storefrontPilot";

const TOKEN_VERSION = "v1";
const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;
const MIN_TTL_SECONDS = 60 * 60;
const MAX_TTL_SECONDS = 90 * 24 * 60 * 60;
const BUSINESS_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

export type StorefrontTrackingPublicState =
  | "RECEIVED"
  | "QUEUED"
  | "PROCESSING"
  | "AT_CASHIER"
  | "PAID"
  | "ISSUED"
  | "CANCELLED";

export type StorefrontTrackingStatus = {
  orderNumber: string;
  state: StorefrontTrackingPublicState;
  label: string;
  queueState: "PENDING" | "SUCCEEDED" | "FAILED" | null;
  commerceStatus: CommerceOrderStatus | null;
  terminal: boolean;
  updatedAt: string | null;
  expiresAt: string;
};

type TrackingPayload = {
  v: 1;
  b: string;
  o: string;
  n: string;
  iat: number;
  exp: number;
};

type Row = Record<string, unknown>;

export class StorefrontTrackingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

export function isStorefrontTrackingEnabled() {
  return process.env.ARUTER_STOREFRONT_TRACKING_ENABLED?.trim() === "1";
}

function trackingSecret() {
  const secret = process.env.ARUTER_STOREFRONT_TRACKING_SECRET?.trim() || "";
  if (secret.length < 32) {
    throw new StorefrontTrackingError(
      "A rendeléskövetés szerveroldali kulcsa nincs megfelelően konfigurálva.",
      "STOREFRONT_TRACKING_CONFIG_MISSING",
      503,
    );
  }
  return secret;
}

function trackingTtlSeconds() {
  const requested = Number(process.env.ARUTER_STOREFRONT_TRACKING_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  if (!Number.isFinite(requested)) return DEFAULT_TTL_SECONDS;
  return Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, Math.floor(requested)));
}

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(`${TOKEN_VERSION}.${encodedPayload}`).digest("base64url");
}

function safeEqualSignature(left: string, right: string) {
  try {
    const leftBuffer = Buffer.from(left, "base64url");
    const rightBuffer = Buffer.from(right, "base64url");
    return leftBuffer.length === rightBuffer.length && leftBuffer.length > 0 && timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

function validPayload(value: unknown): value is TrackingPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Partial<TrackingPayload>;
  return payload.v === 1
    && typeof payload.b === "string" && BUSINESS_SLUG_PATTERN.test(payload.b)
    && typeof payload.o === "string" && payload.o.length >= 8 && payload.o.length <= 200
    && typeof payload.n === "string" && payload.n.length >= 4 && payload.n.length <= 200
    && Number.isInteger(payload.iat) && Number.isInteger(payload.exp)
    && Number(payload.exp) > Number(payload.iat)
    && Number(payload.exp) - Number(payload.iat) <= MAX_TTL_SECONDS;
}

function encodePayload(payload: TrackingPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeAndVerifyToken(tokenInput: unknown): TrackingPayload {
  if (!isStorefrontTrackingEnabled()) {
    throw new StorefrontTrackingError("A rendeléskövetés nincs engedélyezve.", "STOREFRONT_TRACKING_DISABLED", 404);
  }
  const token = text(tokenInput);
  if (!token || token.length > 2048) throw new StorefrontTrackingError("Érvénytelen rendeléskövetési token.", "STOREFRONT_TRACKING_TOKEN_INVALID", 404);
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) throw new StorefrontTrackingError("Érvénytelen rendeléskövetési token.", "STOREFRONT_TRACKING_TOKEN_INVALID", 404);
  const [, encodedPayload, receivedSignature] = parts;
  const secret = trackingSecret();
  const expectedSignature = sign(encodedPayload, secret);
  if (!safeEqualSignature(expectedSignature, receivedSignature)) throw new StorefrontTrackingError("Érvénytelen rendeléskövetési token.", "STOREFRONT_TRACKING_TOKEN_INVALID", 404);
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new StorefrontTrackingError("Érvénytelen rendeléskövetési token.", "STOREFRONT_TRACKING_TOKEN_INVALID", 404);
  }
  if (!validPayload(parsed)) throw new StorefrontTrackingError("Érvénytelen rendeléskövetési token.", "STOREFRONT_TRACKING_TOKEN_INVALID", 404);
  const now = Math.floor(Date.now() / 1000);
  if (parsed.iat > now + 300 || parsed.exp <= now) throw new StorefrontTrackingError("A rendeléskövetési token lejárt.", "STOREFRONT_TRACKING_TOKEN_EXPIRED", 410);
  return parsed;
}

export function issueStorefrontTrackingToken(businessSlugInput: string, order: Pick<AruterOrder, "id" | "orderNumber" | "createdAt">) {
  if (!isStorefrontTrackingEnabled()) return null;
  const businessSlug = businessSlugInput.trim();
  if (!BUSINESS_SLUG_PATTERN.test(businessSlug) || !order.id || !order.orderNumber) {
    throw new StorefrontTrackingError("A rendeléskövetéshez hiányos rendelési adatok érkeztek.", "STOREFRONT_TRACKING_ORDER_INVALID", 500);
  }
  const parsedCreatedAt = Date.parse(order.createdAt);
  const issuedAt = Number.isFinite(parsedCreatedAt) ? Math.floor(parsedCreatedAt / 1000) : Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + trackingTtlSeconds();
  const payload: TrackingPayload = { v: 1, b: businessSlug, o: order.id, n: order.orderNumber, iat: issuedAt, exp: expiresAt };
  const encodedPayload = encodePayload(payload);
  const token = `${TOKEN_VERSION}.${encodedPayload}.${sign(encodedPayload, trackingSecret())}`;
  return { token, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

function labelForState(state: StorefrontTrackingPublicState) {
  switch (state) {
    case "RECEIVED": return "Rendelés fogadva";
    case "QUEUED": return "Feldolgozásra vár";
    case "PROCESSING": return "Feldolgozás folyamatban";
    case "AT_CASHIER": return "Pénztárra küldve";
    case "PAID": return "Fizetve";
    case "ISSUED": return "Kiadva";
    case "CANCELLED": return "Törölve";
  }
}

function publicStateForCommerce(status: CommerceOrderStatus): StorefrontTrackingPublicState {
  if (status === "SENT_TO_CASHIER") return "AT_CASHIER";
  if (status === "PAID") return "PAID";
  if (status === "ISSUED") return "ISSUED";
  if (status === "CANCELLED") return "CANCELLED";
  return "PROCESSING";
}

export async function getStorefrontTrackingStatus(tokenInput: unknown): Promise<StorefrontTrackingStatus> {
  const payload = decodeAndVerifyToken(tokenInput);
  const target = resolveStorefrontCommerceTarget(payload.b);
  if (!target) throw new StorefrontTrackingError("A rendeléskövetés ehhez az üzlethez nincs konfigurálva.", "STOREFRONT_TRACKING_BUSINESS_NOT_CONFIGURED", 404);

  const client = createCommerceAdminClient();
  const attempt = await client.from("commerce_order_mirror_attempts")
    .select("state,commerce_order_id,updated_at,succeeded_at")
    .eq("organization_id", target.organizationId)
    .eq("legacy_order_id", payload.o)
    .eq("order_number", payload.n)
    .is("deleted_at", null)
    .maybeSingle();
  if (attempt.error) throw new StorefrontTrackingError("A rendelés állapota átmenetileg nem olvasható.", "STOREFRONT_TRACKING_DATABASE_ERROR", 503);

  const expiresAt = new Date(payload.exp * 1000).toISOString();
  if (!attempt.data) {
    const state: StorefrontTrackingPublicState = "RECEIVED";
    return { orderNumber: payload.n, state, label: labelForState(state), queueState: null, commerceStatus: null, terminal: false, updatedAt: null, expiresAt };
  }

  const queueState = text((attempt.data as Row).state) as "PENDING" | "SUCCEEDED" | "FAILED";
  const attemptUpdatedAt = text((attempt.data as Row).updated_at) || null;
  const commerceOrderId = text((attempt.data as Row).commerce_order_id);
  if (queueState === "PENDING") {
    const state: StorefrontTrackingPublicState = "QUEUED";
    return { orderNumber: payload.n, state, label: labelForState(state), queueState, commerceStatus: null, terminal: false, updatedAt: attemptUpdatedAt, expiresAt };
  }
  if (queueState === "FAILED" || !commerceOrderId) {
    const state: StorefrontTrackingPublicState = "PROCESSING";
    return { orderNumber: payload.n, state, label: labelForState(state), queueState, commerceStatus: null, terminal: false, updatedAt: attemptUpdatedAt, expiresAt };
  }

  const order = await client.from("commerce_orders")
    .select("status,updated_at")
    .eq("organization_id", target.organizationId)
    .eq("id", commerceOrderId)
    .eq("order_number", payload.n)
    .is("deleted_at", null)
    .maybeSingle();
  if (order.error) throw new StorefrontTrackingError("A rendelés állapota átmenetileg nem olvasható.", "STOREFRONT_TRACKING_DATABASE_ERROR", 503);
  if (!order.data) {
    const state: StorefrontTrackingPublicState = "PROCESSING";
    return { orderNumber: payload.n, state, label: labelForState(state), queueState, commerceStatus: null, terminal: false, updatedAt: attemptUpdatedAt, expiresAt };
  }
  const commerceStatus = text((order.data as Row).status) as CommerceOrderStatus;
  const state = publicStateForCommerce(commerceStatus);
  return {
    orderNumber: payload.n,
    state,
    label: labelForState(state),
    queueState,
    commerceStatus,
    terminal: state === "ISSUED" || state === "CANCELLED",
    updatedAt: text((order.data as Row).updated_at) || attemptUpdatedAt,
    expiresAt,
  };
}
