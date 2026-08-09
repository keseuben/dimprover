import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getDropStorageConfig } from "./dropStorageConfig";
import { DropStorageError } from "./dropLocalStorage";

function normalizeEtag(value: string | undefined | null) {
  return (value || "").trim().replace(/^"|"$/g, "");
}

function getClient() {
  const config = getDropStorageConfig();
  if (config.provider !== "s3-compatible" || !config.s3) {
    throw new DropStorageError("A DROP S3 Object Storage még nincs konfigurálva.", "DROP_S3_NOT_CONFIGURED", 503);
  }
  return {
    config,
    client: new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      forcePathStyle: config.s3.forcePathStyle,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
    }),
  };
}

export async function createDropS3Multipart(input: { storageKey: string; contentType: string }) {
  const { client, config } = getClient();
  const result = await client.send(new CreateMultipartUploadCommand({
    Bucket: config.bucket,
    Key: input.storageKey,
    ContentType: input.contentType || "application/octet-stream",
    Metadata: {
      "dimpro-component": "drop",
      "dimpro-state": "quarantine",
    },
  }));
  if (!result.UploadId) {
    throw new DropStorageError("A DROP S3 multipart azonosító nem jött létre.", "DROP_S3_MULTIPART_INIT_FAILED", 502);
  }
  return { uploadId: result.UploadId };
}

export async function createDropS3PartUrl(input: {
  storageKey: string;
  uploadId: string;
  partNumber: number;
  expiresIn?: number;
}) {
  const { client, config } = getClient();
  const expiresIn = input.expiresIn || config.signedUrlTtlSeconds;
  const command = new UploadPartCommand({
    Bucket: config.bucket,
    Key: input.storageKey,
    UploadId: input.uploadId,
    PartNumber: input.partNumber,
  });
  return {
    method: "PUT" as const,
    url: await getSignedUrl(client, command, { expiresIn }),
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

export async function inspectDropS3Part(input: {
  storageKey: string;
  uploadId: string;
  partNumber: number;
}) {
  const { client, config } = getClient();
  const result = await client.send(new ListPartsCommand({
    Bucket: config.bucket,
    Key: input.storageKey,
    UploadId: input.uploadId,
    PartNumberMarker: String(Math.max(0, input.partNumber - 1)),
    MaxParts: 1,
  }));
  const part = result.Parts?.find((candidate) => candidate.PartNumber === input.partNumber);
  if (!part?.ETag) {
    throw new DropStorageError("A feltöltött S3 fájlrész nem található.", "DROP_S3_PART_NOT_FOUND", 409);
  }
  return {
    partNumber: input.partNumber,
    etag: normalizeEtag(part.ETag),
    sizeBytes: Number(part.Size || 0),
    lastModified: part.LastModified?.toISOString() || null,
  };
}

export async function completeDropS3Multipart(input: {
  storageKey: string;
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
}) {
  const { client, config } = getClient();
  const ordered = [...input.parts].sort((left, right) => left.partNumber - right.partNumber);
  if (!ordered.length || ordered.some((part, index) => part.partNumber !== index + 1 || !normalizeEtag(part.etag))) {
    throw new DropStorageError("A multipart véglegesítés partlistája hiányos.", "DROP_S3_PARTS_INCOMPLETE", 409);
  }
  const result = await client.send(new CompleteMultipartUploadCommand({
    Bucket: config.bucket,
    Key: input.storageKey,
    UploadId: input.uploadId,
    MultipartUpload: {
      Parts: ordered.map((part) => ({ PartNumber: part.partNumber, ETag: normalizeEtag(part.etag) })),
    },
  }));
  return {
    etag: normalizeEtag(result.ETag),
    location: result.Location || null,
    versionId: result.VersionId || null,
  };
}

export async function abortDropS3Multipart(input: { storageKey: string; uploadId: string }) {
  const { client, config } = getClient();
  try {
    await client.send(new AbortMultipartUploadCommand({
      Bucket: config.bucket,
      Key: input.storageKey,
      UploadId: input.uploadId,
    }));
  } catch (error) {
    const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
    if (candidate?.name === "NoSuchUpload" || candidate?.name === "NotFound" || candidate?.$metadata?.httpStatusCode === 404) return;
    throw error;
  }
}


export async function putDropS3Object(input: {
  storageKey: string;
  body: Buffer | Uint8Array;
  contentType: string;
  bucket?: string | null;
  metadata?: Record<string, string>;
}) {
  const { client, config } = getClient();
  const result = await client.send(new PutObjectCommand({
    Bucket: input.bucket || config.bucket,
    Key: input.storageKey,
    Body: input.body,
    ContentType: input.contentType || "application/octet-stream",
    Metadata: {
      "dimpro-component": "drop",
      "dimpro-state": "generated",
      ...(input.metadata || {}),
    },
  }));
  return {
    etag: normalizeEtag(result.ETag),
    versionId: result.VersionId || null,
  };
}

export async function createDropS3InlineUrl(input: {
  storageKey: string;
  bucket?: string | null;
  contentType?: string | null;
  expiresIn: number;
}) {
  const { client, config } = getClient();
  const command = new GetObjectCommand({
    Bucket: input.bucket || config.bucket,
    Key: input.storageKey,
    ResponseContentDisposition: "inline",
    ResponseContentType: input.contentType || "application/octet-stream",
  });
  return {
    method: "GET" as const,
    url: await getSignedUrl(client, command, { expiresIn: input.expiresIn }),
    expiresAt: new Date(Date.now() + input.expiresIn * 1000).toISOString(),
  };
}


export async function listDropS3Objects(input: { prefix?: string; maxKeys?: number; bucket?: string | null } = {}) {
  const { client, config } = getClient();
  const maxKeys = Math.max(1, Math.min(1000, Math.floor(input.maxKeys || 1000)));
  const result = await client.send(new ListObjectsV2Command({
    Bucket: input.bucket || config.bucket,
    Prefix: input.prefix || undefined,
    MaxKeys: maxKeys,
  }));
  return {
    objects: (result.Contents || []).map((item) => ({
      key: item.Key || "",
      sizeBytes: Number(item.Size || 0),
      etag: normalizeEtag(item.ETag),
      lastModified: item.LastModified?.toISOString() || null,
    })).filter((item) => Boolean(item.key)),
    truncated: Boolean(result.IsTruncated),
    keyCount: Number(result.KeyCount || result.Contents?.length || 0),
  };
}

export async function headDropS3Object(input: { storageKey: string; bucket?: string | null }) {
  const { client, config } = getClient();
  const result = await client.send(new HeadObjectCommand({
    Bucket: input.bucket || config.bucket,
    Key: input.storageKey,
  }));
  return {
    sizeBytes: Number(result.ContentLength || 0),
    contentType: result.ContentType || "application/octet-stream",
    etag: normalizeEtag(result.ETag),
    lastModified: result.LastModified?.toISOString() || null,
    metadata: result.Metadata || {},
  };
}

export async function deleteDropS3Object(input: { storageKey: string; bucket?: string | null }) {
  const { client, config } = getClient();
  await client.send(new DeleteObjectCommand({
    Bucket: input.bucket || config.bucket,
    Key: input.storageKey,
  }));
}

export async function openDropS3Object(input: { storageKey: string; bucket?: string | null }) {
  const { client, config } = getClient();
  const result = await client.send(new GetObjectCommand({
    Bucket: input.bucket || config.bucket,
    Key: input.storageKey,
  }));
  if (!result.Body) {
    throw new DropStorageError("A DROP S3 objektum nem olvasható.", "DROP_S3_OBJECT_MISSING", 502);
  }
  return {
    body: result.Body,
    contentLength: Number(result.ContentLength || 0),
    contentType: result.ContentType || "application/octet-stream",
    etag: normalizeEtag(result.ETag),
  };
}

function safeDownloadName(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return normalized || "dimpro-drop-file";
}

export async function createDropS3DownloadUrl(input: {
  storageKey: string;
  bucket?: string | null;
  displayName: string;
  contentType?: string | null;
  expiresIn: number;
}) {
  const { client, config } = getClient();
  const displayName = safeDownloadName(input.displayName);
  const asciiName = displayName.replace(/[^\x20-\x7E]/g, "_");
  const disposition = `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(displayName)}`;
  const command = new GetObjectCommand({
    Bucket: input.bucket || config.bucket,
    Key: input.storageKey,
    ResponseContentDisposition: disposition,
    ResponseContentType: input.contentType || "application/octet-stream",
  });
  return {
    method: "GET" as const,
    url: await getSignedUrl(client, command, { expiresIn: input.expiresIn }),
    expiresAt: new Date(Date.now() + input.expiresIn * 1000).toISOString(),
    displayName,
  };
}

