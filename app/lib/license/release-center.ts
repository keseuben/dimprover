import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ReleaseStage = "dev" | "staging" | "production";
export type ReleaseStatus =
  | "draft"
  | "dev_testing"
  | "staging_candidate"
  | "approved"
  | "ready_for_production"
  | "production_deployed"
  | "rollback_ready"
  | "rolled_back"
  | "blocked"
  | "archived";

export type ReleaseType = "web" | "desktop" | "api" | "docs" | "mixed";

export type ReleaseChecklistItem = {
  id: string;
  label: string;
  required: boolean;
  checked: boolean;
  checkedAt?: string | null;
  note?: string;
};

export type ReleaseRecord = {
  id: string;
  version: string;
  title: string;
  type: ReleaseType;
  status: ReleaseStatus;
  sourceStage: ReleaseStage;
  targetStage: ReleaseStage;
  modules: string[];
  summary: string;
  technicalChangelog: string;
  publicChangelog: string;
  internalChangelog: string;
  knownIssues: string;
  testResult: string;
  rollbackPlan: string;
  rollbackPath: string;
  buildResult: string;
  smokeResult: string;
  relatedDevNoteIds: string[];
  aiHandoff: string;
  checklist: ReleaseChecklistItem[];
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  deployedAt?: string | null;
  archivedAt?: string | null;
};

export type ReleaseRuntimeStage = {
  id: ReleaseStage;
  label: string;
  processName: string;
  status: "online" | "offline" | "unknown";
  uptime: string;
  pid: string;
  memory: string;
  cpu: string;
  buildTime: string;
  staticStatus: "ok" | "missing" | "unknown";
  note: string;
};

export type ReleaseCenterStore = {
  version: 1;
  updatedAt: string;
  releases: ReleaseRecord[];
};

export type ReleaseCenterResponse = {
  ok: true;
  store: ReleaseCenterStore;
  stages: ReleaseRuntimeStage[];
  stats: {
    total: number;
    active: number;
    production: number;
    blocked: number;
    latestVersion: string;
  };
  config: {
    storageFile: string;
    recommendedPath: string;
    deploymentMode: "manual_controlled";
    warning: string;
  };
};

export type ReleaseDraft = Partial<
  Pick<
    ReleaseRecord,
    | "version"
    | "title"
    | "type"
    | "status"
    | "sourceStage"
    | "targetStage"
    | "modules"
    | "summary"
    | "technicalChangelog"
    | "publicChangelog"
    | "internalChangelog"
    | "knownIssues"
    | "testResult"
    | "rollbackPlan"
    | "rollbackPath"
    | "buildResult"
    | "smokeResult"
    | "relatedDevNoteIds"
    | "aiHandoff"
  >
>;

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
};

type Pm2Process = {
  name?: string;
  pid?: number;
  monit?: {
    memory?: number;
    cpu?: number;
  };
  pm2_env?: {
    status?: string;
    pm_uptime?: number;
  };
};

function resolveProjectRoot() {
  const cwd = process.cwd();
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;
  if (cwd.endsWith(standaloneSuffix)) return cwd.slice(0, -standaloneSuffix.length);
  return cwd;
}

const projectRoot = process.env.DIMPRO_PROJECT_ROOT ?? resolveProjectRoot();
const releaseDir = path.join(projectRoot, ".dimprover", "release-center");
const releaseFile = path.join(releaseDir, "release-center.json");

const statusLabels: Record<ReleaseStatus, string> = {
  draft: "Tervezet",
  dev_testing: "DEV teszt alatt",
  staging_candidate: "Release candidate",
  approved: "Jóváhagyva",
  ready_for_production: "Élesítésre kész",
  production_deployed: "Élesítve",
  rollback_ready: "Rollback pont kész",
  rolled_back: "Visszaállítva",
  blocked: "Blokkolva",
  archived: "Archiválva",
};

const defaultChecklist: ReleaseChecklistItem[] = [
  { id: "backup", label: "Backup / rollback pont előkészítve", required: true, checked: false, checkedAt: null },
  { id: "dev_notes", label: "Fejlesztési Napló frissítve", required: true, checked: false, checkedAt: null },
  { id: "tsc", label: "TypeScript ellenőrzés: npx tsc --noEmit", required: true, checked: false, checkedAt: null },
  { id: "lint", label: "Lint ellenőrzés: npm run lint", required: true, checked: false, checkedAt: null },
  { id: "build", label: "Build sikeres: npm run build", required: true, checked: false, checkedAt: null },
  { id: "smoke", label: "Smoke teszt / alap oldalletöltés ellenőrizve", required: true, checked: false, checkedAt: null },
  { id: "static", label: "CSS/static asset ellenőrzés OK", required: true, checked: false, checkedAt: null },
  { id: "api", label: "Érintett API útvonalak ellenőrizve", required: false, checked: false, checkedAt: null },
  { id: "docs", label: "DIMPROVER_PRODUCT_DOCS frissítve", required: true, checked: false, checkedAt: null },
  { id: "public_changelog", label: "Publikus changelog elkészült", required: false, checked: false, checkedAt: null },
  { id: "known_issues", label: "Ismert hibák / kockázatok rögzítve", required: true, checked: false, checkedAt: null },
  { id: "approval", label: "Kézi jóváhagyás megtörtént", required: true, checked: false, checkedAt: null },
];

export const releaseModuleOptions = [
  "DIMPROVER web",
  "DIMPRO Drive Web",
  "DIMPRO Drive Desktop",
  "DIMPRO Fájlműhely",
  "Közös Értesítési Motor",
  "Webes Értesítési Központ",
  "Drive Desktop Értesítések",
  "Fejlesztési Napló / AI Kontextustár",
  "Szerverőr / monitoring",
  "Licenc rendszer",
  "Projektkapu",
  "Ütemterv",
  "Jegyzőkönyvek",
  "Terepi hibafelvétel",
  "Költségvetés Műhely",
  "DokuBOX",
  "KépBOX",
  "Szakági Mennyiségmérő",
  "GazdaSegéd",
  "Árutér",
  "Dokumentáció / termékanyag",
];

function cleanString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.replace(/\r\n/g, "\n").trim();
}

function cleanArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanString(item)).filter(Boolean).slice(0, 80);
  }
  if (typeof value === "string") {
    return value.split(/[;,\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 80);
  }
  return [];
}

function isStatus(value: unknown): value is ReleaseStatus {
  return typeof value === "string" && Object.keys(statusLabels).includes(value);
}

function isStage(value: unknown): value is ReleaseStage {
  return value === "dev" || value === "staging" || value === "production";
}

function isType(value: unknown): value is ReleaseType {
  return value === "web" || value === "desktop" || value === "api" || value === "docs" || value === "mixed";
}

function createVersionSuggestion() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `web-${yyyy}.${mm}.${dd}-${hh}${min}`;
}

function normalizeChecklist(value: unknown): ReleaseChecklistItem[] {
  const incoming = Array.isArray(value) ? value : [];
  const byId = new Map(
    incoming
      .filter((item): item is Partial<ReleaseChecklistItem> => Boolean(item && typeof item === "object"))
      .map((item) => [String(item.id), item]),
  );

  return defaultChecklist.map((item) => {
    const existing = byId.get(item.id);
    return {
      ...item,
      checked: Boolean(existing?.checked),
      checkedAt: typeof existing?.checkedAt === "string" ? existing.checkedAt : null,
      note: typeof existing?.note === "string" ? existing.note : "",
    };
  });
}

function createAiHandoff(release: Pick<ReleaseRecord, "version" | "title" | "status" | "modules" | "summary" | "technicalChangelog" | "publicChangelog" | "knownIssues" | "rollbackPlan" | "buildResult" | "smokeResult">) {
  return [
    "# DIMPROVER Release átadó blokk",
    "",
    `Verzió: ${release.version}`,
    `Cím: ${release.title}`,
    `Státusz: ${release.status}`,
    `Modulok: ${release.modules.length ? release.modules.join(", ") : "-"}`,
    "",
    "## Összefoglaló",
    release.summary || "-",
    "",
    "## Technikai changelog",
    release.technicalChangelog || "-",
    "",
    "## Publikus changelog",
    release.publicChangelog || "-",
    "",
    "## Build / smoke eredmény",
    `Build: ${release.buildResult || "-"}`,
    `Smoke: ${release.smokeResult || "-"}`,
    "",
    "## Ismert hibák",
    release.knownIssues || "-",
    "",
    "## Rollback terv",
    release.rollbackPlan || "-",
  ].join("\n");
}

function normalizeRelease(draft: ReleaseDraft, existing?: ReleaseRecord): ReleaseRecord {
  const now = new Date().toISOString();
  const status = isStatus(draft.status) ? draft.status : existing?.status ?? "draft";
  const base = {
    id: existing?.id ?? randomUUID(),
    version: cleanString(draft.version, existing?.version ?? createVersionSuggestion()) || createVersionSuggestion(),
    title: cleanString(draft.title, existing?.title ?? "Új release jelölt") || "Új release jelölt",
    type: isType(draft.type) ? draft.type : existing?.type ?? "web",
    status,
    sourceStage: isStage(draft.sourceStage) ? draft.sourceStage : existing?.sourceStage ?? "dev",
    targetStage: isStage(draft.targetStage) ? draft.targetStage : existing?.targetStage ?? "production",
    modules: cleanArray(draft.modules ?? existing?.modules ?? []),
    summary: cleanString(draft.summary, existing?.summary ?? ""),
    technicalChangelog: cleanString(draft.technicalChangelog, existing?.technicalChangelog ?? ""),
    publicChangelog: cleanString(draft.publicChangelog, existing?.publicChangelog ?? ""),
    internalChangelog: cleanString(draft.internalChangelog, existing?.internalChangelog ?? ""),
    knownIssues: cleanString(draft.knownIssues, existing?.knownIssues ?? ""),
    testResult: cleanString(draft.testResult, existing?.testResult ?? ""),
    rollbackPlan: cleanString(draft.rollbackPlan, existing?.rollbackPlan ?? ""),
    rollbackPath: cleanString(draft.rollbackPath, existing?.rollbackPath ?? ""),
    buildResult: cleanString(draft.buildResult, existing?.buildResult ?? ""),
    smokeResult: cleanString(draft.smokeResult, existing?.smokeResult ?? ""),
    relatedDevNoteIds: cleanArray(draft.relatedDevNoteIds ?? existing?.relatedDevNoteIds ?? []),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    approvedAt: status === "approved" || status === "ready_for_production" || status === "production_deployed" ? existing?.approvedAt ?? now : existing?.approvedAt ?? null,
    deployedAt: status === "production_deployed" ? existing?.deployedAt ?? now : existing?.deployedAt ?? null,
    archivedAt: status === "archived" ? existing?.archivedAt ?? now : null,
  } satisfies Omit<ReleaseRecord, "aiHandoff" | "checklist">;

  const aiHandoff = cleanString(draft.aiHandoff, existing?.aiHandoff ?? "") || createAiHandoff(base);

  return {
    ...base,
    aiHandoff,
    checklist: existing?.checklist ? normalizeChecklist(existing.checklist) : normalizeChecklist([]),
  };
}

function createEmptyStore(): ReleaseCenterStore {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    releases: [],
  };
}

function createSeedRelease(): ReleaseRecord {
  const release = normalizeRelease({
    version: createVersionSuggestion(),
    title: "Release Központ MVP – belső verziókövetés",
    type: "web",
    status: "dev_testing",
    sourceStage: "dev",
    targetStage: "production",
    modules: ["DIMPROVER web", "Fejlesztési Napló / AI Kontextustár", "Szerverőr / monitoring"],
    summary: "A Release Központ célja a DEV → STAGING → PRODUCTION folyamat, a checklist, a verziónapló és a rollback pontok követése.",
    technicalChangelog: "Új release adatmodell, admin API, védett admin felület és dokumentációs naplózás.",
    publicChangelog: "Belső fejlesztői élesítési és verziókövetési központ előkészítve.",
    internalChangelog: "Az MVP még nem végez automatikus élesítést, csak biztonságos nyilvántartást és jóváhagyási folyamatot ad.",
    knownIssues: "A tényleges dev → production deploy gomb még nincs bekötve, szándékosan kézi kontroll alatt marad.",
    rollbackPlan: "Élesítés előtt külön backup mappa és build output megőrzése szükséges.",
  });
  return release;
}

function normalizeStore(value: unknown): ReleaseCenterStore {
  if (!value || typeof value !== "object") {
    return { ...createEmptyStore(), releases: [createSeedRelease()] };
  }
  const maybe = value as Partial<ReleaseCenterStore>;
  const releases = Array.isArray(maybe.releases) ? maybe.releases : [];
  const normalized = releases.map((item) => {
    const existing = item as ReleaseRecord;
    return {
      ...normalizeRelease(existing, existing),
      checklist: normalizeChecklist(existing.checklist),
    };
  });

  return {
    version: 1,
    updatedAt: typeof maybe.updatedAt === "string" ? maybe.updatedAt : new Date().toISOString(),
    releases: normalized.length ? normalized : [createSeedRelease()],
  };
}

export async function readReleaseCenterStore(): Promise<ReleaseCenterStore> {
  try {
    const raw = await readFile(releaseFile, "utf8");
    return normalizeStore(JSON.parse(raw));
  } catch {
    return { ...createEmptyStore(), releases: [createSeedRelease()] };
  }
}

export async function writeReleaseCenterStore(store: ReleaseCenterStore) {
  await mkdir(releaseDir, { recursive: true });
  const nextStore: ReleaseCenterStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    releases: [...store.releases].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
  const tempFile = `${releaseFile}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(nextStore, null, 2)}\n`, "utf8");
  await rename(tempFile, releaseFile);
  return nextStore;
}

async function runCommand(command: string, args: string[] = [], timeout = 8_000): Promise<CommandResult> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: projectRoot,
      timeout,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
  } catch (error) {
    const commandError = error as Error & { stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      ok: false,
      stdout: commandError.stdout?.toString() ?? "",
      stderr: commandError.stderr?.toString() ?? commandError.message,
    };
  }
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDurationSince(value?: number) {
  if (!value) return "-";
  const seconds = Math.max(0, Math.round((Date.now() - value) / 1000));
  if (seconds < 60) return `${seconds} mp`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} perc`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} óra`;
  return `${Math.round(hours / 24)} nap`;
}

async function getBuildTime() {
  const candidates = [
    path.join(projectRoot, ".next", "standalone", "server.js"),
    path.join(projectRoot, ".next", "BUILD_ID"),
    path.join(projectRoot, ".next", "static"),
  ];
  for (const file of candidates) {
    try {
      const info = await stat(file);
      return info.mtime.toISOString();
    } catch {
      // következő jelölt
    }
  }
  return "-";
}

async function getStaticStatus() {
  const required = [
    path.join(projectRoot, ".next", "standalone", ".next", "static"),
    path.join(projectRoot, ".next", "standalone", "public"),
  ];
  try {
    await Promise.all(required.map((item) => stat(item)));
    return "ok" as const;
  } catch {
    return "missing" as const;
  }
}

function parsePm2(output: string) {
  try {
    return JSON.parse(output) as Pm2Process[];
  } catch {
    return [];
  }
}

function processToStage(stage: ReleaseStage, label: string, processName: string, processes: Pm2Process[], buildTime: string, staticStatus: "ok" | "missing" | "unknown"): ReleaseRuntimeStage {
  const process = processes.find((item) => item.name === processName);
  const status = process?.pm2_env?.status === "online" ? "online" : process ? "offline" : "unknown";
  return {
    id: stage,
    label,
    processName,
    status,
    uptime: formatDurationSince(process?.pm2_env?.pm_uptime),
    pid: process?.pid ? String(process.pid) : "-",
    memory: formatBytes(process?.monit?.memory ?? 0),
    cpu: typeof process?.monit?.cpu === "number" ? `${process.monit.cpu}%` : "-",
    buildTime,
    staticStatus,
    note: stage === "production"
      ? "Publikus / éles PM2 folyamat. Automatikus élesítés az MVP-ben nincs bekötve."
      : stage === "dev"
        ? "Fejlesztői / teszt folyamat. Innen indul a release candidate állapot."
        : "Staging logikai állapot: jóváhagyásra váró release candidate nyilvántartás.",
  };
}

export async function collectReleaseRuntimeStages(): Promise<ReleaseRuntimeStage[]> {
  const [pm2Result, buildTime, staticStatus] = await Promise.all([
    runCommand("pm2", ["jlist"], 8_000),
    getBuildTime(),
    getStaticStatus(),
  ]);
  const processes = pm2Result.ok ? parsePm2(pm2Result.stdout) : [];
  return [
    processToStage("dev", "DEV / fejlesztői verzió", "dimprover-dev", processes, buildTime, staticStatus),
    processToStage("staging", "STAGING / release candidate", "dimprover-dev", processes, buildTime, staticStatus),
    processToStage("production", "PRODUCTION / publikus éles verzió", "dimprover", processes, buildTime, staticStatus),
  ];
}

export async function getReleaseCenterResponse(): Promise<ReleaseCenterResponse> {
  const store = await readReleaseCenterStore();
  const stages = await collectReleaseRuntimeStages();
  const active = store.releases.filter((item) => item.status !== "archived");
  const production = store.releases.filter((item) => item.status === "production_deployed");
  return {
    ok: true,
    store,
    stages,
    stats: {
      total: store.releases.length,
      active: active.length,
      production: production.length,
      blocked: store.releases.filter((item) => item.status === "blocked").length,
      latestVersion: store.releases[0]?.version ?? "-",
    },
    config: {
      storageFile: releaseFile,
      recommendedPath: "/admin/release-kozpont",
      deploymentMode: "manual_controlled",
      warning: "Az MVP nem másol automatikusan DEV állapotot élesre. A tényleges élesítés csak külön jóváhagyott, kézi kontrollos folyamat után történjen.",
    },
  };
}

export async function createReleaseRecord(draft: ReleaseDraft) {
  const store = await readReleaseCenterStore();
  const release = normalizeRelease(draft);
  const nextStore = await writeReleaseCenterStore({ ...store, releases: [release, ...store.releases] });
  return { store: nextStore, release };
}

export async function updateReleaseRecord(releaseId: string, draft: ReleaseDraft) {
  const store = await readReleaseCenterStore();
  const existing = store.releases.find((item) => item.id === releaseId);
  if (!existing) throw new Error("A release bejegyzés nem található.");
  const release = {
    ...normalizeRelease(draft, existing),
    checklist: existing.checklist,
  };
  const nextStore = await writeReleaseCenterStore({
    ...store,
    releases: store.releases.map((item) => (item.id === releaseId ? release : item)),
  });
  return { store: nextStore, release };
}

export async function setReleaseStatus(releaseId: string, status: ReleaseStatus) {
  const store = await readReleaseCenterStore();
  const existing = store.releases.find((item) => item.id === releaseId);
  if (!existing) throw new Error("A release bejegyzés nem található.");
  return updateReleaseRecord(releaseId, { ...existing, status });
}

export async function toggleReleaseChecklistItem(releaseId: string, itemId: string, checked: boolean, note = "") {
  const store = await readReleaseCenterStore();
  const existing = store.releases.find((item) => item.id === releaseId);
  if (!existing) throw new Error("A release bejegyzés nem található.");
  const now = new Date().toISOString();
  const checklist = normalizeChecklist(existing.checklist).map((item) => item.id === itemId ? {
    ...item,
    checked,
    checkedAt: checked ? now : null,
    note: cleanString(note, item.note ?? ""),
  } : item);
  const release = {
    ...existing,
    checklist,
    updatedAt: now,
  };
  const nextStore = await writeReleaseCenterStore({
    ...store,
    releases: store.releases.map((item) => (item.id === releaseId ? release : item)),
  });
  return { store: nextStore, release };
}

export function getReleaseCenterStorageFile() {
  return releaseFile;
}

export function getReleaseOptions() {
  return {
    modules: releaseModuleOptions,
    statuses: Object.entries(statusLabels).map(([id, label]) => ({ id, label })),
    types: [
      { id: "web", label: "Webes release" },
      { id: "desktop", label: "Desktop release" },
      { id: "api", label: "API / backend release" },
      { id: "docs", label: "Dokumentáció" },
      { id: "mixed", label: "Vegyes release" },
    ],
    stages: [
      { id: "dev", label: "DEV" },
      { id: "staging", label: "STAGING" },
      { id: "production", label: "PRODUCTION" },
    ],
    checklist: defaultChecklist,
    hostname: os.hostname(),
  };
}
