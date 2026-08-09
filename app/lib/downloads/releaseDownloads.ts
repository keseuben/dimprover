import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export type ReleaseVisibility = "private_token";

export type ReleaseDownloadRecord = {
  id: string;
  token: string;
  project: string;
  version: string;
  fileName: string;
  storedFileName: string;
  relativeFilePath: string;
  sizeBytes: number;
  sha256: string;
  visibility: ReleaseVisibility;
  createdAt: string;
  expiresAt: string | null;
  uploadedBy: string;
  downloadCount: number;
  lastDownloadedAt: string | null;
  title?: string;
  note?: string;
  description?: string;
  changes?: string[];
  fileDeletedAt?: string;
  fileDeleteReason?: string;
};

export type ReleaseHistoryItem = ReleaseDownloadRecord & {
  isActive: boolean;
  isCurrent: boolean;
  fileAvailable: boolean;
  downloadPageUrl: string;
};

type ReleaseRegistry = {
  schemaVersion: 1;
  updatedAt: string;
  records: ReleaseDownloadRecord[];
};

export type ReleaseLookupResult =
  | { ok: true; record: ReleaseDownloadRecord; absolutePath: string }
  | { ok: false; status: number; message: string };

const DEFAULT_RELEASE_ROOT = "/root/dimprover_release_packages";

export function getReleaseRoot() {
  return path.resolve(process.env.DIMPRO_RELEASE_ROOT || DEFAULT_RELEASE_ROOT);
}

export function getReleaseFilesRoot() {
  return path.join(getReleaseRoot(), "files");
}

export function getReleaseRegistryPath() {
  return path.join(getReleaseRoot(), "release-registry.json");
}

export function getReleaseDownloadBaseUrl() {
  return (process.env.DIMPRO_RELEASE_DOWNLOAD_BASE_URL || "https://dimprover.hu").replace(/\/$/, "");
}

export function createReleaseToken() {
  return `rel_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${randomBytes(18).toString("base64url")}`;
}

export function createReleaseDownloadUrl(token: string) {
  return `${getReleaseDownloadBaseUrl()}/download/${encodeURIComponent(token)}`;
}

export function sanitizeReleaseFileName(fileName: string) {
  const originalBaseName = path.basename(String(fileName || "release-package.zip"));
  const normalized = originalBaseName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);

  return normalized || "release-package.zip";
}

export function getSafeReleasePath(relativeFilePath: string) {
  const filesRoot = getReleaseFilesRoot();
  const resolved = path.resolve(filesRoot, relativeFilePath);

  if (!resolved.startsWith(filesRoot + path.sep)) {
    throw new Error("Tiltott release fájlútvonal.");
  }

  return resolved;
}

export async function ensureReleaseStorage() {
  await mkdir(getReleaseFilesRoot(), { recursive: true });
}

async function readRegistry(): Promise<ReleaseRegistry> {
  try {
    const raw = await readFile(getReleaseRegistryPath(), "utf8");
    const parsed = JSON.parse(raw) as ReleaseRegistry;

    if (!Array.isArray(parsed.records)) throw new Error("Hibás registry formátum.");
    return parsed;
  } catch {
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      records: [],
    };
  }
}

async function writeRegistry(registry: ReleaseRegistry) {
  await mkdir(path.dirname(getReleaseRegistryPath()), { recursive: true });
  await writeFile(getReleaseRegistryPath(), `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

function isRecordExpired(record: ReleaseDownloadRecord) {
  return Boolean(record.expiresAt && new Date(record.expiresAt).getTime() < Date.now());
}

async function checkReleaseFileAvailable(record: ReleaseDownloadRecord) {
  if (record.fileDeletedAt) return false;

  try {
    const fileStat = await stat(getSafeReleasePath(record.relativeFilePath));
    return fileStat.isFile();
  } catch {
    return false;
  }
}

function normalizeChanges(changes?: string[]) {
  return (changes || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

export async function calculateSha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function getReleaseByToken(token: string): Promise<ReleaseLookupResult> {
  const cleanToken = String(token || "").trim();

  if (!/^rel_[a-zA-Z0-9_-]{12,80}$/.test(cleanToken)) {
    return { ok: false, status: 404, message: "A letöltési link nem érvényes." };
  }

  const registry = await readRegistry();
  const record = registry.records.find((item) => item.token === cleanToken);

  if (!record) {
    return { ok: false, status: 404, message: "A letöltési csomag nem található." };
  }

  if (record.fileDeletedAt) {
    return { ok: false, status: 410, message: "A release fájl már törölve lett a szerverről, de a verzióelőzmény megmaradt." };
  }

  if (isRecordExpired(record)) {
    return { ok: false, status: 410, message: "A letöltési link lejárt." };
  }

  const absolutePath = getSafeReleasePath(record.relativeFilePath);

  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) throw new Error("Nem fájl.");
  } catch {
    return { ok: false, status: 404, message: "A release fájl nem található a szerveren." };
  }

  return { ok: true, record, absolutePath };
}

export async function getReleaseHistoryForProject(project: string, currentToken?: string, limit = 20): Promise<ReleaseHistoryItem[]> {
  const registry = await readRegistry();
  const cleanProject = String(project || "").trim();
  const records = registry.records
    .filter((item) => item.project === cleanProject)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, Math.max(1, Math.min(limit, 50)));

  return Promise.all(
    records.map(async (record, index) => {
      const fileAvailable = await checkReleaseFileAvailable(record);

      return {
        ...record,
        changes: normalizeChanges(record.changes),
        fileAvailable,
        isActive: fileAvailable && !isRecordExpired(record),
        isCurrent: record.token === currentToken || (!currentToken && index === 0),
        downloadPageUrl: createReleaseDownloadUrl(record.token),
      };
    }),
  );
}

export async function getReleaseHistory(project = "DIMPRO_Fajlmuhely", limit = 50): Promise<ReleaseHistoryItem[]> {
  return getReleaseHistoryForProject(project, undefined, limit);
}

export async function deleteReleasePackage(token: string) {
  const cleanToken = String(token || "").trim();

  if (!/^rel_[a-zA-Z0-9_-]{12,80}$/.test(cleanToken)) {
    return { ok: false as const, status: 404, message: "A törlendő release token nem érvényes." };
  }

  const registry = await readRegistry();
  const record = registry.records.find((item) => item.token === cleanToken);

  if (!record) {
    return { ok: false as const, status: 404, message: "A release csomag nem található." };
  }

  const absolutePath = getSafeReleasePath(record.relativeFilePath);
  let fileDeleted = false;

  try {
    await unlink(absolutePath);
    fileDeleted = true;
  } catch {
    fileDeleted = false;
  }

  record.fileDeletedAt = new Date().toISOString();
  record.fileDeleteReason = "admin_release_file_cleanup";

  const deletedLogPath = path.join(getReleaseRoot(), "release-deleted-log.json");
  let deletedRecords: Array<ReleaseDownloadRecord & { deletedAt: string; fileDeleted: boolean }> = [];

  try {
    const rawLog = await readFile(deletedLogPath, "utf8");
    const parsedLog = JSON.parse(rawLog) as Array<ReleaseDownloadRecord & { deletedAt: string; fileDeleted: boolean }>;
    if (Array.isArray(parsedLog)) deletedRecords = parsedLog;
  } catch {
    deletedRecords = [];
  }

  deletedRecords.unshift({
    ...record,
    changes: normalizeChanges(record.changes),
    deletedAt: record.fileDeletedAt,
    fileDeleted,
  });

  registry.updatedAt = new Date().toISOString();
  await writeRegistry(registry);
  await writeFile(deletedLogPath, `${JSON.stringify(deletedRecords.slice(0, 500), null, 2)}\n`, "utf8");

  return { ok: true as const, record, fileDeleted };
}

export async function registerDownloadedRelease(token: string) {
  const registry = await readRegistry();
  const record = registry.records.find((item) => item.token === token);

  if (!record) return;

  record.downloadCount = Number(record.downloadCount || 0) + 1;
  record.lastDownloadedAt = new Date().toISOString();
  registry.updatedAt = new Date().toISOString();
  await writeRegistry(registry);
}

export async function registerReleasePackage(params: {
  buffer: Buffer;
  fileName: string;
  project?: string;
  version?: string;
  uploadedBy?: string;
  expiresInDays?: number | null;
  title?: string;
  note?: string;
  description?: string;
  changes?: string[];
}) {
  await ensureReleaseStorage();

  const token = createReleaseToken();
  const fileName = sanitizeReleaseFileName(params.fileName);
  const project = params.project?.trim() || "DIMPRO_Fajlmuhely";
  const version = params.version?.trim() || "unversioned";
  const projectFolder = sanitizeReleaseFileName(project);
  const storedFileName = `${token}_${fileName}`;
  const relativeFilePath = path.join(projectFolder, storedFileName);
  const absolutePath = getSafeReleasePath(relativeFilePath);
  const createdAt = new Date().toISOString();
  const expiresInDays = params.expiresInDays === null ? null : Math.max(1, Math.min(Number(params.expiresInDays || 7), 90));
  const expiresAt = expiresInDays === null ? null : new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const sha256 = await calculateSha256(params.buffer);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, params.buffer);

  const registry = await readRegistry();
  const record: ReleaseDownloadRecord = {
    id: token,
    token,
    project,
    version,
    fileName,
    storedFileName,
    relativeFilePath,
    sizeBytes: params.buffer.length,
    sha256,
    visibility: "private_token",
    createdAt,
    expiresAt,
    uploadedBy: params.uploadedBy?.trim() || "mcp-upload-file",
    downloadCount: 0,
    lastDownloadedAt: null,
    title: params.title?.trim() || undefined,
    note: params.note?.trim() || undefined,
    description: params.description?.trim() || undefined,
    changes: normalizeChanges(params.changes),
  };

  registry.records.unshift(record);
  registry.updatedAt = new Date().toISOString();
  await writeRegistry(registry);

  return {
    record,
    absolutePath,
    downloadUrl: createReleaseDownloadUrl(token),
    apiDownloadUrl: `${getReleaseDownloadBaseUrl()}/api/downloads/${encodeURIComponent(token)}`,
  };
}