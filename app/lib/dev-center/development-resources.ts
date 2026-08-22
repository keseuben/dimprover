import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type DevelopmentResourcePriority = "normal" | "important" | "critical";
export type DevelopmentResourceDocumentType = "specification" | "concept" | "coding_guide" | "reference" | "handoff" | "other";
export type DevelopmentResource = {
  id: string;
  module: string;
  title: string;
  description: string;
  originalName: string;
  storedName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  tags: string[];
  priority: DevelopmentResourcePriority;
  source: string;
  version: string;
  requiredBeforeDevelopment: boolean;
  documentType: DevelopmentResourceDocumentType;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const resourceRoot = process.env.DIMPRO_DEV_RESOURCE_ROOT?.trim() || "/srv/dimpro-dev/data/benjadmin-dev-resources";
const indexFile = path.join(resourceRoot, "index.json");
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "webp", "svg", "txt", "md", "json", "csv", "zip", "docx", "xlsx", "pptx", "ts", "tsx", "js", "mjs", "css", "sql", "py"]);

function safeModule(value: string) {
  const normalized = value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 80) || "altalanos";
}

function safeFileBase(value: string) {
  const base = path.basename(value).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "-").trim();
  return (base || "fajl").slice(0, 180);
}

function extOf(fileName: string) {
  return path.extname(fileName).replace(/^\./, "").toLowerCase();
}

function normalizeTags(value: string | string[] | undefined) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;\n]/g) : [];
  return [...new Set(source.map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 24).map((item) => item.slice(0, 48));
}

function normalizePriority(value: unknown): DevelopmentResourcePriority {
  return value === "critical" || value === "important" ? value : "normal";
}

function normalizeDocumentType(value: unknown): DevelopmentResourceDocumentType {
  return ["specification", "concept", "coding_guide", "reference", "handoff", "other"].includes(String(value || ""))
    ? String(value) as DevelopmentResourceDocumentType
    : "reference";
}

export function validateDevelopmentResourceMetadata(input: { module: string; title?: string; description?: string; tags?: string | string[]; version?: string; documentType?: DevelopmentResourceDocumentType }) {
  const tags = normalizeTags(input.tags);
  const missing = [
    !String(input.module || "").trim() ? "Modul" : "",
    !String(input.title || "").trim() ? "Cím" : "",
    !String(input.version || "").trim() ? "Verzió" : "",
    !String(input.description || "").trim() ? "Leírás" : "",
    tags.length === 0 ? "Címkék" : "",
    !String(input.documentType || "").trim() ? "Dokumentumtípus" : "",
  ].filter(Boolean);
  if (missing.length) throw new Error(`A feltöltés előtt töltsd ki a kötelező adatokat: ${missing.join(", ")}.`);
}

async function ensureStore() {
  await mkdir(resourceRoot, { recursive: true, mode: 0o700 });
  await chmod(resourceRoot, 0o700).catch(() => undefined);
}

function migrateResource(item: unknown): DevelopmentResource | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const row = item as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) return null;
  const originalName = typeof row.originalName === "string" ? row.originalName : typeof row.fileName === "string" ? row.fileName : "fajl";
  const createdAt = typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString();
  return {
    id,
    module: safeModule(typeof row.module === "string" ? row.module : "altalanos"),
    title: typeof row.title === "string" ? row.title : originalName,
    description: typeof row.description === "string" ? row.description : typeof row.notes === "string" ? row.notes : "",
    originalName,
    storedName: typeof row.storedName === "string" ? row.storedName : "",
    extension: typeof row.extension === "string" ? row.extension : extOf(originalName),
    mimeType: typeof row.mimeType === "string" ? row.mimeType : "application/octet-stream",
    sizeBytes: Number(row.sizeBytes) || 0,
    sha256: typeof row.sha256 === "string" ? row.sha256 : "",
    tags: Array.isArray(row.tags) ? normalizeTags(row.tags.filter((value): value is string => typeof value === "string")) : [],
    priority: normalizePriority(row.priority),
    source: typeof row.source === "string" ? row.source : "BENJADMIN_UPLOAD",
    version: typeof row.version === "string" ? row.version : "",
    requiredBeforeDevelopment: typeof row.requiredBeforeDevelopment === "boolean" ? row.requiredBeforeDevelopment : Boolean(row.activeContext),
    documentType: normalizeDocumentType(row.documentType),
    archivedAt: typeof row.archivedAt === "string" ? row.archivedAt : null,
    createdAt,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : createdAt,
  };
}

async function readIndex(): Promise<DevelopmentResource[]> {
  await ensureStore();
  try {
    const raw = await readFile(indexFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(migrateResource).filter((item): item is DevelopmentResource => Boolean(item)) : [];
  } catch {
    return [];
  }
}

async function writeIndex(resources: DevelopmentResource[]) {
  await ensureStore();
  const temp = `${indexFile}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(resources, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, indexFile);
  await chmod(indexFile, 0o600).catch(() => undefined);
}

export async function listDevelopmentResources(options: { includeArchived?: boolean } = {}) {
  const resources = await readIndex();
  return resources.filter((item) => options.includeArchived || !item.archivedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveDevelopmentResource(input: {
  module: string;
  title?: string;
  description?: string;
  tags?: string | string[];
  priority?: DevelopmentResourcePriority;
  source?: string;
  version?: string;
  requiredBeforeDevelopment?: boolean;
  documentType?: DevelopmentResourceDocumentType;
  file: File;
}) {
  const originalName = safeFileBase(input.file.name);
  const extension = extOf(originalName);
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error(`Nem engedélyezett fájltípus: .${extension || "ismeretlen"}`);
  if (input.file.size <= 0) throw new Error("Üres fájl nem tölthető fel.");
  if (input.file.size > MAX_FILE_BYTES) throw new Error("A fájl legfeljebb 50 MB lehet a BENJADMIN DEV tárban.");

  const moduleCode = safeModule(input.module);
  const moduleDir = path.join(resourceRoot, moduleCode);
  await mkdir(moduleDir, { recursive: true, mode: 0o700 });
  await chmod(moduleDir, 0o700).catch(() => undefined);

  const bytes = Buffer.from(await input.file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const id = `devres-${randomUUID()}`;
  const storedName = `${id}-${originalName}`;
  const target = path.join(moduleDir, storedName);
  if (!target.startsWith(`${moduleDir}${path.sep}`)) throw new Error("Érvénytelen célútvonal.");
  await writeFile(target, bytes, { mode: 0o600, flag: "wx" });
  await chmod(target, 0o600).catch(() => undefined);

  const now = new Date().toISOString();
  const resource: DevelopmentResource = {
    id,
    module: moduleCode,
    title: (input.title?.trim() || originalName).slice(0, 180),
    description: (input.description?.trim() || "").slice(0, 3000),
    originalName,
    storedName,
    extension,
    mimeType: input.file.type || "application/octet-stream",
    sizeBytes: input.file.size,
    sha256,
    tags: normalizeTags(input.tags),
    priority: normalizePriority(input.priority),
    source: (input.source?.trim() || "BENJADMIN_UPLOAD").slice(0, 120),
    version: (input.version?.trim() || "").slice(0, 80),
    requiredBeforeDevelopment: Boolean(input.requiredBeforeDevelopment),
    documentType: normalizeDocumentType(input.documentType),
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const resources = await readIndex();
  resources.unshift(resource);
  await writeIndex(resources);
  return resource;
}

export async function updateDevelopmentResource(id: string, patch: Partial<Pick<DevelopmentResource, "title" | "description" | "tags" | "priority" | "source" | "version" | "requiredBeforeDevelopment" | "documentType">> & { archived?: boolean }) {
  const resources = await readIndex();
  const index = resources.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("A fejlesztési segédanyag nem található.");
  const current = resources[index];
  resources[index] = {
    ...current,
    title: typeof patch.title === "string" && patch.title.trim() ? patch.title.trim().slice(0, 180) : current.title,
    description: typeof patch.description === "string" ? patch.description.trim().slice(0, 3000) : current.description,
    tags: patch.tags ? normalizeTags(patch.tags) : current.tags,
    priority: patch.priority ? normalizePriority(patch.priority) : current.priority,
    source: typeof patch.source === "string" ? patch.source.trim().slice(0, 120) : current.source,
    version: typeof patch.version === "string" ? patch.version.trim().slice(0, 80) : current.version,
    requiredBeforeDevelopment: typeof patch.requiredBeforeDevelopment === "boolean" ? patch.requiredBeforeDevelopment : current.requiredBeforeDevelopment,
    documentType: patch.documentType ? normalizeDocumentType(patch.documentType) : current.documentType,
    archivedAt: typeof patch.archived === "boolean" ? patch.archived ? new Date().toISOString() : null : current.archivedAt,
    updatedAt: new Date().toISOString(),
  };
  await writeIndex(resources);
  return resources[index];
}

export async function getDevelopmentResourceContent(id: string) {
  const resources = await readIndex();
  const resource = resources.find((item) => item.id === id);
  if (!resource) throw new Error("A fejlesztési segédanyag nem található.");
  const moduleDir = path.join(resourceRoot, safeModule(resource.module));
  const target = path.join(moduleDir, resource.storedName);
  if (!target.startsWith(`${moduleDir}${path.sep}`)) throw new Error("Érvénytelen célútvonal.");
  const bytes = await readFile(target);
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (resource.sha256 && resource.sha256 !== actualHash) throw new Error("A segédanyag integritás-ellenőrzése sikertelen.");
  return { resource: { ...resource, sha256: resource.sha256 || actualHash }, bytes };
}

export async function developmentResourceHealth() {
  await ensureStore();
  const resources = await readIndex();
  const active = resources.filter((item) => !item.archivedAt);
  const modules = new Set(active.map((item) => item.module));
  const totalBytes = active.reduce((sum, item) => sum + item.sizeBytes, 0);
  const rootStat = await stat(resourceRoot);
  return {
    ready: rootStat.isDirectory(),
    resources: active.length,
    archived: resources.length - active.length,
    requiredBeforeDevelopment: active.filter((item) => item.requiredBeforeDevelopment).length,
    modules: modules.size,
    totalBytes,
    backend: "DEV_LOCAL_STAGING",
    rootKind: "DEDICATED_DEV_DATA",
    driveTarget: "PENDING",
  };
}
