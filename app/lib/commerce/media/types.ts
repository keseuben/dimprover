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
