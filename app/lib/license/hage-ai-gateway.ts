import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getServerPublicKeyBase64, verifyLicenseToken } from "./crypto";
import { readLicenseStore } from "./store";
import { getHageAiIdentityPolicyMode, readCentralHageAiPolicyDecision } from "@/app/lib/identity-core/hage-ai-policy";
import type { HageAiFeatureId, LicenseAiUserAccess, LicenseRecord, LicenseTokenPayload } from "./types";

export type HageAiScope = "personal" | "hage";

export type HageAiGatewayCredentials = {
  licenseToken: string;
  licenseKey: string;
  machineIdHash: string;
  appId: string;
  appVersion: string;
  userId?: string;
  userName: string;
};

export type HageAiGatewayRequest = HageAiGatewayCredentials & {
  scope: HageAiScope;
  action?: HageAiFeatureId;
  context?: unknown;
  note?: unknown;
};

type AiActionDefinition = {
  label: string;
  icon: string;
  description: string;
  maxOutputTokens: number;
  typicalInputTokens: number;
};

type AiUsageRecord = {
  id: string;
  createdAt: string;
  licenseId: string;
  companyId: string;
  companyName: string;
  aiUserId: string;
  userId: string;
  userName: string;
  scope: HageAiScope;
  action: HageAiFeatureId;
  actionLabel: string;
  model: string;
  status: "success" | "error";
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  estimatedCostHuf: number;
  costUsd: number;
  costHuf: number;
  durationMs: number;
  responseId?: string;
  errorMessage?: string;
  policySource?: "central_identity" | "legacy_license_store";
};

type AiUsageStore = {
  version: 1;
  records: AiUsageRecord[];
};

const licenseDataRoot = process.env.DIMPRO_LICENSE_DATA_ROOT?.trim() || path.join(process.cwd(), ".dimprover");
const AI_USAGE_FILE = path.join(licenseDataRoot, "data", "hage-ai-usage.json");
const DEFAULT_MODEL = process.env.HAGE_AI_MODEL?.trim() || "gpt-5.4-mini";
const USD_HUF_RATE = Math.max(1, Number(process.env.HAGE_AI_USD_HUF_RATE || 370));

const MODEL_PRICING: Record<string, { label: string; inputPerMillionUsd: number; cachedInputPerMillionUsd: number; outputPerMillionUsd: number }> = {
  "gpt-5.4-mini": {
    label: "GPT-5.4 mini",
    inputPerMillionUsd: 0.75,
    cachedInputPerMillionUsd: 0.075,
    outputPerMillionUsd: 4.5,
  },
};

export const HAGE_AI_ACTIONS: Record<HageAiFeatureId, AiActionDefinition> = {
  daily_plan: {
    label: "Mai feladatok rangsorolása",
    icon: "☀",
    description: "A nyitott feladatokból rövid, végrehajtható napi sorrendet készít.",
    maxOutputTokens: 700,
    typicalInputTokens: 2200,
  },
  next_step: {
    label: "Következő lépés javaslat",
    icon: "→",
    description: "Egy feladathoz konkrét következő intézkedést és rövid kockázatjelzést ad.",
    maxOutputTokens: 450,
    typicalInputTokens: 900,
  },
  task_breakdown: {
    label: "Feladat bontása ellenőrzőlistára",
    icon: "☑",
    description: "A nagyobb feladatot 5–10 ellenőrizhető részlépésre bontja.",
    maxOutputTokens: 650,
    typicalInputTokens: 1000,
  },
  waiting_email: {
    label: "Visszakérdező levélvázlat",
    icon: "✉",
    description: "Udvarias, rövid, másolható szakmai levélszöveget készít.",
    maxOutputTokens: 550,
    typicalInputTokens: 1000,
  },
  meeting_agenda: {
    label: "Értekezleti napirend",
    icon: "◉",
    description: "A nyitott feladatokból, döntésekből és elakadásokból napirendet állít össze.",
    maxOutputTokens: 850,
    typicalInputTokens: 2600,
  },
  weekly_summary: {
    label: "Heti projektvezetői összefoglaló",
    icon: "▤",
    description: "Tömör heti szakmai összefoglalót készít munkaidő-kimutatás nélkül.",
    maxOutputTokens: 1100,
    typicalInputTokens: 3500,
  },
  decision_support: {
    label: "Döntési pont összefoglalása",
    icon: "◆",
    description: "Alternatívákat, kockázatokat és szükséges döntést foglal össze, döntést nem hoz helyetted.",
    maxOutputTokens: 800,
    typicalInputTokens: 1600,
  },
  document_extract: {
    label: "Iktató dokumentum-adatkinyerés",
    icon: "⌕",
    description: "Szöveges vagy szkennelt dokumentumból iktatási mezőjavaslatokat készít oldalhivatkozással és megbízhatósággal.",
    maxOutputTokens: 1800,
    typicalInputTokens: 6000,
  },
};

export class HageAiGatewayError extends Error {
  statusCode: number;
  errorCode: string;

  constructor(statusCode: number, errorCode: string, message: string) {
    super(message);
    this.name = "HageAiGatewayError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

function normalizeIdentity(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function restrictivePositive(primary: number, safetyCeiling: number) {
  if (primary > 0 && safetyCeiling > 0) return Math.min(primary, safetyCeiling);
  return primary > 0 ? primary : safetyCeiling > 0 ? safetyCeiling : 0;
}

function earlierExpiry(primary?: string, safetyCeiling?: string) {
  const values = [primary, safetyCeiling].filter((value): value is string => Boolean(value && !Number.isNaN(new Date(value).getTime())));
  if (!values.length) return undefined;
  return values.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
}

function applyLegacySafetyCeiling(central: LicenseAiUserAccess, legacy: LicenseAiUserAccess) {
  const legacyFeatures = new Set(legacy.allowedFeatures);
  const legacyScopes = new Set(legacy.allowedScopes);
  return {
    ...central,
    allowedFeatures: central.allowedFeatures.filter((feature) => legacyFeatures.has(feature)),
    allowedScopes: central.allowedScopes.filter((scope) => legacyScopes.has(scope)),
    maxRequestsPerDay: restrictivePositive(central.maxRequestsPerDay, legacy.maxRequestsPerDay),
    maxRequestsPerMonth: restrictivePositive(central.maxRequestsPerMonth, legacy.maxRequestsPerMonth),
    monthlyBudgetHuf: restrictivePositive(central.monthlyBudgetHuf, legacy.monthlyBudgetHuf),
    accessExpiresAt: earlierExpiry(central.accessExpiresAt, legacy.accessExpiresAt),
  } satisfies LicenseAiUserAccess;
}

function licenseIsActive(license: LicenseRecord, now = new Date()) {
  if (license.status !== "active" && license.status !== "trial") return false;
  const startsAt = new Date(license.startsAt);
  const expiresAt = new Date(license.expiresAt);
  return !Number.isNaN(startsAt.getTime()) && !Number.isNaN(expiresAt.getTime()) && startsAt <= now && expiresAt > now;
}

function tokenIsActive(token: LicenseTokenPayload, now = new Date()) {
  if (token.status !== "active" && token.status !== "trial") return false;
  const expiresAt = new Date(token.expiresAt);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt > now;
}

async function readUsageStore(): Promise<AiUsageStore> {
  try {
    const parsed = JSON.parse(await readFile(AI_USAGE_FILE, "utf8")) as Partial<AiUsageStore>;
    return { version: 1, records: Array.isArray(parsed.records) ? parsed.records.slice(-20000) as AiUsageRecord[] : [] };
  } catch {
    return { version: 1, records: [] };
  }
}

async function writeUsageStore(store: AiUsageStore) {
  await mkdir(path.dirname(AI_USAGE_FILE), { recursive: true });
  const tempFile = `${AI_USAGE_FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempFile, `${JSON.stringify({ version: 1, records: store.records.slice(-20000) }, null, 2)}\n`, "utf8");
  await rename(tempFile, AI_USAGE_FILE);
}

async function appendUsage(record: Omit<AiUsageRecord, "id" | "createdAt">) {
  const store = await readUsageStore();
  store.records.push({ id: `hage-ai-${randomUUID()}`, createdAt: new Date().toISOString(), ...record });
  await writeUsageStore(store);
}

function currentPeriodRecords(records: AiUsageRecord[], licenseId: string, aiUserId?: string) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);
  const base = records.filter((record) => record.licenseId === licenseId && (!aiUserId || record.aiUserId === aiUserId));
  return {
    today: base.filter((record) => record.createdAt.startsWith(today)),
    month: base.filter((record) => record.createdAt.startsWith(month)),
  };
}

function successfulCost(records: AiUsageRecord[]) {
  return records.filter((record) => record.status === "success").reduce((sum, record) => sum + Number(record.costHuf || 0), 0);
}

function successfulTokens(records: AiUsageRecord[]) {
  return records
    .filter((record) => record.status === "success")
    .reduce((sum, record) => sum + Number(record.inputTokens || 0) + Number(record.outputTokens || 0), 0);
}

export async function getHageAiAdminUsageSnapshot() {
  const records = (await readUsageStore()).records;
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const monthRecords = records.filter((record) => record.createdAt.startsWith(month));
  const successful = monthRecords.filter((record) => record.status === "success");

  const byLicense = Object.values(monthRecords.reduce<Record<string, {
    licenseId: string;
    companyId: string;
    companyName: string;
    requests: number;
    successfulRequests: number;
    failedRequests: number;
    inputTokens: number;
    outputTokens: number;
    costHuf: number;
    lastUsedAt?: string;
  }>>((acc, record) => {
    acc[record.licenseId] ??= {
      licenseId: record.licenseId,
      companyId: record.companyId,
      companyName: record.companyName,
      requests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costHuf: 0,
    };
    const target = acc[record.licenseId];
    target.requests += 1;
    target.successfulRequests += record.status === "success" ? 1 : 0;
    target.failedRequests += record.status === "error" ? 1 : 0;
    target.inputTokens += Number(record.inputTokens || 0);
    target.outputTokens += Number(record.outputTokens || 0);
    target.costHuf += record.status === "success" ? Number(record.costHuf || 0) : 0;
    target.lastUsedAt = !target.lastUsedAt || record.createdAt > target.lastUsedAt ? record.createdAt : target.lastUsedAt;
    return acc;
  }, {})).sort((a, b) => b.costHuf - a.costHuf);

  return {
    month,
    totals: {
      requests: monthRecords.length,
      successfulRequests: successful.length,
      failedRequests: monthRecords.length - successful.length,
      costHuf: successful.reduce((sum, record) => sum + Number(record.costHuf || 0), 0),
      inputTokens: successful.reduce((sum, record) => sum + Number(record.inputTokens || 0), 0),
      outputTokens: successful.reduce((sum, record) => sum + Number(record.outputTokens || 0), 0),
    },
    byLicense,
    recent: records.slice().reverse().slice(0, 100),
  };
}

function approximateTokens(value: unknown) {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : null;
  const pageImages = record && Array.isArray(record.pageImages) ? record.pageImages.length : 0;
  const textValue = record ? { ...record, pageImages: undefined } : value;
  const text = typeof textValue === "string" ? textValue : JSON.stringify(textValue ?? {});
  return Math.max(1, Math.ceil(text.length / 4) + pageImages * 1100);
}

function modelPricing(model = DEFAULT_MODEL) {
  return MODEL_PRICING[model] ?? MODEL_PRICING["gpt-5.4-mini"];
}

function calculateCost(inputTokens: number, cachedInputTokens: number, outputTokens: number, model = DEFAULT_MODEL) {
  const pricing = modelPricing(model);
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const costUsd = (
    uncachedInputTokens * pricing.inputPerMillionUsd
    + cachedInputTokens * pricing.cachedInputPerMillionUsd
    + outputTokens * pricing.outputPerMillionUsd
  ) / 1_000_000;
  return { costUsd, costHuf: costUsd * USD_HUF_RATE };
}

function estimateRequest(action: HageAiFeatureId, context: unknown) {
  const definition = HAGE_AI_ACTIONS[action];
  const inputTokens = 430 + Math.max(definition.typicalInputTokens, approximateTokens(context));
  const outputTokens = definition.maxOutputTokens;
  const cost = calculateCost(inputTokens, 0, outputTokens);
  return { inputTokens, outputTokens, ...cost };
}

function sanitizeContext(context: unknown) {
  const source = context && typeof context === "object" ? context as Record<string, unknown> : { text: String(context ?? "") };
  const rawImages = Array.isArray(source.pageImages) ? source.pageImages : [];
  const pageImages = rawImages.slice(0, 10).map((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const imageUrl = String(record.imageUrl ?? record.image_url ?? "");
    return {
      page: Math.max(1, Number(record.page ?? index + 1)),
      imageUrl: /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageUrl) && imageUrl.length <= 2_200_000 ? imageUrl : "",
    };
  }).filter((item) => item.imageUrl);
  const withoutImages = { ...source, pageImages: undefined };
  const text = JSON.stringify(withoutImages, null, 2).slice(0, 120000);
  try {
    return { ...(JSON.parse(text) as Record<string, unknown>), pageImages };
  } catch {
    return { text, pageImages };
  }
}

function systemPrompt() {
  return "Te a HAGE-INVEST beruházási projektvezetői és dokumentum-iktatási munkát támogató, magyar nyelvű szakmai asszisztens vagy. Legyél tömör, konkrét és ellenőrizhető. Ne találj ki tényeket, határidőket, neveket, összegeket vagy szerződéses adatokat. Csak a bemeneti dokumentumban bizonyítható adatot javasolj. A hiányzó vagy bizonytalan adatot jelöld. A döntést és az adatátvételt mindig a felhasználó hagyja jóvá.";
}

function userPrompt(action: HageAiFeatureId, context: unknown, note: unknown) {
  const instructions: Record<HageAiFeatureId, string> = {
    daily_plan: "Állíts össze legfeljebb 7 pontos mai munkasorrendet. Elöl legyen a lejárt, döntést blokkoló és határidős ügy. Minden pontnál add meg: feladat, miért fontos, első konkrét lépés.",
    next_step: "Adj 1 fő következő lépést, legfeljebb 3 előkészítő alpontot és 1 rövid kockázatjelzést.",
    task_breakdown: "Bontsd a feladatot 5–10 kipipálható ellenőrzőpontra, logikus végrehajtási sorrendben.",
    waiting_email: "Készíts tárgymezőt és udvarias, tömör magyar levélszöveget visszakérdezéshez. Ne legyen fenyegető vagy túl hosszú.",
    meeting_agenda: "Készíts strukturált értekezleti napirendet: cél, döntési pontok, nyitott feladatok, elakadások, felelős és következő lépés helykitöltővel.",
    weekly_summary: "Készíts tömör projektvezetői heti összefoglalót: teljesített, folyamatban, válaszra vár, döntést igényel, következő hét. Ne legyen munkaidő-kimutatás.",
    decision_support: "Foglald össze a döntési helyzetet: kérdés, ismert tények, alternatívák, kockázatok, hiányzó információ, javasolt döntési szempontok. Ne hozz végleges döntést.",
    document_extract: "Az iktatáshoz használható mezőjavaslatokat add vissza kizárólag JSON formában: {\"fields\":[{\"field\":\"documentDate|party1|party2|amount|invoiceNumber|contractNumber|dueDate|title|projectLocation|sector|financing|paymentStatus\",\"label\":\"magyar címke\",\"value\":\"érték\",\"displayValue\":\"olvasható érték\",\"page\":1,\"confidence\":0-100,\"section\":\"basic|project|finance|storage\"}]}. Csak a dokumentumból bizonyítható mezőt add vissza, oldalszámmal. Bizonytalan adatnál alacsonyabb confidence értéket használj. Ne írj magyarázó szöveget a JSON köré.",
  };
  const safeContext = context && typeof context === "object" ? { ...(context as Record<string, unknown>), pageImages: undefined } : context;
  return `${instructions[action]}\n\nFelhasználói kiegészítés: ${String(note ?? "nincs").slice(0, 3000)}\n\nBemeneti adatok:\n${JSON.stringify(safeContext, null, 2)}`;
}

function extractResponseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const parts: string[] = [];
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown[] }).content) ? (item as { content: unknown[] }).content : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("\n").trim();
}

async function runOpenAi(action: HageAiFeatureId, context: unknown, note: unknown) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new HageAiGatewayError(503, "OPENAI_NOT_CONFIGURED", "Az OpenAI API-kulcs nincs beállítva a DIMPRO szerveren.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const contextRecord = context && typeof context === "object" ? context as Record<string, unknown> : {};
    const pageImages = action === "document_extract" && Array.isArray(contextRecord.pageImages)
      ? contextRecord.pageImages.slice(0, 10).map((item) => item && typeof item === "object" ? item as Record<string, unknown> : {}).filter((item) => typeof item.imageUrl === "string")
      : [];
    const userContent: Array<Record<string, unknown>> = [
      { type: "input_text", text: userPrompt(action, context, note) },
      ...pageImages.map((item) => ({ type: "input_image", image_url: String(item.imageUrl), detail: "auto" })),
    ];
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: [
          { role: "system", content: [{ type: "input_text", text: systemPrompt() }] },
          { role: "user", content: userContent },
        ],
        reasoning: { effort: "low" },
        max_output_tokens: HAGE_AI_ACTIONS[action].maxOutputTokens,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: { message?: string }; usage?: Record<string, unknown>; id?: string };
    if (!response.ok) throw new HageAiGatewayError(response.status, "OPENAI_ERROR", payload.error?.message || `OpenAI API hiba (${response.status}).`);
    const text = extractResponseText(payload);
    if (!text) throw new HageAiGatewayError(502, "EMPTY_AI_RESPONSE", "Az AI nem adott feldolgozható szöveges választ.");
    return { text, usage: payload.usage ?? {}, responseId: payload.id ?? "" };
  } finally {
    clearTimeout(timeout);
  }
}

async function authorize(input: HageAiGatewayRequest, requireAction = false) {
  if (!input.licenseToken || !input.licenseKey || !input.machineIdHash || !input.appId || !input.userName) {
    throw new HageAiGatewayError(400, "MISSING_CREDENTIALS", "Hiányos licenc- vagy felhasználói azonosítás.");
  }
  const publicKey = await getServerPublicKeyBase64();
  const token = verifyLicenseToken(input.licenseToken, publicKey);
  if (!token || !tokenIsActive(token)) throw new HageAiGatewayError(401, "INVALID_LICENSE_TOKEN", "A licenctoken érvénytelen vagy lejárt.");
  if (token.licenseKey !== input.licenseKey || token.machineIdHash !== input.machineIdHash || token.appId !== input.appId) {
    throw new HageAiGatewayError(401, "LICENSE_TOKEN_MISMATCH", "A licenctoken nem ehhez a géphez vagy alkalmazáshoz tartozik.");
  }

  const store = await readLicenseStore();
  const license = store.licenses.find((item) => item.licenseKey === input.licenseKey);
  if (!license || !licenseIsActive(license)) throw new HageAiGatewayError(403, "LICENSE_INACTIVE", "A DIMPRO licenc nem aktív.");
  if (!license.enabledModules.includes("ai_assistant")) throw new HageAiGatewayError(403, "AI_MODULE_DISABLED", "Az AI-modul nincs engedélyezve ehhez a licenchez.");
  const device = store.devices.find((item) => item.licenseId === license.id && item.machineIdHash === input.machineIdHash && item.appId === input.appId);
  if (!device || device.status !== "active") throw new HageAiGatewayError(403, "DEVICE_NOT_ALLOWED", "Ez a gép nem jogosult az AI-funkció használatára.");

  const normalizedUserId = normalizeIdentity(input.userId || "");
  const normalizedUserName = normalizeIdentity(input.userName);
  const legacyAiUser = (license.aiUsers ?? []).find((item) => {
    const storedId = normalizeIdentity(item.userId);
    const storedName = normalizeIdentity(item.displayName);
    return (normalizedUserId && storedId === normalizedUserId) || storedName === normalizedUserName || storedId === normalizedUserName;
  });

  let aiUser: LicenseAiUserAccess | undefined;
  let policySource: "central_identity" | "legacy_license_store" = "legacy_license_store";
  let policyReason = "identity_policy_off";
  let organizationMonthlyBudgetHuf = Number(license.aiMonthlyBudgetHuf ?? 0);
  let organizationMonthlyTokenBudget = 0;
  let organizationMaxRequestsPerDay = 0;
  let organizationMaxRequestsPerMonth = 0;
  let maxSingleRequestHuf = Number(license.aiMaxSingleRequestHuf ?? 0);
  const identityPolicyMode = getHageAiIdentityPolicyMode();

  if (identityPolicyMode !== "off") {
    try {
      const decision = await readCentralHageAiPolicyDecision(license.id, {
        userId: input.userId,
        userName: input.userName,
        scope: input.scope,
        action: input.action,
        requireAction,
      });
      policyReason = decision.reason;
      if (decision.mode === "deny") throw new HageAiGatewayError(403, decision.errorCode, decision.message);
      if (decision.mode === "fallback" && identityPolicyMode === "strict") {
        throw new HageAiGatewayError(403, "AI_IDENTITY_POLICY_REQUIRED", "Ehhez a felhasználóhoz még nincs véglegesített központi AI-jogosultság.");
      }
      if (decision.mode === "allow") {
        if (identityPolicyMode === "prefer" && !legacyAiUser) {
          policyReason = "central_policy_requires_legacy_user_during_migration";
        } else {
          aiUser = identityPolicyMode === "prefer" && legacyAiUser
            ? applyLegacySafetyCeiling(decision.policy.aiUser, legacyAiUser)
            : decision.policy.aiUser;
          policySource = "central_identity";
          organizationMonthlyBudgetHuf = identityPolicyMode === "prefer"
            ? restrictivePositive(decision.policy.organizationMonthlyBudgetHuf, Number(license.aiMonthlyBudgetHuf ?? 0))
            : decision.policy.organizationMonthlyBudgetHuf;
          maxSingleRequestHuf = identityPolicyMode === "prefer"
            ? restrictivePositive(decision.policy.maxSingleRequestHuf, Number(license.aiMaxSingleRequestHuf ?? 0))
            : decision.policy.maxSingleRequestHuf;
          organizationMonthlyTokenBudget = decision.policy.organizationMonthlyTokenBudget;
          organizationMaxRequestsPerDay = decision.policy.organizationMaxRequestsPerDay;
          organizationMaxRequestsPerMonth = decision.policy.organizationMaxRequestsPerMonth;
          if (identityPolicyMode === "prefer" && legacyAiUser) policyReason = `${decision.reason}_with_legacy_safety_ceiling`;
        }
      }
    } catch (error) {
      if (error instanceof HageAiGatewayError) throw error;
      if (identityPolicyMode === "strict") {
        throw new HageAiGatewayError(503, "AI_IDENTITY_POLICY_UNAVAILABLE", "A központi AI-jogosultság ellenőrzése jelenleg nem érhető el.");
      }
      policyReason = "identity_policy_unavailable_fallback";
    }
  }

  if (!aiUser) aiUser = legacyAiUser;
  if (!aiUser) throw new HageAiGatewayError(403, "AI_USER_NOT_LICENSED", `Az AI-hozzáférés nincs név szerint engedélyezve: ${input.userName}.`);
  if (!aiUser.enabled) throw new HageAiGatewayError(403, "AI_USER_DISABLED", "Az AI-hozzáférés ennél a felhasználónál ki van kapcsolva.");
  if (aiUser.accessExpiresAt && new Date(aiUser.accessExpiresAt) <= new Date()) throw new HageAiGatewayError(403, "AI_USER_ACCESS_EXPIRED", "A felhasználó AI-hozzáférése lejárt.");
  if (!aiUser.allowedScopes.includes(input.scope)) throw new HageAiGatewayError(403, "AI_SCOPE_DISABLED", "Az AI ezen a munkaterületen nincs engedélyezve a felhasználónak.");
  if (requireAction && (!input.action || !aiUser.allowedFeatures.includes(input.action))) throw new HageAiGatewayError(403, "AI_FEATURE_DISABLED", "Ez az AI-funkció nincs engedélyezve a felhasználónak.");

  const usageAiUserId = legacyAiUser?.id || aiUser.id;
  const usageStore = await readUsageStore();
  const organizationPeriods = currentPeriodRecords(usageStore.records, license.id);
  const userPeriods = currentPeriodRecords(usageStore.records, license.id, usageAiUserId);
  const dayRequests = userPeriods.today.length;
  const monthRequests = userPeriods.month.length;
  const organizationDayRequests = organizationPeriods.today.length;
  const organizationMonthRequests = organizationPeriods.month.length;
  const userMonthCostHuf = successfulCost(userPeriods.month);
  const organizationMonthCostHuf = successfulCost(organizationPeriods.month);
  const organizationMonthTokens = successfulTokens(organizationPeriods.month);

  if (aiUser.maxRequestsPerDay > 0 && dayRequests >= aiUser.maxRequestsPerDay) throw new HageAiGatewayError(429, "AI_DAILY_LIMIT", "A felhasználó napi AI-kérési kerete elfogyott.");
  if (aiUser.maxRequestsPerMonth > 0 && monthRequests >= aiUser.maxRequestsPerMonth) throw new HageAiGatewayError(429, "AI_MONTHLY_LIMIT", "A felhasználó havi AI-kérési kerete elfogyott.");
  if (organizationMaxRequestsPerDay > 0 && organizationDayRequests >= organizationMaxRequestsPerDay) throw new HageAiGatewayError(429, "AI_LICENSE_DAILY_LIMIT", "A licenc napi AI-kérési kerete elfogyott.");
  if (organizationMaxRequestsPerMonth > 0 && organizationMonthRequests >= organizationMaxRequestsPerMonth) throw new HageAiGatewayError(429, "AI_LICENSE_MONTHLY_LIMIT", "A licenc havi AI-kérési kerete elfogyott.");
  if (aiUser.monthlyBudgetHuf > 0 && userMonthCostHuf >= aiUser.monthlyBudgetHuf) throw new HageAiGatewayError(429, "AI_USER_BUDGET", "A felhasználó havi AI-költségkerete elfogyott.");
  if (organizationMonthlyBudgetHuf > 0 && organizationMonthCostHuf >= organizationMonthlyBudgetHuf) throw new HageAiGatewayError(429, "AI_LICENSE_BUDGET", "A licenc havi AI-költségkerete elfogyott.");
  if (organizationMonthlyTokenBudget > 0 && organizationMonthTokens >= organizationMonthlyTokenBudget) throw new HageAiGatewayError(429, "AI_LICENSE_TOKEN_BUDGET", "A licenc havi AI-tokenkerete elfogyott.");

  return {
    token,
    license,
    aiUser,
    usageAiUserId,
    usageStore,
    dayRequests,
    monthRequests,
    userMonthCostHuf,
    organizationMonthCostHuf,
    organizationMonthlyBudgetHuf,
    organizationMonthTokens,
    organizationMonthlyTokenBudget,
    organizationDayRequests,
    organizationMonthRequests,
    organizationMaxRequestsPerDay,
    organizationMaxRequestsPerMonth,
    maxSingleRequestHuf,
    policySource,
    policyReason,
    identityPolicyMode,
  };
}

function publicUserAccess(user: LicenseAiUserAccess) {
  return {
    userId: user.userId,
    displayName: user.displayName,
    enabled: user.enabled,
    allowedFeatures: user.allowedFeatures,
    allowedScopes: user.allowedScopes,
    maxRequestsPerDay: user.maxRequestsPerDay,
    maxRequestsPerMonth: user.maxRequestsPerMonth,
    monthlyBudgetHuf: user.monthlyBudgetHuf,
    accessExpiresAt: user.accessExpiresAt,
  };
}

export async function getHageAiStatus(input: HageAiGatewayRequest) {
  const auth = await authorize(input, false);
  const actions = auth.aiUser.allowedFeatures.map((key) => {
    const action = HAGE_AI_ACTIONS[key];
    const estimate = estimateRequest(key, { typicalInputTokens: action.typicalInputTokens });
    return { key, ...action, estimatedCostHuf: estimate.costHuf, estimatedCostUsd: estimate.costUsd };
  });
  return {
    ok: true,
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    enabled: true,
    model: DEFAULT_MODEL,
    modelLabel: modelPricing().label,
    usdHufRate: USD_HUF_RATE,
    user: publicUserAccess(auth.aiUser),
    authorization: {
      policySource: auth.policySource,
      policyReason: auth.policyReason,
      identityPolicyMode: auth.identityPolicyMode,
    },
    actions,
    usage: {
      dayRequests: auth.dayRequests,
      monthRequests: auth.monthRequests,
      monthCostHuf: auth.userMonthCostHuf,
      monthlyBudgetHuf: auth.aiUser.monthlyBudgetHuf,
      organizationMonthCostHuf: auth.organizationMonthCostHuf,
      organizationMonthlyBudgetHuf: auth.organizationMonthlyBudgetHuf,
      organizationMonthTokens: auth.organizationMonthTokens,
      organizationMonthlyTokenBudget: auth.organizationMonthlyTokenBudget,
      organizationDayRequests: auth.organizationDayRequests,
      organizationMonthRequests: auth.organizationMonthRequests,
      organizationMaxRequestsPerDay: auth.organizationMaxRequestsPerDay,
      organizationMaxRequestsPerMonth: auth.organizationMaxRequestsPerMonth,
    },
  };
}

export async function estimateHageAi(input: HageAiGatewayRequest) {
  if (!input.action || !HAGE_AI_ACTIONS[input.action]) throw new HageAiGatewayError(400, "INVALID_ACTION", "Ismeretlen AI-művelet.");
  const auth = await authorize(input, true);
  const estimate = estimateRequest(input.action, sanitizeContext(input.context));
  if (auth.maxSingleRequestHuf > 0 && estimate.costHuf > auth.maxSingleRequestHuf) {
    throw new HageAiGatewayError(413, "AI_REQUEST_COST_LIMIT", `A becsült költség (${estimate.costHuf.toFixed(2)} Ft) meghaladja az egy kérésre engedélyezett keretet.`);
  }
  if (auth.organizationMonthlyTokenBudget > 0 && auth.organizationMonthTokens + estimate.inputTokens + estimate.outputTokens > auth.organizationMonthlyTokenBudget) {
    throw new HageAiGatewayError(429, "AI_LICENSE_TOKEN_BUDGET", "A becsült kérés már túllépné a licenc havi AI-tokenkeretét.");
  }
  return { ok: true, model: DEFAULT_MODEL, ...estimate };
}

export async function runHageAi(input: HageAiGatewayRequest) {
  if (!input.action || !HAGE_AI_ACTIONS[input.action]) throw new HageAiGatewayError(400, "INVALID_ACTION", "Ismeretlen AI-művelet.");
  const auth = await authorize(input, true);
  const context = sanitizeContext(input.context);
  const estimate = estimateRequest(input.action, context);
  if (auth.maxSingleRequestHuf > 0 && estimate.costHuf > auth.maxSingleRequestHuf) {
    throw new HageAiGatewayError(413, "AI_REQUEST_COST_LIMIT", `A becsült költség (${estimate.costHuf.toFixed(2)} Ft) meghaladja az egy kérésre engedélyezett keretet.`);
  }
  if (auth.organizationMonthlyTokenBudget > 0 && auth.organizationMonthTokens + estimate.inputTokens + estimate.outputTokens > auth.organizationMonthlyTokenBudget) {
    throw new HageAiGatewayError(429, "AI_LICENSE_TOKEN_BUDGET", "A becsült kérés már túllépné a licenc havi AI-tokenkeretét.");
  }
  const startedAt = Date.now();
  const actionDefinition = HAGE_AI_ACTIONS[input.action];
  try {
    const result = await runOpenAi(input.action, context, input.note);
    const usage = result.usage as {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
    const inputTokens = Number(usage.input_tokens ?? estimate.inputTokens);
    const cachedInputTokens = Number(usage.input_tokens_details?.cached_tokens ?? 0);
    const outputTokens = Number(usage.output_tokens ?? 0);
    const cost = calculateCost(inputTokens, cachedInputTokens, outputTokens);
    await appendUsage({
      licenseId: auth.license.id,
      companyId: auth.license.companyId,
      companyName: auth.license.companyName,
      aiUserId: auth.usageAiUserId,
      userId: auth.aiUser.userId,
      userName: auth.aiUser.displayName,
      scope: input.scope,
      action: input.action,
      actionLabel: actionDefinition.label,
      model: DEFAULT_MODEL,
      status: "success",
      inputTokens,
      cachedInputTokens,
      outputTokens,
      estimatedCostHuf: estimate.costHuf,
      costUsd: cost.costUsd,
      costHuf: cost.costHuf,
      durationMs: Date.now() - startedAt,
      responseId: result.responseId,
      policySource: auth.policySource,
    });
    return {
      ok: true,
      text: result.text,
      model: DEFAULT_MODEL,
      usage: { inputTokens, cachedInputTokens, outputTokens },
      estimatedCostHuf: estimate.costHuf,
      costUsd: cost.costUsd,
      costHuf: cost.costHuf,
    };
  } catch (error) {
    await appendUsage({
      licenseId: auth.license.id,
      companyId: auth.license.companyId,
      companyName: auth.license.companyName,
      aiUserId: auth.usageAiUserId,
      userId: auth.aiUser.userId,
      userName: auth.aiUser.displayName,
      scope: input.scope,
      action: input.action,
      actionLabel: actionDefinition.label,
      model: DEFAULT_MODEL,
      status: "error",
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      estimatedCostHuf: estimate.costHuf,
      costUsd: 0,
      costHuf: 0,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Ismeretlen AI hiba",
      policySource: auth.policySource,
    });
    throw error;
  }
}

export async function getHageAiUsageSummary(input: HageAiGatewayRequest) {
  const auth = await authorize(input, false);
  const records = auth.usageStore.records.filter((record) => record.licenseId === auth.license.id);
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const today = now.toISOString().slice(0, 10);
  const monthRecords = records.filter((record) => record.createdAt.startsWith(month));
  const successful = monthRecords.filter((record) => record.status === "success");
  const group = (key: "userName" | "actionLabel") => Object.values(successful.reduce<Record<string, { name: string; requests: number; inputTokens: number; outputTokens: number; costHuf: number }>>((acc, record) => {
    const name = record[key] || "Ismeretlen";
    acc[name] ??= { name, requests: 0, inputTokens: 0, outputTokens: 0, costHuf: 0 };
    acc[name].requests += 1;
    acc[name].inputTokens += record.inputTokens;
    acc[name].outputTokens += record.outputTokens;
    acc[name].costHuf += record.costHuf;
    return acc;
  }, {})).sort((a, b) => b.costHuf - a.costHuf);

  const totalHuf = successful.reduce((sum, record) => sum + record.costHuf, 0);
  const totalUsd = successful.reduce((sum, record) => sum + record.costUsd, 0);
  const todayHuf = successful.filter((record) => record.createdAt.startsWith(today)).reduce((sum, record) => sum + record.costHuf, 0);
  const budgetHuf = auth.organizationMonthlyBudgetHuf;
  return {
    ok: true,
    config: {
      enabled: auth.license.enabledModules.includes("ai_assistant"),
      apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      model: DEFAULT_MODEL,
      modelLabel: modelPricing().label,
      usdHufRate: USD_HUF_RATE,
      monthlyBudgetHuf: budgetHuf,
      maxSingleRequestHuf: auth.maxSingleRequestHuf,
      monthlyTokenBudget: auth.organizationMonthlyTokenBudget,
      organizationMaxRequestsPerDay: auth.organizationMaxRequestsPerDay,
      organizationMaxRequestsPerMonth: auth.organizationMaxRequestsPerMonth,
      policySource: auth.policySource,
      policyReason: auth.policyReason,
      identityPolicyMode: auth.identityPolicyMode,
    },
    summary: {
      month,
      requests: monthRecords.length,
      successfulRequests: successful.length,
      failedRequests: monthRecords.length - successful.length,
      totalHuf,
      totalUsd,
      todayHuf,
      budgetHuf,
      budgetPercent: budgetHuf > 0 ? totalHuf / budgetHuf * 100 : 0,
      totalTokens: successfulTokens(successful),
      tokenBudget: auth.organizationMonthlyTokenBudget,
      tokenBudgetPercent: auth.organizationMonthlyTokenBudget > 0 ? successfulTokens(successful) / auth.organizationMonthlyTokenBudget * 100 : 0,
      byUser: group("userName"),
      byAction: group("actionLabel"),
      recent: records.slice().reverse().slice(0, 100),
    },
  };
}
