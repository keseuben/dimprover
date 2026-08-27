import { readFile, stat } from "node:fs/promises";

export const DEFAULT_COORDINATION_ROOT = "/srv/dimpro-dev/coordination";

export type ExclusiveOperationState = {
  lockPath: string;
  statePath: string;
  lockFilePresent: boolean;
  activeOperation: Record<string, unknown> | null;
  checkedAt: string;
};

export async function readExclusiveOperationState(coordinationRoot = DEFAULT_COORDINATION_ROOT): Promise<ExclusiveOperationState> {
  const lockPath = `${coordinationRoot}/locks/exclusive-operation.lock`;
  const statePath = `${coordinationRoot}/active-development.json`;
  let lockFilePresent = false;
  let activeOperation: Record<string, unknown> | null = null;
  try {
    lockFilePresent = (await stat(lockPath)).isFile();
  } catch {}
  try {
    activeOperation = JSON.parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
  } catch {}
  return { lockPath, statePath, lockFilePresent, activeOperation, checkedAt: new Date().toISOString() };
}

export function requireCoordinatedExclusiveOperation(state: ExclusiveOperationState, expectedOperation: "build" | "release" | "restart") {
  if (!state.lockFilePresent || state.activeOperation?.operation !== expectedOperation || state.activeOperation?.status !== "running") {
    const error = new Error(`Központi exclusive coordination lock szükséges: ${expectedOperation}.`);
    Object.assign(error, { code: "EXCLUSIVE_COORDINATION_LOCK_REQUIRED", state });
    throw error;
  }
  return state;
}
