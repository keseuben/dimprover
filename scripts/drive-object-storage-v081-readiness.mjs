const required = [
  "DIMPRO_DRIVE_S3_ENDPOINT",
  "DIMPRO_DRIVE_S3_REGION",
  "DIMPRO_DRIVE_S3_BUCKET",
  "DIMPRO_DRIVE_S3_ACCESS_KEY_ID",
  "DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY",
];

const presence = Object.fromEntries(required.map((key) => [key, Boolean(process.env[key]?.trim())]));
const mode = process.env.DIMPRO_DRIVE_STORAGE_MODE?.trim().toLowerCase() || "disabled";
const provider = process.env.DIMPRO_DRIVE_STORAGE_PROVIDER?.trim() || "s3-compatible";
const endpoint = process.env.DIMPRO_DRIVE_S3_ENDPOINT?.trim() || "";
const region = process.env.DIMPRO_DRIVE_S3_REGION?.trim() || "";
const bucket = process.env.DIMPRO_DRIVE_S3_BUCKET?.trim() || "";
const maxUploadMb = Number(process.env.DIMPRO_DRIVE_MAX_UPLOAD_MB || 500);
const signedUrlTtlSeconds = Number(process.env.DIMPRO_DRIVE_SIGNED_URL_TTL_SECONDS || 600);
const uploadSessionTtlMinutes = Number(process.env.DIMPRO_DRIVE_UPLOAD_SESSION_TTL_MINUTES || 30);
const forcePathStyle = process.env.DIMPRO_DRIVE_S3_FORCE_PATH_STYLE?.trim().toLowerCase() === "true";
const configurationReady = Object.values(presence).every(Boolean);

const result = {
  ok: configurationReady,
  provider,
  mode,
  configurationReady,
  safeConfiguration: {
    endpointConfigured: Boolean(endpoint),
    endpointUsesHttps: endpoint.startsWith("https://"),
    region,
    bucket,
    accessKeyConfigured: presence.DIMPRO_DRIVE_S3_ACCESS_KEY_ID,
    secretKeyConfigured: presence.DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY,
    maxUploadMb,
    signedUrlTtlSeconds,
    uploadSessionTtlMinutes,
    forcePathStyle,
  },
  writeEnabled: configurationReady && mode !== "disabled",
  downloadEnabled: configurationReady && mode === "active",
  quarantineRequired: mode === "quarantine",
  secretsExposed: false,
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(2);