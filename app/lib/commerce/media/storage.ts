import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getCommerceMediaStorageConfig } from "./storageConfig";
import type { MediaVariantKind } from "./types";

function clientAndConfig() {
  const config = getCommerceMediaStorageConfig();
  return {
    config,
    client: new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    }),
  };
}

function extensionForMime(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    default: return "bin";
  }
}

export function buildCommerceMediaStorageKey(input: {
  organizationId: string;
  assetId: string;
  kind: MediaVariantKind;
  mimeType: string;
}) {
  const org = input.organizationId.trim().toLowerCase();
  const asset = input.assetId.trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(org) || !/^[0-9a-f-]{36}$/.test(asset)) throw new Error("COMMERCE_MEDIA_STORAGE_ID_INVALID");
  return `commerce/${org}/media/${asset}/${input.kind.toLowerCase()}.${extensionForMime(input.mimeType)}`;
}

export async function putCommerceMediaObject(input: {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  body: ReadableStream<Uint8Array>;
}) {
  const { client, config } = clientAndConfig();
  if (input.sizeBytes <= 0 || input.sizeBytes > config.maxUploadBytes) throw new Error("COMMERCE_MEDIA_UPLOAD_SIZE_INVALID");
  const body = Readable.fromWeb(input.body as never);
  const result = await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.storageKey,
    Body: body,
    ContentLength: input.sizeBytes,
    ContentType: input.mimeType,
    Metadata: { "dimpro-component": "commerce-media", "dimpro-variant": input.storageKey.split("/").at(-1) || "media" },
  }));
  return { bucket: config.bucket, storageKey: input.storageKey, etag: result.ETag || null, versionId: result.VersionId || null };
}

export async function headCommerceMediaObject(storageKey: string) {
  const { client, config } = clientAndConfig();
  const result = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: storageKey }));
  return {
    bucket: config.bucket,
    storageKey,
    sizeBytes: Number(result.ContentLength || 0),
    mimeType: result.ContentType || "application/octet-stream",
    etag: result.ETag || null,
  };
}

export async function deleteCommerceMediaObject(storageKey: string) {
  const { client, config } = clientAndConfig();
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: storageKey }));
}

export async function createCommerceMediaSignedGetUrl(input: { storageKey: string; expiresInSeconds?: number }) {
  const { client, config } = clientAndConfig();
  const expiresIn = Math.max(60, Math.min(3600, Math.floor(input.expiresInSeconds || 300)));
  return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: input.storageKey }), { expiresIn });
}
