import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export type HandoffStatus = "COMPLETED" | "PARTIAL" | "BLOCKED" | "FAILED";
export type DevelopmentHandoff = {
  id: string;
  schemaVersion: number;
  chatSessionId: string;
  chatTitle: string;
  workerCode: string;
  mainProject: string;
  project: string;
  module: string;
  contextModule: string;
  developmentArea: string;
  fileAreaKey: string;
  taskId: string;
  taskTitle: string;
  liveNextTaskId: string;
  liveNextTaskTitle: string;
  startedAt: string;
  finishedAt: string;
  durationMinutes: number;
  status: HandoffStatus;
  branch: string;
  worktree: string;
  startCommit: string;
  endCommit: string;
  testsSummary: string;
  buildRelease: string;
  productionAccess: "DENY";
  tags: string[];
  summary: string;
  fileName: string;
  filePath: string;
  sha256: string;
  createdAt: string;
};

const root = process.env.DIMPRO_DEV_HANDOFF_ROOT?.trim() || "/srv/dimpro-dev/handoffs";
const indexPath = path.join(root, "handoff-index.json");
const writeLockPath = path.join(root, ".handoff-write.lock");
const workers = new Set(["BENAI", "BENJAMINAI", "OUTMINAI", "ARMINAI", "JAZMINAI", "BENJADMIN"]);
const workerFileLabels: Record<string, string> = {
  BENAI: "BenjaminAI",
  BENJAMINAI: "BenjaminAI",
  OUTMINAI: "OutminAI",
  ARMINAI: "ArminAI",
  JAZMINAI: "JazminAI",
  BENJADMIN: "BenjAdmin",
};
const LOCK_WAIT_MS = 50;
const LOCK_TIMEOUT_MS = 8_000;
const LOCK_STALE_MS = 30_000;

function text(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }
function tags(value: unknown) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(/[,;\n]/g);
  return [...new Set(source.map((item) => text(item, 48).toLowerCase()).filter(Boolean))].slice(0, 30);
}
function slug(value: unknown) {
  return text(value, 120).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "altalanos";
}
function fileToken(value: unknown, fallback = "Nincs", max = 72) {
  const normalized = text(value, 240).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (normalized || fallback).slice(0, max);
}
function iso(value: unknown) {
  const raw = text(value, 100);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}
function q(value: unknown) { return JSON.stringify(String(value ?? "")); }
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function budapestStamp(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Budapest",
    year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}${byType.month}${byType.day}_${byType.hour}${byType.minute}`;
}
function moduleLatestKey(input: Record<string, unknown>) {
  return [input.mainProject, input.project, input.module, input.contextModule]
    .map((value) => text(value, 160)).filter(Boolean).map(slug).join("__") || "altalanos";
}
function canonicalFileName(input: Record<string, unknown>, workerCode: string, createdAt: string) {
  return [
    fileToken(input.chatSessionId, "chat", 40),
    workerFileLabels[workerCode] || fileToken(workerCode, "Worker", 32),
    budapestStamp(createdAt),
    fileToken(input.mainProject, "DIMPRO", 64),
    fileToken(input.module, "Modul", 64),
    fileToken(input.fileAreaKey || input.developmentArea || input.contextModule || input.taskTitle, "Fejlesztes", 48),
    "atado.md",
  ].join("_");
}

async function ensureRoot() {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700).catch(() => undefined);
}
async function readIndex(): Promise<DevelopmentHandoff[]> {
  await ensureRoot();
  try {
    const value = JSON.parse(await readFile(indexPath, "utf8"));
    return Array.isArray(value) ? value as DevelopmentHandoff[] : [];
  } catch {
    return [];
  }
}
async function writeAtomic(target: string, content: string) {
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, content, { encoding: "utf8", mode: 0o600 });
  await rename(temp, target);
  await chmod(target, 0o600).catch(() => undefined);
}
async function writeIndex(items: DevelopmentHandoff[]) {
  await ensureRoot();
  await writeAtomic(indexPath, `${JSON.stringify(items, null, 2)}\n`);
}

async function acquireWriteLock() {
  await ensureRoot();
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (true) {
    try {
      const handle = await open(writeLockPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, "utf8");
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        await handle.close().catch(() => undefined);
        await unlink(writeLockPath).catch(() => undefined);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const lockStat = await stat(writeLockPath);
        if (Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
          await unlink(writeLockPath).catch(() => undefined);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= deadline) throw new Error("Az átadó mentési lock időtúllépés miatt nem szerezhető meg.");
      await sleep(LOCK_WAIT_MS);
    }
  }
}

export async function listDevelopmentHandoffs(filters: Record<string, string> = {}) {
  let items = await readIndex();
  const query = text(filters.query, 240).toLocaleLowerCase("hu-HU");
  if (query) items = items.filter((item) => `${item.fileName || ""} ${item.chatSessionId} ${item.chatTitle} ${item.workerCode} ${item.mainProject} ${item.project} ${item.module} ${item.contextModule} ${item.developmentArea || ""} ${item.fileAreaKey || ""} ${item.taskId} ${item.taskTitle} ${item.liveNextTaskId || ""} ${item.liveNextTaskTitle || ""} ${item.summary} ${(item.tags || []).join(" ")}`.toLocaleLowerCase("hu-HU").includes(query));
  for (const [key, field] of [["worker", "workerCode"], ["project", "project"], ["module", "module"], ["status", "status"], ["chat", "chatSessionId"]] as const) {
    const expected = text(filters[key], 160).toLowerCase();
    if (expected) items = items.filter((item) => String(item[field] || "").toLowerCase() === expected);
  }
  const from = Date.parse(text(filters.from, 100));
  if (Number.isFinite(from)) items = items.filter((item) => Date.parse(item.finishedAt) >= from);
  const to = Date.parse(text(filters.to, 100));
  if (Number.isFinite(to)) items = items.filter((item) => !item.startedAt || Date.parse(item.startedAt) <= to);
  return items.sort((a, b) => String(b.createdAt || b.finishedAt || "").localeCompare(String(a.createdAt || a.finishedAt || "")));
}

export async function saveDevelopmentHandoff(input: Record<string, unknown>) {
  const workerCode = text(input.workerCode, 40).toUpperCase();
  if (!workers.has(workerCode)) throw new Error("Ismeretlen BENJADMIN worker.");
  const startedAt = iso(input.startedAt);
  const finishedAt = iso(input.finishedAt);
  const status = text(input.status, 30).toUpperCase() as HandoffStatus;
  if (!finishedAt || (startedAt && Date.parse(finishedAt) < Date.parse(startedAt))) throw new Error("Érvénytelen munkakezdés / visszaadás időpont.");
  if (!["COMPLETED", "PARTIAL", "BLOCKED", "FAILED"].includes(status)) throw new Error("Érvénytelen átadási állapot.");
  const required = ["chatSessionId", "chatTitle", "mainProject", "project", "module", "taskId", "taskTitle", "summary", "body"];
  const missing = required.filter((key) => !text(input[key], key === "body" ? 200_000 : 500));
  if (missing.length) throw new Error(`Hiányzó átadási adatok: ${missing.join(", ")}.`);

  const durationMinutes = startedAt ? Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 60000)) : 0;
  const id = text(input.id, 180) || `handoff-${workerCode.toLowerCase()}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const moduleKey = moduleLatestKey(input);
  const date = new Date(finishedAt);
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const dir = path.join(root, "history", yyyy, mm, dd, workerCode);
  const createdAt = new Date().toISOString();
  const fileName = canonicalFileName(input, workerCode, createdAt);
  const filePath = path.join(dir, fileName);
  const body = text(input.body, 200_000);
  const schemaVersion = Math.max(1, Math.min(2, Math.round(Number(input.schemaVersion) || 2)));
  const front = [
    "---", `schemaVersion: ${schemaVersion}`, `handoffId: ${q(id)}`, `fileName: ${q(fileName)}`, `chatSessionId: ${q(input.chatSessionId)}`, `chatTitle: ${q(input.chatTitle)}`,
    `workerCode: ${q(workerCode)}`, `mainProject: ${q(input.mainProject)}`, `project: ${q(input.project)}`, `module: ${q(input.module)}`, `contextModule: ${q(input.contextModule)}`,
    `developmentArea: ${q(input.developmentArea)}`, `fileAreaKey: ${q(input.fileAreaKey)}`, `taskId: ${q(input.taskId)}`, `taskTitle: ${q(input.taskTitle)}`, `liveNextTaskId: ${q(input.liveNextTaskId)}`, `liveNextTaskTitle: ${q(input.liveNextTaskTitle)}`,
    `startedAt: ${q(startedAt)}`, `finishedAt: ${q(finishedAt)}`, `durationMinutes: ${durationMinutes}`,
    `status: ${q(status)}`, `branch: ${q(input.branch)}`, `worktree: ${q(input.worktree)}`, `startCommit: ${q(input.startCommit)}`, `endCommit: ${q(input.endCommit)}`,
    `testsSummary: ${q(input.testsSummary)}`, `buildRelease: ${q(input.buildRelease)}`, `productionAccess: "DENY"`, `tags: ${JSON.stringify(tags(input.tags))}`, "---", "", body, "",
  ].join("\n");
  const sha256 = createHash("sha256").update(front).digest("hex");
  const item: DevelopmentHandoff = {
    id,
    schemaVersion,
    chatSessionId: text(input.chatSessionId, 120),
    chatTitle: text(input.chatTitle, 260),
    workerCode,
    mainProject: text(input.mainProject, 160),
    project: text(input.project, 160),
    module: text(input.module, 160),
    contextModule: text(input.contextModule, 160),
    developmentArea: text(input.developmentArea, 220),
    fileAreaKey: fileToken(input.fileAreaKey || input.developmentArea, "Fejlesztes", 48),
    taskId: text(input.taskId, 180),
    taskTitle: text(input.taskTitle, 500),
    liveNextTaskId: text(input.liveNextTaskId, 180),
    liveNextTaskTitle: text(input.liveNextTaskTitle, 500),
    startedAt,
    finishedAt,
    durationMinutes,
    status,
    branch: text(input.branch, 300),
    worktree: text(input.worktree, 700),
    startCommit: text(input.startCommit, 64),
    endCommit: text(input.endCommit, 64),
    testsSummary: text(input.testsSummary, 1000),
    buildRelease: text(input.buildRelease, 1000),
    productionAccess: "DENY",
    tags: tags(input.tags),
    summary: text(input.summary, 3000),
    fileName,
    filePath,
    sha256,
    createdAt,
  };

  const releaseLock = await acquireWriteLock();
  try {
    const existing = await readIndex();
    if (existing.some((entry) => entry.id === id)) throw new Error("Ez az átadó már létezik; a történeti átadók nem írhatók felül.");
    if (existing.some((entry) => entry.filePath === filePath)) throw new Error("Azonos nevű átadó már létezik ebben a percben; ismételd meg a mentést egy perc múlva.");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(filePath, front, { encoding: "utf8", mode: 0o600, flag: "wx" });
    existing.unshift(item);
    await writeIndex(existing);

    const workerDir = path.join(root, "workers");
    const moduleDir = path.join(root, "modules", moduleKey);
    await mkdir(workerDir, { recursive: true, mode: 0o700 });
    await mkdir(moduleDir, { recursive: true, mode: 0o700 });
    await Promise.all([
      writeAtomic(path.join(workerDir, `${workerCode}_LATEST.md`), front),
      writeAtomic(path.join(moduleDir, "LATEST.md"), front),
      writeAtomic(path.join(root, `${workerCode}_LATEST.md`), front),
    ]);
    return item;
  } finally {
    await releaseLock();
  }
}

export async function readDevelopmentHandoff(id: string) {
  const item = (await readIndex()).find((entry) => entry.id === id);
  if (!item) throw new Error("Az átadó nem található.");
  const content = await readFile(item.filePath, "utf8");
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== item.sha256) throw new Error("Az átadó integritás-ellenőrzése sikertelen.");
  return { item, content };
}
