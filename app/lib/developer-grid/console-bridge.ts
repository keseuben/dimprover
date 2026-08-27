"server-only";
import { getDeveloperConsoleWorkspaceActivitySource } from "@/app/lib/dev-center/developer-console";
import { DEVELOPER_GRID_TASK_ID, DEVELOPER_GRID_WORKTREE } from "./foundation";
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const row = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export async function getDeveloperConsoleGridBridge() {
  const checkedAt = new Date().toISOString();
  try {
    const source = await getDeveloperConsoleWorkspaceActivitySource();
    const tasks = Array.isArray(source.tasks) ? source.tasks.map(row) : [];
    const sessions = Array.isArray(source.sessions) ? source.sessions.map(row) : [];
    const workers = Array.isArray(source.workers) ? source.workers.map(row) : [];
    const task = tasks.find((item) => text(item.id) === DEVELOPER_GRID_TASK_ID) || tasks.find((item) => text(item.worktree_path) === DEVELOPER_GRID_WORKTREE) || null;
    const session = sessions.find((item) => text(item.task_id) === DEVELOPER_GRID_TASK_ID) || sessions.find((item) => text(item.worktree_path) === DEVELOPER_GRID_WORKTREE) || null;
    const workerId = text(session?.worker_id || task?.assigned_worker_id);
    const worker = workers.find((item) => text(item.id) === workerId || text(item.code).toUpperCase() === "OUTMINAI") || null;
    return { connected: true, source: "BENJADMIN_DEVELOPER_CONSOLE" as const, task, session, worker, authoritativeContextSource: "TASK_SESSION_PROVENANCE" as const, presenceAuthoritative: false as const, checkedAt, reason: task || session ? "Developer Console task/session bridge resolved." : "Developer Console elérhető; a külön Developer Grid task/session még nincs a központi store-ban materializálva." };
  } catch (error) {
    return { connected: false, source: "BENJADMIN_DEVELOPER_CONSOLE" as const, task: null, session: null, worker: null, authoritativeContextSource: "TASK_SESSION_PROVENANCE" as const, presenceAuthoritative: false as const, checkedAt, reason: error instanceof Error ? error.message : "Developer Console bridge nem érhető el." };
  }
}
