import path from "node:path";

export type MForgeJitWorkspacePlan = {
  taskId: string;
  workerId: "worker_mforge";
  workerCode: "MFORGE";
  environmentId: "env_dev";
  repositoryId: "repo_dimprover";
  baselineCommit: string;
  branchName: string;
  worktreePath: string;
  scope: Array<{ type: string; key: string }>;
};

const WORKTREE_ROOT = "/srv/dimpro-dev/worktrees";

export function validateMForgeJitWorkspacePlan(input: Record<string, unknown>): MForgeJitWorkspacePlan {
  const taskId = typeof input.taskId === "string" ? input.taskId.trim() : "";
  const workerId = typeof input.workerId === "string" ? input.workerId.trim() : "";
  const workerCode = typeof input.workerCode === "string" ? input.workerCode.trim().toUpperCase() : "";
  const environmentId = typeof input.environmentId === "string" ? input.environmentId.trim() : "";
  const repositoryId = typeof input.repositoryId === "string" ? input.repositoryId.trim() : "";
  const baselineCommit = typeof input.baselineCommit === "string" ? input.baselineCommit.trim().toLowerCase() : "";
  const branchName = typeof input.branchName === "string" ? input.branchName.trim() : "";
  const worktreePath = typeof input.worktreePath === "string" ? path.resolve(input.worktreePath) : "";
  const scope = Array.isArray(input.scope)
    ? input.scope.map((item) => item && typeof item === "object" ? item as Record<string, unknown> : {}).map((item) => ({ type: typeof item.type === "string" ? item.type.trim() : "", key: typeof item.key === "string" ? item.key.trim() : "" })).filter((item) => item.type && item.key)
    : [];

  if (!/^dev-task-[a-z0-9-]+$/i.test(taskId)) throw new Error("Érvénytelen M.Forge task ID.");
  if (workerId !== "worker_mforge" || workerCode !== "MFORGE") throw new Error("A JIT workspace kizárólag M.Forge workerhez készíthető.");
  if (environmentId !== "env_dev") throw new Error("M.Forge JIT workspace kizárólag env_dev környezetben készíthető.");
  if (repositoryId !== "repo_dimprover") throw new Error("M.Forge JIT workspace csak a közös repo_dimprover repositoryt használhatja.");
  if (!/^[0-9a-f]{40}$/.test(baselineCommit)) throw new Error("Érvénytelen trusted baseline commit.");
  if (!/^worker\/mforge\/[a-z0-9-]+$/.test(branchName)) throw new Error("Érvénytelen M.Forge branch név.");
  const expectedPath = path.join(WORKTREE_ROOT, branchName.replaceAll("/", "-"));
  if (worktreePath !== expectedPath) throw new Error("A M.Forge worktree path eltér a branchből determinisztikusan számított DEV path-tól.");
  if (!scope.length || scope.some((item) => item.type !== "path" || item.key.startsWith("/") || item.key.includes(".."))) throw new Error("A JIT workspace kizárólag relatív GREEN path scope-pal indítható.");

  return { taskId, workerId: "worker_mforge", workerCode: "MFORGE", environmentId: "env_dev", repositoryId: "repo_dimprover", baselineCommit, branchName, worktreePath, scope };
}
