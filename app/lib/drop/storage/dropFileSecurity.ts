import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class DropFileSecurityError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "DropFileSecurityError";
    this.code = code;
    this.status = status;
  }
}

const blockedExtensions = new Set([
  "ade", "adp", "apk", "app", "application", "asp", "aspx", "bat", "bin", "cab", "cgi", "cmd", "com", "cpl", "crt", "dll", "dmg", "exe", "gadget", "hta", "htm", "html", "inf", "ins", "iso", "jar", "js", "jse", "jsp", "lnk", "mde", "msc", "msi", "msp", "mst", "pif", "php", "ps1", "reg", "scr", "sct", "sh", "sys", "vb", "vbe", "vbs", "ws", "wsc", "wsf", "wsh",
]);

const allowedExtensions = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "xlsm", "csv", "txt", "rtf", "odt", "ods", "ppt", "pptx",
  "jpg", "jpeg", "png", "webp", "heic", "heif", "tif", "tiff", "bmp", "gif", "ico",
  "zip", "dwg", "dxf", "ifc", "ifczip", "bcf", "bcfzip", "xml", "json", "eml", "msg",
]);

const imageExtensions = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "tif", "tiff", "bmp", "gif", "ico"]);
const zipExtensions = new Set(["zip", "ifczip", "bcfzip", "docx", "xlsx", "xlsm", "pptx", "odt", "ods"]);
const officeZipExtensions = new Set(["docx", "xlsx", "xlsm", "pptx", "odt", "ods"]);

export function sanitizeDropFileName(value: string) {
  const base = path.basename(value.replaceAll("\\", "/")).normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!base || base === "." || base === "..") {
    throw new DropFileSecurityError("A fájlnév üres vagy érvénytelen.", "DROP_FILE_NAME_INVALID");
  }
  const collapsed = base.replace(/\s+/g, " ").slice(0, 180);
  const extension = path.extname(collapsed).slice(1).toLowerCase();
  if (!extension || blockedExtensions.has(extension) || !allowedExtensions.has(extension)) {
    throw new DropFileSecurityError(
      `A(z) .${extension || "ismeretlen"} fájltípus nem engedélyezett.`,
      blockedExtensions.has(extension) ? "DROP_FILE_EXTENSION_BLOCKED" : "DROP_FILE_EXTENSION_NOT_ALLOWED",
      415,
    );
  }
  const stem = path.basename(collapsed, path.extname(collapsed))
    .replace(/[^\p{L}\p{N}._ -]+/gu, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 140) || "fajl";
  return {
    originalName: collapsed,
    displayName: collapsed,
    extension,
    safeStem: stem,
    isImage: imageExtensions.has(extension),
    isZip: extension === "zip" || extension === "ifczip" || extension === "bcfzip",
    isZipContainer: zipExtensions.has(extension),
  };
}

function assertDetectedMime(extension: string, detectedMime: string) {
  const normalized = detectedMime.toLowerCase();
  const dangerousMime = [
    "application/x-dosexec",
    "application/x-executable",
    "application/x-pie-executable",
    "application/x-sharedlib",
    "application/x-shellscript",
    "text/x-shellscript",
    "text/html",
    "application/java-archive",
  ];
  if (dangerousMime.some((item) => normalized.includes(item))) {
    throw new DropFileSecurityError("A szerver végrehajtható vagy script jellegű fájlt észlelt.", "DROP_FILE_CONTENT_BLOCKED", 415);
  }
  if (extension === "pdf" && normalized !== "application/pdf") {
    throw new DropFileSecurityError("A fájl tartalma nem PDF dokumentum.", "DROP_FILE_MIME_MISMATCH", 415);
  }
  if (imageExtensions.has(extension) && !normalized.startsWith("image/") && normalized !== "application/octet-stream") {
    throw new DropFileSecurityError("A képfájl tartalma nem felel meg a kiterjesztésnek.", "DROP_FILE_MIME_MISMATCH", 415);
  }
  if ((extension === "zip" || extension === "ifczip" || extension === "bcfzip")
      && !normalized.includes("zip")
      && normalized !== "application/octet-stream") {
    throw new DropFileSecurityError("A ZIP-fájl tartalma nem érvényes ZIP archívum.", "DROP_FILE_MIME_MISMATCH", 415);
  }
}

async function detectMime(filePath: string) {
  try {
    const { stdout } = await execFileAsync("file", ["--brief", "--mime-type", "--", filePath], {
      timeout: 20_000,
      maxBuffer: 256 * 1024,
      encoding: "utf8",
    });
    return stdout.trim() || "application/octet-stream";
  } catch (error) {
    throw new DropFileSecurityError(
      `A fájltípus szerveroldali felismerése sikertelen: ${error instanceof Error ? error.message : "ismeretlen hiba"}`,
      "DROP_FILE_MIME_DETECTION_FAILED",
      500,
    );
  }
}

async function inspectZip(filePath: string) {
  try {
    await execFileAsync("unzip", ["-tqq", "--", filePath], {
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
      encoding: "utf8",
    });
    const [{ stdout: listOutput }, { stdout: totalsOutput }] = await Promise.all([
      execFileAsync("zipinfo", ["-1", "--", filePath], {
        timeout: 60_000,
        maxBuffer: 4 * 1024 * 1024,
        encoding: "utf8",
      }),
      execFileAsync("zipinfo", ["-t", "--", filePath], {
        timeout: 60_000,
        maxBuffer: 512 * 1024,
        encoding: "utf8",
      }),
    ]);
    const entries = listOutput.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (entries.length > 5000) {
      throw new DropFileSecurityError("A ZIP túl sok fájlt tartalmaz.", "DROP_ZIP_ENTRY_LIMIT", 415);
    }
    for (const entry of entries) {
      const normalized = entry.replaceAll("\\", "/");
      if (normalized.startsWith("/") || normalized.split("/").includes("..")) {
        throw new DropFileSecurityError("A ZIP veszélyes elérési útvonalat tartalmaz.", "DROP_ZIP_PATH_TRAVERSAL", 415);
      }
      const extension = path.extname(normalized).slice(1).toLowerCase();
      if (extension && blockedExtensions.has(extension)) {
        throw new DropFileSecurityError(`A ZIP tiltott .${extension} fájlt tartalmaz.`, "DROP_ZIP_BLOCKED_CONTENT", 415);
      }
    }
    const totals = totalsOutput.match(/(\d+)\s+files?,\s+(\d+)\s+bytes?\s+uncompressed,\s+(\d+)\s+bytes?\s+compressed/i);
    const uncompressedBytes = totals ? Number(totals[2]) : 0;
    const compressedBytes = totals ? Number(totals[3]) : 0;
    if (uncompressedBytes > 2 * 1024 ** 3) {
      throw new DropFileSecurityError("A ZIP kibontott mérete meghaladná a 2 GB-ot.", "DROP_ZIP_UNCOMPRESSED_LIMIT", 415);
    }
    if (compressedBytes > 0 && uncompressedBytes / compressedBytes > 100) {
      throw new DropFileSecurityError("A ZIP tömörítési aránya biztonsági kockázatot jelez.", "DROP_ZIP_COMPRESSION_RATIO", 415);
    }
    return { status: "passed", entryCount: entries.length, uncompressedBytes, compressedBytes };
  } catch (error) {
    if (error instanceof DropFileSecurityError) throw error;
    throw new DropFileSecurityError(
      `A ZIP szerkezeti ellenőrzése sikertelen: ${error instanceof Error ? error.message : "ismeretlen hiba"}`,
      "DROP_ZIP_INVALID",
      415,
    );
  }
}

export async function inspectDropIncomingFile(input: {
  filePath: string;
  extension: string;
  expectedBytes: number;
}) {
  const detectedMimeType = await detectMime(input.filePath);
  assertDetectedMime(input.extension, detectedMimeType);
  const zipContainer = zipExtensions.has(input.extension);
  const zipResult = zipContainer ? await inspectZip(input.filePath) : null;
  return {
    detectedMimeType,
    zipScanStatus: zipResult ? "passed" : "not_applicable",
    zipEntryCount: zipResult?.entryCount || 0,
    zipUncompressedBytes: zipResult?.uncompressedBytes || 0,
    officeZipContainer: officeZipExtensions.has(input.extension),
    quarantineReason: "A fájl szerkezeti ellenőrzése sikeres, de víruskereső ellenőrzés még szükséges.",
    expectedBytes: input.expectedBytes,
  };
}
