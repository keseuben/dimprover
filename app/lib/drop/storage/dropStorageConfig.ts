import { access, chmod, mkdir } from "node:fs/promises";
import path from "node:path";

export type DropStorageProvider = "local-private" | "s3-compatible";

export type DropStorageConfig = {
  provider: DropStorageProvider;
  mode: "disabled" | "quarantine" | "active";
  bucket: string;
  localRoot: string;
  maxUploadBytes: number;
  maxFileBytes: number;
  maxPartBytes: number;
  chunkSizeBytes: number;
  signedUrlTtlSeconds: number;
  scannerAvailable: boolean;
  s3?: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  };
};

function env(primary: string, legacy?: string) {
  return process.env[primary]?.trim() || (legacy ? process.env[legacy]?.trim() : "") || "";
}

function positiveInteger(value: string | undefined, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function getDropStorageConfig(): DropStorageConfig {
  const providerValue = env("DIMPRO_DROP_STORAGE_PROVIDER", "DROP_STORAGE_PROVIDER").toLowerCase();
  const provider: DropStorageProvider = providerValue === "s3-compatible" ? "s3-compatible" : "local-private";
  const modeValue = env("DIMPRO_DROP_STORAGE_MODE", "DROP_STORAGE_MODE").toLowerCase();
  const mode: DropStorageConfig["mode"] = modeValue === "active" ? "active" : modeValue === "quarantine" ? "quarantine" : "disabled";
  const maxPartMb = positiveInteger(env("DIMPRO_DROP_MAX_STREAM_UPLOAD_MB", "DROP_MAX_STREAM_UPLOAD_MB"), 70, 5, 500);
  const maxFileMb = positiveInteger(env("DIMPRO_DROP_MAX_FILE_UPLOAD_MB", "DROP_MAX_FILE_UPLOAD_MB"), 500, 1, 5_120);
  const chunkMb = positiveInteger(env("DIMPRO_DROP_UPLOAD_CHUNK_MB", "DROP_UPLOAD_CHUNK_MB"), 64, 5, 500);
  const endpoint = env("DIMPRO_DROP_S3_ENDPOINT", "DROP_STORAGE_ENDPOINT");
  const region = env("DIMPRO_DROP_S3_REGION", "DROP_STORAGE_REGION");
  const accessKeyId = env("DIMPRO_DROP_S3_ACCESS_KEY_ID", "DROP_STORAGE_ACCESS_KEY_ID");
  const secretAccessKey = env("DIMPRO_DROP_S3_SECRET_ACCESS_KEY", "DROP_STORAGE_SECRET_ACCESS_KEY");
  return {
    provider,
    mode,
    bucket: env("DIMPRO_DROP_S3_BUCKET", "DROP_STORAGE_BUCKET") || "dimpro-drop-local",
    localRoot: path.resolve(env("DIMPRO_DROP_STORAGE_LOCAL_ROOT", "DROP_STORAGE_LOCAL_ROOT") || "/var/lib/dimpro/drop"),
    maxUploadBytes: maxFileMb * 1024 * 1024,
    maxFileBytes: maxFileMb * 1024 * 1024,
    maxPartBytes: maxPartMb * 1024 * 1024,
    chunkSizeBytes: chunkMb * 1024 * 1024,
    signedUrlTtlSeconds: positiveInteger(env("DIMPRO_DROP_SIGNED_URL_TTL_SECONDS"), 600, 60, 900),
    scannerAvailable: Boolean(env("DIMPRO_DROP_VIRUS_SCANNER_COMMAND", "DROP_VIRUS_SCANNER_COMMAND")),
    s3: endpoint && region && accessKeyId && secretAccessKey ? {
      endpoint,
      region,
      accessKeyId,
      secretAccessKey,
      forcePathStyle: env("DIMPRO_DROP_S3_FORCE_PATH_STYLE", "DROP_STORAGE_FORCE_PATH_STYLE").toLowerCase() === "true",
    } : undefined,
  };
}

export function getDropStoragePaths(config = getDropStorageConfig()) {
  return {
    root: config.localRoot,
    incoming: path.join(config.localRoot, "incoming"),
    quarantine: path.join(config.localRoot, "quarantine"),
    objects: path.join(config.localRoot, "objects"),
    metadata: path.join(config.localRoot, "metadata"),
  };
}

export async function ensureDropLocalStorage(config = getDropStorageConfig()) {
  if (config.provider !== "local-private") return;
  const paths = getDropStoragePaths(config);
  for (const directory of Object.values(paths)) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    await access(directory);
  }
}

export function getDropStorageSafeStatus(config = getDropStorageConfig()) {
  const localConfigured = config.provider === "local-private"
    && config.mode !== "disabled"
    && path.isAbsolute(config.localRoot)
    && !config.localRoot.startsWith(path.resolve(process.cwd(), "public"));
  const s3Configured = config.provider === "s3-compatible" && Boolean(config.s3 && config.bucket);
  const driveBucket = process.env.DIMPRO_DRIVE_S3_BUCKET?.trim() || "";
  const driveAccessKey = process.env.DIMPRO_DRIVE_S3_ACCESS_KEY_ID?.trim() || "";
  const credentialIsolationReady = config.provider !== "s3-compatible"
    || Boolean(
      config.s3
      && config.bucket
      && config.bucket !== driveBucket
      && config.s3.accessKeyId !== driveAccessKey,
    );
  const storageConfigured = (localConfigured || s3Configured) && credentialIsolationReady;
  return {
    provider: config.provider,
    mode: config.mode,
    bucket: config.bucket,
    maxUploadBytes: config.maxUploadBytes,
    maxFileBytes: config.maxFileBytes,
    maxPartBytes: config.maxPartBytes,
    chunkSizeBytes: config.chunkSizeBytes,
    signedUrlTtlSeconds: config.signedUrlTtlSeconds,
    localConfigured,
    s3Configured,
    credentialIsolationReady,
    storageConfigured,
    scannerAvailable: config.scannerAvailable,
    objectWriteEnabled: storageConfigured && config.mode !== "disabled",
    publicDownloadReady: storageConfigured && config.mode === "active" && config.scannerAvailable,
  };
}
