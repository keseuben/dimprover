import type { TerminalHubFeatureFlags } from "./types";

function flag(name: string, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(value);
}

export function getTerminalHubFeatureFlags(): TerminalHubFeatureFlags {
  const terminalHubEnabled = flag("BENJADMIN_TERMINAL_HUB_ENABLED", false);
  const liveWorkspaceEnabled = terminalHubEnabled && flag("BENJADMIN_LIVE_WORKSPACE_ENABLED", false);
  return {
    terminalHubEnabled,
    commandLibraryEnabled: terminalHubEnabled && flag("BENJADMIN_COMMAND_LIBRARY_ENABLED", false),
    liveWorkspaceEnabled,
    workspaceActivityEnabled: liveWorkspaceEnabled && flag("BENJADMIN_WORKSPACE_ACTIVITY_ENABLED", false),
    multiPanelEnabled: terminalHubEnabled && flag("BENJADMIN_MULTI_PANEL_ENABLED", false),
    windowsBridgeEnabled: terminalHubEnabled && flag("BENJADMIN_WINDOWS_BRIDGE_ENABLED", false),
    prodTerminalEnabled: terminalHubEnabled && flag("BENJADMIN_PROD_TERMINAL_ENABLED", false),
    secretVaultEnabled: terminalHubEnabled && flag("BENJADMIN_SECRET_VAULT_ENABLED", false),
    // Implementation-only extra kill switch: the 06 plan flags stay authoritative.
    terminalExecutionEnabled: terminalHubEnabled && flag("BENJADMIN_TERMINAL_EXECUTION_ENABLED", false),
  };
}

export const TERMINAL_HUB_WORKSPACE_ROOTS = [
  "/srv/dimpro-dev/worktrees",
  "/srv/partner-dev/worktrees",
] as const;
