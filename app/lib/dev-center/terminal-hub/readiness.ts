import { getTerminalHubFeatureFlags } from "./config";
import { getTerminalOsIdentityReadiness } from "./os-identity";

export type TerminalCoreReadiness = {
  ready: boolean;
  phase: "P2_DEV_TERMINAL_CORE";
  blockers: string[];
  osIdentity: { label: string; uid: number; gid: number } | null;
  executionEnabled: boolean;
  prodTerminalEnabled: boolean;
  liveWorkspaceEnabled: boolean;
  windowsBridgeEnabled: boolean;
};

export function getTerminalCoreReadiness(): TerminalCoreReadiness {
  const flags = getTerminalHubFeatureFlags();
  const identity = getTerminalOsIdentityReadiness();
  const blockers: string[] = [];
  if (!flags.terminalHubEnabled) blockers.push("Terminal Hub UI flag OFF.");
  if (!flags.terminalExecutionEnabled) blockers.push("Terminal execution kill switch OFF.");
  if (flags.prodTerminalEnabled) blockers.push("PROD terminal flag P2-ben nem lehet ON.");
  if (flags.liveWorkspaceEnabled) blockers.push("Live Workspace P4 előtt nem lehet ON.");
  if (flags.windowsBridgeEnabled) blockers.push("Windows Bridge P8 előtt nem lehet ON.");
  if (!identity.ready) blockers.push(identity.blocker || "A terminál OS-identitás nem READY.");
  return {
    ready: blockers.length === 0,
    phase: "P2_DEV_TERMINAL_CORE",
    blockers,
    osIdentity: identity.ready && identity.identity ? { label: identity.identity.label, uid: identity.identity.uid, gid: identity.identity.gid } : null,
    executionEnabled: flags.terminalExecutionEnabled,
    prodTerminalEnabled: flags.prodTerminalEnabled,
    liveWorkspaceEnabled: flags.liveWorkspaceEnabled,
    windowsBridgeEnabled: flags.windowsBridgeEnabled,
  };
}
