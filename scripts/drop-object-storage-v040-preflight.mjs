import crypto from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const env = (name, legacy = "") => process.env[name]?.trim() || (legacy ? process.env[legacy]?.trim() : "") || "";
const endpoint = env("DIMPRO_DROP_S3_ENDPOINT", "DROP_STORAGE_ENDPOINT");
const region = env("DIMPRO_DROP_S3_REGION", "DROP_STORAGE_REGION");
const bucket = env("DIMPRO_DROP_S3_BUCKET", "DROP_STORAGE_BUCKET");
const accessKeyId = env("DIMPRO_DROP_S3_ACCESS_KEY_ID", "DROP_STORAGE_ACCESS_KEY_ID");
const secretAccessKey = env("DIMPRO_DROP_S3_SECRET_ACCESS_KEY", "DROP_STORAGE_SECRET_ACCESS_KEY");
const forcePathStyle = env("DIMPRO_DROP_S3_FORCE_PATH_STYLE", "DROP_STORAGE_FORCE_PATH_STYLE").toLowerCase() === "true";
const driveBucket = process.env.DIMPRO_DRIVE_S3_BUCKET?.trim() || "";
const driveAccessKey = process.env.DIMPRO_DRIVE_S3_ACCESS_KEY_ID?.trim() || "";
const presence = {
  endpoint: Boolean(endpoint), region: Boolean(region), bucket: Boolean(bucket),
  accessKeyId: Boolean(accessKeyId), secretAccessKey: Boolean(secretAccessKey),
};
const isolation = {
  bucketDiffersFromDrive: Boolean(bucket && bucket !== driveBucket),
  accessKeyDiffersFromDrive: Boolean(accessKeyId && accessKeyId !== driveAccessKey),
};
if (Object.values(presence).some((value) => !value) || Object.values(isolation).some((value) => !value)) {
  console.log(JSON.stringify({ ok: false, stage: "configuration", presence, isolation, secretsExposed: false, error: "A DROP S3-konfiguráció hiányos vagy DRIVE credentialt használ." }, null, 2));
  process.exit(2);
}
const client = new S3Client({ endpoint, region, forcePathStyle, credentials: { accessKeyId, secretAccessKey } });
const body = Buffer.from(`DIMPRO DROP S3 preflight ${new Date().toISOString()}`, "utf8");
const sha256 = crypto.createHash("sha256").update(body).digest("hex");
const key = `_dimpro_healthchecks/drop-object-storage-v040-${Date.now()}-${crypto.randomUUID()}.txt`;
const checks = [];
let uploaded = false;
function record(name, pass, detail = null) {
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name} failed`);
}
try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  record("Private DROP bucket accessible", true);
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: body, ContentType: "text/plain; charset=utf-8",
    Metadata: { "dimpro-sha256": sha256, "dimpro-purpose": "drop-v040-preflight" },
  }));
  uploaded = true;
  record("DROP test object uploaded", true);
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  record("DROP test object size verified", Number(head.ContentLength) === body.length, { expected: body.length, actual: Number(head.ContentLength) });
  record("DROP test object metadata verified", head.Metadata?.["dimpro-sha256"] === sha256);
  const get = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const received = get.Body ? Buffer.from(await get.Body.transformToByteArray()) : Buffer.alloc(0);
  record("DROP test object downloaded", received.length === body.length);
  record("DROP downloaded checksum verified", crypto.createHash("sha256").update(received).digest("hex") === sha256);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  uploaded = false;
  record("DROP test object deleted", true);
  console.log(JSON.stringify({ ok: true, provider: "s3-compatible", bucketConfigured: true, credentialIsolationReady: true, forcePathStyle, checks, secretsExposed: false }, null, 2));
} catch (error) {
  if (uploaded) try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); } catch {}
  console.error(JSON.stringify({
    ok: false, provider: "s3-compatible", bucketConfigured: true, credentialIsolationReady: true,
    forcePathStyle, checks, secretsExposed: false,
    error: { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : "Ismeretlen tárhelyhiba.", code: typeof error === "object" && error !== null && "$metadata" in error ? error.$metadata?.httpStatusCode || null : null },
  }, null, 2));
  process.exit(1);
}
