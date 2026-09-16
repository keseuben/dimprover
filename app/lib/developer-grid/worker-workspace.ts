import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
export const DEVELOPER_WORKER_REPOSITORY = "/srv/dimpro-dev/repositories/dimprover.git";
export const DEVELOPER_WORKER_WORKTREE_ROOT = "/srv/dimpro-dev/worktrees";

function slug(value: string, max = 42) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || "task";
}
async function exists(target: string) { try { await stat(target); return true; } catch { return false; } }
async function git(args: string[]) {
  const result = await execFileAsync("/usr/bin/git", args, { encoding: "utf8", timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
  return result.stdout.trim();
}
async function branchCommit(branchName: string) {
  try { return await git(["--git-dir", DEVELOPER_WORKER_REPOSITORY, "rev-parse", "--verify", `refs/heads/${branchName}`]); }
  catch { return ""; }
}

export function developerWorkerBranchName(workerCode: string, taskId: string) {
  return `worker/${slug(workerCode, 24)}/${slug(taskId, 42)}`;
}
export function developerWorkerWorktreePath(workerCode: string, taskId: string) {
  return path.join(DEVELOPER_WORKER_WORKTREE_ROOT, developerWorkerBranchName(workerCode, taskId).replaceAll("/", "-"));
}

export async function ensureDeveloperWorkerWorkspace(input: { workerCode: string; taskId: string; baseCommit: string }) {
  const baseCommit = String(input.baseCommit || "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(baseCommit)) throw Object.assign(new Error("A worker workspace teljes 40 karakteres base commitot igényel."), { code:"DEVELOPER_WORKSPACE_BASE_INVALID" });
  const branchName = developerWorkerBranchName(input.workerCode, input.taskId);
  const worktreePath = developerWorkerWorktreePath(input.workerCode, input.taskId);
  const liveBase = await git(["--git-dir", DEVELOPER_WORKER_REPOSITORY, "rev-parse", "--verify", baseCommit]);
  if (liveBase !== baseCommit) throw Object.assign(new Error("A worker workspace base commit nem érhető el a canonical DEV repositoryban."), { code:"DEVELOPER_WORKSPACE_BASE_MISSING" });

  if (await exists(worktreePath)) {
    const [branch, head, dirty] = await Promise.all([
      git(["-C", worktreePath, "branch", "--show-current"]),
      git(["-C", worktreePath, "rev-parse", "HEAD"]),
      git(["-C", worktreePath, "status", "--porcelain", "--untracked-files=normal"]),
    ]);
    if (branch !== branchName || head !== baseCommit || dirty.trim()) {
      throw Object.assign(new Error("A meglévő task-worktree nem egyezik a determinisztikus branch/base/clean állapottal."), { code:"DEVELOPER_WORKSPACE_EXISTING_MISMATCH", details:{ branch, head, dirty:Boolean(dirty.trim()) } });
    }
    return { ok:true as const, repository:DEVELOPER_WORKER_REPOSITORY, branchName, worktreePath, head, reused:true };
  }

  const existingBranchCommit = await branchCommit(branchName);
  if (existingBranchCommit && existingBranchCommit !== baseCommit) {
    throw Object.assign(new Error("A determinisztikus worker branch már létezik eltérő commiton."), { code:"DEVELOPER_WORKSPACE_BRANCH_MISMATCH", details:{ branchName, existingBranchCommit, baseCommit } });
  }
  if (existingBranchCommit) await git(["--git-dir", DEVELOPER_WORKER_REPOSITORY, "worktree", "add", worktreePath, branchName]);
  else await git(["--git-dir", DEVELOPER_WORKER_REPOSITORY, "worktree", "add", "-b", branchName, worktreePath, baseCommit]);

  const [branch, head, dirty] = await Promise.all([
    git(["-C", worktreePath, "branch", "--show-current"]),
    git(["-C", worktreePath, "rev-parse", "HEAD"]),
    git(["-C", worktreePath, "status", "--porcelain", "--untracked-files=normal"]),
  ]);
  if (branch !== branchName || head !== baseCommit || dirty.trim()) {
    throw Object.assign(new Error("A létrehozott worker worktree verifikációja sikertelen."), { code:"DEVELOPER_WORKSPACE_VERIFY_FAILED", details:{ branch, head, dirty:Boolean(dirty.trim()) } });
  }
  return { ok:true as const, repository:DEVELOPER_WORKER_REPOSITORY, branchName, worktreePath, head, reused:false };
}
