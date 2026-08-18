import { calculateDriveObjectSha256, deleteDriveObject, headDriveObject, putDriveObjectStream } from "@/app/lib/drive-core/s3ObjectStorage";
import { openDropS3Object } from "@/app/lib/drop/storage/dropS3Storage";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export async function copyDropObjectToDriveVerified(input: {
  sourceBucket: string;
  sourceStorageKey: string;
  driveStorageKey: string;
  expectedDriveBucket: string;
  mimeType: string;
  sizeBytes: number;
  expectedSha256?: string | null;
  metadata?: Record<string, string>;
}) {
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new DimproIdentityError("A forrásobjektum mérete érvénytelen.", "DROP_DRIVE_COPY_SIZE_INVALID", 409);
  }
  const opened = await openDropS3Object({ storageKey: input.sourceStorageKey, bucket: input.sourceBucket });
  if (opened.contentLength !== input.sizeBytes) {
    throw new DimproIdentityError("A Drop forrásobjektum mérete eltér a rögzített mérettől.", "DROP_DRIVE_COPY_SOURCE_SIZE_MISMATCH", 409);
  }
  const body = opened.body as unknown as AsyncIterable<Uint8Array>;
  if (!body || typeof body[Symbol.asyncIterator] !== "function") {
    throw new DimproIdentityError("A Drop forrásobjektum nem streamelhető.", "DROP_DRIVE_COPY_STREAM_UNAVAILABLE", 502);
  }

  let copied = false;
  try {
    const result = await putDriveObjectStream({
      storageKey: input.driveStorageKey,
      body,
      contentType: input.mimeType || opened.contentType,
      contentLength: opened.contentLength,
      metadata: input.metadata,
    });
    copied = true;
    if (result.bucket !== input.expectedDriveBucket) {
      throw new DimproIdentityError("A Drive célbucket eltér az aktív konfigurációtól.", "DROP_DRIVE_COPY_BUCKET_MISMATCH", 409);
    }
    const head = await headDriveObject({ storageKey: input.driveStorageKey, bucket: result.bucket });
    if (head.contentLength !== input.sizeBytes) {
      throw new DimproIdentityError("A Drive másolat méretellenőrzése sikertelen.", "DROP_DRIVE_COPY_SIZE_MISMATCH", 502);
    }
    let sha256: string | null = null;
    if (input.expectedSha256) {
      const checksum = await calculateDriveObjectSha256({ storageKey: input.driveStorageKey, bucket: result.bucket });
      if (checksum.sizeBytes !== input.sizeBytes || checksum.sha256.toLowerCase() !== input.expectedSha256.toLowerCase()) {
        throw new DimproIdentityError("A Drive másolat SHA-256 ellenőrzése sikertelen.", "DROP_DRIVE_COPY_SHA256_MISMATCH", 502);
      }
      sha256 = checksum.sha256.toLowerCase();
    }
    return { ...head, sha256 };
  } catch (error) {
    if (copied) await deleteDriveObject({ storageKey: input.driveStorageKey, bucket: input.expectedDriveBucket }).catch(() => undefined);
    throw error;
  }
}
