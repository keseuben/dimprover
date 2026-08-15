import { getTerminalHubFeatureFlags } from "./config";

export type ProdReadinessState = "DISABLED" | "CONNECTOR_MISSING" | "READ_ONLY_READY" | "BLOCKED";

export type ProdReadiness = {
  phase: "P10_PROD_READINESS";
  foundationReady: true;
  state: ProdReadinessState;
  readinessEnabled: boolean;
  connectorEnabled: boolean;
  readOnlySmokeAllowed: boolean;
  blockers: string[];
  policy: {
    startMode: "PROD_START";
    productionDefault: "READ_ONLY";
    aiVisibility: "BLOCKED";
    browserDirectSsh: false;
    rawProdToAiAllowed: false;
    mutatingCommandsDefaultAllowed: false;
    explicitApprovalRequired: true;
    releaseGateRequired: true;
    rollbackPointRequired: true;
    separateConnectorRequired: true;
    terminalExecutionRequiredForReadOnlySmoke: false;
  };
  safety: {
    prodTerminalExecutionFlag: boolean;
    terminalExecutionFlag: boolean;
    windowsBridgeExecutionFlag: boolean;
    secretVaultStorageFlag: boolean;
  };
  generatedAt: string;
};

export function getProdReadiness(): ProdReadiness {
  const flags = getTerminalHubFeatureFlags();
  const blockers: string[] = [];
  if (!flags.terminalHubEnabled) blockers.push("Terminal Hub UI flag OFF.");
  if (!flags.prodReadinessEnabled) blockers.push("P10 PROD readiness flag OFF.");
  if (!flags.prodReadOnlyConnectorEnabled) blockers.push("Külön PROD read-only connector flag OFF.");
  if (flags.prodTerminalEnabled) blockers.push("PROD terminal execution flag ON — P10 readiness alatt tiltott.");
  if (flags.terminalExecutionEnabled) blockers.push("Terminal execution kill switch ON — PROD read-only smoke előtt tiltott.");
  if (flags.windowsBridgeExecutionEnabled) blockers.push("Windows Bridge execution ON — PROD readiness-szel nem kombinálható.");

  const hardBlocked = flags.prodTerminalEnabled || flags.terminalExecutionEnabled || flags.windowsBridgeExecutionEnabled;
  const readOnlySmokeAllowed = Boolean(flags.prodReadinessEnabled && flags.prodReadOnlyConnectorEnabled && !hardBlocked);
  const state: ProdReadinessState = hardBlocked
    ? "BLOCKED"
    : !flags.prodReadinessEnabled
      ? "DISABLED"
      : !flags.prodReadOnlyConnectorEnabled
        ? "CONNECTOR_MISSING"
        : "READ_ONLY_READY";

  return {
    phase: "P10_PROD_READINESS",
    foundationReady: true,
    state,
    readinessEnabled: flags.prodReadinessEnabled,
    connectorEnabled: flags.prodReadOnlyConnectorEnabled,
    readOnlySmokeAllowed,
    blockers,
    policy: {
      startMode: "PROD_START",
      productionDefault: "READ_ONLY",
      aiVisibility: "BLOCKED",
      browserDirectSsh: false,
      rawProdToAiAllowed: false,
      mutatingCommandsDefaultAllowed: false,
      explicitApprovalRequired: true,
      releaseGateRequired: true,
      rollbackPointRequired: true,
      separateConnectorRequired: true,
      terminalExecutionRequiredForReadOnlySmoke: false,
    },
    safety: {
      prodTerminalExecutionFlag: flags.prodTerminalEnabled,
      terminalExecutionFlag: flags.terminalExecutionEnabled,
      windowsBridgeExecutionFlag: flags.windowsBridgeExecutionEnabled,
      secretVaultStorageFlag: flags.secretVaultEnabled,
    },
    generatedAt: new Date().toISOString(),
  };
}
