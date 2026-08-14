import { getTerminalHubFeatureFlags } from "./config";

export const WINDOWS_BRIDGE_PROTOCOL_VERSION = 1 as const;
export const WINDOWS_BRIDGE_PAIRING_MAX_AGE_SECONDS = 600 as const;

export type WindowsBridgeTransport = "OUTBOUND_HTTPS_ONLY";
export type WindowsBridgeCredentialStore = "WINDOWS_CREDENTIAL_MANAGER_OR_DPAPI";
export type WindowsBridgeConnectionState = "DISABLED" | "FOUNDATION_READY" | "PAIRING_DISABLED" | "EXECUTION_DISABLED" | "PLANNED_AGENT";
export type WindowsBridgeCapability = "powershell" | "terminal-resize" | "terminal-reconnect" | "raw-sanitized-audit";

export type WindowsBridgeReadiness = {
  phase: "P8_WINDOWS_BRIDGE_FOUNDATION";
  protocolVersion: 1;
  foundationReady: true;
  bridgeEnabled: boolean;
  pairingEnabled: boolean;
  executionEnabled: boolean;
  state: WindowsBridgeConnectionState;
  blockers: string[];
  security: {
    transport: WindowsBridgeTransport;
    browserDirectProcessAccess: false;
    browserLocalhostBridgeAccess: false;
    inboundPortRequired: false;
    localAgentRequired: true;
    credentialStore: WindowsBridgeCredentialStore;
    oneTimePairingMaxAgeSeconds: 600;
    prodExecutionAllowed: false;
    rawPolicy: "AUTHORIZED_UI_ONLY";
    sanitizedPolicy: "AI_FILTERED_ONLY";
    auditPolicy: "MASKED_METADATA_ONLY";
  };
  plannedCapabilities: WindowsBridgeCapability[];
  generatedAt: string;
};

export type WindowsBridgeAgentHello = {
  protocolVersion: 1;
  agentId: string;
  deviceLabel: string;
  osVersion: string;
  powershellVersion: string;
  capabilities: WindowsBridgeCapability[];
  nonce: string;
  sentAt: string;
};

export type WindowsBridgeHeartbeat = {
  protocolVersion: 1;
  agentId: string;
  sessionId: string;
  sentAt: string;
};

export function getWindowsBridgeReadiness(): WindowsBridgeReadiness {
  const flags = getTerminalHubFeatureFlags();
  const blockers: string[] = [];
  if (!flags.terminalHubEnabled) blockers.push("Terminal Hub UI flag OFF.");
  if (!flags.windowsBridgeEnabled) blockers.push("Windows Bridge feature flag OFF.");
  if (!flags.windowsBridgePairingEnabled) blockers.push("Windows Bridge pairing kill switch OFF.");
  if (!flags.windowsBridgeExecutionEnabled) blockers.push("Windows Bridge execution kill switch OFF.");
  if (flags.prodTerminalEnabled) blockers.push("PROD terminal nem kapcsolható össze a P8 Windows Bridge-dzsel.");

  const state: WindowsBridgeConnectionState = !flags.windowsBridgeEnabled
    ? "DISABLED"
    : !flags.windowsBridgePairingEnabled
      ? "PAIRING_DISABLED"
      : !flags.windowsBridgeExecutionEnabled
        ? "EXECUTION_DISABLED"
        : "PLANNED_AGENT";

  return {
    phase: "P8_WINDOWS_BRIDGE_FOUNDATION",
    protocolVersion: WINDOWS_BRIDGE_PROTOCOL_VERSION,
    foundationReady: true,
    bridgeEnabled: flags.windowsBridgeEnabled,
    pairingEnabled: flags.windowsBridgePairingEnabled,
    executionEnabled: flags.windowsBridgeExecutionEnabled,
    state,
    blockers,
    security: {
      transport: "OUTBOUND_HTTPS_ONLY",
      browserDirectProcessAccess: false,
      browserLocalhostBridgeAccess: false,
      inboundPortRequired: false,
      localAgentRequired: true,
      credentialStore: "WINDOWS_CREDENTIAL_MANAGER_OR_DPAPI",
      oneTimePairingMaxAgeSeconds: WINDOWS_BRIDGE_PAIRING_MAX_AGE_SECONDS,
      prodExecutionAllowed: false,
      rawPolicy: "AUTHORIZED_UI_ONLY",
      sanitizedPolicy: "AI_FILTERED_ONLY",
      auditPolicy: "MASKED_METADATA_ONLY",
    },
    plannedCapabilities: ["powershell", "terminal-resize", "terminal-reconnect", "raw-sanitized-audit"],
    generatedAt: new Date().toISOString(),
  };
}
