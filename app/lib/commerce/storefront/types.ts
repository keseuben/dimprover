import type { CommerceEntityId, CommerceLifecycle, OrganizationScoped } from "../core/types";

export type CommerceStorefrontProductMapping = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  storefrontId: CommerceEntityId;
  externalProductId: string;
  externalSku?: string | null;
  productId: CommerceEntityId;
  variantId: CommerceEntityId;
  fulfillmentSourceId?: CommerceEntityId | null;
  active: boolean;
  metadata: Record<string, unknown>;
};

export type CommerceStorefrontMappingResolution = {
  storefrontId: CommerceEntityId;
  storefrontSlug: string;
  mapping: CommerceStorefrontProductMapping;
  product: {
    id: CommerceEntityId;
    name: string;
    status: string;
  };
  variant: {
    id: CommerceEntityId;
    productId: CommerceEntityId;
    name: string;
    sku: string | null;
    unit: string;
    status: string;
  };
  matchedBy: "EXTERNAL_PRODUCT_ID" | "EXTERNAL_SKU";
};

export type CommerceFulfillmentRequirement = {
  variantId: CommerceEntityId;
  quantity: string | number;
};

export type CommerceFulfillmentSourceSelection = {
  sourceId: CommerceEntityId | null;
  sourceCode: string | null;
  sourceName: string | null;
  selectedBy: "CONFIGURED" | "MAPPING" | "STOREFRONT_DEFAULT" | "AUTO_STOCK" | "NONE";
  reservationReady: boolean;
  reason:
    | "SELECTED"
    | "NO_REQUIREMENTS"
    | "MAPPING_SOURCE_CONFLICT"
    | "SOURCE_NOT_AVAILABLE"
    | "INSUFFICIENT_STOCK"
    | "NO_ELIGIBLE_SOURCE";
  shortages: Array<{ variantId: CommerceEntityId; required: string; available: string }>;
};
