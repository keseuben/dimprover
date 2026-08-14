import type { TerminalHubFeatureFlags } from "./types";

function flag(name: string, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(value);
}

export function getTerminalHubFeatureFlags(): TerminalHubFeatureFlags {
  const terminalHubEnabled = flag("BENJADMIN_TERMINAL_HUB_ENABLED", false);
  return {
    terminalHubEnabled,
    liveWorkspaceEnabled: terminalHubEnabled && flag("BENJADMIN_LIVE_WORKSPACE_ENABLED", false),
    terminalExecutionEnabled: terminalHubEnabled && flag("BENJADMIN_TERMINAL_EXECUTION_ENABLED", false),
    desktopBridgeEnabled: terminalHubEnabled && flag("BENJADMIN_DESKTOP_BRIDGE_ENABLED", false),
  };
}

export const TERMINAL_HUB_WORKSPACE_ROOTS = [
  "/srv/dimpro-dev/worktrees",
  "/srv/partner-dev/worktrees",
] as const;
