import path from "node:path";

export function validateMForgePatchApplyPlan(input: {
  taskId: string;
  sessionId: string;
  worktreePath: string;
  branchName: string;
  baselineCommit: string;
  allowedPaths: string[];
  changedPaths: string[];
}) {
  if (!/^dev-task-[a-z0-9-]+$/i.test(input.taskId)) throw new Error("Érvénytelen patch task ID.");
  if (!/^dev-session-[a-z0-9-]+$/i.test(input.sessionId)) throw new Error("Érvénytelen patch session ID.");
  if (!/^worker\/mforge\/[a-z0-9-]+$/.test(input.branchName)) throw new Error("A patch branch nem M.Forge branch.");
  if (!/^[0-9a-f]{40}$/i.test(input.baselineCommit)) throw new Error("Érvénytelen patch baseline commit.");
  const expectedPath = path.join("/srv/dimpro-dev/worktrees", input.branchName.replaceAll("/", "-"));
  if (path.resolve(input.worktreePath) !== expectedPath) throw new Error("A patch worktree path nem determinisztikus M.Forge DEV path.");
  if (!input.allowedPaths.length || !input.changedPaths.length) throw new Error("A patch scope/changedPaths nem lehet üres.");
  const allowed = new Set(input.allowedPaths);
  for (const filePath of input.changedPaths) {
    if (!allowed.has(filePath)) throw new Error(`A patch scope-on kívüli fájlt módosít: ${filePath}`);
    if (filePath.startsWith("/") || filePath.includes("..")) throw new Error(`Érvénytelen patch path: ${filePath}`);
  }
  return { ...input, worktreePath: expectedPath, allowedPaths: [...input.allowedPaths], changedPaths: [...input.changedPaths] };
}
