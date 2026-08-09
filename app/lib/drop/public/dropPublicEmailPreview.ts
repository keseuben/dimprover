import sharp from "sharp";
import { openDropS3Object } from "../storage/dropS3Storage";
import type { DimproMailAttachment } from "@/app/lib/license/mail-profiles";

const DEFAULT_MAX_PREVIEWS = 20;
const HARD_MAX_PREVIEWS = 20;
const DEFAULT_MAX_SOURCE_BYTES = 18 * 1024 * 1024;
const HARD_MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_PREVIEW_BYTES = 3 * 1024 * 1024;
const HARD_MAX_TOTAL_PREVIEW_BYTES = 5 * 1024 * 1024;
const THUMBNAIL_WIDTH = 180;
const THUMBNAIL_HEIGHT = 120;

export type DropPublicEmailPreviewSource = {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  isImage: boolean;
  storageKey: string;
  storageBucket?: string | null;
};

export type DropPublicEmailPreview = {
  fileId: string;
  cid: string;
  filename: string;
  content: Buffer;
  contentType: "image/jpeg";
  width: number;
  height: number;
  sizeBytes: number;
};

export type DropPublicEmailPreviewBundle = {
  previews: DropPublicEmailPreview[];
  attachments: DimproMailAttachment[];
  eligibleCount: number;
  attemptedCount: number;
  skippedCount: number;
  errors: Array<{ fileId: string; code: string }>;
  totalBytes: number;
};

function clampEnv(name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function isSupportedImage(file: DropPublicEmailPreviewSource) {
  if (!file.isImage || !file.storageKey || file.sizeBytes <= 0) return false;
  const mime = file.mimeType.toLowerCase().split(";", 1)[0].trim();
  return mime.startsWith("image/") && mime !== "image/svg+xml" && mime !== "image/x-icon";
}

function safeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "file";
}

async function readObjectBuffer(file: DropPublicEmailPreviewSource, maximumBytes: number) {
  if (file.sizeBytes > maximumBytes) throw Object.assign(new Error("A kép túl nagy az e-mailes előnézethez."), { code: "SOURCE_TOO_LARGE" });
  const opened = await openDropS3Object({ storageKey: file.storageKey, bucket: file.storageBucket });
  if (opened.contentLength > maximumBytes) throw Object.assign(new Error("A kép túl nagy az e-mailes előnézethez."), { code: "SOURCE_TOO_LARGE" });
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of opened.body as unknown as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > maximumBytes) throw Object.assign(new Error("A kép streamje meghaladta az e-mailes előnézeti korlátot."), { code: "STREAM_TOO_LARGE" });
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export async function createDropPublicEmailThumbnail(source: Buffer) {
  const result = await sharp(source, {
    animated: false,
    failOn: "warning",
    limitInputPixels: 50_000_000,
  })
    .rotate()
    .resize({
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_HEIGHT,
      fit: "cover",
      position: "centre",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 72, progressive: true, chromaSubsampling: "4:2:0" })
    .toBuffer({ resolveWithObject: true });
  return {
    content: result.data,
    width: result.info.width,
    height: result.info.height,
    sizeBytes: result.data.length,
    contentType: "image/jpeg" as const,
  };
}

export async function buildDropPublicEmailPreviews(input: {
  packageId: string;
  files: DropPublicEmailPreviewSource[];
}): Promise<DropPublicEmailPreviewBundle> {
  const maximumPreviews = clampEnv("DIMPRO_DROP_EMAIL_MAX_PREVIEWS", DEFAULT_MAX_PREVIEWS, 0, HARD_MAX_PREVIEWS);
  const maximumSourceBytes = clampEnv("DIMPRO_DROP_EMAIL_PREVIEW_MAX_SOURCE_BYTES", DEFAULT_MAX_SOURCE_BYTES, 1_000_000, HARD_MAX_SOURCE_BYTES);
  const maximumTotalBytes = clampEnv("DIMPRO_DROP_EMAIL_PREVIEW_MAX_TOTAL_BYTES", DEFAULT_MAX_TOTAL_PREVIEW_BYTES, 100_000, HARD_MAX_TOTAL_PREVIEW_BYTES);
  const eligible = input.files.filter(isSupportedImage);
  const selected = eligible.slice(0, maximumPreviews);
  const previews: DropPublicEmailPreview[] = [];
  const errors: Array<{ fileId: string; code: string }> = [];
  let totalBytes = 0;

  for (const file of selected) {
    try {
      const source = await readObjectBuffer(file, maximumSourceBytes);
      const thumbnail = await createDropPublicEmailThumbnail(source);
      if (totalBytes + thumbnail.sizeBytes > maximumTotalBytes) {
        errors.push({ fileId: file.id, code: "TOTAL_PREVIEW_LIMIT" });
        continue;
      }
      const sequence = previews.length + 1;
      const cid = `dimpro-drop-${safeId(input.packageId)}-${safeId(file.id)}@dimpro.hu`;
      previews.push({
        fileId: file.id,
        cid,
        filename: `dimpro-drop-preview-${String(sequence).padStart(2, "0")}.jpg`,
        content: thumbnail.content,
        contentType: thumbnail.contentType,
        width: thumbnail.width,
        height: thumbnail.height,
        sizeBytes: thumbnail.sizeBytes,
      });
      totalBytes += thumbnail.sizeBytes;
    } catch (error) {
      errors.push({
        fileId: file.id,
        code: typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "PREVIEW_FAILED") : "PREVIEW_FAILED",
      });
    }
  }

  return {
    previews,
    attachments: previews.map((preview) => ({
      filename: preview.filename,
      content: preview.content,
      contentType: preview.contentType,
      cid: preview.cid,
      contentDisposition: "inline",
    })),
    eligibleCount: eligible.length,
    attemptedCount: selected.length,
    skippedCount: Math.max(0, eligible.length - previews.length),
    errors,
    totalBytes,
  };
}
