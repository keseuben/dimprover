import crypto from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
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
  console.log(JSON.stringify({ ok: false, stage: "configuration", presence, error: "A DRIVE S3-konfiguráció hiányos." }, null, 2));
  process.exit(2);
}

const client = new S3Client({
  endpoint,
  region,
  forcePathStyle,
  credentials: { accessKeyId, secretAccessKey },
});

const marker = `DIMPRO DRIVE Object Storage preflight ${new Date().toISOString()}`;
const body = Buffer.from(marker, "utf8");
const sha256 = crypto.createHash("sha256").update(body).digest("hex");
const key = `_dimpro_healthchecks/drive-object-storage-v040-${Date.now()}-${crypto.randomUUID()}.txt`;
const checks = [];
let uploaded = false;

function record(name, pass, detail = null) {
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name} failed`);
}

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  record("Private bucket accessible", true);

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: "text/plain; charset=utf-8",
    Metadata: { "dimpro-sha256": sha256, "dimpro-purpose": "drive-v040-preflight" },
  }));
  uploaded = true;
  record("Test object uploaded", true);

  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  record("Test object size verified", Number(head.ContentLength) === body.length, { expected: body.length, actual: Number(head.ContentLength) });
  record("Test object metadata verified", head.Metadata?.["dimpro-sha256"] === sha256);

  const get = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const received = get.Body ? Buffer.from(await get.Body.transformToByteArray()) : Buffer.alloc(0);
  const receivedSha256 = crypto.createHash("sha256").update(received).digest("hex");
  record("Test object downloaded", received.length === body.length);
  record("Downloaded checksum verified", receivedSha256 === sha256);

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  uploaded = false;
  record("Test object deleted", true);

  console.log(JSON.stringify({
    ok: true,
    provider: "s3-compatible",
    bucketConfigured: true,
    forcePathStyle,
    checks,
    secretsExposed: false,
  }, null, 2));
} catch (error) {
  if (uploaded) {
    try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); } catch {}
  }
  console.error(JSON.stringify({
    ok: false,
    provider: "s3-compatible",
    bucketConfigured: true,
    forcePathStyle,
    checks,
    secretsExposed: false,
    error: {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Ismeretlen tárhelyhiba.",
      code: typeof error === "object" && error !== null && "$metadata" in error ? error.$metadata?.httpStatusCode || null : null,
    },
  }, null, 2));
  process.exit(1);
}
