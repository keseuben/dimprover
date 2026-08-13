export const EXTERNAL_AI_RUN_COORDINATOR_VERSION = "1.2a";
export const EXTERNAL_AI_RUN_LAUNCH_STEPS = [
  "RUN_READINESS",
  "SESSION_OPEN",
  "BENAI_ASSIGNED",
  "MFORGE_BOUND",
  "TASK_CLAIM",
  "BRANCH_BIND",
  "WORKTREE_CREATE",
  "WORKTREE_BIND",
  "SCOPE_LEASE",
  "WRITE_AUTHORIZATION",
  "PROVIDER_START",
  "USAGE_STREAM",
  "OUTPUT_ARTIFACT",
  "WORKER_DONE",
  "SESSION_CLEANUP",
] as const;

export function getExternalAiRunLaunchPlan(taskId: string) {
  return {
    version: EXTERNAL_AI_RUN_COORDINATOR_VERSION,
    taskId,
    workerId: "worker_mforge",
    workerCode: "MFORGE",
    environmentId: "env_dev",
    productionAccess: "DENY",
    justInTimeWorkspace: true,
    cleanupGuaranteed: true,
    steps: [...EXTERNAL_AI_RUN_LAUNCH_STEPS],
  };
}
