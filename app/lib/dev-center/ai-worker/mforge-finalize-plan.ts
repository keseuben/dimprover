import path from "node:path";

export function validateMForgeFinalizePlan(input: {
  taskId: string;
  sessionId: string;
  branchName: string;
  worktreePath: string;
  baselineCommit: string;
  changedPaths: string[];
}) {
  if (!/^dev-task-[a-z0-9-]+$/i.test(input.taskId)) throw new Error("Érvénytelen M.Forge finalize task ID.");
  if (!/^dev-session-[a-z0-9-]+$/i.test(input.sessionId)) throw new Error("Érvénytelen M.Forge finalize session ID.");
  if (!/^worker\/mforge\/[a-z0-9-]+$/.test(input.branchName)) throw new Error("A finalize branch nem M.Forge branch.");
  if (!/^[0-9a-f]{40}$/i.test(input.baselineCommit)) throw new Error("Érvénytelen M.Forge finalize baseline commit.");
  const expectedWorktree = path.join("/srv/dimpro-dev/worktrees", input.branchName.replaceAll("/", "-"));
  if (path.resolve(input.worktreePath) !== expectedWorktree) throw new Error("A finalize worktree nem determinisztikus M.Forge DEV worktree.");
  const changedPaths = Array.from(new Set(input.changedPaths.map((value) => value.trim()).filter(Boolean))).sort();
  if (!changedPaths.length) throw new Error("A finalize changedPaths nem lehet üres.");
  for (const filePath of changedPaths) if (filePath.startsWith("/") || filePath.includes("..")) throw new Error(`Érvénytelen finalize path: ${filePath}`);
  return { ...input, worktreePath: expectedWorktree, changedPaths };
}
