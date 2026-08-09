import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { createFileUploadedNotification } from "@/app/lib/notifications/notificationStore";

export type DriveApiAuth = {
  ok: boolean;
  mode: "admin" | "dev-token" | "missing" | "invalid";
  clientId?: string;
};

export type DriveProject = {
  id: string;
  code: string;
  name: string;
  status: "active" | "archived";
  rootPath: string;
  updatedAt: string;
};

export type DriveFileRecord = {
  id: string;
  projectId: string;
  name: string;
  path: string;
  type: "file" | "folder";
  sizeBytes: number;
  status: "server-mirror" | "upload-preview" | "download-preview" | "mock";
  updatedAt: string;
  sha256?: string;
};

export type DriveUploadSession = {
  uploadId: string;
  projectId: string;
  fileName: string;
  relativePath: string;
  fileSizeBytes: number;
  mimeType: string;
  status: "initialized" | "chunk-received" | "completed";
  createdAt: string;
  updatedAt: string;
  chunks: Array<{
    index: number;
    sizeBytes: number;
    receivedAt: string;
  }>;
  clientId?: string;
};

export type DriveEventRecord = {
  id: string;
  type: string;
  projectId?: string;
  fileId?: string;
  severity: "info" | "warning" | "error";
  message: string;
  source: "desktop" | "server" | "drop" | "mappaor" | "unknown";
  createdAt: string;
  payload?: Record<string, unknown>;
};

function getRuntimeProjectRoot() {
  const currentWorkingDirectory = process.cwd();
  if (currentWorkingDirectory.endsWith(path.join(".next", "standalone"))) {
    return path.resolve(currentWorkingDirectory, "..", "..");
  }
  return currentWorkingDirectory;
}

const runtimeProjectRoot = getRuntimeProjectRoot();
const driveDataRoot = path.join(runtimeProjectRoot, ".data", "dimpro-drive");
const devTokenFile = path.join(runtimeProjectRoot, ".dimprover", "drive", "dev-token.txt");

export function getDriveDevTokenFilePath() {
  return devTokenFile;
}

export async function getDriveDevTokenForAdmin() {
  return readOrCreateDevToken();
}

function createDevToken() {
  return `DIMPRO-DRIVE-DEV-${randomBytes(24).toString("base64url")}`;
}

async function readOrCreateDevToken() {
  const envToken = process.env.DIMPRO_DRIVE_DEV_TOKEN?.trim();
  if (envToken && envToken.length >= 20) return envToken;

  try {
    const existing = (await readFile(devTokenFile, "utf8")).trim();
    if (existing.length >= 20) return existing;
  } catch {
    // Első Drive API tesztnél még nincs fejlesztői token.
  }

  const nextToken = createDevToken();
  await mkdir(path.dirname(devTokenFile), { recursive: true });
  await writeFile(devTokenFile, `${nextToken}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(devTokenFile, 0o600).catch(() => undefined);
  return nextToken;
}

function normalizeToken(value: string | null) {
  return value?.replace(/^Bearer\s+/i, "").trim() || "";
}

export async function isDriveApiAuthorized(headers: Headers): Promise<DriveApiAuth> {
  if (await isLicenseAdminAuthorized(headers)) {
    return {
      ok: true,
      mode: "admin",
      clientId: headers.get("x-dimpro-drive-client-id")?.trim() || "admin",
    };
  }

  const expectedToken = await readOrCreateDevToken();
  const receivedToken =
    normalizeToken(headers.get("x-dimpro-drive-dev-token")) ||
    normalizeToken(headers.get("authorization"));

  if (!receivedToken) return { ok: false, mode: "missing" };
  if (receivedToken !== expectedToken) return { ok: false, mode: "invalid" };

  return {
    ok: true,
    mode: "dev-token",
    clientId: headers.get("x-dimpro-drive-client-id")?.trim() || "desktop-dev-client",
  };
}

export function unauthorizedDriveResponse() {
  return {
    ok: false,
    error: "Nincs jogosultság a DIMPRO Drive API használatához.",
    devTokenHint: getDriveDevTokenFilePath(),
    authHint:
      "Fejlesztői módban x-dimpro-drive-dev-token vagy admin módban x-dimpro-license-admin-key header szükséges.",
  };
}

function slugPart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function sanitizeDriveId(value: string, fallback = "default") {
  const clean = slugPart(value);
  return clean || fallback;
}

export function sanitizeRelativePath(value: string) {
  const normalized = value.replaceAll("\\", "/").split("/").filter(Boolean);
  const safeParts = normalized.map((part) => slugPart(part)).filter(Boolean);
  return safeParts.join("/") || "root";
}

async function ensureDriveRoot() {
  await mkdir(driveDataRoot, { recursive: true });
}

function projectRoot(projectId: string) {
  return path.join(driveDataRoot, "projects", sanitizeDriveId(projectId));
}

function uploadRoot(uploadId: string) {
  return path.join(driveDataRoot, "uploads", sanitizeDriveId(uploadId));
}

function eventsFile() {
  return path.join(driveDataRoot, "events", "drive-events.jsonl");
}

async function safeReadJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function getDriveHealth() {
  await ensureDriveRoot();
  return {
    ok: true,
    service: "DIMPRO Drive API",
    mode: "mvp-dev",
    storage: "filesystem-preview",
    dataRoot: driveDataRoot,
    timestamp: new Date().toISOString(),
    rules: {
      noLongLivedClientApiKey: true,
      metadataFirst: true,
      pathGuardRequiredBeforeRealUpload: true,
    },
  };
}

export async function listDriveProjects(): Promise<DriveProject[]> {
  await ensureDriveRoot();
  const projectsRoot = path.join(driveDataRoot, "projects");
  await mkdir(projectsRoot, { recursive: true });

  const names = await readdir(projectsRoot).catch(() => [] as string[]);
  const now = new Date().toISOString();
  const projects: DriveProject[] = [];

  for (const name of names) {
    const rootPath = path.join(projectsRoot, name);
    const itemStat = await stat(rootPath).catch(() => null);
    if (!itemStat?.isDirectory()) continue;
    const meta = await safeReadJson<Partial<DriveProject>>(path.join(rootPath, "project.json"), {});
    projects.push({
      id: meta.id || name,
      code: meta.code || name,
      name: meta.name || name.replaceAll("_", " "),
      status: meta.status === "archived" ? "archived" : "active",
      rootPath: `/DIMPRO_Drive/${name}`,
      updatedAt: meta.updatedAt || itemStat.mtime.toISOString(),
    });
  }

  if (projects.length > 0) return projects;

  const sample = await ensureDriveProject("DIMPRO_DEMO", "DIMPRO Demo projekt");
  return [
    {
      id: sample.id,
      code: sample.code,
      name: sample.name,
      status: sample.status,
      rootPath: sample.rootPath,
      updatedAt: now,
    },
  ];
}

export async function ensureDriveProject(projectId: string, projectName?: string): Promise<DriveProject> {
  await ensureDriveRoot();
  const id = sanitizeDriveId(projectId, "DIMPRO_DEMO");
  const root = projectRoot(id);
  await mkdir(path.join(root, "files"), { recursive: true });
  await mkdir(path.join(root, "downloads"), { recursive: true });
  await mkdir(path.join(root, "logs"), { recursive: true });

  const metaPath = path.join(root, "project.json");
  const existing = await safeReadJson<Partial<DriveProject>>(metaPath, {});
  const project: DriveProject = {
    id,
    code: existing.code || id,
    name: projectName || existing.name || id.replaceAll("_", " "),
    status: existing.status === "archived" ? "archived" : "active",
    rootPath: `/DIMPRO_Drive/${id}`,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(metaPath, JSON.stringify(project, null, 2), "utf8");
  return project;
}

export async function listDriveFiles(projectId: string): Promise<DriveFileRecord[]> {
  const project = await ensureDriveProject(projectId);
  const filesDir = path.join(projectRoot(project.id), "files");
  const fileNames = await readdir(filesDir).catch(() => [] as string[]);
  const records: DriveFileRecord[] = [];

  for (const fileName of fileNames) {
    const filePath = path.join(filesDir, fileName);
    const itemStat = await stat(filePath).catch(() => null);
    if (!itemStat) continue;

    if (fileName.endsWith(".receipt.json")) {
      const receipt = await safeReadJson<(DriveUploadSession & { fileRecord?: DriveFileRecord }) | null>(filePath, null);
      if (receipt?.fileRecord) {
        records.push({
          ...receipt.fileRecord,
          status: "upload-preview",
          updatedAt: receipt.updatedAt || itemStat.mtime.toISOString(),
        });
        continue;
      }
      if (receipt?.uploadId) {
        records.push({
          id: `${project.id}_${receipt.uploadId}`,
          projectId: project.id,
          name: receipt.fileName,
          path: `${project.rootPath}/${receipt.relativePath}`,
          type: "file",
          sizeBytes: receipt.fileSizeBytes,
          status: "upload-preview",
          updatedAt: receipt.updatedAt || itemStat.mtime.toISOString(),
        });
        continue;
      }
    }

    records.push({
      id: `${project.id}_${slugPart(fileName)}`,
      projectId: project.id,
      name: fileName,
      path: `${project.rootPath}/${fileName}`,
      type: itemStat.isDirectory() ? "folder" : "file",
      sizeBytes: itemStat.isFile() ? itemStat.size : 0,
      status: "mock",
      updatedAt: itemStat.mtime.toISOString(),
    });
  }

  if (records.length > 0) {
    return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  return [
    {
      id: `${project.id}_mintaterv_pdf`,
      projectId: project.id,
      name: "mintaterv.pdf",
      path: `${project.rootPath}/01_SERVER_MIRROR/mintaterv.pdf`,
      type: "file",
      sizeBytes: 0,
      status: "server-mirror",
      updatedAt: new Date().toISOString(),
    },
    {
      id: `${project.id}_kooperacios_jegyzokonyv_docx`,
      projectId: project.id,
      name: "kooperacios_jegyzokonyv.docx",
      path: `${project.rootPath}/01_SERVER_MIRROR/kooperacios_jegyzokonyv.docx`,
      type: "file",
      sizeBytes: 0,
      status: "server-mirror",
      updatedAt: new Date().toISOString(),
    },
  ];
}

export async function createUploadSession(params: {
  projectId: string;
  fileName: string;
  relativePath?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  clientId?: string;
}) {
  const project = await ensureDriveProject(params.projectId);
  const now = new Date().toISOString();
  const uploadId = `upl_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const session: DriveUploadSession = {
    uploadId,
    projectId: project.id,
    fileName: slugPart(params.fileName || "feltoltes.bin") || "feltoltes.bin",
    relativePath: sanitizeRelativePath(params.relativePath || params.fileName || "feltoltes.bin"),
    fileSizeBytes: Number(params.fileSizeBytes || 0),
    mimeType: params.mimeType || "application/octet-stream",
    status: "initialized",
    createdAt: now,
    updatedAt: now,
    chunks: [],
    clientId: params.clientId,
  };

  const root = uploadRoot(uploadId);
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "session.json"), JSON.stringify(session, null, 2), "utf8");
  return session;
}

export async function saveUploadChunk(uploadId: string, chunkIndex: number, buffer: Buffer) {
  const root = uploadRoot(uploadId);
  const sessionPath = path.join(root, "session.json");
  const session = await safeReadJson<DriveUploadSession | null>(sessionPath, null);
  if (!session) throw new Error("Ismeretlen upload session.");

  const index = Number.isFinite(chunkIndex) && chunkIndex >= 0 ? chunkIndex : session.chunks.length;
  const chunkName = `chunk-${String(index).padStart(6, "0")}.bin`;
  await writeFile(path.join(root, chunkName), buffer);

  const nextSession: DriveUploadSession = {
    ...session,
    status: "chunk-received",
    updatedAt: new Date().toISOString(),
    chunks: [
      ...session.chunks.filter((chunk) => chunk.index !== index),
      {
        index,
        sizeBytes: buffer.length,
        receivedAt: new Date().toISOString(),
      },
    ].sort((left, right) => left.index - right.index),
  };
  await writeFile(sessionPath, JSON.stringify(nextSession, null, 2), "utf8");
  return nextSession;
}

export async function completeUploadSession(uploadId: string) {
  const root = uploadRoot(uploadId);
  const sessionPath = path.join(root, "session.json");
  const session = await safeReadJson<DriveUploadSession | null>(sessionPath, null);
  if (!session) throw new Error("Ismeretlen upload session.");

  const receivedBytes = session.chunks.reduce((sum, chunk) => sum + Number(chunk.sizeBytes || 0), 0);
  const completed: DriveUploadSession = {
    ...session,
    status: "completed",
    updatedAt: new Date().toISOString(),
  };

  const project = await ensureDriveProject(session.projectId);
  const fileRecord: DriveFileRecord = {
    id: `${session.projectId}_${session.uploadId}`,
    projectId: session.projectId,
    name: session.fileName,
    path: `${project.rootPath}/${session.relativePath}`,
    type: "file",
    sizeBytes: session.fileSizeBytes || receivedBytes,
    status: "upload-preview",
    updatedAt: completed.updatedAt,
  };

  const receipt = {
    ...completed,
    receivedBytes,
    chunkCount: completed.chunks.length,
    fileRecord,
    receiptCreatedAt: new Date().toISOString(),
    note: "DIMPRO Drive MVP: upload complete receipt. Ez még fejlesztői előnézet, nem végleges tárhelymentés.",
  };

  const receiptPath = path.join(projectRoot(project.id), "files", `${session.uploadId}_${session.fileName}.receipt.json`);
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf8");
  await writeFile(sessionPath, JSON.stringify(receipt, null, 2), "utf8");

  await createFileUploadedNotification({
    projectId: project.id,
    projectName: project.name,
    fileId: fileRecord.id,
    fileName: fileRecord.name,
    actorUserId: session.clientId,
    actorName: session.clientId || "DIMPRO Drive",
    sourceClient: session.clientId && session.clientId !== "admin" ? "desktop" : "web",
    clientId: session.clientId,
  }).catch(() => undefined);

  return {
    ...receipt,
    receiptPath,
  };
}

export async function createDownloadInit(fileId: string, clientId?: string) {
  return {
    ok: true,
    fileId: sanitizeDriveId(fileId, "file"),
    downloadId: `dwn_${Date.now()}_${randomUUID().slice(0, 8)}`,
    mode: "dev-preview",
    clientId: clientId || "desktop-dev-client",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    note: "MVP állapot: ez még nem ad vissza valós letöltési URL-t, csak a kliens-szerver szerződést teszteli.",
  };
}


export type DriveUploadDebugRecord = {
  uploadId: string;
  projectId: string;
  fileName: string;
  relativePath: string;
  status: DriveUploadSession["status"] | "unknown";
  createdAt?: string;
  updatedAt?: string;
  chunkCount: number;
  receivedBytes: number;
  fileSizeBytes: number;
  uploadPath: string;
  ageHours: number | null;
};

function getSessionAgeHours(value?: string) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.round(((Date.now() - time) / 3_600_000) * 10) / 10;
}

export async function listDriveUploadSessions(projectId?: string): Promise<DriveUploadDebugRecord[]> {
  await ensureDriveRoot();
  const uploadsRoot = path.join(driveDataRoot, "uploads");
  await mkdir(uploadsRoot, { recursive: true });
  const names = await readdir(uploadsRoot).catch(() => [] as string[]);
  const records: DriveUploadDebugRecord[] = [];

  for (const name of names) {
    const uploadPath = path.join(uploadsRoot, name);
    const itemStat = await stat(uploadPath).catch(() => null);
    if (!itemStat?.isDirectory()) continue;
    const session = await safeReadJson<DriveUploadSession | null>(path.join(uploadPath, "session.json"), null);
    const chunks = session?.chunks || [];
    const normalizedProjectId = projectId ? sanitizeDriveId(projectId) : "";
    if (normalizedProjectId && session?.projectId !== normalizedProjectId) continue;

    records.push({
      uploadId: session?.uploadId || name,
      projectId: session?.projectId || "unknown",
      fileName: session?.fileName || "unknown",
      relativePath: session?.relativePath || "unknown",
      status: session?.status || "unknown",
      createdAt: session?.createdAt,
      updatedAt: session?.updatedAt || itemStat.mtime.toISOString(),
      chunkCount: chunks.length,
      receivedBytes: chunks.reduce((sum, chunk) => sum + Number(chunk.sizeBytes || 0), 0),
      fileSizeBytes: Number(session?.fileSizeBytes || 0),
      uploadPath,
      ageHours: getSessionAgeHours(session?.updatedAt || itemStat.mtime.toISOString()),
    });
  }

  return records.sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""));
}

export async function buildDriveUploadCleanupPlan(options?: { projectId?: string; olderThanHours?: number }) {
  const olderThanHours = Math.max(1, Number(options?.olderThanHours || 24));
  const sessions = await listDriveUploadSessions(options?.projectId);
  const candidates = sessions.filter((session) => {
    const age = session.ageHours ?? 0;
    if (age < olderThanHours) return false;
    return session.status === "completed" || session.status === "initialized" || session.status === "chunk-received" || session.status === "unknown";
  });

  return {
    ok: true,
    mode: "cleanup-plan-only",
    olderThanHours,
    generatedAt: new Date().toISOString(),
    totalSessions: sessions.length,
    candidateCount: candidates.length,
    candidates,
    note: "Ez csak tisztítási terv. Automatikus törlést nem végez.",
  };
}

export async function deleteDriveUploadSession(uploadId: string) {
  await ensureDriveRoot();
  const safeUploadId = sanitizeDriveId(uploadId, "upload");
  const targetRoot = uploadRoot(safeUploadId);
  const session = await safeReadJson<DriveUploadSession | null>(path.join(targetRoot, "session.json"), null);
  await rm(targetRoot, { recursive: true, force: true });
  return {
    ok: true,
    uploadId: safeUploadId,
    deletedAt: new Date().toISOString(),
    deletedSession: session,
    note: "Csak az upload session ideiglenes fejlesztői mappája törlődött. Projekt receipt / fájllista rekordot nem töröl automatikusan.",
  };
}

export async function appendDriveEvent(event: Omit<DriveEventRecord, "id" | "createdAt">) {
  await mkdir(path.dirname(eventsFile()), { recursive: true });
  const record: DriveEventRecord = {
    ...event,
    id: `evt_${Date.now()}_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await writeFile(eventsFile(), `${JSON.stringify(record)}\n`, { flag: "a", encoding: "utf8" });
  return record;
}
