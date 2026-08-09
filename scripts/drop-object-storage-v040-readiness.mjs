const env = (name, legacy = "") => process.env[name]?.trim() || (legacy ? process.env[legacy]?.trim() : "") || "";
const provider = env("DIMPRO_DROP_STORAGE_PROVIDER", "DROP_STORAGE_PROVIDER") || "local-private";
const mode = env("DIMPRO_DROP_STORAGE_MODE", "DROP_STORAGE_MODE") || "disabled";
const endpoint = env("DIMPRO_DROP_S3_ENDPOINT", "DROP_STORAGE_ENDPOINT");
const region = env("DIMPRO_DROP_S3_REGION", "DROP_STORAGE_REGION");
const bucket = env("DIMPRO_DROP_S3_BUCKET", "DROP_STORAGE_BUCKET");
const accessKeyId = env("DIMPRO_DROP_S3_ACCESS_KEY_ID", "DROP_STORAGE_ACCESS_KEY_ID");
const secretAccessKey = env("DIMPRO_DROP_S3_SECRET_ACCESS_KEY", "DROP_STORAGE_SECRET_ACCESS_KEY");
const driveBucket = process.env.DIMPRO_DRIVE_S3_BUCKET?.trim() || "";
const driveAccessKey = process.env.DIMPRO_DRIVE_S3_ACCESS_KEY_ID?.trim() || "";
const configurationReady = provider === "s3-compatible"
  && Boolean(endpoint && region && bucket && accessKeyId && secretAccessKey);
const credentialIsolationReady = configurationReady
  && bucket !== driveBucket
  && accessKeyId !== driveAccessKey;
console.log(JSON.stringify({
  ok: configurationReady && credentialIsolationReady,
  provider,
  mode,
  configurationReady,
  credentialIsolationReady,
  safeConfiguration: {
    endpointConfigured: Boolean(endpoint),
    endpointUsesHttps: endpoint.startsWith("https://"),
    region: region || null,
    bucket: bucket || null,
    accessKeyConfigured: Boolean(accessKeyId),
    secretKeyConfigured: Boolean(secretAccessKey),
    bucketDiffersFromDrive: Boolean(bucket && bucket !== driveBucket),
    accessKeyDiffersFromDrive: Boolean(accessKeyId && accessKeyId !== driveAccessKey),
    maxFileMb: Number(env("DIMPRO_DROP_MAX_FILE_UPLOAD_MB", "DROP_MAX_FILE_UPLOAD_MB") || 500),
    chunkMb: Number(env("DIMPRO_DROP_UPLOAD_CHUNK_MB", "DROP_UPLOAD_CHUNK_MB") || 64),
    signedUrlTtlSeconds: Number(env("DIMPRO_DROP_SIGNED_URL_TTL_SECONDS") || 600),
  },
  writeEnabled: configurationReady && credentialIsolationReady && mode !== "disabled",
  downloadEnabled: configurationReady && credentialIsolationReady && mode === "active" && Boolean(env("DIMPRO_DROP_VIRUS_SCANNER_COMMAND", "DROP_VIRUS_SCANNER_COMMAND")),
  quarantineRequired: mode === "quarantine",
  secretsExposed: false,
}, null, 2));
process.exit(configurationReady && credentialIsolationReady ? 0 : 2);
