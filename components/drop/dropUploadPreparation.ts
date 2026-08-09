export type DropFileNameRule =
  | "original"
  | "safe_original"
  | "preserve_original"
  | "dimpro_photo"
  | "package_sequence"
  | "date_package_sequence"
  | "custom_prefix";
export type DropImageSizePreset = "original" | "large" | "medium" | "small";
export type DropImageMetadataPolicy = "strip" | "preserve";
export type DropCapturedAtSource = "exif" | "file_last_modified" | "upload_time";

export const DROP_IMAGE_SIZE_PRESETS: Record<DropImageSizePreset, {
  label: string;
  description: string;
  maxLongEdge: number;
  quality: number;
  minimumSavingsPercent: number;
}> = {
  large: {
    label: "Nagy",
    description: "3200 px · 90% minőség · részletgazdag dokumentációhoz",
    maxLongEdge: 3200,
    quality: 0.9,
    minimumSavingsPercent: 3,
  },
  medium: {
    label: "Közepes",
    description: "2560 px · 82% minőség · általános küldéshez",
    maxLongEdge: 2560,
    quality: 0.82,
    minimumSavingsPercent: 5,
  },
  small: {
    label: "Kicsi",
    description: "1600 px · 74% minőség · gyors mobil küldéshez",
    maxLongEdge: 1600,
    quality: 0.74,
    minimumSavingsPercent: 5,
  },
  original: {
    label: "Eredeti felbontás",
    description: "Nincs méretarányos kicsinyítés · a metaadat-szabály külön érvényesül",
    maxLongEdge: 0,
    quality: 0.96,
    minimumSavingsPercent: 0,
  },
};

export function getDropImageOptimizationOptions(
  preset: DropImageSizePreset,
  metadataPolicy: DropImageMetadataPolicy = "strip",
): DropImageOptimizationOptions {
  const selected = DROP_IMAGE_SIZE_PRESETS[preset] || DROP_IMAGE_SIZE_PRESETS.medium;
  if (metadataPolicy === "preserve") {
    return {
      enabled: false,
      maxLongEdge: 0,
      quality: 1,
      minimumSavingsPercent: 0,
      metadataPolicy,
    };
  }
  return {
    enabled: true,
    maxLongEdge: selected.maxLongEdge,
    quality: selected.quality,
    minimumSavingsPercent: selected.minimumSavingsPercent,
    metadataPolicy,
  };
}

export type DropImageOptimizationOptions = {
  enabled: boolean;
  maxLongEdge: number;
  quality: number;
  minimumSavingsPercent: number;
  metadataPolicy?: DropImageMetadataPolicy;
};

export type DropFilePreparationOptions = {
  packageCode: string;
  packageTitle: string;
  nameRule: DropFileNameRule;
  customPrefix: string;
  photoLabel?: string;
  sequenceStart: number;
  imageOptimization: DropImageOptimizationOptions;
};

export type PreparedDropFile = {
  originalFile: File;
  uploadFile: File;
  originalName: string;
  displayName: string;
  originalSize: number;
  uploadSize: number;
  optimized: boolean;
  optimizationNote: string;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  capturedAt: string;
  capturedAtSource: DropCapturedAtSource;
  uploadedAt: string;
  sequenceNumber: number;
  customLabel: string;
};

function extensionOf(name: string) {
  const match = name.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : "";
}

function stemOf(name: string) {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(0, index) : name;
}

export function sanitizeDropFileNamePart(value: string, fallback = "fajl") {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
  return normalized || fallback;
}

function preserveDropFileNamePart(value: string, fallback = "fájl") {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return normalized || fallback;
}

function safePart(value: string, fallback = "fajl") {
  return sanitizeDropFileNamePart(value, fallback);
}

export function sanitizeDropOriginalFileName(originalName: string, preserveAccentsAndSpaces: boolean) {
  const extension = extensionOf(originalName) || "bin";
  const stem = preserveAccentsAndSpaces
    ? preserveDropFileNamePart(stemOf(originalName), "fájl")
    : sanitizeDropFileNamePart(stemOf(originalName), "fajl");
  return `${stem}.${extension}`;
}

export function sanitizeDropManualFileName(value: string, fallbackOriginalName: string) {
  const raw = value.normalize("NFKC").replace(/[\/:*?"<>|]/g, "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const fallbackExtension = extensionOf(fallbackOriginalName) || "bin";
  const extension = extensionOf(raw) || fallbackExtension;
  const rawStem = extensionOf(raw) ? stemOf(raw) : raw;
  const stem = preserveDropFileNamePart(rawStem, preserveDropFileNamePart(stemOf(fallbackOriginalName), "fájl"));
  return `${stem}.${extension}`.slice(0, 180);
}

function genericPhotoStem(value: string) {
  const stem = stemOf(value).trim();
  return /^(img|image|dsc|dscn|pxl|photo|foto|screenshot|screen_?shot)[-_ ]*[0-9a-z:_-]*$/i.test(stem);
}

export function suggestedDropPhotoLabel(originalName: string) {
  if (!originalName || genericPhotoStem(originalName)) return "";
  return sanitizeDropFileNamePart(stemOf(originalName), "foto");
}

function two(value: number) { return String(value).padStart(2, "0"); }
function compactDate(value: Date) { return `${String(value.getFullYear()).slice(-2)}${two(value.getMonth() + 1)}${two(value.getDate())}`; }
function compactTime(value: Date) { return `${two(value.getHours())}${two(value.getMinutes())}`; }

export function buildDropPhotoDisplayName(input: {
  originalName: string;
  outputExtension?: string;
  capturedAt: string | Date;
  uploadedAt: string | Date;
  sequenceNumber: number;
  customLabel?: string;
}) {
  const captured = input.capturedAt instanceof Date ? input.capturedAt : new Date(input.capturedAt);
  const uploaded = input.uploadedAt instanceof Date ? input.uploadedAt : new Date(input.uploadedAt);
  const safeCaptured = Number.isNaN(captured.getTime()) ? uploaded : captured;
  const safeUploaded = Number.isNaN(uploaded.getTime()) ? new Date() : uploaded;
  const extension = input.outputExtension || extensionOf(input.originalName) || "bin";
  const sequence = `F${String(Math.max(1, Math.floor(input.sequenceNumber))).padStart(4, "0")}`;
  const label = sanitizeDropFileNamePart(input.customLabel || suggestedDropPhotoLabel(input.originalName) || "foto", "foto");
  return `${compactDate(safeCaptured)}_${compactTime(safeCaptured)}_${compactDate(safeUploaded)}_${sequence}_${label}.${extension}`;
}

function parseExifDate(value: string) {
  const match = value.trim().match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function readJpegExifCapturedAt(file: File): Promise<Date | null> {
  const lower = file.name.toLowerCase();
  if (!(file.type.toLowerCase() === "image/jpeg" || lower.endsWith(".jpg") || lower.endsWith(".jpeg"))) return null;
  try {
    const buffer = await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer();
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) { offset += 1; continue; }
      const marker = view.getUint8(offset + 1);
      offset += 2;
      if (marker === 0xda || marker === 0xd9) break;
      if (offset + 2 > view.byteLength) break;
      const length = view.getUint16(offset, false);
      if (length < 2 || offset + length > view.byteLength) break;
      if (marker === 0xe1 && length >= 10) {
        const exifStart = offset + 2;
        const signature = String.fromCharCode(...new Uint8Array(buffer, exifStart, Math.min(6, view.byteLength - exifStart)));
        if (signature.startsWith("Exif")) {
          const tiff = exifStart + 6;
          if (tiff + 8 > view.byteLength) return null;
          const endian = view.getUint16(tiff, false);
          const little = endian === 0x4949;
          if (!little && endian !== 0x4d4d) return null;
          const u16 = (pos: number) => view.getUint16(pos, little);
          const u32 = (pos: number) => view.getUint32(pos, little);
          const readAscii = (base: number, type: number, count: number, valuePos: number) => {
            if (type !== 2 || count < 4) return "";
            const dataPos = count <= 4 ? valuePos : base + u32(valuePos);
            if (dataPos < 0 || dataPos + count > view.byteLength) return "";
            let out = "";
            for (let i = 0; i < count; i += 1) {
              const char = view.getUint8(dataPos + i);
              if (!char) break;
              out += String.fromCharCode(char);
            }
            return out;
          };
          const readIfd = (ifdPos: number) => {
            if (ifdPos < 0 || ifdPos + 2 > view.byteLength) return { date: "", exifOffset: 0 };
            const count = u16(ifdPos);
            let date = "";
            let exifOffset = 0;
            for (let i = 0; i < count; i += 1) {
              const entry = ifdPos + 2 + i * 12;
              if (entry + 12 > view.byteLength) break;
              const tag = u16(entry);
              const type = u16(entry + 2);
              const itemCount = u32(entry + 4);
              if (tag === 0x8769) exifOffset = u32(entry + 8);
              if (tag === 0x0132 || tag === 0x9003 || tag === 0x9004) {
                date = readAscii(tiff, type, itemCount, entry + 8) || date;
                if (tag === 0x9003 && date) break;
              }
            }
            return { date, exifOffset };
          };
          const ifd0Offset = u32(tiff + 4);
          const ifd0 = readIfd(tiff + ifd0Offset);
          if (ifd0.exifOffset) {
            const exifIfd = readIfd(tiff + ifd0.exifOffset);
            const parsed = parseExifDate(exifIfd.date);
            if (parsed) return parsed;
          }
          const parsed = parseExifDate(ifd0.date);
          if (parsed) return parsed;
        }
      }
      offset += length;
    }
  } catch {
    return null;
  }
  return null;
}

async function resolveCapturedAt(file: File, uploadTime: Date): Promise<{ date: Date; source: DropCapturedAtSource }> {
  const exif = await readJpegExifCapturedAt(file);
  if (exif) return { date: exif, source: "exif" };
  if (Number.isFinite(file.lastModified) && file.lastModified > 946684800000 && file.lastModified <= Date.now() + 86_400_000) {
    return { date: new Date(file.lastModified), source: "file_last_modified" };
  }
  return { date: uploadTime, source: "upload_time" };
}

function buildName(input: {
  originalName: string;
  outputExtension: string;
  index: number;
  capturedAt: Date;
  uploadedAt: Date;
  options: DropFilePreparationOptions;
}) {
  const sequenceNumber = input.options.sequenceStart + input.index;
  const sequence = String(sequenceNumber).padStart(3, "0");
  const extension = input.outputExtension || extensionOf(input.originalName) || "bin";
  const date = input.uploadedAt.toISOString().slice(0, 10).replaceAll("-", "");
  const packagePart = safePart(input.options.packageTitle || input.options.packageCode, "csomag");
  if (input.options.nameRule === "preserve_original") return sanitizeDropOriginalFileName(input.originalName, true);
  if (input.options.nameRule === "safe_original" || input.options.nameRule === "original") return sanitizeDropOriginalFileName(input.originalName, false);
  if (input.options.nameRule === "dimpro_photo") {
    return buildDropPhotoDisplayName({
      originalName: input.originalName,
      outputExtension: extension,
      capturedAt: input.capturedAt,
      uploadedAt: input.uploadedAt,
      sequenceNumber,
      customLabel: input.options.photoLabel || suggestedDropPhotoLabel(input.originalName),
    });
  }
  if (input.options.nameRule === "date_package_sequence") return `${date}_${packagePart}_${sequence}.${extension}`;
  if (input.options.nameRule === "custom_prefix") return `${safePart(input.options.customPrefix || packagePart, packagePart)}_${sequence}.${extension}`;
  return `${safePart(input.options.packageCode || packagePart, packagePart)}_${sequence}.${extension}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("A böngésző nem tudta létrehozni az optimalizált képet."));
    }, type, quality);
  });
}

type DropDrawableImage = {
  width: number;
  height: number;
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void;
  close: () => void;
};

const rasterImageExtensions = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "tif", "tiff", "bmp", "gif", "ico"]);

function isRasterImageFile(file: File) {
  return file.type.toLowerCase().startsWith("image/") || rasterImageExtensions.has(extensionOf(file.name));
}

function isHeicFile(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return type === "image/heic" || type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
}

async function convertHeicToJpeg(file: File) {
  const { heicTo } = await import("heic-to/csp");
  const blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
  if (!blob || blob.size <= 0) throw new Error("A HEIC/HEIF konverzió nem adott használható képet.");
  return new File([blob], `${safePart(stemOf(file.name), "kep")}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
}

async function loadDrawableImage(file: File): Promise<DropDrawableImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { width: bitmap.width, height: bitmap.height, draw: (context, width, height) => context.drawImage(bitmap, 0, 0, width, height), close: () => bitmap.close() };
    } catch {
      // Safari/iOS esetén a natív képelem több formátumot is meg tud nyitni.
    }
  }
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("A mobilböngésző nem tudta megnyitni ezt a képformátumot."));
      image.src = objectUrl;
    });
    return { width: image.naturalWidth, height: image.naturalHeight, draw: (context, width, height) => context.drawImage(image, 0, 0, width, height), close: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function optimizeImage(file: File, options: DropImageOptimizationOptions) {
  if (!options.enabled) {
    return { file, optimized: false, note: options.metadataPolicy === "preserve" ? "Eredeti fájl megőrizve, a GPS- és EXIF-metaadatok változatlanul benne maradnak." : "Képoptimalizálás kikapcsolva.", width: null, height: null };
  }
  const lowerType = file.type.toLowerCase();
  const lowerName = file.name.toLowerCase();
  const heicSource = isHeicFile(file);
  if (lowerType === "image/gif" || lowerName.endsWith(".gif")) return { file, optimized: false, note: "A GIF az animáció megőrzése miatt eredeti formában maradt.", width: null, height: null };
  if (lowerType === "image/svg+xml" || lowerName.endsWith(".svg")) return { file, optimized: false, note: "A vektorkép eredeti formában maradt.", width: null, height: null };

  let source: DropDrawableImage | null = null;
  try {
    const drawableFile = heicSource ? await convertHeicToJpeg(file) : file;
    source = await loadDrawableImage(drawableFile);
    if (!source.width || !source.height) throw new Error("A kép mérete nem olvasható.");
    const longEdge = Math.max(source.width, source.height);
    const scale = options.maxLongEdge > 0 && longEdge > options.maxLongEdge ? options.maxLongEdge / longEdge : 1;
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const isPng = !heicSource && (lowerType === "image/png" || lowerName.endsWith(".png"));
    const shouldReencode = options.metadataPolicy === "strip" || scale < 1 || !isPng;
    if (!shouldReencode) return { file, optimized: false, note: "A PNG mérete nem igényelt átméretezést; az eredeti fájl maradt.", width: source.width, height: source.height };
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: isPng });
    if (!context) throw new Error("A böngésző képfeldolgozó felülete nem érhető el.");
    source.draw(context, width, height);
    const outputType = isPng || lowerType === "image/webp" ? "image/webp" : "image/jpeg";
    const blob = await canvasToBlob(canvas, outputType, options.quality);
    const savingsPercent = Math.max(0, Math.round((1 - blob.size / file.size) * 100));
    if (options.metadataPolicy !== "strip" && !heicSource && (blob.size >= file.size || savingsPercent < options.minimumSavingsPercent)) {
      return { file, optimized: false, note: `A várható megtakarítás csak ${savingsPercent}%, ezért az eredeti kép maradt.`, width: source.width, height: source.height };
    }
    const extension = outputType === "image/webp" ? "webp" : "jpg";
    const optimizedFile = new File([blob], `${safePart(stemOf(file.name), "kep")}.${extension}`, { type: outputType, lastModified: file.lastModified });
    const sourceLabel = heicSource ? "HEIC/HEIF → JPG; " : "";
    return { file: optimizedFile, optimized: true, note: `${sourceLabel}${source.width}×${source.height} → ${width}×${height}; ${savingsPercent}% méretmegtakarítás; EXIF- és GPS-metaadatok eltávolítva.`, width, height };
  } catch (error) {
    if (heicSource) throw new Error(`A(z) ${file.name} HEIC/HEIF képet a böngésző nem tudta JPG-vé alakítani. Próbálja újra, vagy alakítsa át a képet JPG-re. Technikai ok: ${error instanceof Error ? error.message : "ismeretlen konverziós hiba"}`);
    return { file, optimized: false, note: "A böngésző ezt a képformátumot nem tudta biztonságosan átméretezni; az eredeti kép kerül feltöltésre.", width: null, height: null };
  } finally {
    source?.close();
  }
}

export async function prepareDropFiles(files: File[], options: DropFilePreparationOptions): Promise<PreparedDropFile[]> {
  const result: PreparedDropFile[] = [];
  const uploadTime = new Date();
  for (let index = 0; index < files.length; index += 1) {
    const originalFile = files[index];
    const captured = isRasterImageFile(originalFile) ? await resolveCapturedAt(originalFile, uploadTime) : { date: uploadTime, source: "upload_time" as const };
    const imageResult = isRasterImageFile(originalFile)
      ? await optimizeImage(originalFile, options.imageOptimization)
      : { file: originalFile, optimized: false, note: "Nem képfájl; nincs méretoptimalizálás.", width: null, height: null };
    const outputExtension = extensionOf(imageResult.file.name) || extensionOf(originalFile.name);
    const sequenceNumber = options.sequenceStart + index;
    const displayName = buildName({ originalName: originalFile.name, outputExtension, index, capturedAt: captured.date, uploadedAt: uploadTime, options });
    const uploadFile = displayName === imageResult.file.name
      ? imageResult.file
      : new File([imageResult.file], displayName, { type: imageResult.file.type, lastModified: imageResult.file.lastModified });
    result.push({
      originalFile,
      uploadFile,
      originalName: originalFile.name,
      displayName,
      originalSize: originalFile.size,
      uploadSize: uploadFile.size,
      optimized: imageResult.optimized,
      optimizationNote: imageResult.note,
      previewUrl: uploadFile.type.startsWith("image/") ? URL.createObjectURL(uploadFile) : null,
      width: imageResult.width,
      height: imageResult.height,
      capturedAt: captured.date.toISOString(),
      capturedAtSource: captured.source,
      uploadedAt: uploadTime.toISOString(),
      sequenceNumber,
      customLabel: options.photoLabel || suggestedDropPhotoLabel(originalFile.name),
    });
  }
  return result;
}

export function revokePreparedDropFile(file: PreparedDropFile) {
  if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
}
