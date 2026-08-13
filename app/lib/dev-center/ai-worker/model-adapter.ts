export type WorkerProviderId = "mock" | "openai" | "anthropic" | "other";
export type WorkerProviderRole = "MFORGE" | "VGUARD";

export type WorkerAdapterProbe = {
  provider: WorkerProviderId;
  label: string;
  configured: boolean;
  executionGateEnabled: boolean;
  executionImplemented: boolean;
  ready: boolean;
  modelId: string | null;
  roles: WorkerProviderRole[];
  detail: string;
};

export interface WorkerModelAdapter {
  provider: WorkerProviderId;
  label: string;
  roles: WorkerProviderRole[];
  executionImplemented: boolean;
  probe(): Promise<WorkerAdapterProbe>;
}

function gateEnabled() {
  return process.env.DIMPRO_EXTERNAL_AI_PROVIDER_EXECUTION_ENABLED?.trim().toLowerCase() === "true";
}

export const mockWorkerAdapter: WorkerModelAdapter & { modelId: string } = {
  provider: "mock",
  label: "BENJADMIN Mock",
  roles: ["MFORGE", "VGUARD"],
  executionImplemented: true,
  modelId: "BENJADMIN_V1_MOCK",
  async probe() {
    return {
      provider: "mock",
      label: "BENJADMIN Mock",
      configured: true,
      executionGateEnabled: false,
      executionImplemented: true,
      ready: true,
      modelId: "BENJADMIN_V1_MOCK",
      roles: ["MFORGE", "VGUARD"],
      detail: "V1.0 mock adapter: külső provider nem indul, PROD-hozzáférés nincs.",
    };
  },
};

export const openAiWorkerAdapter: WorkerModelAdapter = {
  provider: "openai",
  label: "OpenAI / Codex",
  roles: ["MFORGE", "VGUARD"],
  executionImplemented: false,
  async probe() {
    const configured = Boolean(process.env.OPENAI_API_KEY?.trim());
    const modelId = process.env.DIMPRO_EXTERNAL_AI_OPENAI_MODEL?.trim() || null;
    const executionGateEnabled = gateEnabled();
    return {
      provider: "openai",
      label: "OpenAI / Codex",
      configured: configured && Boolean(modelId),
      executionGateEnabled,
      executionImplemented: false,
      ready: false,
      modelId,
      roles: ["MFORGE", "VGUARD"],
      detail: !configured ? "Szerveroldali OpenAI secret nincs konfigurálva." : !modelId ? "OpenAI modell nincs kijelölve." : "Adapter contract előkészítve; tényleges provider executor V1.2 következő gate.",
    };
  },
};

export const anthropicWorkerAdapter: WorkerModelAdapter = {
  provider: "anthropic",
  label: "Anthropic / Claude",
  roles: ["MFORGE", "VGUARD"],
  executionImplemented: false,
  async probe() {
    const configured = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
    const modelId = process.env.DIMPRO_EXTERNAL_AI_CLAUDE_MODEL?.trim() || null;
    const executionGateEnabled = gateEnabled();
    return {
      provider: "anthropic",
      label: "Anthropic / Claude",
      configured: configured && Boolean(modelId),
      executionGateEnabled,
      executionImplemented: false,
      ready: false,
      modelId,
      roles: ["MFORGE", "VGUARD"],
      detail: !configured ? "Szerveroldali Anthropic secret nincs konfigurálva." : !modelId ? "Claude modell nincs kijelölve." : "Adapter contract előkészítve; tényleges provider executor V1.2 következő gate.",
    };
  },
};

export const workerModelAdapters: WorkerModelAdapter[] = [mockWorkerAdapter, openAiWorkerAdapter, anthropicWorkerAdapter];

export async function probeWorkerModelAdapters() {
  return Promise.all(workerModelAdapters.map((adapter) => adapter.probe()));
}

export async function resolveWorkerModelAdapter(preference: "AUTO" | "CLAUDE" | "OPENAI_CODEX", role: WorkerProviderRole) {
  const probes = await probeWorkerModelAdapters();
  const requested = preference === "CLAUDE" ? "anthropic" : preference === "OPENAI_CODEX" ? "openai" : null;
  if (requested) {
    const probe = probes.find((item) => item.provider === requested && item.roles.includes(role));
    return probe && probe.ready ? probe : null;
  }
  return probes.find((item) => item.provider !== "mock" && item.roles.includes(role) && item.ready) || null;
}
