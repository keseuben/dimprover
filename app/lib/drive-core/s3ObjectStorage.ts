import { createHash } from "node:crypto";
import { Readable } from "node:stream";
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
  UploadPartCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DriveCoreRepositoryError } from "./errors";
import { getDriveObjectStorageConfig } from "./storageConfig";

function safeSegment(value: string, fallback: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 120) || fallback;
}

function extensionFromFileName(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16);
}

function getStorageClient() {
  const config = getDriveObjectStorageConfig();
  if (!config.s3 || !config.bucket) {
    throw new DriveCoreRepositoryError(
      "A DRIVE saját S3-kompatibilis objektumtárhelye nincs konfigurálva.",
      "DRIVE_OBJECT_STORAGE_NOT_CONFIGURED",
      503,
    );
  }
  return {
    config,
    client: new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
    }),
  };
}

export function buildDriveStorageKey(input: { projectId: string; uploadId: string; fileName: string }) {
  const now = new Date();
  const project = safeSegment(input.projectId, "project");
  const upload = safeSegment(input.uploadId, "upload");
  const extension = extensionFromFileName(input.fileName);
  const objectName = extension ? `${upload}.${extension}` : upload;
  return `projects/${project}/objects/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${objectName}`;
}

export function buildPersonalDriveStorageKey(input: { userId: string; uploadId: string; fileName: string }) {
  const now = new Date();
  const user = safeSegment(input.userId, "user");
  const upload = safeSegment(input.uploadId, "upload");
  const extension = extensionFromFileName(input.fileName);
  const objectName = extension ? `${upload}.${extension}` : upload;
  return `users/${user}/objects/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${objectName}`;
}

/**
 * Personal multipart keys are namespace-isolated from project Drive objects.
 * All parts stay quarantined until a later audited whole-file scan completes.
 */
export function buildPersonalMultipartStorageKey(input: {
  userId: string; sessionId: string; fileName: string;
}) {
  const userId = safeSegment(input.userId, "user");
  const sessionId = safeSegment(input.sessionId, "session");
  const ext = extensionFromFileName(input.fileName);
  return `users/${userId}/multipart/${sessionId}${ext ? "." + ext : ""}`;
}

export async function createDriveSignedPutUrl(input: {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const { client, config } = getStorageClient();
  if (input.sizeBytes <= 0) {
    throw new DriveCoreRepositoryError("Üres objektumhoz nem készíthető feltöltési URL.", "DRIVE_OBJECT_SIZE_INVALID", 400);
  }
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.storageKey,
    ContentType: input.mimeType || "application/octet-stream",
  });
  const url = await getSignedUrl(client, command, { expiresIn: config.signedUrlTtlSeconds });
  return {
    url,
    method: "PUT" as const,
    headers: {
      "content-type": input.mimeType || "application/octet-stream",
    },
    bucket: config.bucket,
    expiresAt: new Date(Date.now() + config.signedUrlTtlSeconds * 1000).toISOString(),
  };
}


export async function putDriveObjectStream(input: {
  storageKey: string;
  body: AsyncIterable<Uint8Array>;
  contentType: string;
  contentLength: number;
  metadata?: Record<string, string>;
}) {
  const { client, config } = getStorageClient();
  if (input.contentLength <= 0) {
    throw new DriveCoreRepositoryError("Üres objektum nem archiválható a DRIVE tárhelyre.", "DRIVE_ARCHIVE_OBJECT_SIZE_INVALID", 400);
  }
  const body = input.body instanceof Readable ? input.body : Readable.from(input.body);
  const result = await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.storageKey,
    Body: body,
    ContentLength: input.contentLength,
    ContentType: input.contentType || "application/octet-stream",
    Metadata: {
      "dimpro-component": "drive",
      "dimpro-source": "drop-archive",
      ...(input.metadata || {}),
    },
  }));
  return {
    bucket: config.bucket,
    storageKey: input.storageKey,
    etag: result.ETag || null,
    versionId: result.VersionId || null,
  };
}


export async function listDriveS3Objects(input: { prefix?: string; maxKeys?: number; continuationToken?: string | null } = {}) {
  const { client, config } = getStorageClient();
  const maxKeys = Math.max(1, Math.min(1000, Math.floor(input.maxKeys || 1000)));
  const result = await client.send(new ListObjectsV2Command({
    Bucket: config.bucket,
    Prefix: input.prefix || undefined,
    MaxKeys: maxKeys,
    ContinuationToken: input.continuationToken || undefined,
  }));
  return {
    objects: (result.Contents || []).map((item) => ({
      key: item.Key || "",
      sizeBytes: Number(item.Size || 0),
      lastModified: item.LastModified?.toISOString() || null,
    })).filter((item) => Boolean(item.key)),
    truncated: Boolean(result.IsTruncated),
    nextContinuationToken: result.NextContinuationToken || null,
    keyCount: Number(result.KeyCount || result.Contents?.length || 0),
    bucket: config.bucket,
  };
}

export async function headDriveObject(input: { storageKey: string; bucket?: string | null }) {
  const { client, config } = getStorageClient();
  const bucket = input.bucket || config.bucket;
  if (bucket !== config.bucket) {
    throw new DriveCoreRepositoryError("A feltöltési munkamenet tárhelye eltér az aktív DRIVE buckettől.", "DRIVE_OBJECT_BUCKET_MISMATCH", 409);
  }
  const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: input.storageKey }));
  return {
    bucket,
    storageKey: input.storageKey,
    contentLength: Number(result.ContentLength || 0),
    contentType: result.ContentType || "application/octet-stream",
    etag: result.ETag || null,
    versionId: result.VersionId || null,
    lastModified: result.LastModified?.toISOString() || null,
    metadata: result.Metadata || {},
  };
}

export async function calculateDriveObjectSha256(input: { storageKey: string; bucket?: string | null }) {
  const { client, config } = getStorageClient();
  const bucket = input.bucket || config.bucket;
  if (bucket !== config.bucket) {
    throw new DriveCoreRepositoryError(
      "A hash-ellenőrzés tárhelye eltér az aktív DRIVE buckettől.",
      "DRIVE_OBJECT_BUCKET_MISMATCH",
      409,
    );
  }

  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: input.storageKey }));
  const body = result.Body;
  if (!body || typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] !== "function") {
    throw new DriveCoreRepositoryError(
      "A feltöltött objektum tartalma nem olvasható vissza SHA-256 ellenőrzéshez.",
      "DRIVE_OBJECT_HASH_STREAM_UNAVAILABLE",
      502,
    );
  }

  const hash = createHash("sha256");
  let sizeBytes = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    hash.update(chunk);
    sizeBytes += chunk.byteLength;
  }

  return {
    bucket,
    storageKey: input.storageKey,
    sha256: hash.digest("hex"),
    sizeBytes,
    contentType: result.ContentType || "application/octet-stream",
    etag: result.ETag || null,
  };
}

export async function getDriveObjectStream(input: {
  storageKey: string;
  bucket?: string | null;
  range?: string | null;
}) {
  const { client, config } = getStorageClient();
  const bucket = input.bucket || config.bucket;
  if (bucket !== config.bucket) {
    throw new DriveCoreRepositoryError("A dokumentum tárhelye eltér az aktív DRIVE buckettől.", "DRIVE_OBJECT_BUCKET_MISMATCH", 409);
  }
  const result = await client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: input.storageKey,
    Range: input.range?.trim() || undefined,
  }));
  const body = result.Body;
  if (!body || typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] !== "function") {
    throw new DriveCoreRepositoryError("A DRIVE objektum tartalma nem streamelhető.", "DRIVE_OBJECT_STREAM_UNAVAILABLE", 502);
  }
  return {
    body: body as AsyncIterable<Uint8Array>,
    contentLength: Number(result.ContentLength || 0),
    contentType: result.ContentType || "application/octet-stream",
    contentRange: result.ContentRange || null,
    acceptRanges: result.AcceptRanges || "bytes",
    etag: result.ETag || null,
    lastModified: result.LastModified?.toISOString() || null,
  };
}

export async function deleteDriveObject(input: { storageKey: string; bucket?: string | null }) {
  const { client, config } = getStorageClient();
  const bucket = input.bucket || config.bucket;
  if (bucket !== config.bucket) {
    throw new DriveCoreRepositoryError("A törlendő objektum tárhelye eltér az aktív DRIVE buckettől.", "DRIVE_OBJECT_BUCKET_MISMATCH", 409);
  }
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: input.storageKey }));
}


function normalizeDriveMultipartEtag(value: string | undefined | null) {
  return (value || "").trim().replace(/^"|"$/g, "");
}

export async function createDriveS3Multipart(input: { storageKey: string; mimeType: string }) {
  const { client, config } = getStorageClient();
  const result = await client.send(new CreateMultipartUploadCommand({
    Bucket: config.bucket,
    Key: input.storageKey,
    ContentType: input.mimeType || "application/octet-stream",
    Metadata: {
      "dimpro-component": "drive",
      "dimpro-state": "quarantine",
    },
  }));
  if (!result.UploadId) {
    throw new DriveCoreRepositoryError(
      "A DRIVE S3 multipart azonosító nem jött létre.",
      "DRIVE_S3_MULTIPART_INIT_FAILED",
      502,
    );
  }
  return { uploadId: result.UploadId };
}

export async function createDriveS3PartUrl(input: {
  storageKey: string;
  uploadId: string;
  partNumber: number;
  expiresIn?: number;
}) {
  const { client, config } = getStorageClient();
  const expiresIn = Math.max(60, Math.min(900, Math.floor(input.expiresIn || config.signedUrlTtlSeconds)));
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

export async function listDriveS3MultipartParts(input: { storageKey: string; uploadId: string }) {
  const { client, config } = getStorageClient();
  const parts: Array<{ partNumber: number; etag: string; sizeBytes: number; lastModified: string | null }> = [];
  let partNumberMarker: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await client.send(new ListPartsCommand({
      Bucket: config.bucket,
      Key: input.storageKey,
      UploadId: input.uploadId,
      PartNumberMarker: partNumberMarker,
      MaxParts: 1000,
    }));
    parts.push(...(result.Parts || []).map((part) => ({
      partNumber: Number(part.PartNumber || 0),
      etag: normalizeDriveMultipartEtag(part.ETag),
      sizeBytes: Number(part.Size || 0),
      lastModified: part.LastModified?.toISOString() || null,
    })).filter((part) => part.partNumber > 0 && Boolean(part.etag)));
    if (!result.IsTruncated) return parts;
    const next = result.NextPartNumberMarker;
    if (next == null || String(next) === String(partNumberMarker ?? "")) {
      throw new DriveCoreRepositoryError(
        "A DRIVE multipart S3 partlista lapozása nem halad előre.",
        "DRIVE_S3_PART_LIST_PAGINATION_FAILED",
        502,
      );
    }
    partNumberMarker = String(next);
  }
  throw new DriveCoreRepositoryError(
    "A DRIVE multipart S3 partlista túllépte a biztonságos lapozási határt.",
    "DRIVE_S3_PART_LIST_TOO_LARGE",
    502,
  );
}

export async function inspectDriveS3MultipartPart(input: {
  storageKey: string;
  uploadId: string;
  partNumber: number;
}) {
  const parts = await listDriveS3MultipartParts(input);
  const part = parts.find((candidate) => candidate.partNumber === input.partNumber);
  if (!part) {
    throw new DriveCoreRepositoryError(
      "A feltöltött DRIVE S3 fájlrész nem található.",
      "DRIVE_S3_PART_NOT_FOUND",
      409,
    );
  }
  return part;
}

export async function completeDriveS3Multipart(input: {
  storageKey: string;
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
}) {
  const { client, config } = getStorageClient();
  const ordered = [...input.parts].sort((left, right) => left.partNumber - right.partNumber);
  if (!ordered.length || ordered.some((part, index) => part.partNumber !== index + 1 || !normalizeDriveMultipartEtag(part.etag))) {
    throw new DriveCoreRepositoryError(
      "A DRIVE multipart véglegesítés partlistája hiányos.",
      "DRIVE_S3_PARTS_INCOMPLETE",
      409,
    );
  }
  const result = await client.send(new CompleteMultipartUploadCommand({
    Bucket: config.bucket,
    Key: input.storageKey,
    UploadId: input.uploadId,
    MultipartUpload: {
      Parts: ordered.map((part) => ({ PartNumber: part.partNumber, ETag: normalizeDriveMultipartEtag(part.etag) })),
    },
  }));
  return {
    etag: normalizeDriveMultipartEtag(result.ETag),
    versionId: result.VersionId || null,
    location: result.Location || null,
  };
}

export async function abortDriveS3Multipart(input: { storageKey: string; uploadId: string }) {
  const { client, config } = getStorageClient();
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

export async function createDriveSignedGetUrl(input: {
  storageKey: string;
  bucket?: string | null;
  fileName: string;
  mimeType?: string | null;
  disposition?: "attachment" | "inline";
}) {
  const { client, config } = getStorageClient();
  const bucket = input.bucket || config.bucket;
  if (bucket !== config.bucket) {
    throw new DriveCoreRepositoryError("A dokumentum tárhelye eltér az aktív DRIVE buckettől.", "DRIVE_OBJECT_BUCKET_MISMATCH", 409);
  }
  const safeName = input.fileName.replace(/[\r\n"\\/]/g, "_").slice(0, 240) || "dimpro-drive-file";
  const disposition = input.disposition === "inline" ? "inline" : "attachment";
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: input.storageKey,
    ResponseContentType: input.mimeType || "application/octet-stream",
    ResponseContentDisposition: `${disposition}; filename*=UTF-8''${encodeURIComponent(safeName)}`,
  });
  const url = await getSignedUrl(client, command, { expiresIn: config.signedUrlTtlSeconds });
  return {
    url,
    method: "GET" as const,
    expiresAt: new Date(Date.now() + config.signedUrlTtlSeconds * 1000).toISOString(),
  };
}
