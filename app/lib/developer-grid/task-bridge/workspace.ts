import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
export const TASK_BRIDGE_REPOSITORY = "/srv/dimpro-dev/repositories/dimprover.git";
export const TASK_BRIDGE_WORKTREE_ROOT = "/srv/dimpro-dev/worktrees";

async function exists(target: string) { try { await stat(target); return true; } catch { return false; } }
async function git(args: string[]) {
  const result = await execFileAsync("/usr/bin/git", args, { encoding: "utf8", timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
  return result.stdout.trim();
}

function slug(value: string, max = 36) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || "task";
}

export function taskBridgeBranchName(workerCode: string, taskId: string) {
  return `worker/${slug(workerCode, 24)}/${slug(taskId, 42)}`;
}

export function taskBridgeWorktreePath(workerCode: string, taskId: string) {
  return path.join(TASK_BRIDGE_WORKTREE_ROOT, taskBridgeBranchName(workerCode, taskId).replaceAll("/", "-"));
}

export function validateTaskBridgeWorkspacePlan(input: { workerCode: string; taskId: string; branchName: string; worktreePath: string; baseCommit: string }) {
  const branchName = taskBridgeBranchName(input.workerCode, input.taskId);
  const worktreePath = taskBridgeWorktreePath(input.workerCode, input.taskId);
  if (input.branchName !== branchName) throw new Error("A Task Bridge branch eltér a determinisztikus worker/task branchtől.");
  if (path.resolve(input.worktreePath) !== path.resolve(worktreePath)) throw new Error("A Task Bridge worktree eltér a determinisztikus DEV worktree-től.");
  if (!/^[0-9a-f]{40}$/i.test(input.baseCommit)) throw new Error("Érvénytelen Task Bridge base commit.");
  return { ...input, branchName, worktreePath, baseCommit: input.baseCommit.toLowerCase(), repositoryPath: TASK_BRIDGE_REPOSITORY };
}

export async function prepareTaskBridgeWorkspace(input: { workerCode: string; taskId: string; branchName: string; worktreePath: string; baseCommit: string }) {
  const plan = validateTaskBridgeWorkspacePlan(input);
  const live = await git(["--git-dir", TASK_BRIDGE_REPOSITORY, "rev-parse", "--verify", plan.baseCommit]);
  if (live !== plan.baseCommit) throw new Error("A Task Bridge base commit nem érhető el a canonical DEV repositoryban.");
  if (await exists(plan.worktreePath)) throw new Error("A Task Bridge worktree útvonal már létezik.");
  try {
    await execFileAsync("/usr/bin/git", ["--git-dir", TASK_BRIDGE_REPOSITORY, "show-ref", "--verify", "--quiet", `refs/heads/${plan.branchName}`], { timeout: 5_000 });
    throw new Error("A Task Bridge worker branch már létezik.");
  } catch (error) {
    if (error instanceof Error && error.message === "A Task Bridge worker branch már létezik.") throw error;
  }
  await git(["--git-dir", TASK_BRIDGE_REPOSITORY, "worktree", "add", "-b", plan.branchName, plan.worktreePath, plan.baseCommit]);
  const [branch, head] = await Promise.all([
    git(["-C", plan.worktreePath, "branch", "--show-current"]),
    git(["-C", plan.worktreePath, "rev-parse", "HEAD"]),
  ]);
  if (branch !== plan.branchName || head !== plan.baseCommit) {
    await removeTaskBridgeWorkspace(plan).catch(() => undefined);
    throw new Error("A Task Bridge worktree verifikációja sikertelen.");
  }
  return { ok: true as const, ...plan, branch, head };
}

export async function removeTaskBridgeWorkspace(input: { workerCode: string; taskId: string; branchName: string; worktreePath: string; baseCommit: string }) {
  const plan = validateTaskBridgeWorkspacePlan(input);
  if (await exists(plan.worktreePath)) await git(["--git-dir", TASK_BRIDGE_REPOSITORY, "worktree", "remove", "--force", plan.worktreePath]);
  try { await git(["--git-dir", TASK_BRIDGE_REPOSITORY, "branch", "-D", plan.branchName]); } catch { /* already absent */ }
  await git(["--git-dir", TASK_BRIDGE_REPOSITORY, "worktree", "prune"]);
  return { ok: true as const, branchName: plan.branchName, worktreePath: plan.worktreePath };
}

export async function inspectTaskBridgeGit(input: { worktreePath: string; branchName: string; baseCommit: string; resultCommit?: string | null }) {
  const [branch, head, status] = await Promise.all([
    git(["-C", input.worktreePath, "branch", "--show-current"]),
    git(["-C", input.worktreePath, "rev-parse", "HEAD"]),
    git(["-C", input.worktreePath, "status", "--porcelain", "--untracked-files=normal"]),
  ]);
  if (branch !== input.branchName) throw new Error("A Task Bridge result branch eltér a rögzített branchtől.");
  if (input.resultCommit && head !== input.resultCommit) throw new Error("A Task Bridge resultCommit nem egyezik a worktree HEAD-del.");
  await execFileAsync("/usr/bin/git", ["-C", input.worktreePath, "merge-base", "--is-ancestor", input.baseCommit, head], { timeout: 10_000 });
  const changedRaw = await git(["-C", input.worktreePath, "diff", "--name-only", input.baseCommit, head]);
  const changedPaths = changedRaw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).sort();
  await git(["-C", input.worktreePath, "diff", "--check", input.baseCommit, head]);
  return { branch, head, dirty: Boolean(status.trim()), status, changedPaths };
}
