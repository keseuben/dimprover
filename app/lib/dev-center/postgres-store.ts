import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/app/lib/notifications/notificationStore";
import { sendDevPushNotification } from "./push-store";
import type { DevCenterState, DevProject, DevVersion, DevVersionStatus, DevWorkCategory, DevWorkSession, DevWorkSessionSource, DevWorkTimeSegment } from "./types";

function db(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("DEV_CENTER_DATABASE_NOT_CONFIGURED");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { "x-client-info": "dimpro-dev-center-store/0.2.0" } } });
}
function nowIso() { return new Date().toISOString(); }
function text(value: unknown, fallback = "") { return typeof value === "string" ? value.trim() : fallback; }
function date(value: unknown, fallback: string) { const raw = text(value); if (!raw) return fallback; const parsed = new Date(raw); return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString(); }
function source(value: unknown, fallback: DevWorkSessionSource): DevWorkSessionSource { return ["automatic","manual","chatgpt","system"].includes(String(value)) ? value as DevWorkSessionSource : fallback; }
function category(value: unknown, fallback: DevWorkCategory): DevWorkCategory { return ["active_development","build_test","waiting_blocked","documentation_release"].includes(String(value)) ? value as DevWorkCategory : fallback; }
function status(value: unknown, fallback: DevVersionStatus): DevVersionStatus { return ["planned","in_progress","testing","blocked","completed","released"].includes(String(value)) ? value as DevVersionStatus : fallback; }
function minutes(start: string, end: string) { return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)); }
function slugify(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `project-${Date.now()}`; }
function inferModuleName(title: string) { const n = title.toLocaleLowerCase("hu-HU"); if (n.includes("fejlesztési központ") || n.includes("dev center")) return "Fejlesztési Központ"; if (n.includes("drive")) return "DIMPRO Drive"; if (n.includes("licenc")) return "Licenckezelés"; return "Általános fejlesztés"; }
function mapProject(row: Record<string, unknown>): DevProject { return { id: String(row.id), name: String(row.name), slug: String(row.slug), category: String(row.category), description: String(row.description || ""), status: row.status as DevProject["status"], accent: row.accent as DevProject["accent"], startedAt: String(row.started_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }
function mapVersion(row: Record<string, unknown>): DevVersion { return { id: String(row.id), projectId: String(row.project_id), version: String(row.version), moduleName: String(row.module_name), title: String(row.title), summary: String(row.summary || ""), status: row.status as DevVersionStatus, startedAt: String(row.started_at), completedAt: row.completed_at ? String(row.completed_at) : null, updatedAt: String(row.updated_at), chatTitle: row.chat_title ? String(row.chat_title) : undefined, chatUrl: row.chat_url ? String(row.chat_url) : undefined, releaseUrl: row.release_url ? String(row.release_url) : undefined, downloadUrl: row.download_url ? String(row.download_url) : undefined, testSummary: row.test_summary ? String(row.test_summary) : undefined, nextStep: row.next_step ? String(row.next_step) : undefined, createdBy: row.created_by ? String(row.created_by) : undefined, metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : undefined }; }
function mapSession(row: Record<string, unknown>, segments: DevWorkTimeSegment[]): DevWorkSession { return { id: String(row.id), versionId: String(row.version_id), projectId: String(row.project_id), moduleName: String(row.module_name), startedAt: String(row.started_at), endedAt: row.ended_at ? String(row.ended_at) : null, durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes), timeSegments: segments, currentCategory: row.current_category ? row.current_category as DevWorkCategory : null, source: row.source as DevWorkSessionSource, note: row.note ? String(row.note) : undefined, createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }

export async function getDevCenterState(): Promise<DevCenterState> {
  const client = db();
  const [projects, versions, sessions, segments] = await Promise.all([
    client.from("dev_center_projects").select("*").order("created_at"),
    client.from("dev_center_versions").select("*").order("started_at", { ascending: false }),
    client.from("dev_center_work_sessions").select("*").order("started_at", { ascending: false }),
    client.from("dev_center_work_segments").select("*").order("started_at"),
  ]);
  for (const result of [projects, versions, sessions, segments]) if (result.error) throw result.error;
  const segmentMap = new Map<string, DevWorkTimeSegment[]>();
  for (const row of segments.data || []) { const item: DevWorkTimeSegment = { id: row.id, category: row.category, startedAt: row.started_at, endedAt: row.ended_at, durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes) }; segmentMap.set(row.work_session_id, [...(segmentMap.get(row.work_session_id) || []), item]); }
  return { projects: (projects.data || []).map((row) => mapProject(row)), versions: (versions.data || []).map((row) => mapVersion(row)), workSessions: (sessions.data || []).map((row) => mapSession(row, segmentMap.get(row.id) || [])), updatedAt: nowIso() };
}

async function findVersion(client: SupabaseClient, versionId: string) {
  const { data, error } = await client.from("dev_center_versions").select("*").eq("id", versionId).maybeSingle();
  if (error) throw error;
  return data ? mapVersion(data) : null;
}
async function findOpenSession(client: SupabaseClient, versionId: string) {
  const { data, error } = await client.from("dev_center_work_sessions").select("*").eq("version_id", versionId).is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}
async function startSessionRow(client: SupabaseClient, version: DevVersion, input: Record<string, unknown>) {
  const existing = await findOpenSession(client, version.id);
  if (existing) return { row: existing, alreadyRunning: true };
  const now = nowIso();
  const startedAt = date(input.startedAt, now);
  const workCategory = category(input.category, "active_development");
  const sessionId = `work_${randomUUID().slice(0, 12)}`;
  const session = { id: sessionId, version_id: version.id, project_id: version.projectId, module_name: text(input.moduleName, version.moduleName), started_at: startedAt, ended_at: null, duration_minutes: null, current_category: workCategory, source: source(input.source, "automatic"), note: text(input.note) || null, created_at: now, updated_at: now };
  const { data, error } = await client.from("dev_center_work_sessions").insert(session).select("*").single();
  if (error) throw error;
  const segment = { id: `segment_${randomUUID().slice(0, 12)}`, work_session_id: sessionId, category: workCategory, started_at: startedAt, ended_at: null, duration_minutes: null };
  const { error: segmentError } = await client.from("dev_center_work_segments").insert(segment);
  if (segmentError) throw segmentError;
  return { row: data, alreadyRunning: false };
}
async function closeOpenSegment(client: SupabaseClient, sessionId: string, endedAt: string) {
  const { data, error } = await client.from("dev_center_work_segments").select("*").eq("work_session_id", sessionId).is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const normalizedEnd = new Date(endedAt).getTime() > new Date(data.started_at).getTime() ? endedAt : nowIso();
  const duration = minutes(data.started_at, normalizedEnd);
  const { error: updateError } = await client.from("dev_center_work_segments").update({ ended_at: normalizedEnd, duration_minutes: duration }).eq("id", data.id);
  if (updateError) throw updateError;
  return { ...data, ended_at: normalizedEnd, duration_minutes: duration };
}

export async function createDevProject(input: Record<string, unknown>) {
  const name = text(input.name);
  if (!name) return { ok: false as const, error: "A projekt neve kötelező." };
  const client = db();
  const now = nowIso();
  const row = { id: `project_${randomUUID().slice(0, 12)}`, name, slug: text(input.slug) || slugify(name), category: text(input.category, "Fejlesztési projekt"), description: text(input.description), status: ["paused","completed","archived"].includes(String(input.status)) ? input.status : "active", accent: ["lime","blue","amber","slate"].includes(String(input.accent)) ? input.accent : "cyan", started_at: date(input.startedAt, now), created_at: now, updated_at: now, metadata: {} };
  const { data, error } = await client.from("dev_center_projects").insert(row).select("*").single();
  if (error) return { ok: false as const, error: error.message };
  const project = mapProject(data);
  return { ok: true as const, project, state: await getDevCenterState() };
}

export async function createDevVersion(input: Record<string, unknown>) {
  const client = db();
  const projectRef = text(input.projectId);
  const { data: projects, error: projectError } = await client.from("dev_center_projects").select("*").or(`id.eq.${projectRef},slug.eq.${projectRef}`);
  if (projectError) throw projectError;
  const projectRow = projects?.[0] || (await client.from("dev_center_projects").select("*").eq("id", "project_unassigned").maybeSingle()).data;
  if (!projectRow) return { ok: false as const, error: "Nem található célprojekt." };
  const title = text(input.title);
  if (!title) return { ok: false as const, error: "A fejlesztési verzió címe kötelező." };
  const now = nowIso();
  const versionStatus = status(input.status, "in_progress");
  const row = { id: `version_${randomUUID().slice(0, 12)}`, project_id: projectRow.id, version: text(input.version, "verzió nélkül"), module_name: text(input.moduleName, inferModuleName(title)), title, summary: text(input.summary), status: versionStatus, started_at: date(input.startedAt, now), completed_at: null, updated_at: now, chat_title: text(input.chatTitle) || null, chat_url: text(input.chatUrl) || null, release_url: text(input.releaseUrl) || null, download_url: text(input.downloadUrl) || null, test_summary: text(input.testSummary) || null, next_step: text(input.nextStep) || null, created_by: text(input.createdBy, "ChatGPT Dev Reporter"), metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {} };
  const { data, error } = await client.from("dev_center_versions").insert(row).select("*").single();
  if (error) return { ok: false as const, error: error.message };
  const version = mapVersion(data);
  if (input.startTimer !== false && ["in_progress","testing"].includes(versionStatus)) await startSessionRow(client, version, { ...input, startedAt: version.startedAt, source: input.source || "automatic" });
  await client.from("dev_center_projects").update({ updated_at: now }).eq("id", projectRow.id);
  const state = await getDevCenterState();
  return { ok: true as const, version, project: mapProject(projectRow), workSessions: state.workSessions, state };
}

export async function updateDevVersion(versionId: string, input: Record<string, unknown>) {
  const client = db();
  const current = await findVersion(client, versionId);
  if (!current) return { ok: false as const, error: "A fejlesztési verzió nem található." };
  const previousStatus = current.status;
  const now = nowIso();
  let projectId = current.projectId;
  if (input.projectId) {
    const ref = text(input.projectId);
    const byId = await client.from("dev_center_projects").select("id").eq("id", ref).maybeSingle();
    if (byId.error) throw byId.error;
    const target = byId.data || (await client.from("dev_center_projects").select("id").eq("slug", ref).maybeSingle()).data;
    if (target) projectId = target.id;
  }
  const nextStatus = input.status !== undefined ? status(input.status, current.status) : current.status;
  const patch = {
    project_id: projectId,
    version: input.version !== undefined ? text(input.version, current.version) : current.version,
    module_name: input.moduleName !== undefined ? text(input.moduleName, current.moduleName) : current.moduleName,
    title: input.title !== undefined ? text(input.title, current.title) : current.title,
    summary: input.summary !== undefined ? text(input.summary) : current.summary,
    status: nextStatus,
    chat_title: input.chatTitle !== undefined ? text(input.chatTitle) || null : current.chatTitle || null,
    chat_url: input.chatUrl !== undefined ? text(input.chatUrl) || null : current.chatUrl || null,
    release_url: input.releaseUrl !== undefined ? text(input.releaseUrl) || null : current.releaseUrl || null,
    download_url: input.downloadUrl !== undefined ? text(input.downloadUrl) || null : current.downloadUrl || null,
    test_summary: input.testSummary !== undefined ? text(input.testSummary) || null : current.testSummary || null,
    next_step: input.nextStep !== undefined ? text(input.nextStep) || null : current.nextStep || null,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : current.metadata || {},
    updated_at: now,
  };
  const { data, error } = await client.from("dev_center_versions").update(patch).eq("id", versionId).select("*").single();
  if (error) throw error;
  await client.from("dev_center_work_sessions").update({ project_id: projectId, module_name: patch.module_name, updated_at: now }).eq("version_id", versionId);
  const version = mapVersion(data);
  if (["completed","released"].includes(nextStatus) && nextStatus !== previousStatus) await stopDevWorkSession(versionId, { endedAt: now, note: `Automatikus leállítás: ${nextStatus}` });
  else if (nextStatus === "blocked" && nextStatus !== previousStatus) { const started = await startDevWorkSession(versionId, { source: "automatic", category: "waiting_blocked" }); if (started.ok) await switchDevWorkSessionCategory(versionId, { category: "waiting_blocked" }); }
  else if (nextStatus === "testing" && nextStatus !== previousStatus) { const started = await startDevWorkSession(versionId, { source: "automatic", category: "build_test" }); if (started.ok) await switchDevWorkSessionCategory(versionId, { category: "build_test" }); }
  else if (nextStatus === "in_progress" && nextStatus !== previousStatus) { const started = await startDevWorkSession(versionId, { source: "automatic", category: "active_development" }); if (started.ok) await switchDevWorkSessionCategory(versionId, { category: "active_development" }); }
  const state = await getDevCenterState();
  return { ok: true as const, version, workSessions: state.workSessions, state };
}

export async function startDevWorkSession(versionId: string, input: Record<string, unknown>) {
  const client = db();
  const version = await findVersion(client, versionId);
  if (!version) return { ok: false as const, error: "A fejlesztési verzió nem található." };
  const result = await startSessionRow(client, version, input);
  await client.from("dev_center_versions").update({ updated_at: nowIso() }).eq("id", versionId);
  const state = await getDevCenterState();
  const session = state.workSessions.find((item) => item.id === result.row.id)!;
  return { ok: true as const, session, alreadyRunning: result.alreadyRunning, state };
}

export async function stopDevWorkSession(versionId: string, input: Record<string, unknown>) {
  const client = db();
  const version = await findVersion(client, versionId);
  if (!version) return { ok: false as const, error: "A fejlesztési verzió nem található." };
  const row = await findOpenSession(client, versionId);
  if (!row) return { ok: false as const, error: "Ehhez a verzióhoz nincs futó munkamenet." };
  const now = nowIso();
  let endedAt = date(input.endedAt, now);
  if (new Date(endedAt).getTime() <= new Date(row.started_at).getTime()) endedAt = now;
  await closeOpenSegment(client, row.id, endedAt);
  const patch = { ended_at: endedAt, duration_minutes: minutes(row.started_at, endedAt), current_category: null, updated_at: now, note: text(input.note) || row.note || null };
  const { error } = await client.from("dev_center_work_sessions").update(patch).eq("id", row.id);
  if (error) throw error;
  await client.from("dev_center_versions").update({ updated_at: now }).eq("id", versionId);
  const state = await getDevCenterState();
  return { ok: true as const, session: state.workSessions.find((item) => item.id === row.id)!, state };
}

export async function switchDevWorkSessionCategory(versionId: string, input: Record<string, unknown>) {
  const client = db();
  const row = await findOpenSession(client, versionId);
  if (!row) return { ok: false as const, error: "Ehhez a verzióhoz nincs futó munkamenet." };
  const nextCategory = category(input.category, row.current_category || "active_development");
  if (row.current_category === nextCategory) {
    const state = await getDevCenterState();
    return { ok: true as const, session: state.workSessions.find((item) => item.id === row.id)!, category: nextCategory, state };
  }
  const changedAt = date(input.changedAt, nowIso());
  await closeOpenSegment(client, row.id, changedAt);
  const segment = { id: `segment_${randomUUID().slice(0, 12)}`, work_session_id: row.id, category: nextCategory, started_at: changedAt, ended_at: null, duration_minutes: null };
  const { error: segmentError } = await client.from("dev_center_work_segments").insert(segment);
  if (segmentError) throw segmentError;
  const now = nowIso();
  const { error } = await client.from("dev_center_work_sessions").update({ current_category: nextCategory, updated_at: now }).eq("id", row.id);
  if (error) throw error;
  await client.from("dev_center_versions").update({ updated_at: now }).eq("id", versionId);
  const state = await getDevCenterState();
  return { ok: true as const, session: state.workSessions.find((item) => item.id === row.id)!, category: nextCategory, state };
}

export async function addManualDevWorkSession(versionId: string, input: Record<string, unknown>) {
  const client = db();
  const version = await findVersion(client, versionId);
  if (!version) return { ok: false as const, error: "A fejlesztési verzió nem található." };
  const durationMinutes = Math.max(0, Math.round(Number(input.durationMinutes) || 0));
  if (!durationMinutes) return { ok: false as const, error: "A kézi időbejegyzéshez pozitív percszám szükséges." };
  const now = nowIso();
  const endedAt = date(input.endedAt, now);
  const startedAt = text(input.startedAt) ? date(input.startedAt, new Date(new Date(endedAt).getTime() - durationMinutes * 60000).toISOString()) : new Date(new Date(endedAt).getTime() - durationMinutes * 60000).toISOString();
  const workCategory = category(input.category, "active_development");
  const sessionId = `work_${randomUUID().slice(0, 12)}`;
  const row = { id: sessionId, version_id: version.id, project_id: version.projectId, module_name: text(input.moduleName, version.moduleName), started_at: startedAt, ended_at: endedAt, duration_minutes: durationMinutes, current_category: null, source: source(input.source, "manual"), note: text(input.note, "Kézzel rögzített fejlesztési idő."), created_at: now, updated_at: now };
  const { error } = await client.from("dev_center_work_sessions").insert(row);
  if (error) throw error;
  const { error: segmentError } = await client.from("dev_center_work_segments").insert({ id: `segment_${randomUUID().slice(0, 12)}`, work_session_id: sessionId, category: workCategory, started_at: startedAt, ended_at: endedAt, duration_minutes: durationMinutes });
  if (segmentError) throw segmentError;
  await client.from("dev_center_versions").update({ updated_at: now }).eq("id", versionId);
  const state = await getDevCenterState();
  return { ok: true as const, session: state.workSessions.find((item) => item.id === sessionId)!, state };
}

export async function completeDevVersion(versionId: string, input: Record<string, unknown>) {
  const client = db();
  const current = await findVersion(client, versionId);
  if (!current) return { ok: false as const, error: "A fejlesztési verzió nem található." };
  const now = nowIso();
  const completedAt = date(input.completedAt, now);
  const patch = {
    status: input.released === true ? "released" : "completed",
    completed_at: completedAt,
    updated_at: now,
    summary: input.summary !== undefined ? text(input.summary, current.summary) : current.summary,
    test_summary: input.testSummary !== undefined ? text(input.testSummary) || null : current.testSummary || null,
    release_url: input.releaseUrl !== undefined ? text(input.releaseUrl) || null : current.releaseUrl || null,
    download_url: input.downloadUrl !== undefined ? text(input.downloadUrl) || null : current.downloadUrl || null,
    next_step: input.nextStep !== undefined ? text(input.nextStep) || null : current.nextStep || null,
  };
  const { data, error } = await client.from("dev_center_versions").update(patch).eq("id", versionId).select("*").single();
  if (error) throw error;
  const open = await findOpenSession(client, versionId);
  if (open) await stopDevWorkSession(versionId, { endedAt: completedAt, note: "Automatikus lezárás a fejlesztés befejezésekor." });
  await client.from("dev_center_projects").update({ updated_at: now }).eq("id", current.projectId);
  const version = mapVersion(data);
  const state = await getDevCenterState();
  const project = state.projects.find((item) => item.id === version.projectId);
  const recipientUserId = process.env.DIMPRO_DEV_NOTIFICATION_USER_ID?.trim();
  if (recipientUserId) {
    await createNotification({ type: "SYSTEM_INFO", title: "DIMPRO fejlesztés elkészült", message: `${project?.name || "Egyéb fejlesztés"} ${version.version}: ${version.title}`, recipientUserIds: [recipientUserId], projectId: project?.id, projectName: project?.name, source: "server", sourceClient: "dimpro-dev-reporter", priority: "high", actionUrl: `/admin/dev?version=${encodeURIComponent(version.id)}#projektek`, metadata: { devVersionId: version.id, completedAt: version.completedAt, summary: version.summary } });
  }
  let pushResult: Awaited<ReturnType<typeof sendDevPushNotification>> | null = null;
  let pushError = "";
  try { pushResult = await sendDevPushNotification({ title: "DIMPRO fejlesztés elkészült", body: `${project?.name || "Egyéb fejlesztés"} ${version.version}: ${version.title}`, url: `/admin/dev?version=${encodeURIComponent(version.id)}#verziok`, tag: `dimpro-dev-complete-${version.id}`, priority: "high" }); }
  catch (error) { pushError = error instanceof Error ? error.message : "A push értesítés sikertelen."; }
  return { ok: true as const, version, project, workSessions: state.workSessions, state, notificationQueued: Boolean(recipientUserId), pushResult, pushError: pushError || undefined };
}
