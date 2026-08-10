import path from "node:path";
import { readFile, stat } from "node:fs/promises";

const DEV_WORKTREE_ROOT = "/srv/dimpro-dev/worktrees";

export class DevWorktreeValidationError extends Error {
  constructor(message: string, public code: string, public status = 409, public details?: unknown) {
    super(message);
  }
}

export async function validateDevGitWorktree(worktreePath: string, branchName: string) {
  const root = path.resolve(DEV_WORKTREE_ROOT);
  const target = path.resolve(worktreePath);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) {
    throw new DevWorktreeValidationError("A worktree útvonal kívül esik a DEV worktree gyökéren.", "DEV_CENTER_WORKTREE_PATH_INVALID", 400, { target });
  }

  let targetStat;
  try {
    targetStat = await stat(target);
  } catch {
    throw new DevWorktreeValidationError("A megadott DEV worktree nem létezik.", "DEV_CENTER_WORKTREE_NOT_FOUND", 409, { target });
  }
  if (!targetStat.isDirectory()) {
    throw new DevWorktreeValidationError("A megadott worktree útvonal nem könyvtár.", "DEV_CENTER_WORKTREE_NOT_DIRECTORY", 409, { target });
  }

  const gitMarkerPath = path.join(target, ".git");
  let gitMarkerStat;
  try {
    gitMarkerStat = await stat(gitMarkerPath);
  } catch {
    throw new DevWorktreeValidationError("A megadott könyvtár nem Git worktree.", "DEV_CENTER_WORKTREE_GIT_MARKER_MISSING", 409, { target });
  }

  let gitDir = gitMarkerPath;
  if (gitMarkerStat.isFile()) {
    const marker = (await readFile(gitMarkerPath, "utf8")).trim();
    const match = /^gitdir:\s*(.+)$/m.exec(marker);
    if (!match?.[1]) {
      throw new DevWorktreeValidationError("A Git worktree marker nem értelmezhető.", "DEV_CENTER_WORKTREE_GIT_MARKER_INVALID", 409, { target });
    }
    gitDir = path.isAbsolute(match[1]) ? path.normalize(match[1]) : path.resolve(target, match[1]);
  }

  let head = "";
  try {
    head = (await readFile(path.join(gitDir, "HEAD"), "utf8")).trim();
  } catch {
    throw new DevWorktreeValidationError("A Git worktree HEAD nem olvasható.", "DEV_CENTER_WORKTREE_HEAD_MISSING", 409, { target, gitDir });
  }

  const expectedHead = `ref: refs/heads/${branchName}`;
  if (head !== expectedHead) {
    throw new DevWorktreeValidationError("A worktree nem a sessionhöz rendelt branchre mutat.", "DEV_CENTER_WORKTREE_BRANCH_MISMATCH", 409, { target, branchName, head });
  }

  return { worktreePath: target, branchName, gitDir, head };
}
