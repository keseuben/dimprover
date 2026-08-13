export type WorkerProviderId = "mock" | "openai" | "anthropic" | "other";
export type WorkerProviderRole = "MFORGE" | "VGUARD";

export type WorkerAdapterProbe = {
  provider: WorkerProviderId;
  label: string;
  configured: boolean;
  secretConfigured: boolean;
  modelConfigured: boolean;
  pricingConfigured: boolean;
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
function positive(name: string) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0;
}
function pricingConfigured(provider: "openai" | "anthropic") {
  const prefix = provider === "openai" ? "OPENAI" : "CLAUDE";
  return positive(`DIMPRO_EXTERNAL_AI_${prefix}_INPUT_HUF_PER_MTOKEN`) && positive(`DIMPRO_EXTERNAL_AI_${prefix}_OUTPUT_HUF_PER_MTOKEN`);
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
      secretConfigured: false,
      modelConfigured: true,
      pricingConfigured: false,
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
  executionImplemented: true,
  async probe() {
    const secretConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
    const modelId = process.env.DIMPRO_EXTERNAL_AI_OPENAI_MODEL?.trim() || null;
    const modelConfigured = Boolean(modelId);
    const pricing = pricingConfigured("openai");
    const executionGateEnabled = gateEnabled();
    const configured = secretConfigured && modelConfigured && pricing;
    const ready = configured && executionGateEnabled;
    return {
      provider: "openai",
      label: "OpenAI / Codex",
      configured,
      secretConfigured,
      modelConfigured,
      pricingConfigured: pricing,
      executionGateEnabled,
      executionImplemented: true,
      ready,
      modelId,
      roles: ["MFORGE", "VGUARD"],
      detail: !secretConfigured ? "Szerveroldali OpenAI secret nincs konfigurálva." : !modelConfigured ? "OpenAI modell nincs kijelölve." : !pricing ? "OpenAI HUF token-díjszabás nincs konfigurálva." : !executionGateEnabled ? "OpenAI executor kész; a global execution gate ki van kapcsolva." : "OpenAI Responses API executor READY.",
    };
  },
};

export const anthropicWorkerAdapter: WorkerModelAdapter = {
  provider: "anthropic",
  label: "Anthropic / Claude",
  roles: ["MFORGE", "VGUARD"],
  executionImplemented: true,
  async probe() {
    const secretConfigured = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
    const modelId = process.env.DIMPRO_EXTERNAL_AI_CLAUDE_MODEL?.trim() || null;
    const modelConfigured = Boolean(modelId);
    const pricing = pricingConfigured("anthropic");
    const executionGateEnabled = gateEnabled();
    const configured = secretConfigured && modelConfigured && pricing;
    const ready = configured && executionGateEnabled;
    return {
      provider: "anthropic",
      label: "Anthropic / Claude",
      configured,
      secretConfigured,
      modelConfigured,
      pricingConfigured: pricing,
      executionGateEnabled,
      executionImplemented: true,
      ready,
      modelId,
      roles: ["MFORGE", "VGUARD"],
      detail: !secretConfigured ? "Szerveroldali Anthropic secret nincs konfigurálva." : !modelConfigured ? "Claude modell nincs kijelölve." : !pricing ? "Claude HUF token-díjszabás nincs konfigurálva." : !executionGateEnabled ? "Anthropic executor kész; a global execution gate ki van kapcsolva." : "Anthropic Messages API executor READY.",
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
