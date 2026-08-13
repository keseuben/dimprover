export type ExternalProviderId = "openai" | "anthropic";

export type ExternalProviderExecutionRequest = {
  provider: ExternalProviderId;
  modelId: string;
  prompt: string;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type ExternalProviderExecutionResult = {
  provider: ExternalProviderId;
  providerRunId: string;
  modelId: string;
  outputText: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costHuf: number;
  durationMs: number;
  stopReason: string | null;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}
function finiteNonNegative(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
function positiveEnv(name: string) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : null;
}
function executionGateEnabled() {
  return process.env.DIMPRO_EXTERNAL_AI_PROVIDER_EXECUTION_ENABLED?.trim().toLowerCase() === "true";
}
function maxOutputTokens(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 8192;
  return Math.max(256, Math.min(32768, Math.round(parsed)));
}

export function externalProviderPricing(provider: ExternalProviderId) {
  const prefix = provider === "openai" ? "OPENAI" : "CLAUDE";
  const inputHufPerMillion = positiveEnv(`DIMPRO_EXTERNAL_AI_${prefix}_INPUT_HUF_PER_MTOKEN`);
  const outputHufPerMillion = positiveEnv(`DIMPRO_EXTERNAL_AI_${prefix}_OUTPUT_HUF_PER_MTOKEN`);
  return {
    configured: inputHufPerMillion !== null && outputHufPerMillion !== null,
    inputHufPerMillion,
    outputHufPerMillion,
  };
}

export function calculateExternalProviderCostHuf(provider: ExternalProviderId, inputTokens: number, outputTokens: number) {
  const pricing = externalProviderPricing(provider);
  if (!pricing.configured || pricing.inputHufPerMillion === null || pricing.outputHufPerMillion === null) {
    throw new Error(`A ${provider} provider HUF token-díjszabása nincs konfigurálva.`);
  }
  return inputTokens / 1_000_000 * pricing.inputHufPerMillion + outputTokens / 1_000_000 * pricing.outputHufPerMillion;
}

export function buildOpenAiProviderRequest(input: { modelId: string; prompt: string; maxOutputTokens?: number }, apiKey: string) {
  return {
    url: "https://api.openai.com/v1/responses",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: {
      model: input.modelId,
      input: input.prompt,
      max_output_tokens: maxOutputTokens(input.maxOutputTokens),
      store: false,
    },
  };
}

export function buildAnthropicProviderRequest(input: { modelId: string; prompt: string; maxOutputTokens?: number }, apiKey: string) {
  return {
    url: "https://api.anthropic.com/v1/messages",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: {
      model: input.modelId,
      max_tokens: maxOutputTokens(input.maxOutputTokens),
      messages: [{ role: "user", content: input.prompt }],
    },
  };
}

function openAiOutputText(payload: JsonRecord) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of output) {
    const content = Array.isArray(record(item).content) ? record(item).content as unknown[] : [];
    for (const block of content) {
      const row = record(block);
      if ((row.type === "output_text" || row.type === "text") && typeof row.text === "string") parts.push(row.text);
    }
  }
  return parts.join("\n").trim();
}

export function parseOpenAiProviderResponse(payload: unknown, modelId: string): ExternalProviderExecutionResult {
  const row = record(payload);
  const usage = record(row.usage);
  const inputTokens = finiteNonNegative(usage.input_tokens);
  const outputTokens = finiteNonNegative(usage.output_tokens);
  const totalTokens = finiteNonNegative(usage.total_tokens) || inputTokens + outputTokens;
  const outputText = openAiOutputText(row);
  if (!outputText) throw new Error("Az OpenAI Responses API nem adott feldolgozható szöveges kimenetet.");
  return {
    provider: "openai",
    providerRunId: typeof row.id === "string" ? row.id : "",
    modelId: typeof row.model === "string" ? row.model : modelId,
    outputText,
    inputTokens,
    outputTokens,
    totalTokens,
    costHuf: calculateExternalProviderCostHuf("openai", inputTokens, outputTokens),
    durationMs: 0,
    stopReason: typeof row.status === "string" ? row.status : null,
  };
}

export function parseAnthropicProviderResponse(payload: unknown, modelId: string): ExternalProviderExecutionResult {
  const row = record(payload);
  const usage = record(row.usage);
  const inputTokens = finiteNonNegative(usage.input_tokens);
  const outputTokens = finiteNonNegative(usage.output_tokens);
  const totalTokens = inputTokens + outputTokens;
  const content = Array.isArray(row.content) ? row.content : [];
  const outputText = content.map((item) => {
    const block = record(item);
    return block.type === "text" && typeof block.text === "string" ? block.text : "";
  }).filter(Boolean).join("\n").trim();
  if (!outputText) throw new Error("Az Anthropic Messages API nem adott feldolgozható szöveges kimenetet.");
  return {
    provider: "anthropic",
    providerRunId: typeof row.id === "string" ? row.id : "",
    modelId: typeof row.model === "string" ? row.model : modelId,
    outputText,
    inputTokens,
    outputTokens,
    totalTokens,
    costHuf: calculateExternalProviderCostHuf("anthropic", inputTokens, outputTokens),
    durationMs: 0,
    stopReason: typeof row.stop_reason === "string" ? row.stop_reason : null,
  };
}

export async function executeExternalAiProviderText(input: ExternalProviderExecutionRequest): Promise<ExternalProviderExecutionResult> {
  if (!executionGateEnabled()) throw new Error("A külső AI provider execution global gate ki van kapcsolva.");
  if (!input.modelId.trim()) throw new Error("A provider modell nincs kijelölve.");
  if (!input.prompt.trim()) throw new Error("A provider prompt üres.");
  if (!externalProviderPricing(input.provider).configured) throw new Error("A provider HUF token-díjszabása nincs konfigurálva.");

  const apiKey = input.provider === "openai" ? process.env.OPENAI_API_KEY?.trim() : process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error(`A ${input.provider} provider szerveroldali secretje nincs konfigurálva.`);

  const request = input.provider === "openai"
    ? buildOpenAiProviderRequest(input, apiKey)
    : buildAnthropicProviderRequest(input, apiKey);
  const timeoutSignal = AbortSignal.timeout(300_000);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
  const startedAt = Date.now();
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal,
    redirect: "error",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${input.provider} provider HTTP ${response.status}; a provider hiba részlete nem kerül továbbításra.`);
  }
  const parsed = input.provider === "openai"
    ? parseOpenAiProviderResponse(payload, input.modelId)
    : parseAnthropicProviderResponse(payload, input.modelId);
  return { ...parsed, durationMs: Date.now() - startedAt };
}
