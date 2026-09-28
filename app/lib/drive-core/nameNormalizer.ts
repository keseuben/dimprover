export const DRIVE_SAFE_FILE_NAME_MAX = 96;
export const DRIVE_SAFE_FOLDER_NAME_MAX = 60;
export const DRIVE_SAFE_PATH_TARGET_MAX = 180;
export const DRIVE_NAME_NORMALIZATION_VERSION = "1";

const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

function shortStableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

function transliterateAscii(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/Æ/g, "AE")
    .replace(/æ/g, "ae")
    .replace(/Ø/g, "O")
    .replace(/ø/g, "o")
    .replace(/Ð/g, "D")
    .replace(/ð/g, "d")
    .replace(/Þ/g, "TH")
    .replace(/þ/g, "th");
}

function safeStem(value: string, fallback: string) {
  const ascii = transliterateAscii(value);
  const normalized = ascii
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/-+/g, "-")
    .replace(/^[_-]+|[_-]+$/g, "");

  if (!normalized) return fallback;
  if (WINDOWS_RESERVED.test(normalized)) return "_" + normalized;
  return normalized;
}

function truncateWithHash(stem: string, hash: string, maxLength: number) {
  const suffix = "_" + hash;
  const keep = Math.max(1, maxLength - suffix.length);
  const trimmed = stem.slice(0, keep).replace(/^[_-]+|[_-]+$/g, "") || "file";
  return trimmed + suffix;
}

function splitFileName(value: string) {
  const input = value.trim();
  const index = input.lastIndexOf(".");
  if (index <= 0 || index === input.length - 1) return { stem: input, extension: "" };
  return { stem: input.slice(0, index), extension: input.slice(index + 1) };
}

function safeExtension(value: string) {
  return transliterateAscii(value)
    .replace(/[^A-Za-z0-9]+/g, "")
    .slice(0, 16)
    .toLowerCase();
}

export type DriveSafeFileName = {
  originalFileName: string;
  displayName: string;
  safeFileName: string;
  extension: string;
  nameWasSanitized: boolean;
  nameWasShortened: boolean;
  normalizationVersion: string;
};

export function normalizeDriveFileName(originalFileName: string): DriveSafeFileName {
  const original = String(originalFileName || "").trim() || "file";
  const parts = splitFileName(original);
  const extension = safeExtension(parts.extension);
  const displayName = parts.stem.trim() || original;
  const hash = shortStableHash(original);
  const stem = safeStem(parts.stem, "file");
  const extPart = extension ? "." + extension : "";
  const allowedStemLength = Math.max(1, DRIVE_SAFE_FILE_NAME_MAX - extPart.length);

  let safeBase = stem + "_" + hash;
  let nameWasShortened = false;
  if (safeBase.length > allowedStemLength) {
    safeBase = truncateWithHash(stem, hash, allowedStemLength);
    nameWasShortened = true;
  }
  const safeFileName = safeBase + extPart;
  const comparableOriginal = transliterateAscii(original);
  const nameWasSanitized = safeFileName !== comparableOriginal || /[^A-Za-z0-9_.-]/.test(comparableOriginal);

  return {
    originalFileName: original,
    displayName,
    safeFileName,
    extension,
    nameWasSanitized,
    nameWasShortened,
    normalizationVersion: DRIVE_NAME_NORMALIZATION_VERSION,
  };
}

export type DriveSafeFolderName = {
  originalFolderName: string;
  displayFolderName: string;
  safeFolderName: string;
  nameWasSanitized: boolean;
  nameWasShortened: boolean;
  normalizationVersion: string;
};

export function normalizeDriveFolderName(originalFolderName: string): DriveSafeFolderName {
  const original = String(originalFolderName || "").trim() || "mappa";
  const hash = shortStableHash(original);
  const stem = safeStem(original, "mappa");
  let safeFolderName = stem + "_" + hash;
  let nameWasShortened = false;
  if (safeFolderName.length > DRIVE_SAFE_FOLDER_NAME_MAX) {
    safeFolderName = truncateWithHash(stem, hash, DRIVE_SAFE_FOLDER_NAME_MAX);
    nameWasShortened = true;
  }
  const comparableOriginal = transliterateAscii(original);
  const nameWasSanitized = safeFolderName !== comparableOriginal || /[^A-Za-z0-9_-]/.test(comparableOriginal);

  return {
    originalFolderName: original,
    displayFolderName: original,
    safeFolderName,
    nameWasSanitized,
    nameWasShortened,
    normalizationVersion: DRIVE_NAME_NORMALIZATION_VERSION,
  };
}

export function normalizeDriveRelativePath(relativePath: string) {
  const parts = String(relativePath || "")
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);
  if (!parts.length) return { originalRelativePath: "", safeRelativePath: "" };

  const file = normalizeDriveFileName(parts.at(-1) || "file");
  const folders = parts.slice(0, -1).map(normalizeDriveFolderName);
  return {
    originalRelativePath: parts.join("/"),
    safeRelativePath: [...folders.map((entry) => entry.safeFolderName), file.safeFileName].join("/"),
    file,
    folders,
  };
}
