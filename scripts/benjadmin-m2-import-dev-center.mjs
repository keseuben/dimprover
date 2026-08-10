import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

async function readEnv(file) {
  const raw = await fs.readFile(file, "utf8");
  return Object.fromEntries(raw.split(/\r?\n/).filter((line) => line && !line.startsWith("#")).map((line) => {
    const index = line.indexOf("=");
    return index > 0 ? [line.slice(0, index), line.slice(index + 1)] : [line, ""];
  }));
}
const root = process.cwd();
const env = await readEnv(path.join(root, ".env.local"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing DEV Supabase environment.");
const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const state = JSON.parse(await fs.readFile(path.join(root, ".data/dimpro-dev-center/state.json"), "utf8"));

const projects = state.projects.map((item) => ({
  id: item.id, name: item.name, slug: item.slug, category: item.category, description: item.description || "",
  status: item.status, accent: item.accent, started_at: item.startedAt, created_at: item.createdAt,
  updated_at: item.updatedAt, metadata: { importedFrom: "state.json", importedAt: new Date().toISOString() },
}));
const projectResult = await client.from("dev_center_projects").upsert(projects, { onConflict: "id" });
if (projectResult.error) throw projectResult.error;

const versions = state.versions.map((item) => ({
  id: item.id, project_id: item.projectId, version: item.version, module_name: item.moduleName,
  title: item.title, summary: item.summary || "", status: item.status, started_at: item.startedAt,
  completed_at: item.completedAt || null, updated_at: item.updatedAt, chat_title: item.chatTitle || null,
  chat_url: item.chatUrl || null, release_url: item.releaseUrl || null, download_url: item.downloadUrl || null,
  test_summary: item.testSummary || null, next_step: item.nextStep || null, created_by: item.createdBy || null,
  metadata: { ...(item.metadata || {}), importedFrom: "state.json" },
}));
const versionResult = await client.from("dev_center_versions").upsert(versions, { onConflict: "id" });
if (versionResult.error) throw versionResult.error;

const workSessions = state.workSessions.map((item) => ({
  id: item.id, version_id: item.versionId, project_id: item.projectId, module_name: item.moduleName,
  started_at: item.startedAt, ended_at: item.endedAt || null, duration_minutes: item.durationMinutes ?? null,
  current_category: item.currentCategory || null, source: item.source, note: item.note || null,
  created_at: item.createdAt, updated_at: item.updatedAt,
}));
if (workSessions.length) {
  const result = await client.from("dev_center_work_sessions").upsert(workSessions, { onConflict: "id" });
  if (result.error) throw result.error;
}
const segments = state.workSessions.flatMap((session) => (session.timeSegments || []).map((segment) => ({
  id: segment.id, work_session_id: session.id, category: segment.category, started_at: segment.startedAt,
  ended_at: segment.endedAt || null, duration_minutes: segment.durationMinutes ?? null,
})));
if (segments.length) {
  const result = await client.from("dev_center_work_segments").upsert(segments, { onConflict: "id" });
  if (result.error) throw result.error;
}

const repoResult = await client.from("dev_center_repositories").upsert({
  id: "repo_dimprover", project_id: "project_dimprover", name: "DIMPROVER monorepo",
  default_branch: "main", dev_path: "/srv/dimpro-dev/repositories/dimprover.git", status: "active",
  metadata: { environment: "DEV", branchStrategy: "worktree" }, updated_at: new Date().toISOString(),
}, { onConflict: "id" });
if (repoResult.error) throw repoResult.error;

const auditResult = await client.from("dev_center_audit_events").insert({
  id: `dev-audit-import-${Date.now()}`, actor_type: "system", actor_id: "BenAI", action: "LEGACY_STATE_IMPORTED",
  entity_type: "dev_center", summary: "Legacy Development Center JSON state imported to PostgreSQL.",
  metadata: { projects: projects.length, versions: versions.length, workSessions: workSessions.length, segments: segments.length },
});
if (auditResult.error) throw auditResult.error;
console.log(JSON.stringify({ ok: true, projects: projects.length, versions: versions.length, workSessions: workSessions.length, segments: segments.length, repository: "repo_dimprover" }));
