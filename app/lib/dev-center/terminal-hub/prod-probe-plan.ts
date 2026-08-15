import {
  getProdReadOnlyConnectorReadiness,
  PROD_READONLY_PROBE_IDS,
  type ProdReadOnlyProbeId,
} from "./prod-readonly-connector";

export const PROD_PROBE_PLAN_VERSION = "1.0" as const;

export type ProdProbeAdapterAction =
  | "READ_PUBLIC_HEALTH"
  | "READ_RELEASE_METADATA"
  | "READ_SERVICE_STATUS_SUMMARY"
  | "READ_STORAGE_SUMMARY";

export type ProdReadOnlyProbePlan = {
  phase: "P10_2_PROD_PROBE_PLAN";
  planVersion: typeof PROD_PROBE_PLAN_VERSION;
  probeId: ProdReadOnlyProbeId;
  adapterAction: ProdProbeAdapterAction;
  executionAvailable: false;
  networkAccessAttempted: false;
  referencesResolved: false;
  commandStringPresent: false;
  inputPolicy: {
    browserMaySupplyProbeIdOnly: true;
    browserMaySupplyCommand: false;
    browserMaySupplyHost: false;
    browserMaySupplyCredential: false;
  };
  limits: {
    timeoutMs: number;
    maxOutputBytes: number;
  };
  outputPolicy: {
    dataClass: "AUDIT_ONLY";
    sanitizeRequired: true;
    auditRequired: true;
    rawOutputToAiAllowed: false;
    persistRawOutput: false;
  };
  steps: ReadonlyArray<{
    id: "VERIFY_REFERENCE_STATE" | "VERIFY_HOST_KEY_POLICY" | "INVOKE_FIXED_ADAPTER" | "SANITIZE_AND_AUDIT";
    execution: false;
  }>;
};

type ProbeSpec = {
  adapterAction: ProdProbeAdapterAction;
  timeoutMs: number;
  maxOutputBytes: number;
};

const PROBE_SPECS: Record<ProdReadOnlyProbeId, ProbeSpec> = Object.freeze({
  PUBLIC_HEALTH: Object.freeze({ adapterAction: "READ_PUBLIC_HEALTH", timeoutMs: 5_000, maxOutputBytes: 8_192 }),
  RELEASE_METADATA: Object.freeze({ adapterAction: "READ_RELEASE_METADATA", timeoutMs: 5_000, maxOutputBytes: 16_384 }),
  SERVICE_STATUS_SUMMARY: Object.freeze({ adapterAction: "READ_SERVICE_STATUS_SUMMARY", timeoutMs: 7_500, maxOutputBytes: 16_384 }),
  STORAGE_SUMMARY: Object.freeze({ adapterAction: "READ_STORAGE_SUMMARY", timeoutMs: 7_500, maxOutputBytes: 16_384 }),
});

function isProbeId(value: string): value is ProdReadOnlyProbeId {
  return (PROD_READONLY_PROBE_IDS as readonly string[]).includes(value);
}

export class ProdProbePlanError extends Error {
  constructor(message: string, public code: string, public status = 400) {
    super(message);
    this.name = "ProdProbePlanError";
  }
}

export function compileProdReadOnlyProbePlan(input: { probeId: string }): ProdReadOnlyProbePlan {
  const probeId = input.probeId.trim().toUpperCase();
  if (!isProbeId(probeId)) {
    throw new ProdProbePlanError("Nem engedélyezett PROD read-only probe azonosító.", "PROD_PROBE_NOT_ALLOWLISTED", 400);
  }

  const connector = getProdReadOnlyConnectorReadiness();
  if (connector.state === "BLOCKED") {
    throw new ProdProbePlanError("A PROD connector safety gate BLOCKED.", "PROD_PROBE_CONNECTOR_BLOCKED", 409);
  }
  if (connector.state !== "FOUNDATION_READY") {
    throw new ProdProbePlanError("A PROD read-only connector foundation még nem READY.", "PROD_PROBE_CONNECTOR_NOT_READY", 409);
  }

  const spec = PROBE_SPECS[probeId];
  return Object.freeze({
    phase: "P10_2_PROD_PROBE_PLAN",
    planVersion: PROD_PROBE_PLAN_VERSION,
    probeId,
    adapterAction: spec.adapterAction,
    executionAvailable: false,
    networkAccessAttempted: false,
    referencesResolved: false,
    commandStringPresent: false,
    inputPolicy: Object.freeze({
      browserMaySupplyProbeIdOnly: true,
      browserMaySupplyCommand: false,
      browserMaySupplyHost: false,
      browserMaySupplyCredential: false,
    }),
    limits: Object.freeze({ timeoutMs: spec.timeoutMs, maxOutputBytes: spec.maxOutputBytes }),
    outputPolicy: Object.freeze({
      dataClass: "AUDIT_ONLY",
      sanitizeRequired: true,
      auditRequired: true,
      rawOutputToAiAllowed: false,
      persistRawOutput: false,
    }),
    steps: Object.freeze([
      Object.freeze({ id: "VERIFY_REFERENCE_STATE" as const, execution: false as const }),
      Object.freeze({ id: "VERIFY_HOST_KEY_POLICY" as const, execution: false as const }),
      Object.freeze({ id: "INVOKE_FIXED_ADAPTER" as const, execution: false as const }),
      Object.freeze({ id: "SANITIZE_AND_AUDIT" as const, execution: false as const }),
    ]),
  });
}
