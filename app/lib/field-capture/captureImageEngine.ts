"use client";

import {
  getDropImageOptimizationOptions,
  prepareDropFiles,
  revokePreparedDropFile,
  type PreparedDropFile,
} from "@/components/drop/dropUploadPreparation";

export type PreparedFieldCaptureFile = PreparedDropFile;

export async function prepareFieldCaptureFiles(files: File[], sequenceStart: number) {
  return prepareDropFiles(files, {
    packageCode: "FIELD_CAPTURE",
    packageTitle: "Terepi Gyorsrögzítő",
    nameRule: "dimpro_photo",
    customPrefix: "terepi",
    photoLabel: "terepi_foto",
    sequenceStart,
    imageOptimization: getDropImageOptimizationOptions("medium", "strip"),
  });
}

export function revokePreparedFieldCaptureFile(file: PreparedFieldCaptureFile) {
  revokePreparedDropFile(file);
}
