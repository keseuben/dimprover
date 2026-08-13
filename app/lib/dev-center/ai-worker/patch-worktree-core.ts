import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(worktreePath: string, args: string[]) {
  try {
    const { stdout } = await execFileAsync("/usr/bin/git", ["-C", worktreePath, ...args], { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    const detail = error as { stderr?: string; message?: string };
    throw new Error(`M.Forge Git patch művelet sikertelen: ${(detail.stderr || detail.message || "ismeretlen hiba").slice(0, 800)}`);
  }
}

export async function applyPatchToVerifiedWorktree(input: {
  worktreePath: string;
  branchName: string;
  baselineCommit: string;
  patchPath: string;
  expectedPaths: string[];
}) {
  const [branch, head, statusBefore] = await Promise.all([
    git(input.worktreePath, ["branch", "--show-current"]),
    git(input.worktreePath, ["rev-parse", "HEAD"]),
    git(input.worktreePath, ["status", "--porcelain"]),
  ]);
  if (branch !== input.branchName || head !== input.baselineCommit) throw new Error("A M.Forge worktree branch/HEAD eltér a jóváhagyott JIT tervtől.");
  if (statusBefore) throw new Error("A M.Forge worktree nem tiszta a patch alkalmazása előtt.");
  let applied = false;
  try {
    await git(input.worktreePath, ["apply", "--check", "--whitespace=error-all", input.patchPath]);
    await git(input.worktreePath, ["apply", "--whitespace=error-all", input.patchPath]);
    applied = true;
    await git(input.worktreePath, ["diff", "--check"]);
    const [changedRaw, statusAfter] = await Promise.all([
      git(input.worktreePath, ["diff", "--name-only"]),
      git(input.worktreePath, ["status", "--porcelain"]),
    ]);
    const changedPaths = changedRaw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).sort();
    const expectedPaths = [...input.expectedPaths].sort();
    if (JSON.stringify(changedPaths) !== JSON.stringify(expectedPaths)) throw new Error(`A worktree tényleges diff pathjai eltérnek a validált artifacttól: ${changedPaths.join(", ")}`);
    if (statusAfter.split(/\r?\n/).some((line) => line.startsWith("??"))) throw new Error("A provider patch váratlan untracked fájlt hozott létre.");
    return { ok: true as const, branch, head, changedPaths, statusAfter };
  } catch (error) {
    if (applied) await git(input.worktreePath, ["reset", "--hard", input.baselineCommit]).catch(() => "");
    throw error;
  }
}

export async function resetVerifiedWorktree(worktreePath: string, baselineCommit: string) {
  await git(worktreePath, ["reset", "--hard", baselineCommit]);
  return { ok: true as const };
}
