import type { DevEngineOperation } from "../engine-types";

export type ExternalAiWorkerCode = "MFORGE" | "VGUARD";

export const EXTERNAL_AI_WORKER_IDS: Record<ExternalAiWorkerCode, string> = {
  MFORGE: "worker_mforge",
  VGUARD: "worker_vguard",
};

export const EXTERNAL_AI_WORKER_OPERATION_POLICY: Record<ExternalAiWorkerCode, readonly DevEngineOperation[]> = {
  MFORGE: ["write", "build", "test"],
  VGUARD: ["build", "test"],
};

export function isExternalAiWorkerCode(value: unknown): value is ExternalAiWorkerCode {
  return value === "MFORGE" || value === "VGUARD";
}

export function externalAiWorkerOperationAllowed(workerCode: ExternalAiWorkerCode, operation: DevEngineOperation) {
  return EXTERNAL_AI_WORKER_OPERATION_POLICY[workerCode].includes(operation);
}
