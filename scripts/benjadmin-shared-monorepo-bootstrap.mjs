import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile?.(".env.local"); } catch {}
const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
if (!url || !key) throw new Error("DEV Supabase app environment missing");
if (os.hostname() !== "dimpro-dev") throw new Error("Fail-closed: shared monorepo bootstrap csak a dimpro-dev hoston futtatható.");

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const expectedProjects = ["project_dimprover", "project_dimpro", "project_drive_drop", "project_fajlmuhely", "project_infrastructure"];
const repoResult = await db.from("dev_center_repositories").select("id,project_id,name,status,dev_path,metadata").eq("id", "repo_dimprover").single();
if (repoResult.error) throw repoResult.error;
const repo = repoResult.data;
if (repo.project_id !== "project_dimprover" || repo.status !== "active" || repo.dev_path !== "/srv/dimpro-dev/repositories/dimprover.git") throw new Error("Fail-closed: repo_dimprover identity/path/status eltér a várt DEV monorepo állapottól.");
const projects = await db.from("dev_center_projects").select("id,status").in("id", expectedProjects);
if (projects.error) throw projects.error;
const present = new Set((projects.data || []).map((row) => row.id));
if (!expectedProjects.every((id) => present.has(id))) throw new Error("Fail-closed: nem minden elvárt belső logikai projekt létezik.");

const nextMetadata = {
  ...(repo.metadata || {}),
  sharedInternalMonorepo: true,
  internalProjectIds: expectedProjects,
  scopeLockRepositoryId: "repo_dimprover",
  bindingVersion: 1,
  bindingOrigin: "BENJADMIN_DEVELOPER_CONSOLE_V1",
};
console.log(JSON.stringify({ ok: true, apply, repository: repo.id, projects: expectedProjects, currentShared: repo.metadata?.sharedInternalMonorepo === true, nextShared: true }, null, 2));
if (!apply) process.exit(0);

const stamp = new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
const backupDir = path.join(process.cwd(), ".dimprover", "backups", `shared-monorepo-${stamp}`);
await mkdir(backupDir, { recursive: true, mode: 0o700 });
await writeFile(path.join(backupDir, "repo_dimprover_before.json"), `${JSON.stringify(repo, null, 2)}\n`, { mode: 0o600 });
const update = await db.from("dev_center_repositories").update({ metadata: nextMetadata, updated_at: new Date().toISOString() }).eq("id", "repo_dimprover").eq("project_id", "project_dimprover").select("id,project_id,status,dev_path,metadata").single();
if (update.error) throw update.error;
if (update.data?.metadata?.sharedInternalMonorepo !== true || !expectedProjects.every((id) => update.data?.metadata?.internalProjectIds?.includes(id))) throw new Error("Shared monorepo metadata verification failed after update.");
console.log(JSON.stringify({ applied: true, backupDir, repository: update.data.id, bindingVersion: update.data.metadata.bindingVersion, projectCount: update.data.metadata.internalProjectIds.length }, null, 2));
