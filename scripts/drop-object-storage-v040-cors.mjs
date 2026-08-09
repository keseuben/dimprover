import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const env = (name, legacy = "") => process.env[name]?.trim() || (legacy ? process.env[legacy]?.trim() : "") || "";
const endpoint = env("DIMPRO_DROP_S3_ENDPOINT", "DROP_STORAGE_ENDPOINT");
const region = env("DIMPRO_DROP_S3_REGION", "DROP_STORAGE_REGION");
const bucket = env("DIMPRO_DROP_S3_BUCKET", "DROP_STORAGE_BUCKET");
const accessKeyId = env("DIMPRO_DROP_S3_ACCESS_KEY_ID", "DROP_STORAGE_ACCESS_KEY_ID");
const secretAccessKey = env("DIMPRO_DROP_S3_SECRET_ACCESS_KEY", "DROP_STORAGE_SECRET_ACCESS_KEY");
const forcePathStyle = env("DIMPRO_DROP_S3_FORCE_PATH_STYLE", "DROP_STORAGE_FORCE_PATH_STYLE").toLowerCase() === "true";
const driveBucket = process.env.DIMPRO_DRIVE_S3_BUCKET?.trim() || "";
const driveAccessKey = process.env.DIMPRO_DRIVE_S3_ACCESS_KEY_ID?.trim() || "";
if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey || bucket === driveBucket || accessKeyId === driveAccessKey) {
  console.log(JSON.stringify({ ok: false, bucketConfigured: Boolean(bucket), credentialIsolationReady: false, secretsExposed: false, error: "A külön DROP S3-konfiguráció hiányos." }, null, 2));
  process.exit(2);
}
const client = new S3Client({ endpoint, region, forcePathStyle, credentials: { accessKeyId, secretAccessKey } });
const origins = (env("DIMPRO_DROP_CORS_ORIGINS") || "https://drop.dimpro.hu,https://www.drop.dimpro.hu")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const expected = {
  AllowedOrigins: origins,
  AllowedMethods: ["GET", "HEAD", "PUT"],
  AllowedHeaders: ["*"],
  ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
  MaxAgeSeconds: 3600,
};
try {
  await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: [expected] } }));
  const read = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  const rule = read.CORSRules?.[0];
  const corsConfigured = Boolean(
    rule
    && origins.every((origin) => rule.AllowedOrigins?.includes(origin))
    && ["GET", "HEAD", "PUT"].every((method) => rule.AllowedMethods?.includes(method))
    && rule.ExposeHeaders?.some((header) => header.toLowerCase() === "etag")
  );
  console.log(JSON.stringify({
    ok: corsConfigured,
    bucketConfigured: true,
    credentialIsolationReady: true,
    corsConfigured,
    origins: rule?.AllowedOrigins || [],
    methods: rule?.AllowedMethods || [],
    allowedHeaders: rule?.AllowedHeaders || [],
    exposedHeaders: rule?.ExposeHeaders || [],
    secretsExposed: false,
  }, null, 2));
  if (!corsConfigured) process.exit(1);
} catch (error) {
  console.error(JSON.stringify({ ok: false, bucketConfigured: true, credentialIsolationReady: true, corsConfigured: false, secretsExposed: false, error: { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : "Ismeretlen CORS hiba." } }, null, 2));
  process.exit(1);
}
