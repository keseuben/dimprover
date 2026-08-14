import type { AiVisibilityMode } from "./types";

export interface BenjadminTerminalEvent<TType extends string, TPayload> {
  id: string;
  type: TType;
  timestamp: string;
  actor: {
    userId?: string;
    workerId?: string;
  };
  environment: "local" | "dev" | "prod";
  projectId?: string;
  worktree?: string;
  payload: TPayload;
  security: {
    aiVisibility: AiVisibilityMode;
    containsSecrets: boolean;
    sanitized: boolean;
  };
}
