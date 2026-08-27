import type { GridHandoff } from "./types";

export function validateGridHandoff(handoff: GridHandoff) {
  const errors: string[] = [];
  if (!handoff.taskId) errors.push("taskId hiányzik");
  if (!handoff.branch) errors.push("branch hiányzik");
  if (!handoff.worktree) errors.push("worktree hiányzik");
  if (!/^[0-9a-f]{40}$/i.test(handoff.startHead)) errors.push("startHead hibás");
  if (!/^[0-9a-f]{40}$/i.test(handoff.endHead)) errors.push("endHead hibás");
  if (handoff.productionAccess !== "DENY") errors.push("PROD DENY sérült");
  if (!handoff.nextStep.trim()) errors.push("nextStep hiányzik");
  return { ok: errors.length === 0, errors };
}
