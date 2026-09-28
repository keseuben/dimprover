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

export function ensureDriveSafeFileName(value: string) {
  const input = String(value || "").trim();
  const parts = splitFileName(input);
  const extension = parts.extension;
  const safeExtensionValue = safeExtension(extension);
  const safeStemValue = parts.stem;
  const extensionIsSafe = extension ? /^[A-Za-z0-9]+$/.test(extension) && extension.length <= 16 : true;
  const stemIsSafe = /^[A-Za-z0-9_-]+$/.test(safeStemValue)
    && !WINDOWS_RESERVED.test(safeStemValue)
    && safeStemValue.length > 0;
  if (stemIsSafe && extensionIsSafe && input.length <= DRIVE_SAFE_FILE_NAME_MAX) return input;
  return normalizeDriveFileName(input).safeFileName;
}

export function compactDriveSafeFileName(value: string, maxLength: number) {
  const safe = ensureDriveSafeFileName(value);
  if (safe.length <= maxLength) return safe;
  const parts = splitFileName(safe);
  const extension = safeExtension(parts.extension);
  const extPart = extension ? "." + extension : "";
  const minLength = extPart.length + 6;
  const target = Math.max(minLength, maxLength);
  const stemBudget = Math.max(5, target - extPart.length);
  const hash = shortStableHash(safe);
  const compactStem = stemBudget <= 6
    ? hash.slice(0, stemBudget)
    : truncateWithHash(parts.stem, hash, stemBudget);
  return compactStem.slice(0, stemBudget) + extPart;
}

export function ensureDriveSafeFolderName(value: string) {
  const input = String(value || "").trim();
  if (/^[A-Za-z0-9_-]+$/.test(input) && !WINDOWS_RESERVED.test(input) && input.length <= DRIVE_SAFE_FOLDER_NAME_MAX) {
    return input;
  }
  return normalizeDriveFolderName(input).safeFolderName;
}

export function compactDriveSafeFolderName(value: string, maxLength: number) {
  const safe = ensureDriveSafeFolderName(value);
  if (safe.length <= maxLength) return safe;
  const target = Math.max(3, maxLength);
  const hash = shortStableHash(safe);
  if (target <= 6) return hash.slice(0, target);
  return truncateWithHash(safe, hash, target).slice(0, target);
}

export function buildDriveSafeArchiveFolderPath(
  folderSegments: string[],
  maxLength = DRIVE_SAFE_PATH_TARGET_MAX,
) {
  const safeFolders = folderSegments.map(ensureDriveSafeFolderName);
  const initial = safeFolders.join("/");
  if (initial.length <= maxLength) {
    return { folderSegments: safeFolders, relativePath: initial, pathWasCompacted: false };
  }

  const depth = Math.max(1, safeFolders.length);
  const separatorCount = Math.max(0, depth - 1);
  const availableChars = Math.max(depth, maxLength - separatorCount);
  const segmentBudget = Math.max(3, Math.min(DRIVE_SAFE_FOLDER_NAME_MAX, Math.floor(availableChars / depth)));
  const compactFolders = safeFolders.map((segment) => compactDriveSafeFolderName(segment, segmentBudget));
  const compactPath = compactFolders.join("/");
  if (compactPath.length <= maxLength) {
    return { folderSegments: compactFolders, relativePath: compactPath, pathWasCompacted: true };
  }

  const emergencyFolders = safeFolders.map((segment) => compactDriveSafeFolderName(segment, 3));
  const emergencyPath = emergencyFolders.join("/");
  if (emergencyPath.length <= maxLength) {
    return { folderSegments: emergencyFolders, relativePath: emergencyPath, pathWasCompacted: true };
  }

  const flattened = "P_" + shortStableHash(safeFolders.join("/"));
  return { folderSegments: [flattened], relativePath: flattened, pathWasCompacted: true };
}

export function buildDriveSafeArchivePath(
  folderSegments: string[],
  fileName: string,
  maxLength = DRIVE_SAFE_PATH_TARGET_MAX,
) {
  const safeFile = ensureDriveSafeFileName(fileName);
  const folderTarget = Math.max(24, maxLength - 73);
  const folderPath = buildDriveSafeArchiveFolderPath(folderSegments, folderTarget);
  const separatorCount = folderPath.folderSegments.length ? 1 : 0;
  const availableFileChars = Math.max(10, maxLength - folderPath.relativePath.length - separatorCount);
  const compactFile = compactDriveSafeFileName(safeFile, availableFileChars);
  let relativePath = folderPath.relativePath
    ? folderPath.relativePath + "/" + compactFile
    : compactFile;

  if (relativePath.length <= maxLength) {
    return {
      folderSegments: folderPath.folderSegments,
      fileName: compactFile,
      relativePath,
      pathWasCompacted: folderPath.pathWasCompacted || compactFile !== safeFile,
    };
  }

  const fallbackFolder = folderPath.folderSegments.length
    ? ["P_" + shortStableHash(folderPath.folderSegments.join("/"))]
    : [];
  const fallbackPrefix = fallbackFolder.length ? fallbackFolder[0].length + 1 : 0;
  const fallbackFile = compactDriveSafeFileName(safeFile, Math.max(10, maxLength - fallbackPrefix));
  relativePath = fallbackFolder.length ? fallbackFolder[0] + "/" + fallbackFile : fallbackFile;
  return {
    folderSegments: fallbackFolder,
    fileName: fallbackFile,
    relativePath: relativePath.slice(0, maxLength),
    pathWasCompacted: true,
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
  const compacted = buildDriveSafeArchivePath(
    folders.map((entry) => entry.safeFolderName),
    file.safeFileName,
    DRIVE_SAFE_PATH_TARGET_MAX,
  );
  return {
    originalRelativePath: parts.join("/"),
    safeRelativePath: compacted.relativePath,
    pathWasCompacted: compacted.pathWasCompacted,
    file,
    folders,
  };
}
