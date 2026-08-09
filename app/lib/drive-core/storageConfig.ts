export type DriveObjectStorageMode = "disabled" | "quarantine" | "active";
export type DriveObjectStorageProvider = "s3-compatible";

export type DriveObjectStorageConfig = {
  provider: DriveObjectStorageProvider;
  mode: DriveObjectStorageMode;
  bucket: string;
  maxUploadBytes: number;
  signedUrlTtlSeconds: number;
  forcePathStyle: boolean;
  s3: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  } | null;
};

function positiveInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeMode(value: string | undefined): DriveObjectStorageMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "quarantine") return "quarantine";
  return "disabled";
}

export function getDriveObjectStorageConfig(): DriveObjectStorageConfig {
  const endpoint = process.env.DIMPRO_DRIVE_S3_ENDPOINT?.trim() || "";
  const region = process.env.DIMPRO_DRIVE_S3_REGION?.trim() || "";
  const accessKeyId = process.env.DIMPRO_DRIVE_S3_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY?.trim() || "";
  const bucket = process.env.DIMPRO_DRIVE_S3_BUCKET?.trim() || "";
  const maxUploadMb = positiveInteger(process.env.DIMPRO_DRIVE_MAX_UPLOAD_MB, 100, 1, 5_120);
  const signedUrlTtlSeconds = positiveInteger(process.env.DIMPRO_DRIVE_SIGNED_URL_TTL_SECONDS, 600, 60, 900);

  return {
    provider: "s3-compatible",
    mode: normalizeMode(process.env.DIMPRO_DRIVE_STORAGE_MODE),
    bucket,
    maxUploadBytes: maxUploadMb * 1024 * 1024,
    signedUrlTtlSeconds,
    forcePathStyle: process.env.DIMPRO_DRIVE_S3_FORCE_PATH_STYLE?.trim().toLowerCase() === "true",
    s3: endpoint && region && accessKeyId && secretAccessKey
      ? { endpoint, region, accessKeyId, secretAccessKey }
      : null,
  };
}

export function getDriveObjectStorageSafeStatus(config = getDriveObjectStorageConfig()) {
  const credentialsConfigured = Boolean(config.s3);
  const bucketConfigured = Boolean(config.bucket);
  const storageConfigured = credentialsConfigured && bucketConfigured;
  const objectWriteEnabled = storageConfigured && config.mode !== "disabled";
  const objectDownloadEnabled = storageConfigured && config.mode === "active";

  return {
    provider: config.provider,
    mode: config.mode,
    bucketConfigured,
    credentialsConfigured,
    storageConfigured,
    objectWriteEnabled,
    objectDownloadEnabled,
    maxUploadBytes: config.maxUploadBytes,
    maxUploadMb: Math.floor(config.maxUploadBytes / 1024 / 1024),
    signedUrlTtlSeconds: config.signedUrlTtlSeconds,
    forcePathStyle: config.forcePathStyle,
    quarantineRequired: config.mode === "quarantine",
    warning: storageConfigured
      ? config.mode === "disabled"
        ? "A DRIVE objektumtárhely konfigurálva van, de a valós fájlműveletek le vannak tiltva."
        : config.mode === "quarantine"
          ? "A feltöltés engedélyezett, de a fájlok karanténba kerülnek és nem tölthetők le."
          : "A privát DRIVE objektumtárhely aktív."
      : "A DRIVE saját S3-kompatibilis tárhelykapcsolata még nincs konfigurálva.",
  };
}
