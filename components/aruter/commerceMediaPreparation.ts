"use client";

import {
  prepareDropFiles,
  revokePreparedDropFile,
  type PreparedDropFile,
} from "@/components/drop/dropUploadPreparation";

export type CommercePreparedImage = {
  source: File;
  web: PreparedDropFile;
  thumbnail: PreparedDropFile;
};

const WEB_IMAGE_OPTIONS = {
  enabled: true,
  maxLongEdge: 2560,
  quality: 0.82,
  minimumSavingsPercent: 5,
  metadataPolicy: "strip" as const,
};

const THUMBNAIL_IMAGE_OPTIONS = {
  enabled: true,
  maxLongEdge: 512,
  quality: 0.76,
  minimumSavingsPercent: 0,
  metadataPolicy: "strip" as const,
};

export async function prepareCommerceProductImages(files: File[]): Promise<CommercePreparedImage[]> {
  if (!files.length) return [];
  const common = {
    packageCode: "COMMERCE_PRODUCT",
    packageTitle: "DIMPRO Árutér termék",
    nameRule: "custom_prefix" as const,
    customPrefix: "termek",
    sequenceStart: 1,
  };
  const [webFiles, thumbnails] = await Promise.all([
    prepareDropFiles(files, {
      ...common,
      photoLabel: "web",
      imageOptimization: WEB_IMAGE_OPTIONS,
    }),
    prepareDropFiles(files, {
      ...common,
      photoLabel: "thumb",
      imageOptimization: THUMBNAIL_IMAGE_OPTIONS,
    }),
  ]);
  return files.map((source, index) => ({ source, web: webFiles[index], thumbnail: thumbnails[index] }));
}

export function revokeCommercePreparedImage(image: CommercePreparedImage) {
  revokePreparedDropFile(image.web);
  revokePreparedDropFile(image.thumbnail);
}

type CommerceMediaInitiateResponse = {
  ok: boolean;
  data?: {
    assetId: string;
    token: string;
    variants: Array<{ kind: "WEB" | "THUMBNAIL" | "ORIGINAL"; uploadUrl: string; mimeType: string }>;
  };
  error?: string;
};

export async function uploadCommerceProductImage(productId: string, file: File) {
  const prepared = await prepareCommerceProductImages([file]);
  const image = prepared[0];
  if (!image?.web.width || !image.web.height || !image.thumbnail.width || !image.thumbnail.height) {
    if (image) revokeCommercePreparedImage(image);
    throw new Error("A kép méretei nem olvashatók ki.");
  }
  try {
    const initiateResponse = await fetch("/api/v1/commerce/media/uploads/initiate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetType: "PRODUCT",
        targetId: productId,
        visibility: "PUBLIC",
        retainOriginal: false,
        variants: [
          { kind: "WEB", mimeType: image.web.uploadFile.type, sizeBytes: image.web.uploadFile.size, width: image.web.width, height: image.web.height },
          { kind: "THUMBNAIL", mimeType: image.thumbnail.uploadFile.type, sizeBytes: image.thumbnail.uploadFile.size, width: image.thumbnail.width, height: image.thumbnail.height },
        ],
      }),
    });
    const initiated = await initiateResponse.json() as CommerceMediaInitiateResponse;
    if (!initiateResponse.ok || !initiated.ok || !initiated.data) throw new Error(initiated.error || "A képfeltöltés nem indítható.");
    for (const variant of initiated.data.variants) {
      const preparedVariant = variant.kind === "WEB" ? image.web : variant.kind === "THUMBNAIL" ? image.thumbnail : null;
      if (!preparedVariant) continue;
      const response = await fetch(variant.uploadUrl, {
        method: "PUT",
        headers: {
          "content-type": preparedVariant.uploadFile.type,
          "x-commerce-media-upload-token": initiated.data.token,
        },
        body: preparedVariant.uploadFile,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(error.error || `${variant.kind} kép feltöltése sikertelen.`);
      }
    }
    const finalizeResponse = await fetch("/api/v1/commerce/media/uploads/finalize", {
      method: "POST",
      headers: { "content-type": "application/json", "x-commerce-media-upload-token": initiated.data.token },
      body: JSON.stringify({ token: initiated.data.token }),
    });
    const finalized = await finalizeResponse.json() as { ok: boolean; data?: { assetId?: string }; error?: string };
    if (!finalizeResponse.ok || !finalized.ok) throw new Error(finalized.error || "A képfeltöltés véglegesítése sikertelen.");
    return { assetId: finalized.data?.assetId || initiated.data.assetId };
  } finally {
    revokeCommercePreparedImage(image);
  }
}
