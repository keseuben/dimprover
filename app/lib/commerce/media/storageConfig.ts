export type CommerceMediaStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  maxUploadBytes: number;
  uploadTokenTtlSeconds: number;
  uploadSecret: string;
  credentialSource: "COMMERCE" | "DRIVE_FALLBACK";
};

function text(name: string) {
  return process.env[name]?.trim() || "";
}

function boolean(value: string, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function integer(value: string, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

export class CommerceMediaStorageConfigError extends Error {
  constructor(message: string, public readonly code: string) { super(message); }
}

export function getCommerceMediaStorageConfig(): CommerceMediaStorageConfig {
  const commerceEndpoint = text("DIMPRO_COMMERCE_S3_ENDPOINT");
  const commerceBucket = text("DIMPRO_COMMERCE_S3_BUCKET");
  const commerceAccess = text("DIMPRO_COMMERCE_S3_ACCESS_KEY_ID");
  const commerceSecret = text("DIMPRO_COMMERCE_S3_SECRET_ACCESS_KEY");
  const useCommerce = Boolean(commerceEndpoint && commerceBucket && commerceAccess && commerceSecret);
  const endpoint = useCommerce ? commerceEndpoint : text("DIMPRO_DRIVE_S3_ENDPOINT");
  const bucket = useCommerce ? commerceBucket : text("DIMPRO_DRIVE_S3_BUCKET");
  const accessKeyId = useCommerce ? commerceAccess : text("DIMPRO_DRIVE_S3_ACCESS_KEY_ID");
  const secretAccessKey = useCommerce ? commerceSecret : text("DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY");
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new CommerceMediaStorageConfigError("A Commerce Media objektumtárhely nincs konfigurálva.", "COMMERCE_MEDIA_STORAGE_NOT_CONFIGURED");
  }
  const region = useCommerce ? text("DIMPRO_COMMERCE_S3_REGION") : text("DIMPRO_DRIVE_S3_REGION");
  const forcePathStyleRaw = useCommerce ? text("DIMPRO_COMMERCE_S3_FORCE_PATH_STYLE") : text("DIMPRO_DRIVE_S3_FORCE_PATH_STYLE");
  const uploadSecret = text("DIMPRO_COMMERCE_MEDIA_UPLOAD_SECRET") || text("DROP_UPLOAD_SESSION_SECRET") || text("DROP_SESSION_SECRET");
  if (!uploadSecret || uploadSecret.length < 24) {
    throw new CommerceMediaStorageConfigError("A Commerce Media upload token titka hiányzik.", "COMMERCE_MEDIA_UPLOAD_SECRET_MISSING");
  }
  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region: region || "auto",
    forcePathStyle: boolean(forcePathStyleRaw, true),
    maxUploadBytes: integer(text("DIMPRO_COMMERCE_MEDIA_MAX_UPLOAD_BYTES"), 9 * 1024 * 1024, 256 * 1024, 50 * 1024 * 1024),
    uploadTokenTtlSeconds: integer(text("DIMPRO_COMMERCE_MEDIA_UPLOAD_TTL_SECONDS"), 15 * 60, 60, 60 * 60),
    uploadSecret,
    credentialSource: useCommerce ? "COMMERCE" : "DRIVE_FALLBACK",
  };
}
