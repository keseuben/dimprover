import { getProdReadiness } from "./prod-readiness";

export const PROD_READONLY_PROBE_IDS = [
  "PUBLIC_HEALTH",
  "RELEASE_METADATA",
  "SERVICE_STATUS_SUMMARY",
  "STORAGE_SUMMARY",
] as const;

export type ProdReadOnlyProbeId = typeof PROD_READONLY_PROBE_IDS[number];
export type ProdReadOnlyConnectorState = "DISABLED" | "REFERENCES_MISSING" | "FOUNDATION_READY" | "BLOCKED";

export type ProdReadOnlyConnectorReadiness = {
  phase: "P10_1_PROD_READONLY_CONNECTOR";
  state: ProdReadOnlyConnectorState;
  foundationReady: true;
  networkTransportImplemented: false;
  networkAccessAttempted: false;
  credentialResolved: false;
  references: {
    endpointConfigured: boolean;
    credentialConfigured: boolean;
    hostKeyConfigured: boolean;
    valuesExposed: false;
  };
  transportPolicy: {
    protocol: "SSH_READONLY_PLANNED";
    strictHostKeyChecking: true;
    batchMode: true;
    ttyAllowed: false;
    portForwardingAllowed: false;
    agentForwardingAllowed: false;
    remoteCommandStringsAcceptedFromBrowser: false;
    credentialValueReadableByBrowser: false;
    credentialValueReadableByAi: false;
    rawProdOutputReadableByAi: false;
  };
  probeCatalog: Array<{
    id: ProdReadOnlyProbeId;
    dataClass: "AUDIT_ONLY";
    mutating: false;
    shell: false;
  }>;
  forbiddenCapabilities: [
    "SHELL",
    "WRITE",
    "RESTART",
    "DEPLOY",
    "MIGRATION",
    "FILE_UPLOAD",
    "PORT_FORWARD",
    "AGENT_FORWARD",
    "RAW_PROD_TO_AI",
  ];
  blockers: string[];
  generatedAt: string;
};

function configuredReference(name: string) {
  const value = process.env[name]?.trim() || "";
  return Boolean(value && value.length <= 160 && /^[A-Za-z0-9_.:/-]+$/.test(value));
}

export function getProdReadOnlyConnectorReadiness(): ProdReadOnlyConnectorReadiness {
  const p10 = getProdReadiness();
  const endpointConfigured = configuredReference("BENJADMIN_PROD_READONLY_ENDPOINT_REF");
  const credentialConfigured = configuredReference("BENJADMIN_PROD_READONLY_CREDENTIAL_REF");
  const hostKeyConfigured = configuredReference("BENJADMIN_PROD_READONLY_HOSTKEY_REF");
  const blockers: string[] = [];

  if (!p10.readinessEnabled || !p10.connectorEnabled) blockers.push("P10 read-only connector feature gate OFF.");
  if (!endpointConfigured) blockers.push("PROD endpoint reference nincs konfigurálva.");
  if (!credentialConfigured) blockers.push("PROD credential reference nincs konfigurálva.");
  if (!hostKeyConfigured) blockers.push("PROD host-key reference nincs konfigurálva.");
  if (p10.state === "BLOCKED") blockers.push("P10 execution safety gate BLOCKED.");

  const blocked = p10.state === "BLOCKED";
  const refsReady = endpointConfigured && credentialConfigured && hostKeyConfigured;
  const state: ProdReadOnlyConnectorState = blocked
    ? "BLOCKED"
    : !p10.readinessEnabled || !p10.connectorEnabled
      ? "DISABLED"
      : !refsReady
        ? "REFERENCES_MISSING"
        : "FOUNDATION_READY";

  return {
    phase: "P10_1_PROD_READONLY_CONNECTOR",
    state,
    foundationReady: true,
    networkTransportImplemented: false,
    networkAccessAttempted: false,
    credentialResolved: false,
    references: {
      endpointConfigured,
      credentialConfigured,
      hostKeyConfigured,
      valuesExposed: false,
    },
    transportPolicy: {
      protocol: "SSH_READONLY_PLANNED",
      strictHostKeyChecking: true,
      batchMode: true,
      ttyAllowed: false,
      portForwardingAllowed: false,
      agentForwardingAllowed: false,
      remoteCommandStringsAcceptedFromBrowser: false,
      credentialValueReadableByBrowser: false,
      credentialValueReadableByAi: false,
      rawProdOutputReadableByAi: false,
    },
    probeCatalog: PROD_READONLY_PROBE_IDS.map((id) => ({ id, dataClass: "AUDIT_ONLY", mutating: false, shell: false })),
    forbiddenCapabilities: ["SHELL", "WRITE", "RESTART", "DEPLOY", "MIGRATION", "FILE_UPLOAD", "PORT_FORWARD", "AGENT_FORWARD", "RAW_PROD_TO_AI"],
    blockers,
    generatedAt: new Date().toISOString(),
  };
}
