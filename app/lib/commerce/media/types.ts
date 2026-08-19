import type { CommerceEntityId, CommerceLifecycle, OrganizationScoped } from "../core/types";

export type MediaVisibility = "INTERNAL_ONLY" | "PUBLIC";
export type MediaProcessingStatus = "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
export type MediaLinkType = "PRODUCT" | "PRODUCT_VARIANT" | "GOODS_RECEIPT" | "GOODS_RECEIPT_ITEM" | "LOT" | "QUALITY_CHECK" | "RETURN" | "CLAIM";

export type MediaAsset = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  storageKey: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  sizeBytes: number;
  visibility: MediaVisibility;
  processingStatus: MediaProcessingStatus;
  retainOriginal: boolean;
};

export type MediaLink = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  assetId: CommerceEntityId;
  linkType: MediaLinkType;
  linkedEntityId: CommerceEntityId;
  sortOrder: number;
  primary: boolean;
};

export type MediaVariantKind = "ORIGINAL" | "WEB" | "THUMBNAIL";
export type MediaOverlayType = "WATERMARK" | "LOGO" | "STAMP" | "ARROW" | "CIRCLE" | "TEXT" | "BLUR";

export type MediaVariant = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  assetId: CommerceEntityId;
  kind: MediaVariantKind;
  storageKey: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  sizeBytes: number;
  sha256?: string | null;
};

export type MediaOverlay = OrganizationScoped & CommerceLifecycle & {
  id: CommerceEntityId;
  assetId: CommerceEntityId;
  type: MediaOverlayType;
  payload: Record<string, string | number | boolean | null>;
  sortOrder: number;
  active: boolean;
};
