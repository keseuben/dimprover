import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import type { DevelopmentPlane } from "./partner-isolation";
import { worktreeRootForPlane } from "./partner-isolation";

export class DevWorktreeValidationError extends Error {
  constructor(message: string, public code: string, public status = 409, public details?: unknown) {
    super(message);
  }
}

export async function validateGitWorktreeForPlane(worktreePath: string, branchName: string, plane: DevelopmentPlane) {
  const root = path.resolve(worktreeRootForPlane(plane));
  const target = path.resolve(worktreePath);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) {
    throw new DevWorktreeValidationError(
      plane === "PARTNER"
        ? "A partner worktree útvonal kívül esik a Partner Development Plane gyökéren."
        : "A worktree útvonal kívül esik a DEV worktree gyökéren.",
      plane === "PARTNER" ? "PARTNER_WORKTREE_PATH_DENIED" : "DEV_CENTER_WORKTREE_PATH_INVALID",
      400,
      { target, plane, root },
    );
  }

  let targetStat;
  try {
    targetStat = await stat(target);
  } catch {
    throw new DevWorktreeValidationError(
      plane === "PARTNER" ? "A megadott partner worktree nem létezik." : "A megadott DEV worktree nem létezik.",
      plane === "PARTNER" ? "PARTNER_WORKTREE_NOT_FOUND" : "DEV_CENTER_WORKTREE_NOT_FOUND",
      409,
      { target, plane, root },
    );
  }
  if (!targetStat.isDirectory()) {
    throw new DevWorktreeValidationError("A megadott worktree útvonal nem könyvtár.", "DEV_CENTER_WORKTREE_NOT_DIRECTORY", 409, { target, plane, root });
  }

  const gitMarkerPath = path.join(target, ".git");
  let gitMarkerStat;
  try {
    gitMarkerStat = await stat(gitMarkerPath);
  } catch {
    throw new DevWorktreeValidationError("A megadott könyvtár nem Git worktree.", "DEV_CENTER_WORKTREE_GIT_MARKER_MISSING", 409, { target, plane, root });
  }

  let gitDir = gitMarkerPath;
  if (gitMarkerStat.isFile()) {
    const marker = (await readFile(gitMarkerPath, "utf8")).trim();
    const match = /^gitdir:\s*(.+)$/m.exec(marker);
    if (!match?.[1]) {
      throw new DevWorktreeValidationError("A Git worktree marker nem értelmezhető.", "DEV_CENTER_WORKTREE_GIT_MARKER_INVALID", 409, { target, plane, root });
    }
    gitDir = path.isAbsolute(match[1]) ? path.normalize(match[1]) : path.resolve(target, match[1]);
  }

  let head = "";
  try {
    head = (await readFile(path.join(gitDir, "HEAD"), "utf8")).trim();
  } catch {
    throw new DevWorktreeValidationError("A Git worktree HEAD nem olvasható.", "DEV_CENTER_WORKTREE_HEAD_MISSING", 409, { target, gitDir, plane, root });
  }

  const expectedHead = `ref: refs/heads/${branchName}`;
  if (head !== expectedHead) {
    throw new DevWorktreeValidationError("A worktree nem a sessionhöz rendelt branchre mutat.", "DEV_CENTER_WORKTREE_BRANCH_MISMATCH", 409, { target, branchName, head, plane, root });
  }

  return { worktreePath: target, branchName, gitDir, head, plane, root };
}

export async function validateDevGitWorktree(worktreePath: string, branchName: string) {
  return validateGitWorktreeForPlane(worktreePath, branchName, "INTERNAL");
}
