import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const endpoint = process.env.DIMPRO_DRIVE_S3_ENDPOINT?.trim() || "";
const region = process.env.DIMPRO_DRIVE_S3_REGION?.trim() || "";
const bucket = process.env.DIMPRO_DRIVE_S3_BUCKET?.trim() || "";
const accessKeyId = process.env.DIMPRO_DRIVE_S3_ACCESS_KEY_ID?.trim() || "";
const secretAccessKey = process.env.DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY?.trim() || "";
const forcePathStyle = process.env.DIMPRO_DRIVE_S3_FORCE_PATH_STYLE?.trim().toLowerCase() === "true";

const presence = {
  endpoint: Boolean(endpoint),
  region: Boolean(region),
  bucket: Boolean(bucket),
  accessKeyId: Boolean(accessKeyId),
  secretAccessKey: Boolean(secretAccessKey),
};

if (Object.values(presence).some((value) => !value)) {
  console.log(JSON.stringify({
    ok: false,
    stage: "configuration",
    presence,
    secretsExposed: false,
    error: "A DRIVE S3-konfiguráció hiányos.",
  }, null, 2));
  process.exit(2);
}

const client = new S3Client({
  endpoint,
  region,
  forcePathStyle,
  credentials: { accessKeyId, secretAccessKey },
});

const expectedOrigins = (process.env.DIMPRO_DRIVE_CORS_ORIGINS || "https://projektkapu.dimpro.hu")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const expectedMethods = ["GET", "HEAD", "PUT"];
const corsRules = [{
  ID: "dimpro-drive-projectgate-v081",
  AllowedOrigins: expectedOrigins,
  AllowedMethods: expectedMethods,
  AllowedHeaders: ["*"],
  ExposeHeaders: ["ETag", "x-amz-request-id", "x-amz-id-2"],
  MaxAgeSeconds: 600,
}];

try {
  await client.send(new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: { CORSRules: corsRules },
  }));
  const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  const rules = current.CORSRules || [];
  const matching = rules.find((rule) =>
    expectedOrigins.every((origin) => rule.AllowedOrigins?.includes(origin))
    && expectedMethods.every((method) => rule.AllowedMethods?.includes(method))
    && rule.AllowedHeaders?.includes("*"),
  );
  if (!matching) throw new Error("A visszaolvasott CORS-szabály nem egyezik a DIMPRO DRIVE elvárással.");

  console.log(JSON.stringify({
    ok: true,
    bucketConfigured: true,
    corsConfigured: true,
    origins: expectedOrigins,
    methods: expectedMethods,
    allowedHeaders: ["*"],
    secretsExposed: false,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    bucketConfigured: true,
    corsConfigured: false,
    secretsExposed: false,
    error: {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Ismeretlen CORS-hiba.",
      statusCode: typeof error === "object" && error !== null && "$metadata" in error
        ? error.$metadata?.httpStatusCode || null
        : null,
    },
  }, null, 2));
  process.exit(1);
}