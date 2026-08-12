import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

const execFileAsync = promisify(execFile);
const EXPECTED_REPOSITORY_ID = "repo_dimprover";
const EXPECTED_REPOSITORY_PATH = "/srv/dimpro-dev/repositories/dimprover.git";
const EXPECTED_BASELINE_REF = "refs/heads/integration/benjadmin-dev";
const WORKTREE_ROOT = "/srv/dimpro-dev/worktrees";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function metadata(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export function safeWorkerBranchName(input: { workerCode: string; taskId: string }) {
  const worker = input.workerCode.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "worker";
  const task = input.taskId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(-32) || "task";
  return `worker/${worker}/${task}`;
}

export function safeWorkerWorktreePath(input: { workerCode: string; taskId: string }) {
  const branch = safeWorkerBranchName(input).replaceAll("/", "-");
  return path.join(WORKTREE_ROOT, branch);
}

async function gitRefCommit(gitDir: string, ref: string) {
  try {
    const { stdout } = await execFileAsync("/usr/bin/git", ["--git-dir", gitDir, "rev-parse", "--verify", ref], { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 });
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function getInternalExecutorReadiness(db: SupabaseClient) {
  const blockers: string[] = [];
  const repoResult = await db.from("dev_center_repositories").select("id,project_id,status,dev_path,metadata").eq("id", EXPECTED_REPOSITORY_ID).maybeSingle();
  if (repoResult.error) blockers.push("A belső repository állapota nem olvasható.");
  const repo = repoResult.data || null;
  const repoMeta = metadata(repo?.metadata);
  const repositoryReady = Boolean(repo && repo.status === "active" && repo.dev_path === EXPECTED_REPOSITORY_PATH && repoMeta.sharedInternalMonorepo === true && repoMeta.scopeLockRepositoryId === EXPECTED_REPOSITORY_ID);
  if (!repositoryReady) blockers.push("A közös belső monorepo-kötés nem READY.");

  const configuredBaselineRef = text(repoMeta.trustedBaselineRef) || EXPECTED_BASELINE_REF;
  const configuredBaselineCommit = text(repoMeta.trustedBaselineCommit);
  const liveBaselineCommit = repositoryReady ? await gitRefCommit(EXPECTED_REPOSITORY_PATH, configuredBaselineRef) : "";
  const baselineReady = Boolean(liveBaselineCommit && configuredBaselineRef === EXPECTED_BASELINE_REF && configuredBaselineCommit === liveBaselineCommit);
  if (!baselineReady) blockers.push("A trusted DEV baseline ref még nincs rögzítve vagy eltér a repository metadata állapotától.");

  const providerConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const executorConfigured = Boolean(process.env.DIMPRO_BENJADMIN_WORKER_EXECUTOR_URL?.trim());
  if (!providerConfigured) blockers.push("Az AI provider szerveroldali kulcsa nincs konfigurálva.");
  if (!executorConfigured) blockers.push("A natív BENJADMIN worker executor nincs konfigurálva.");

  return {
    ready: repositoryReady && baselineReady && providerConfigured && executorConfigured,
    repositoryReady,
    repositoryId: repo?.id || EXPECTED_REPOSITORY_ID,
    repositoryPath: repo?.dev_path || null,
    baselineReady,
    baselineRef: configuredBaselineRef,
    baselineCommit: liveBaselineCommit || null,
    providerConfigured,
    executorConfigured,
    worktreeRoot: WORKTREE_ROOT,
    blockers,
  };
}
