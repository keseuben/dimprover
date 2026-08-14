import { readFile } from "node:fs/promises";
import { getTerminalHubFeatureFlags, TERMINAL_HUB_WORKSPACE_ROOTS } from "./config";
import type { TerminalEndpointSummary, TerminalHubStatus } from "./types";

const LOCK_PATH = "/srv/dimpro-dev/coordination/locks/exclusive-operation.lock";

async function readExclusiveLock() {
  try {
    const value = (await readFile(LOCK_PATH, "utf8")).trim();
    return { lockReadable: true, exclusiveOperationBusy: Boolean(value) };
  } catch {
    return { lockReadable: false, exclusiveOperationBusy: false };
  }
}

export async function getTerminalHubStatus(): Promise<TerminalHubStatus> {
  const features = getTerminalHubFeatureFlags();
  const lock = await readExclusiveLock();
  const endpoints: TerminalEndpointSummary[] = [
    {
      kind: "benjadmin-managed",
      label: "BENJADMIN Managed",
      environment: "DEV",
      aiVisibility: "filtered",
      executionEnabled: false,
      risk: "controlled",
      state: features.terminalHubEnabled ? "READY" : "DISABLED",
      note: "P1 kezelőfelület; valódi managed command végrehajtás P2-ben készül.",
    },
    {
      kind: "ssh-dev",
      label: "DEV VPS",
      environment: "DEV",
      aiVisibility: "filtered",
      executionEnabled: false,
      risk: "controlled",
      state: "ONLINE",
      note: "Közvetlen böngészős SSH nincs. P2-ben csak szerveroldali gateway/managed művelet engedhető.",
    },
    {
      kind: "ssh-prod",
      label: "PROD VPS",
      environment: "PROD",
      aiVisibility: "blocked",
      executionEnabled: false,
      risk: "destructive",
      state: "LOCKED",
      note: "PROD alapból zárt és AI számára tiltott. Külön release/approval folyamat szükséges.",
    },
    {
      kind: "powershell",
      label: "Windows PowerShell",
      environment: "LOCAL",
      aiVisibility: "filtered",
      executionEnabled: false,
      risk: "controlled",
      state: "PLANNED",
      note: "Desktop Bridge csak P8-ban készül; a webes UI nem indíthat helyi PowerShell processzt.",
    },
    {
      kind: "git",
      label: "Git Managed",
      environment: "DEV",
      aiVisibility: "filtered",
      executionEnabled: false,
      risk: "controlled",
      state: "PLANNED",
      note: "Status/diff/log kontrollált service-en keresztül kerülhet be későbbi fázisban.",
    },
  ];

  return {
    phase: "P0_P1_UI_SHELL",
    features,
    endpoints,
    security: {
      dataClasses: ["raw", "sanitized", "audit"],
      rawPolicy: "AUTHORIZED_UI_ONLY",
      sanitizedPolicy: "AI_FILTERED_ONLY",
      auditPolicy: "MASKED_METADATA_ONLY",
      redactionPipeline: "CONTRACT_ONLY",
      prodAiDefault: "blocked",
    },
    coordination: {
      managedCommandsRequireCentralLock: true,
      ...lock,
    },
    workspace: {
      policy: "ALLOWLIST_FIRST",
      watcherEnabled: false,
      configuredRootCount: TERMINAL_HUB_WORKSPACE_ROOTS.length,
      pathTraversalPolicy: "FAIL_CLOSED",
      symlinkPolicy: "FAIL_CLOSED",
      denyPolicy: "SENSITIVE_AND_BUILD_ARTIFACTS",
    },
    generatedAt: new Date().toISOString(),
  };
}
