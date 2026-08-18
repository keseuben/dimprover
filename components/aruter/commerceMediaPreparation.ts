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
