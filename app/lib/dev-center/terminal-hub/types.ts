export type TerminalKind = "benjadmin-managed" | "powershell" | "ssh-dev" | "ssh-prod" | "git";
export type AiVisibilityMode = "blocked" | "filtered" | "allowed";
export type CommandRisk = "safe" | "controlled" | "destructive";
export type TerminalDataClass = "raw" | "sanitized" | "audit";
export type TerminalEnvironment = "DEV" | "STAG" | "PROD" | "LOCAL";

export type TerminalHubFeatureFlags = {
  terminalHubEnabled: boolean;
  liveWorkspaceEnabled: boolean;
  terminalExecutionEnabled: boolean;
  desktopBridgeEnabled: boolean;
};

export type TerminalEndpointSummary = {
  kind: TerminalKind;
  label: string;
  environment: TerminalEnvironment;
  aiVisibility: AiVisibilityMode;
  executionEnabled: boolean;
  risk: CommandRisk;
  state: "READY" | "ONLINE" | "LOCKED" | "DISABLED" | "PLANNED";
  note: string;
};

export type TerminalHubStatus = {
  phase: "P0_P1_UI_SHELL";
  features: TerminalHubFeatureFlags;
  endpoints: TerminalEndpointSummary[];
  security: {
    dataClasses: TerminalDataClass[];
    rawPolicy: "AUTHORIZED_UI_ONLY";
    sanitizedPolicy: "AI_FILTERED_ONLY";
    auditPolicy: "MASKED_METADATA_ONLY";
    redactionPipeline: "CONTRACT_ONLY" | "READY";
    prodAiDefault: "blocked";
  };
  coordination: {
    managedCommandsRequireCentralLock: true;
    exclusiveOperationBusy: boolean;
    lockReadable: boolean;
  };
  workspace: {
    policy: "ALLOWLIST_FIRST";
    watcherEnabled: boolean;
    configuredRootCount: number;
    pathTraversalPolicy: "FAIL_CLOSED";
    symlinkPolicy: "FAIL_CLOSED";
  };
  generatedAt: string;
};
