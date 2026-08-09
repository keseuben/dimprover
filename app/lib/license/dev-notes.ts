import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type DevNoteType =
  | "idea"
  | "decision"
  | "task"
  | "bug"
  | "fix"
  | "module_plan"
  | "ai_context"
  | "coding_instruction"
  | "release_note"
  | "saved_for_later";

export type DevNoteStatus =
  | "new"
  | "reviewing"
  | "ready_for_coding"
  | "in_progress"
  | "testing"
  | "done"
  | "deferred"
  | "withdrawn"
  | "archived";

export type DevNotePriority = "low" | "normal" | "high" | "critical";

export type DevNote = {
  id: string;
  title: string;
  type: DevNoteType;
  status: DevNoteStatus;
  module: string;
  priority: DevNotePriority;
  summary: string;
  description: string;
  codingInstruction: string;
  aiContext: string;
  source: string;
  tags: string[];
  relatedFiles: string;
  nextStep: string;
  surfaces: string[];
  epic: string;
  relatedNoteIds: string[];
  dependencies: string;
  blockers: string;
  crossChatStatus: string;
  externalAiNote: string;
  handoffSummary: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
};

export type DevNoteStore = {
  version: 1;
  updatedAt: string;
  notes: DevNote[];
};

export type DevNoteLite = Pick<
  DevNote,
  | "id"
  | "title"
  | "module"
  | "type"
  | "status"
  | "priority"
  | "epic"
  | "surfaces"
  | "updatedAt"
>;

export type DevNoteDraft = Partial<
  Pick<
    DevNote,
    | "title"
    | "type"
    | "status"
    | "module"
    | "priority"
    | "summary"
    | "description"
    | "codingInstruction"
    | "aiContext"
    | "source"
    | "tags"
    | "relatedFiles"
    | "nextStep"
    | "surfaces"
    | "epic"
    | "relatedNoteIds"
    | "dependencies"
    | "blockers"
    | "crossChatStatus"
    | "externalAiNote"
    | "handoffSummary"
  >
>;

export const devNoteTypeOptions: Array<{ id: DevNoteType; label: string }> = [
  { id: "idea", label: "Ötlet" },
  { id: "decision", label: "Fejlesztési döntés" },
  { id: "task", label: "Feladat" },
  { id: "bug", label: "Hiba" },
  { id: "fix", label: "Javítás" },
  { id: "module_plan", label: "Modulterv" },
  { id: "ai_context", label: "AI kontextus" },
  { id: "coding_instruction", label: "Kódolási utasítás" },
  { id: "release_note", label: "Release megjegyzés" },
  { id: "saved_for_later", label: "Későbbre mentve" },
];

export const devNoteStatusOptions: Array<{ id: DevNoteStatus; label: string }> = [
  { id: "new", label: "Új" },
  { id: "reviewing", label: "Átgondolás alatt" },
  { id: "ready_for_coding", label: "Kódolásra vár" },
  { id: "in_progress", label: "Folyamatban" },
  { id: "testing", label: "Tesztelés alatt" },
  { id: "done", label: "Kész" },
  { id: "deferred", label: "Elhalasztva" },
  { id: "withdrawn", label: "Visszavonva" },
  { id: "archived", label: "Archiválva" },
];

export const devNotePriorityOptions: Array<{ id: DevNotePriority; label: string }> = [
  { id: "low", label: "Alacsony" },
  { id: "normal", label: "Normál" },
  { id: "high", label: "Magas" },
  { id: "critical", label: "Kritikus" },
];

export const devNoteModuleOptions = [
  "Közös rendszerlogika",
  "Közös Értesítési Motor",
  "Webes Értesítési Központ",
  "Drive Desktop Értesítések",
  "E-mail / SMTP értesítések",
  "DIMPROVER web",
  "Webes DIMPROVER / Projektkapu",
  "DIMPRO Drive Web",
  "DIMPRO Drive Desktop",
  "DIMPRO Drive",
  "DIMPRO Fájlműhely",
  "Szerver API / közös backend",
  "Object Storage / fájltár",
  "Licenc rendszer",
  "DIMPRO Account",
  "Projektkapu",
  "Szerverőr / monitoring",
  "Fejlesztési Napló / AI Kontextustár",
  "DokuBOX",
  "KépBOX",
  "Költségvetés Műhely",
  "Szakági Mennyiségmérő",
  "Terepi hibafelvétel",
  "Terepi állapotrögzítés",
  "Ütemterv",
  "Jegyzőkönyvek",
  "Építési napló / e-napló",
  "Árutér",
  "GazdaSegéd",
  "Felújítási Gyorskalkulátor",
  "Admin / üzemeltetés",
  "Dokumentáció / termékanyag",
  "Általános rendszer",
];

export const devNoteSurfaceOptions = [
  "Webes felület",
  "Asztali szoftver",
  "Mobil / PWA",
  "Szerver API",
  "Közös rendszerlogika",
  "Adatmodell / adatbázis",
  "Dokumentáció",
  "Üzemeltetés",
  "AI / külső reviewer",
];

export const devNoteEpicOptions = [
  "DIMPRO közös értesítési rendszer",
  "DIMPROVER webes platform",
  "DIMPRO Drive / Projektkapu",
  "DIMPRO Drive Desktop",
  "DIMPRO Fájlműhely fejlesztés",
  "DIMPRO licenc és release rendszer",
  "DIMPRO üzemeltetés / Szerverőr",
  "DIMPRO Fejlesztési Napló / AI Kontextustár",
  "DIMPRO KépBOX / DokuBOX",
  "DIMPRO Költségvetés Műhely",
  "DIMPRO Szakági Mennyiségmérő",
  "DIMPROVER terepi jegyzőkönyvek",
  "DIMPRO GazdaSegéd",
  "DIMPRO Árutér",
  "DIMPRO Felújítási Gyorskalkulátor",
];

function resolveProjectRoot() {
  const cwd = process.cwd();
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;
  if (cwd.endsWith(standaloneSuffix)) return cwd.slice(0, -standaloneSuffix.length);
  return cwd;
}

const projectRoot = process.env.DIMPRO_PROJECT_ROOT ?? resolveProjectRoot();
const devNotesDir = path.join(projectRoot, ".dimprover", "dev-notes");
const devNotesFile = path.join(devNotesDir, "dev-notes.json");

function cleanString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.replace(/\r\n/g, "\n").trim();
}

function cleanStringArray(value: unknown, options?: string[]) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[;,\n]/)
      : [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const text = cleanString(item);
    if (!text || seen.has(text)) continue;
    if (options && options.length > 0 && !options.includes(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= 32) break;
  }
  return result;
}

function cleanTags(value: unknown) {
  return cleanStringArray(value).slice(0, 24);
}

function cleanRelatedNoteIds(value: unknown) {
  return cleanStringArray(value).slice(0, 80);
}

function isType(value: unknown): value is DevNoteType {
  return devNoteTypeOptions.some((item) => item.id === value);
}

function isStatus(value: unknown): value is DevNoteStatus {
  return devNoteStatusOptions.some((item) => item.id === value);
}

function isPriority(value: unknown): value is DevNotePriority {
  return devNotePriorityOptions.some((item) => item.id === value);
}

function normalizeDraft(draft: DevNoteDraft, existing?: DevNote): DevNote {
  const now = new Date().toISOString();
  const status = isStatus(draft.status) ? draft.status : existing?.status ?? "new";

  return {
    id: existing?.id ?? randomUUID(),
    title: cleanString(draft.title, existing?.title ?? "Új fejlesztési bejegyzés") || "Új fejlesztési bejegyzés",
    type: isType(draft.type) ? draft.type : existing?.type ?? "idea",
    status,
    module: cleanString(draft.module, existing?.module ?? "Általános rendszer") || "Általános rendszer",
    priority: isPriority(draft.priority) ? draft.priority : existing?.priority ?? "normal",
    summary: cleanString(draft.summary, existing?.summary ?? ""),
    description: cleanString(draft.description, existing?.description ?? ""),
    codingInstruction: cleanString(draft.codingInstruction, existing?.codingInstruction ?? ""),
    aiContext: cleanString(draft.aiContext, existing?.aiContext ?? ""),
    source: cleanString(draft.source, existing?.source ?? ""),
    tags: cleanTags(draft.tags ?? existing?.tags ?? []),
    relatedFiles: cleanString(draft.relatedFiles, existing?.relatedFiles ?? ""),
    nextStep: cleanString(draft.nextStep, existing?.nextStep ?? ""),
    surfaces: cleanStringArray(draft.surfaces ?? existing?.surfaces ?? [], devNoteSurfaceOptions),
    epic: cleanString(draft.epic, existing?.epic ?? ""),
    relatedNoteIds: cleanRelatedNoteIds(draft.relatedNoteIds ?? existing?.relatedNoteIds ?? []),
    dependencies: cleanString(draft.dependencies, existing?.dependencies ?? ""),
    blockers: cleanString(draft.blockers, existing?.blockers ?? ""),
    crossChatStatus: cleanString(draft.crossChatStatus, existing?.crossChatStatus ?? ""),
    externalAiNote: cleanString(draft.externalAiNote, existing?.externalAiNote ?? ""),
    handoffSummary: cleanString(draft.handoffSummary, existing?.handoffSummary ?? ""),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    archivedAt: status === "archived" ? existing?.archivedAt ?? now : null,
  };
}

function createEmptyStore(): DevNoteStore {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    notes: [],
  };
}

function normalizeLoadedStore(value: unknown): DevNoteStore {
  if (!value || typeof value !== "object") return createEmptyStore();
  const maybeStore = value as Partial<DevNoteStore>;
  const notes = Array.isArray(maybeStore.notes) ? maybeStore.notes : [];

  return {
    version: 1,
    updatedAt: typeof maybeStore.updatedAt === "string" ? maybeStore.updatedAt : new Date().toISOString(),
    notes: notes.map((note) => normalizeDraft(note as DevNoteDraft, note as DevNote)),
  };
}

export async function readDevNoteStore(): Promise<DevNoteStore> {
  try {
    const raw = await readFile(devNotesFile, "utf8");
    return normalizeLoadedStore(JSON.parse(raw));
  } catch {
    return createEmptyStore();
  }
}

export async function writeDevNoteStore(store: DevNoteStore) {
  await mkdir(devNotesDir, { recursive: true });
  const nextStore: DevNoteStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    notes: [...store.notes].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
  const tempFile = `${devNotesFile}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(nextStore, null, 2)}\n`, "utf8");
  await rename(tempFile, devNotesFile);
  return nextStore;
}

export async function createDevNote(draft: DevNoteDraft) {
  const store = await readDevNoteStore();
  const note = normalizeDraft(draft);
  const nextStore = await writeDevNoteStore({ ...store, notes: [note, ...store.notes] });
  return { store: nextStore, note };
}

export async function updateDevNote(noteId: string, draft: DevNoteDraft) {
  const store = await readDevNoteStore();
  const existing = store.notes.find((note) => note.id === noteId);
  if (!existing) throw new Error("A fejlesztési naplóbejegyzés nem található.");
  const note = normalizeDraft(draft, existing);
  const nextStore = await writeDevNoteStore({
    ...store,
    notes: store.notes.map((item) => (item.id === noteId ? note : item)),
  });
  return { store: nextStore, note };
}

export async function archiveDevNote(noteId: string) {
  const store = await readDevNoteStore();
  const existing = store.notes.find((note) => note.id === noteId);
  if (!existing) throw new Error("A fejlesztési naplóbejegyzés nem található.");
  return updateDevNote(noteId, { ...existing, status: "archived" });
}

export async function restoreDevNote(noteId: string) {
  const store = await readDevNoteStore();
  const existing = store.notes.find((note) => note.id === noteId);
  if (!existing) throw new Error("A fejlesztési naplóbejegyzés nem található.");
  return updateDevNote(noteId, { ...existing, status: "reviewing" });
}

export async function removeDevNote(noteId: string) {
  const store = await readDevNoteStore();
  const existing = store.notes.find((note) => note.id === noteId);
  if (!existing) throw new Error("A fejlesztési naplóbejegyzés nem található.");
  const nextStore = await writeDevNoteStore({
    ...store,
    notes: store.notes.filter((note) => note.id !== noteId),
  });
  return { store: nextStore, note: existing };
}

export function getDevNotesFilePath() {
  return devNotesFile;
}

export function toDevNoteLite(note: DevNote): DevNoteLite {
  return {
    id: note.id,
    title: note.title,
    module: note.module,
    type: note.type,
    status: note.status,
    priority: note.priority,
    epic: note.epic,
    surfaces: note.surfaces,
    updatedAt: note.updatedAt,
  };
}

export function filterDevNotes(
  notes: DevNote[],
  filters: {
    search?: string;
    type?: string;
    status?: string;
    module?: string;
    priority?: string;
    surface?: string;
    epic?: string;
    includeArchived?: boolean;
  },
) {
  const search = filters.search?.trim().toLowerCase() ?? "";

  return notes.filter((note) => {
    if (!filters.includeArchived && note.status === "archived") return false;
    if (filters.type && filters.type !== "all" && note.type !== filters.type) return false;
    if (filters.status && filters.status !== "all" && note.status !== filters.status) return false;
    if (filters.module && filters.module !== "all" && note.module !== filters.module) return false;
    if (filters.priority && filters.priority !== "all" && note.priority !== filters.priority) return false;
    if (filters.surface && filters.surface !== "all" && !note.surfaces.includes(filters.surface)) return false;
    if (filters.epic && filters.epic !== "all" && note.epic !== filters.epic) return false;
    if (!search) return true;

    return [
      note.title,
      note.module,
      note.epic,
      note.surfaces.join(" "),
      note.summary,
      note.description,
      note.codingInstruction,
      note.aiContext,
      note.source,
      note.relatedFiles,
      note.nextStep,
      note.dependencies,
      note.blockers,
      note.crossChatStatus,
      note.externalAiNote,
      note.handoffSummary,
      note.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
}

export function getDevNoteOptions(notes: DevNote[] = []) {
  const epics = Array.from(
    new Set([
      ...devNoteEpicOptions,
      ...notes.map((note) => note.epic).filter(Boolean),
    ]),
  ).sort((left, right) => left.localeCompare(right, "hu"));

  return {
    types: devNoteTypeOptions,
    statuses: devNoteStatusOptions,
    priorities: devNotePriorityOptions,
    modules: devNoteModuleOptions,
    surfaces: devNoteSurfaceOptions,
    epics,
  };
}
