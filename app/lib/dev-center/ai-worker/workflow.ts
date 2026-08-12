export const EXTERNAL_AI_WORKER_VERSION = "1.0";
export const EXTERNAL_AI_WORKFLOW = "EXTERNAL_AI_WORKER_V1";
export const EXTERNAL_AI_WORKFLOW_STATES = [
  "DRAFT",
  "READY",
  "PREFLIGHT",
  "RUNNING_FORGE",
  "WORKER_DONE",
  "REVIEW_GUARD",
  "APPROVED",
  "BENJADMIN_GATE",
  "DEV_READY",
  "USER_APPROVED",
  "DEV_INTEGRATED",
  "HUMAN_DECISION_REQUIRED",
  "PAUSED",
  "FAILED",
] as const;
export type ExternalAiWorkflowState = typeof EXTERNAL_AI_WORKFLOW_STATES[number];
export type ExternalAiLaunchMode = "QUICK" | "WORKER" | "PARALLEL";
export type ExternalAiModelPreference = "AUTO" | "CLAUDE" | "OPENAI_CODEX";

export const EXTERNAL_AI_DEFAULTS = {
  taskBudgetHuf: 2500,
  forgeBudgetHuf: 1500,
  guardBudgetHuf: 1000,
  maxActiveMinutesPerWorker: 45,
  maxFixRounds: 2,
  warningPercent: 75,
  strongWarningPercent: 90,
  hardStopPercent: 100,
} as const;

const fullTransitionMap: Record<ExternalAiWorkflowState, ExternalAiWorkflowState[]> = {
  DRAFT: ["READY", "FAILED"],
  READY: ["PREFLIGHT", "PAUSED", "FAILED"],
  PREFLIGHT: ["RUNNING_FORGE", "PAUSED", "FAILED"],
  RUNNING_FORGE: ["WORKER_DONE", "PAUSED", "FAILED"],
  WORKER_DONE: ["REVIEW_GUARD", "FAILED"],
  REVIEW_GUARD: ["APPROVED", "RUNNING_FORGE", "HUMAN_DECISION_REQUIRED", "FAILED"],
  APPROVED: ["BENJADMIN_GATE", "FAILED"],
  BENJADMIN_GATE: ["DEV_READY", "RUNNING_FORGE", "FAILED"],
  DEV_READY: ["USER_APPROVED", "FAILED"],
  USER_APPROVED: ["DEV_INTEGRATED", "FAILED"],
  DEV_INTEGRATED: [],
  HUMAN_DECISION_REQUIRED: ["RUNNING_FORGE", "FAILED"],
  PAUSED: ["READY", "PREFLIGHT", "RUNNING_FORGE", "FAILED"],
  FAILED: [],
};

const v10Transitions: Partial<Record<ExternalAiWorkflowState, ExternalAiWorkflowState[]>> = {
  DRAFT: ["READY"],
  READY: ["PAUSED"],
  PAUSED: ["READY"],
};

export function canTransitionExternalAiWorkerState(from: ExternalAiWorkflowState, to: ExternalAiWorkflowState) {
  return fullTransitionMap[from].includes(to);
}

export function isV10TransitionImplemented(from: ExternalAiWorkflowState, to: ExternalAiWorkflowState) {
  return (v10Transitions[from] || []).includes(to);
}

export function normalizeExternalAiWorkflowState(value: unknown): ExternalAiWorkflowState {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return EXTERNAL_AI_WORKFLOW_STATES.includes(normalized as ExternalAiWorkflowState) ? normalized as ExternalAiWorkflowState : "DRAFT";
}
