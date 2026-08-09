import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createNotification } from "@/app/lib/notifications/notificationStore";
import { sendDevPushNotification } from "./push-store";
import { CORE_DEV_PROJECT_DEFINITIONS, classifyDevVersionProjectId } from "./portfolio";
import type {
  DevCenterState,
  DevProject,
  DevVersion,
  DevVersionStatus,
  DevWorkCategory,
  DevWorkSession,
  DevWorkSessionSource,
} from "./types";

function getRuntimeProjectRoot() {
  const configuredRoot = process.env.DIMPRO_PROJECT_ROOT?.trim();
  if (configuredRoot) return path.resolve(configuredRoot);
  const cwd = process.cwd();
  if (cwd.endsWith(path.join(".next", "standalone"))) return path.resolve(cwd, "..", "..");
  return cwd;
}

const dataRoot = path.join(getRuntimeProjectRoot(), ".data", "dimpro-dev-center");
const statePath = path.join(dataRoot, "state.json");

function nowIso() {
  return new Date().toISOString();
}

function inferModuleName(title: string) {
  const normalized = title.toLocaleLowerCase("hu-HU");
  if (normalized.includes("fejlesztési központ") || normalized.includes("dev center")) return "Fejlesztési Központ";
  if (normalized.includes("értekezlet")) return "Értekezleti kísérő";
  if (normalized.includes("pdf")) return "PDF eszközök";
  if (normalized.includes("drive")) return "DIMPRO Drive";
  if (normalized.includes("licenc")) return "Licenckezelés";
  if (normalized.includes("értesítés")) return "Értesítési Központ";
  return "Általános fejlesztés";
}

function createSeedState(): DevCenterState {
  const now = nowIso();
  const projects: DevProject[] = [
    ...CORE_DEV_PROJECT_DEFINITIONS.map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      category: project.category,
      description: project.description,
      status: project.status,
      accent: project.accent,
      startedAt: project.startedAt,
      createdAt: project.startedAt,
      updatedAt: now,
    })),
    {
      id: "project_hage",
      name: "HAGE-INVEST Munkatér",
      slug: "hage-invest-munkater",
      category: "Külső / vállalati munkatér",
      description: "Saját munkatér, projektkapu, üzemeltetés, iktatás, értekezletek és AI Gateway.",
      status: "active",
      accent: "lime",
      startedAt: "2026-06-15T00:00:00.000Z",
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: now,
    },
    {
      id: "project_unassigned",
      name: "Egyéb / besorolatlan",
      slug: "egyeb-besorolatlan",
      category: "Ideiglenes gyűjtőprojekt",
      description: "A projekt nélkül rögzített fejlesztések ide kerülnek, majd később áthelyezhetők.",
      status: "unassigned",
      accent: "amber",
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const versions: DevVersion[] = [
    {
      id: "version_fajlmuhely_5373",
      projectId: "project_fajlmuhely",
      version: "v5.37.3",
      moduleName: "Értekezleti kísérő",
      title: "Értekezleti archívum export",
      summary: "Értekezleti archívum export és rövid fájlútvonal-kezelés.",
      status: "completed",
      startedAt: "2026-07-20T00:00:00.000Z",
      completedAt: "2026-07-20T23:00:00.000Z",
      updatedAt: now,
      testSummary: "Build és kiadási csomag elkészült.",
      createdBy: "DIMPRO fejlesztési rendszer",
    },
    {
      id: "version_dev_center_001",
      projectId: "project_dimprover",
      version: "DEV-CENTER 0.1",
      moduleName: "Fejlesztési Központ",
      title: "Fejlesztési Központ – mobilbarát felület és témarendszer",
      summary: "Világos alapértelmezésű, sötét módra kapcsolható projektkártyás fejlesztési vezérlőpult és Licencadmin témarendszer.",
      status: "testing",
      startedAt: now,
      completedAt: null,
      updatedAt: now,
      nextStep: "Projekt–verzió API, majd PWA push és hangos értesítés.",
      createdBy: "ChatGPT VPS fejlesztés",
    },
  ];

  return { projects, versions, workSessions: [], updatedAt: now };
}

async function ensureRoot() {
  await mkdir(dataRoot, { recursive: true });
}

async function writeState(state: DevCenterState) {
  await ensureRoot();
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(state, null, 2), "utf8");
  await rename(temporaryPath, statePath);
}

function migrateState(parsed: DevCenterState) {
  let changed = false;
  if (!Array.isArray(parsed.workSessions)) {
    parsed.workSessions = [];
    changed = true;
  }

  const now = nowIso();
  const projectById = new Map(parsed.projects.map((project) => [project.id, project]));
  for (const definition of CORE_DEV_PROJECT_DEFINITIONS) {
    const existing = projectById.get(definition.id);
    if (!existing) {
      const project: DevProject = {
        id: definition.id,
        name: definition.name,
        slug: definition.slug,
        category: definition.category,
        description: definition.description,
        status: definition.status,
        accent: definition.accent,
        startedAt: definition.startedAt,
        createdAt: definition.startedAt,
        updatedAt: now,
      };
      parsed.projects.push(project);
      projectById.set(project.id, project);
      changed = true;
      continue;
    }

    const canonicalPatch = {
      name: definition.name,
      slug: definition.slug,
      category: definition.category,
      description: definition.description,
      startedAt: existing.startedAt || definition.startedAt,
    };
    if (
      existing.name !== canonicalPatch.name ||
      existing.slug !== canonicalPatch.slug ||
      existing.category !== canonicalPatch.category ||
      existing.description !== canonicalPatch.description ||
      existing.startedAt !== canonicalPatch.startedAt
    ) {
      Object.assign(existing, canonicalPatch);
      changed = true;
    }
  }

  parsed.projects = parsed.projects.map((project) => {
    const knownStart = project.id === "project_hage" ? "2026-06-15T00:00:00.000Z" : project.createdAt;
    if (project.startedAt) return project;
    changed = true;
    return { ...project, startedAt: knownStart || now };
  });

  parsed.versions = parsed.versions.map((version) => {
    const moduleName = version.moduleName?.trim() || inferModuleName(version.title);
    const projectId = classifyDevVersionProjectId({ ...version, moduleName });
    if (moduleName === version.moduleName && projectId === version.projectId) return version;
    changed = true;
    return { ...version, moduleName, projectId };
  });

  parsed.workSessions = parsed.workSessions.map((session) => {
    const version = parsed.versions.find((item) => item.id === session.versionId);
    const moduleName = session.moduleName?.trim() || version?.moduleName || "Általános fejlesztés";
    const projectId = version?.projectId || session.projectId || "project_unassigned";
    const hasSegments = Array.isArray(session.timeSegments);
    const timeSegments = Array.isArray(session.timeSegments) ? session.timeSegments : session.endedAt ? [] : [{
      id: `segment_${randomUUID().slice(0, 12)}`,
      category: "active_development" as DevWorkCategory,
      startedAt: now,
      endedAt: null,
      durationMinutes: null,
    }];
    const openSegment = [...timeSegments].reverse().find((segment) => !segment.endedAt);
    const currentCategory = session.endedAt ? null : normalizeWorkCategory(session.currentCategory || openSegment?.category, "active_development");
    if (
      moduleName !== session.moduleName
      || projectId !== session.projectId
      || !hasSegments
      || currentCategory !== (session.currentCategory ?? null)
    ) changed = true;
    return { ...session, moduleName, projectId, timeSegments, currentCategory };
  });

  return { state: parsed, changed };
}

export async function getDevCenterState() {
  await ensureRoot();
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8")) as DevCenterState;
    if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.versions)) throw new Error("invalid state");
    const migrated = migrateState(parsed);
    if (migrated.changed) await writeState(migrated.state);
    return migrated.state;
  } catch {
    const seed = createSeedState();
    await writeState(seed);
    return seed;
  }
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeDate(value: unknown, fallback: string) {
  const text = normalizeText(value);
  if (!text) return fallback;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function normalizePositiveMinutes(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(1, Math.round(numeric));
}

function normalizeSessionSource(value: unknown, fallback: DevWorkSessionSource): DevWorkSessionSource {
  const allowed: DevWorkSessionSource[] = ["automatic", "manual", "chatgpt", "system"];
  return allowed.includes(value as DevWorkSessionSource) ? value as DevWorkSessionSource : fallback;
}

function normalizeWorkCategory(value: unknown, fallback: DevWorkCategory): DevWorkCategory {
  const allowed: DevWorkCategory[] = ["active_development", "build_test", "waiting_blocked", "documentation_release"];
  return allowed.includes(value as DevWorkCategory) ? value as DevWorkCategory : fallback;
}

function calculateDurationMinutes(startedAt: string, endedAt: string) {
  const difference = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return Math.max(1, Math.round(difference / 60_000));
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `project-${Date.now()}`;
}

function findVersion(state: DevCenterState, versionId: string) {
  return state.versions.find((item) => item.id === versionId);
}

function findOpenSession(state: DevCenterState, versionId: string) {
  return state.workSessions.find((session) => session.versionId === versionId && !session.endedAt);
}

function findOpenTimeSegment(session: DevWorkSession) {
  return [...(session.timeSegments || [])].reverse().find((segment) => !segment.endedAt);
}

function closeOpenTimeSegment(session: DevWorkSession, endedAt: string) {
  const segment = findOpenTimeSegment(session);
  if (!segment) return null;
  let normalizedEnd = endedAt;
  if (new Date(normalizedEnd).getTime() <= new Date(segment.startedAt).getTime()) normalizedEnd = nowIso();
  segment.endedAt = normalizedEnd;
  segment.durationMinutes = calculateDurationMinutes(segment.startedAt, normalizedEnd);
  return segment;
}

function switchSessionCategoryInState(session: DevWorkSession, category: DevWorkCategory, changedAt: string) {
  const normalizedCategory = normalizeWorkCategory(category, "active_development");
  const openSegment = findOpenTimeSegment(session);
  if (openSegment?.category === normalizedCategory) {
    session.currentCategory = normalizedCategory;
    return openSegment;
  }
  if (openSegment) closeOpenTimeSegment(session, changedAt);
  const segment = {
    id: `segment_${randomUUID().slice(0, 12)}`,
    category: normalizedCategory,
    startedAt: changedAt,
    endedAt: null,
    durationMinutes: null,
  };
  session.timeSegments = [...(session.timeSegments || []), segment];
  session.currentCategory = normalizedCategory;
  return segment;
}

function startSessionInState(
  state: DevCenterState,
  version: DevVersion,
  input: Record<string, unknown>,
) {
  const existing = findOpenSession(state, version.id);
  if (existing) return existing;
  const now = nowIso();
  const startedAt = normalizeDate(input.startedAt, now);
  const category = normalizeWorkCategory(input.category, "active_development");
  const session: DevWorkSession = {
    id: `work_${randomUUID().slice(0, 12)}`,
    versionId: version.id,
    projectId: version.projectId,
    moduleName: normalizeText(input.moduleName, version.moduleName || "Általános fejlesztés"),
    startedAt,
    endedAt: null,
    durationMinutes: null,
    timeSegments: [{ id: `segment_${randomUUID().slice(0, 12)}`, category, startedAt, endedAt: null, durationMinutes: null }],
    currentCategory: category,
    source: normalizeSessionSource(input.source, "automatic"),
    note: normalizeText(input.note) || undefined,
    createdAt: now,
    updatedAt: now,
  };
  state.workSessions.unshift(session);
  return session;
}

function stopSessionInState(
  state: DevCenterState,
  versionId: string,
  input: Record<string, unknown>,
) {
  const session = findOpenSession(state, versionId);
  if (!session) return null;
  const now = nowIso();
  let endedAt = normalizeDate(input.endedAt, now);
  if (new Date(endedAt).getTime() <= new Date(session.startedAt).getTime()) endedAt = now;
  closeOpenTimeSegment(session, endedAt);
  session.endedAt = endedAt;
  session.durationMinutes = calculateDurationMinutes(session.startedAt, endedAt);
  session.currentCategory = null;
  session.updatedAt = now;
  const note = normalizeText(input.note);
  if (note) session.note = note;
  return session;
}

export async function createDevProject(input: Record<string, unknown>) {
  const name = normalizeText(input.name);
  if (!name) return { ok: false as const, error: "A projekt neve kötelező." };

  const state = await getDevCenterState();
  const now = nowIso();
  const project: DevProject = {
    id: `project_${randomUUID().slice(0, 12)}`,
    name,
    slug: normalizeText(input.slug) || slugify(name),
    category: normalizeText(input.category, "Fejlesztési projekt"),
    description: normalizeText(input.description),
    status: input.status === "paused" || input.status === "completed" || input.status === "archived" ? input.status : "active",
    accent: input.accent === "lime" || input.accent === "blue" || input.accent === "amber" || input.accent === "slate" ? input.accent : "cyan",
    startedAt: normalizeDate(input.startedAt, now),
    createdAt: now,
    updatedAt: now,
  };

  state.projects.push(project);
  state.updatedAt = now;
  await writeState(state);
  return { ok: true as const, project, state };
}

export async function createDevVersion(input: Record<string, unknown>) {
  const state = await getDevCenterState();
  const requestedProjectId = normalizeText(input.projectId);
  const project = state.projects.find((item) => item.id === requestedProjectId)
    || state.projects.find((item) => item.slug === requestedProjectId)
    || state.projects.find((item) => item.id === "project_unassigned");

  if (!project) return { ok: false as const, error: "Nem található célprojekt." };

  const title = normalizeText(input.title);
  if (!title) return { ok: false as const, error: "A fejlesztési verzió címe kötelező." };

  const now = nowIso();
  const status = normalizeVersionStatus(input.status, "in_progress");
  const version: DevVersion = {
    id: `version_${randomUUID().slice(0, 12)}`,
    projectId: project.id,
    version: normalizeText(input.version, "verzió nélkül"),
    moduleName: normalizeText(input.moduleName, inferModuleName(title)),
    title,
    summary: normalizeText(input.summary),
    status,
    startedAt: normalizeDate(input.startedAt, now),
    completedAt: null,
    updatedAt: now,
    chatTitle: normalizeText(input.chatTitle) || undefined,
    chatUrl: normalizeText(input.chatUrl) || undefined,
    releaseUrl: normalizeText(input.releaseUrl) || undefined,
    downloadUrl: normalizeText(input.downloadUrl) || undefined,
    testSummary: normalizeText(input.testSummary) || undefined,
    nextStep: normalizeText(input.nextStep) || undefined,
    createdBy: normalizeText(input.createdBy, "ChatGPT Dev Reporter"),
    metadata: typeof input.metadata === "object" && input.metadata !== null ? input.metadata as Record<string, unknown> : undefined,
  };

  state.versions.unshift(version);
  if (input.startTimer !== false && (status === "in_progress" || status === "testing")) {
    startSessionInState(state, version, { ...input, startedAt: version.startedAt, source: input.source || "automatic" });
  }
  project.updatedAt = now;
  state.updatedAt = now;
  await writeState(state);
  return { ok: true as const, version, project, workSessions: state.workSessions, state };
}

function normalizeVersionStatus(value: unknown, fallback: DevVersionStatus): DevVersionStatus {
  const allowed: DevVersionStatus[] = ["planned", "in_progress", "testing", "blocked", "completed", "released"];
  return allowed.includes(value as DevVersionStatus) ? value as DevVersionStatus : fallback;
}

export async function updateDevVersion(versionId: string, input: Record<string, unknown>) {
  const state = await getDevCenterState();
  const version = findVersion(state, versionId);
  if (!version) return { ok: false as const, error: "A fejlesztési verzió nem található." };

  const previousStatus = version.status;
  const now = nowIso();
  if (input.projectId) {
    const target = state.projects.find((item) => item.id === input.projectId || item.slug === input.projectId);
    if (target) {
      version.projectId = target.id;
      state.workSessions.filter((session) => session.versionId === version.id).forEach((session) => {
        session.projectId = target.id;
        session.updatedAt = now;
      });
    }
  }
  if (input.version !== undefined) version.version = normalizeText(input.version, version.version);
  if (input.moduleName !== undefined) {
    version.moduleName = normalizeText(input.moduleName, version.moduleName);
    state.workSessions.filter((session) => session.versionId === version.id).forEach((session) => {
      session.moduleName = version.moduleName;
      session.updatedAt = now;
    });
  }
  if (input.title !== undefined) version.title = normalizeText(input.title, version.title);
  if (input.summary !== undefined) version.summary = normalizeText(input.summary);
  if (input.status !== undefined) version.status = normalizeVersionStatus(input.status, version.status);
  if (input.chatTitle !== undefined) version.chatTitle = normalizeText(input.chatTitle) || undefined;
  if (input.chatUrl !== undefined) version.chatUrl = normalizeText(input.chatUrl) || undefined;
  if (input.releaseUrl !== undefined) version.releaseUrl = normalizeText(input.releaseUrl) || undefined;
  if (input.downloadUrl !== undefined) version.downloadUrl = normalizeText(input.downloadUrl) || undefined;
  if (input.testSummary !== undefined) version.testSummary = normalizeText(input.testSummary) || undefined;
  if (input.nextStep !== undefined) version.nextStep = normalizeText(input.nextStep) || undefined;
  if (input.metadata && typeof input.metadata === "object") version.metadata = input.metadata as Record<string, unknown>;

  if ((version.status === "completed" || version.status === "released") && previousStatus !== version.status) {
    stopSessionInState(state, version.id, { endedAt: now, note: `Automatikus leállítás: ${version.status}` });
  } else if (version.status === "blocked" && previousStatus !== version.status) {
    const session = findOpenSession(state, version.id) || startSessionInState(state, version, { source: "automatic", category: "waiting_blocked", note: "Automatikus várakozási munkamenet." });
    switchSessionCategoryInState(session, "waiting_blocked", now);
  } else if (version.status === "testing" && previousStatus !== version.status) {
    const session = findOpenSession(state, version.id) || startSessionInState(state, version, { source: "automatic", category: "build_test", note: "Automatikus tesztelési munkamenet." });
    switchSessionCategoryInState(session, "build_test", now);
  } else if (version.status === "in_progress" && previousStatus !== version.status) {
    const session = findOpenSession(state, version.id) || startSessionInState(state, version, { source: "automatic", category: "active_development", note: "Automatikus fejlesztési munkamenet." });
    switchSessionCategoryInState(session, "active_development", now);
  }

  version.updatedAt = now;
  state.updatedAt = now;
  await writeState(state);
  return { ok: true as const, version, workSessions: state.workSessions, state };
}

export async function startDevWorkSession(versionId: string, input: Record<string, unknown>) {
  const state = await getDevCenterState();
  const version = findVersion(state, versionId);
  if (!version) return { ok: false as const, error: "A fejlesztési verzió nem található." };
  const existing = findOpenSession(state, versionId);
  const session = existing || startSessionInState(state, version, input);
  const now = nowIso();
  version.updatedAt = now;
  state.updatedAt = now;
  await writeState(state);
  return { ok: true as const, session, alreadyRunning: Boolean(existing), state };
}

export async function stopDevWorkSession(versionId: string, input: Record<string, unknown>) {
  const state = await getDevCenterState();
  const version = findVersion(state, versionId);
  if (!version) return { ok: false as const, error: "A fejlesztési verzió nem található." };
  const session = stopSessionInState(state, versionId, input);
  if (!session) return { ok: false as const, error: "Ehhez a verzióhoz nincs futó munkamenet." };
  const now = nowIso();
  version.updatedAt = now;
  state.updatedAt = now;
  await writeState(state);
  return { ok: true as const, session, state };
}

export async function switchDevWorkSessionCategory(versionId: string, input: Record<string, unknown>) {
  const state = await getDevCenterState();
  const version = findVersion(state, versionId);
  if (!version) return { ok: false as const, error: "A fejlesztési verzió nem található." };
  const session = findOpenSession(state, versionId);
  if (!session) return { ok: false as const, error: "Ehhez a verzióhoz nincs futó munkamenet." };
  const category = normalizeWorkCategory(input.category, session.currentCategory || "active_development");
  const changedAt = normalizeDate(input.changedAt, nowIso());
  switchSessionCategoryInState(session, category, changedAt);
  session.updatedAt = nowIso();
  version.updatedAt = session.updatedAt;
  state.updatedAt = session.updatedAt;
  await writeState(state);
  return { ok: true as const, session, category, state };
}

export async function addManualDevWorkSession(versionId: string, input: Record<string, unknown>) {
  const state = await getDevCenterState();
  const version = findVersion(state, versionId);
  if (!version) return { ok: false as const, error: "A fejlesztési verzió nem található." };
  const durationMinutes = normalizePositiveMinutes(input.durationMinutes);
  if (!durationMinutes) return { ok: false as const, error: "A kézi időbejegyzéshez pozitív percszám szükséges." };

  const now = nowIso();
  const endedAt = normalizeDate(input.endedAt, now);
  const requestedStart = normalizeText(input.startedAt);
  const startedAt = requestedStart
    ? normalizeDate(requestedStart, new Date(new Date(endedAt).getTime() - durationMinutes * 60_000).toISOString())
    : new Date(new Date(endedAt).getTime() - durationMinutes * 60_000).toISOString();
  const category = normalizeWorkCategory(input.category, "active_development");
  const session: DevWorkSession = {
    id: `work_${randomUUID().slice(0, 12)}`,
    versionId: version.id,
    projectId: version.projectId,
    moduleName: normalizeText(input.moduleName, version.moduleName),
    startedAt,
    endedAt,
    durationMinutes,
    timeSegments: [{ id: `segment_${randomUUID().slice(0, 12)}`, category, startedAt, endedAt, durationMinutes }],
    currentCategory: null,
    source: normalizeSessionSource(input.source, "manual"),
    note: normalizeText(input.note, "Kézzel rögzített fejlesztési idő."),
    createdAt: now,
    updatedAt: now,
  };
  state.workSessions.unshift(session);
  version.updatedAt = now;
  state.updatedAt = now;
  await writeState(state);
  return { ok: true as const, session, state };
}

export async function completeDevVersion(versionId: string, input: Record<string, unknown>) {
  const state = await getDevCenterState();
  const version = findVersion(state, versionId);
  if (!version) return { ok: false as const, error: "A fejlesztési verzió nem található." };
  const project = state.projects.find((item) => item.id === version.projectId);
  const now = nowIso();

  version.status = input.released === true ? "released" : "completed";
  version.completedAt = normalizeDate(input.completedAt, now);
  version.updatedAt = now;
  if (input.summary !== undefined) version.summary = normalizeText(input.summary, version.summary);
  if (input.testSummary !== undefined) version.testSummary = normalizeText(input.testSummary) || undefined;
  if (input.releaseUrl !== undefined) version.releaseUrl = normalizeText(input.releaseUrl) || undefined;
  if (input.downloadUrl !== undefined) version.downloadUrl = normalizeText(input.downloadUrl) || undefined;
  if (input.nextStep !== undefined) version.nextStep = normalizeText(input.nextStep) || undefined;
  stopSessionInState(state, version.id, { endedAt: version.completedAt, note: "Automatikus lezárás a fejlesztés befejezésekor." });
  if (project) project.updatedAt = now;
  state.updatedAt = now;
  await writeState(state);

  const recipientUserId = process.env.DIMPRO_DEV_NOTIFICATION_USER_ID?.trim();
  if (recipientUserId) {
    await createNotification({
      type: "SYSTEM_INFO",
      title: "DIMPRO fejlesztés elkészült",
      message: `${project?.name || "Egyéb fejlesztés"} ${version.version}: ${version.title}`,
      recipientUserIds: [recipientUserId],
      projectId: project?.id,
      projectName: project?.name,
      source: "server",
      sourceClient: "dimpro-dev-reporter",
      priority: "high",
      actionUrl: `/admin/dev?version=${encodeURIComponent(version.id)}#projektek`,
      metadata: { devVersionId: version.id, completedAt: version.completedAt, summary: version.summary },
    });
  }

  let pushResult: Awaited<ReturnType<typeof sendDevPushNotification>> | null = null;
  let pushError = "";
  try {
    pushResult = await sendDevPushNotification({
      title: "DIMPRO fejlesztés elkészült",
      body: `${project?.name || "Egyéb fejlesztés"} ${version.version}: ${version.title}`,
      url: `/admin/dev?version=${encodeURIComponent(version.id)}#verziok`,
      tag: `dimpro-dev-complete-${version.id}`,
      priority: "high",
    });
  } catch (error) {
    pushError = error instanceof Error ? error.message : "A push értesítés sikertelen.";
  }

  return {
    ok: true as const,
    version,
    project,
    workSessions: state.workSessions,
    state,
    notificationQueued: Boolean(recipientUserId),
    pushResult,
    pushError: pushError || undefined,
  };
}
