import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type MeetingAiModelTier = "fast" | "balanced" | "premium" | "audit";

export type MeetingAiAction =
  | "analyze_transcript"
  | "detect_topics"
  | "detect_participants"
  | "extract_decisions"
  | "extract_actions"
  | "verify_responsibles_deadlines"
  | "quick_summary"
  | "draft_minutes"
  | "key_takeaways"
  | "edited_transcript"
  | "full_document_package"
  | "quality_check"
  | "language_polish"
  | "shorter_version"
  | "detailed_version";

export type MeetingAiActionDefinition = {
  label: string;
  description: string;
  expectedResult: string;
  maxOutputTokens: number;
  typicalInputTokens: number;
  defaultTier: MeetingAiModelTier;
  allowedTiers: MeetingAiModelTier[];
  category: "preprocess" | "document" | "verification" | "refinement";
};

export type MeetingAiModelDefinition = {
  tier: MeetingAiModelTier;
  provider: string;
  modelKey: string;
  displayName: string;
  description: string;
  qualityLevel: number;
  inputPricePerMillionUsd: number;
  cachedInputPricePerMillionUsd: number;
  outputPricePerMillionUsd: number;
  active: boolean;
  premiumApprovalRequired: boolean;
  supportsAudio: boolean;
  supportsVision: boolean;
  supportsLongContext: boolean;
  maxSingleRequestHuf: number;
};

export type MeetingAiEstimate = {
  action: MeetingAiAction;
  modelTier: MeetingAiModelTier;
  provider: string;
  model: string;
  modelDisplayName: string;
  inputTokens: number;
  outputTokens: number;
  minimumCostUsd: number;
  estimatedCostUsd: number;
  maximumCostUsd: number;
  minimumCostHuf: number;
  estimatedCostHuf: number;
  maximumCostHuf: number;
  premiumApprovalRequired: boolean;
};

export type MeetingAiUsageRecord = {
  id: string;
  createdAt: string;
  completedAt: string;
  meetingId: string;
  projectId: string;
  userId: string;
  action: MeetingAiAction;
  provider: string;
  modelTier: MeetingAiModelTier;
  model: string;
  status: "success" | "error";
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  estimatedCostHuf: number;
  approvedMaxCostHuf: number;
  actualCostHuf: number;
  actualCostUsd: number;
  durationMs: number;
  responseId?: string;
  retryCount: number;
  errorMessage?: string;
};

type UsageFile = {
  version: 2;
  records: MeetingAiUsageRecord[];
};

const USD_HUF_RATE = Math.max(1, Number(process.env.MEETING_AI_USD_HUF_RATE || 370));
const GLOBAL_MAX_SINGLE_REQUEST_HUF = Math.max(0.1, Number(process.env.MEETING_AI_MAX_SINGLE_REQUEST_HUF || 250));
const USAGE_FILE = path.join(process.cwd(), ".dimprover", "data", "meeting-assistant", "ai-usage.json");

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function envBoolean(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

const FALLBACK_MODEL = process.env.MEETING_AI_MODEL?.trim() || "gpt-5.4-mini";
const BASE_INPUT = envNumber("MEETING_AI_INPUT_PER_MILLION_USD", 0.75);
const BASE_CACHED = envNumber("MEETING_AI_CACHED_INPUT_PER_MILLION_USD", 0.075);
const BASE_OUTPUT = envNumber("MEETING_AI_OUTPUT_PER_MILLION_USD", 4.5);

export const MEETING_AI_MODELS: Record<MeetingAiModelTier, MeetingAiModelDefinition> = {
  fast: {
    tier: "fast",
    provider: process.env.MEETING_AI_FAST_PROVIDER?.trim() || "OpenAI",
    modelKey: process.env.MEETING_AI_FAST_MODEL?.trim() || FALLBACK_MODEL,
    displayName: process.env.MEETING_AI_FAST_DISPLAY_NAME?.trim() || "Gyors / takarékos",
    description: "Előfeldolgozás, témabontás, résztvevők és nyers jelöltek felismerése.",
    qualityLevel: 1,
    inputPricePerMillionUsd: envNumber("MEETING_AI_FAST_INPUT_PER_MILLION_USD", BASE_INPUT),
    cachedInputPricePerMillionUsd: envNumber("MEETING_AI_FAST_CACHED_INPUT_PER_MILLION_USD", BASE_CACHED),
    outputPricePerMillionUsd: envNumber("MEETING_AI_FAST_OUTPUT_PER_MILLION_USD", BASE_OUTPUT),
    active: envBoolean("MEETING_AI_FAST_ACTIVE", true),
    premiumApprovalRequired: false,
    supportsAudio: false,
    supportsVision: false,
    supportsLongContext: true,
    maxSingleRequestHuf: envNumber("MEETING_AI_FAST_MAX_REQUEST_HUF", GLOBAL_MAX_SINGLE_REQUEST_HUF),
  },
  balanced: {
    tier: "balanced",
    provider: process.env.MEETING_AI_BALANCED_PROVIDER?.trim() || "OpenAI",
    modelKey: process.env.MEETING_AI_BALANCED_MODEL?.trim() || FALLBACK_MODEL,
    displayName: process.env.MEETING_AI_BALANCED_DISPLAY_NAME?.trim() || "Kiegyensúlyozott szakmai",
    description: "Tárgyilagos, témakörönként tagolt összefoglalók és dokumentumtervezetek.",
    qualityLevel: 2,
    inputPricePerMillionUsd: envNumber("MEETING_AI_BALANCED_INPUT_PER_MILLION_USD", BASE_INPUT),
    cachedInputPricePerMillionUsd: envNumber("MEETING_AI_BALANCED_CACHED_INPUT_PER_MILLION_USD", BASE_CACHED),
    outputPricePerMillionUsd: envNumber("MEETING_AI_BALANCED_OUTPUT_PER_MILLION_USD", BASE_OUTPUT),
    active: envBoolean("MEETING_AI_BALANCED_ACTIVE", true),
    premiumApprovalRequired: false,
    supportsAudio: false,
    supportsVision: true,
    supportsLongContext: true,
    maxSingleRequestHuf: envNumber("MEETING_AI_BALANCED_MAX_REQUEST_HUF", GLOBAL_MAX_SINGLE_REQUEST_HUF),
  },
  premium: {
    tier: "premium",
    provider: process.env.MEETING_AI_PREMIUM_PROVIDER?.trim() || "OpenAI",
    modelKey: process.env.MEETING_AI_PREMIUM_MODEL?.trim() || FALLBACK_MODEL,
    displayName: process.env.MEETING_AI_PREMIUM_DISPLAY_NAME?.trim() || "Prémium / magas pontosság",
    description: "Összetett műszaki, szerződéses vagy több szakágat érintő értekezletek finomítása.",
    qualityLevel: 3,
    inputPricePerMillionUsd: envNumber("MEETING_AI_PREMIUM_INPUT_PER_MILLION_USD", BASE_INPUT),
    cachedInputPricePerMillionUsd: envNumber("MEETING_AI_PREMIUM_CACHED_INPUT_PER_MILLION_USD", BASE_CACHED),
    outputPricePerMillionUsd: envNumber("MEETING_AI_PREMIUM_OUTPUT_PER_MILLION_USD", BASE_OUTPUT),
    active: envBoolean("MEETING_AI_PREMIUM_ACTIVE", true),
    premiumApprovalRequired: true,
    supportsAudio: false,
    supportsVision: true,
    supportsLongContext: true,
    maxSingleRequestHuf: envNumber("MEETING_AI_PREMIUM_MAX_REQUEST_HUF", GLOBAL_MAX_SINGLE_REQUEST_HUF),
  },
  audit: {
    tier: "audit",
    provider: process.env.MEETING_AI_AUDIT_PROVIDER?.trim() || "OpenAI",
    modelKey: process.env.MEETING_AI_AUDIT_MODEL?.trim() || FALLBACK_MODEL,
    displayName: process.env.MEETING_AI_AUDIT_DISPLAY_NAME?.trim() || "Ellenőrző / audit",
    description: "Az elkészült dokumentum összevetése az eredeti forrással, felülírás nélkül.",
    qualityLevel: 2,
    inputPricePerMillionUsd: envNumber("MEETING_AI_AUDIT_INPUT_PER_MILLION_USD", BASE_INPUT),
    cachedInputPricePerMillionUsd: envNumber("MEETING_AI_AUDIT_CACHED_INPUT_PER_MILLION_USD", BASE_CACHED),
    outputPricePerMillionUsd: envNumber("MEETING_AI_AUDIT_OUTPUT_PER_MILLION_USD", BASE_OUTPUT),
    active: envBoolean("MEETING_AI_AUDIT_ACTIVE", true),
    premiumApprovalRequired: false,
    supportsAudio: false,
    supportsVision: false,
    supportsLongContext: true,
    maxSingleRequestHuf: envNumber("MEETING_AI_AUDIT_MAX_REQUEST_HUF", GLOBAL_MAX_SINGLE_REQUEST_HUF),
  },
};

const ALL_STANDARD_TIERS: MeetingAiModelTier[] = ["fast", "balanced", "premium"];

export const MEETING_AI_ACTIONS: Record<MeetingAiAction, MeetingAiActionDefinition> = {
  analyze_transcript: {
    label: "Átirat elemzése",
    description: "Technikai részek, ismétlések, témaváltások és bizonytalan átiratrészek felismerése.",
    expectedResult: "Előfeldolgozási jelentés és feldolgozási javaslat.",
    maxOutputTokens: 700,
    typicalInputTokens: 5000,
    defaultTier: "fast",
    allowedTiers: ALL_STANDARD_TIERS,
    category: "preprocess",
  },
  detect_topics: {
    label: "Témakörök felismerése",
    description: "Az átiratot szakmai témakörökre és logikai egységekre bontja.",
    expectedResult: "Sorrendbe rendezett témalista rövid leírásokkal.",
    maxOutputTokens: 750,
    typicalInputTokens: 5000,
    defaultTier: "fast",
    allowedTiers: ALL_STANDARD_TIERS,
    category: "preprocess",
  },
  detect_participants: {
    label: "Résztvevők felismerése",
    description: "Kigyűjti a beszélőket, szervezeteket és azonosítható szerepköröket.",
    expectedResult: "Résztvevőjelöltek bizonyossági megjegyzéssel.",
    maxOutputTokens: 550,
    typicalInputTokens: 4000,
    defaultTier: "fast",
    allowedTiers: ALL_STANDARD_TIERS,
    category: "preprocess",
  },
  extract_decisions: {
    label: "Döntések kigyűjtése",
    description: "Csak az átiratban igazolható döntéseket és megállapodásokat gyűjti ki.",
    expectedResult: "Döntésjegyzék forráshivatkozási javaslatokkal.",
    maxOutputTokens: 900,
    typicalInputTokens: 5500,
    defaultTier: "balanced",
    allowedTiers: ALL_STANDARD_TIERS,
    category: "document",
  },
  extract_actions: {
    label: "Feladatok kigyűjtése",
    description: "Feladat-, felelős-, határidő- és nyitottkérdés-jelölteket készít.",
    expectedResult: "Szerkeszthető feladat- és döntéstábla.",
    maxOutputTokens: 1000,
    typicalInputTokens: 5500,
    defaultTier: "balanced",
    allowedTiers: ALL_STANDARD_TIERS,
    category: "document",
  },
  verify_responsibles_deadlines: {
    label: "Határidők és felelősök ellenőrzése",
    description: "Kiszűri a nem igazolt, hiányzó vagy ellentmondó felelősöket és határidőket.",
    expectedResult: "Ellenőrzési lista, automatikus átírás nélkül.",
    maxOutputTokens: 700,
    typicalInputTokens: 4500,
    defaultTier: "audit",
    allowedTiers: ["audit", "balanced", "premium"],
    category: "verification",
  },
  quick_summary: {
    label: "Rövid értekezleti összefoglaló",
    description: "Vezetői áttekintést készít a fő témákról, döntésekről és következő lépésekről.",
    expectedResult: "Rövid, gyorsan áttekinthető összefoglaló.",
    maxOutputTokens: 650,
    typicalInputTokens: 5000,
    defaultTier: "balanced",
    allowedTiers: ALL_STANDARD_TIERS,
    category: "document",
  },
  draft_minutes: {
    label: "Értekezleti összefoglaló készítése",
    description: "Témakörönként részletes, tárgyilagos és szerkeszthető dokumentumtervezetet készít.",
    expectedResult: "Kiküldés előtt ellenőrizhető szakmai dokumentumtervezet.",
    maxOutputTokens: 2200,
    typicalInputTokens: 8000,
    defaultTier: "balanced",
    allowedTiers: ALL_STANDARD_TIERS,
    category: "document",
  },
  key_takeaways: {
    label: "„Lényeg röviden” blokkok készítése",
    description: "Minden fontos témakörhöz 2–4 gondolatjeles, tömör jegyzetblokkot készít.",
    expectedResult: "Témakörönként áttekintő rövid blokkok.",
    maxOutputTokens: 1100,
    typicalInputTokens: 6500,
    defaultTier: "balanced",
    allowedTiers: ALL_STANDARD_TIERS,
    category: "document",
  },
  edited_transcript: {
    label: "Szerkesztett átirat készítése",
    description: "Eltávolítja a technikai zajt és ismétlést, miközben megtartja az érdemi időrendet.",
    expectedResult: "Tömörített, szerkesztett 1. melléklet.",
    maxOutputTokens: 2600,
    typicalInputTokens: 9000,
    defaultTier: "balanced",
    allowedTiers: ALL_STANDARD_TIERS,
    category: "document",
  },
  full_document_package: {
    label: "Teljes dokumentumcsomag szövegének elkészítése",
    description: "Összefoglaló, lényegblokkok, döntések, feladatok és mellékletleírás egységes tervezete.",
    expectedResult: "PDF/DOCX exporthoz előkészített teljes dokumentumszöveg.",
    maxOutputTokens: 3600,
    typicalInputTokens: 11000,
    defaultTier: "balanced",
    allowedTiers: ALL_STANDARD_TIERS,
    category: "document",
  },
  quality_check: {
    label: "AI-ellenőrzés",
    description: "Az elkészült tervezetet összeveti a forrásokkal, és csak javítási javaslatokat ad.",
    expectedResult: "Elfogadható vagy elutasítható auditjavaslatok.",
    maxOutputTokens: 1200,
    typicalInputTokens: 9000,
    defaultTier: "audit",
    allowedTiers: ["audit", "balanced", "premium"],
    category: "verification",
  },
  language_polish: {
    label: "Nyelvi és szakmai finomítás",
    description: "A tartalom megváltoztatása nélkül javítja a mondatszerkezetet és az egységes szakmai hangnemet.",
    expectedResult: "Finomított, továbbra is szerkeszthető változat.",
    maxOutputTokens: 2500,
    typicalInputTokens: 7000,
    defaultTier: "balanced",
    allowedTiers: ALL_STANDARD_TIERS,
    category: "refinement",
  },
  shorter_version: {
    label: "Rövidebb változat készítése",
    description: "A döntések és feladatok megtartásával tömörebb változatot készít.",
    expectedResult: "Rövidebb, vezetői vagy e-mailes változat.",
    maxOutputTokens: 1200,
    typicalInputTokens: 6500,
    defaultTier: "balanced",
    allowedTiers: ALL_STANDARD_TIERS,
    category: "refinement",
  },
  detailed_version: {
    label: "Részletesebb változat készítése",
    description: "A meglévő tervezetet a forrásban igazolható részletekkel bővíti.",
    expectedResult: "Részletesebb, forrásalapú dokumentumváltozat.",
    maxOutputTokens: 3000,
    typicalInputTokens: 9000,
    defaultTier: "premium",
    allowedTiers: ALL_STANDARD_TIERS,
    category: "refinement",
  },
};

function approximateTokens(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return Math.max(1, Math.ceil(text.length / 4));
}

function calculateCost(model: MeetingAiModelDefinition, inputTokens: number, cachedInputTokens: number, outputTokens: number) {
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const costUsd = (
    uncachedInputTokens * model.inputPricePerMillionUsd
    + cachedInputTokens * model.cachedInputPricePerMillionUsd
    + outputTokens * model.outputPricePerMillionUsd
  ) / 1_000_000;
  return { costUsd, costHuf: costUsd * USD_HUF_RATE };
}

function resolveModelTier(action: MeetingAiAction, requestedTier?: MeetingAiModelTier) {
  const definition = MEETING_AI_ACTIONS[action];
  const requested = requestedTier && definition.allowedTiers.includes(requestedTier) ? requestedTier : definition.defaultTier;
  if (MEETING_AI_MODELS[requested].active) return requested;
  return definition.allowedTiers.find((tier) => MEETING_AI_MODELS[tier].active) || definition.defaultTier;
}

export function estimateMeetingAi(action: MeetingAiAction, context: unknown, requestedTier?: MeetingAiModelTier): MeetingAiEstimate {
  const definition = MEETING_AI_ACTIONS[action];
  const modelTier = resolveModelTier(action, requestedTier);
  const model = MEETING_AI_MODELS[modelTier];
  const inputTokens = 550 + Math.max(definition.typicalInputTokens, approximateTokens(context));
  const outputTokens = definition.maxOutputTokens;
  const minimum = calculateCost(model, inputTokens, 0, Math.max(120, Math.round(outputTokens * 0.35)));
  const expected = calculateCost(model, inputTokens, 0, Math.max(180, Math.round(outputTokens * 0.72)));
  const maximum = calculateCost(model, Math.round(inputTokens * 1.08), 0, outputTokens);
  return {
    action,
    modelTier,
    provider: model.provider,
    model: model.modelKey,
    modelDisplayName: model.displayName,
    inputTokens,
    outputTokens,
    minimumCostUsd: minimum.costUsd,
    estimatedCostUsd: expected.costUsd,
    maximumCostUsd: maximum.costUsd,
    minimumCostHuf: minimum.costHuf,
    estimatedCostHuf: expected.costHuf,
    maximumCostHuf: maximum.costHuf,
    premiumApprovalRequired: model.premiumApprovalRequired,
  };
}

function systemPrompt() {
  return [
    "Te a DIMPRO Értekezleti Asszisztens magyar nyelvű szakmai dokumentumkészítője vagy.",
    "Kizárólag a bemenetben szereplő információkat kezeld tényként.",
    "Ne találj ki felelőst, határidőt, döntést, résztvevőt, műszaki adatot vagy forráshivatkozást.",
    "Bizonytalan adatnál használd az 'egyeztetendő', 'pontosítandó' vagy 'az átirat alapján nem egyértelmű' jelölést.",
    "A fontos témakörök után készíts 2–4 gondolatjeles 'LÉNYEG RÖVIDEN' blokkot, ha a feladat ezt indokolja.",
    "Félkövér kiemelést csak végleges döntéshez, elfogadott irányhoz, fontos műszaki adathoz, konkrét feladathoz, felelőshöz, határidőhöz vagy kritikus nyitott kérdéshez használj.",
    "A döntéseknél és feladatoknál add meg a rendelkezésre álló forrást: időbélyeg, beszélő vagy forrásmondat. Ha nincs biztos forrás, ezt jelezd.",
    "Az AI eredménye minden esetben szerkeszthető javaslat, amelyet embernek kell jóváhagynia.",
    "Ne küldj ki és ne minősíts véglegesnek dokumentumot.",
  ].join(" ");
}

function actionPrompt(action: MeetingAiAction, context: unknown) {
  const instruction: Record<MeetingAiAction, string> = {
    analyze_transcript: "Elemezd az átirat feldolgozhatóságát. Jelöld a technikai zajt, ismétléseket, töredékeket, bizonytalan beszélőket, témaváltásokat és azokat a részeket, amelyeket embernek kell ellenőriznie.",
    detect_topics: "Azonosítsd a szakmai témaköröket időrendi sorrendben. Minden témához adj rövid címet, időtartományt vagy forráspontot, résztvevőket, fő kérdést és státuszt.",
    detect_participants: "Gyűjtsd ki az azonosítható résztvevőket, szervezetet és szerepkört. Minden elemnél jelezd a bizonyosságot; ne egészítsd ki külső ismerettel.",
    extract_decisions: "Készíts döntésjegyzéket. Csak egyértelműen kimondott vagy elfogadott döntést szerepeltess. Add meg a témát, döntést, státuszt, beszélőt/időbélyeget/forrásmondatot és a bizonyosságot.",
    extract_actions: "Készíts táblázatszerű feladat-, döntés-, kérdés- és határidőlistát. Add meg a megfogalmazást, felelőst, határidőt, forrást és bizonyosságot. Ismeretlen adat helyére írd: PONTOSÍTANDÓ.",
    verify_responsibles_deadlines: "Vesd össze a feladatokat az eredeti forrással. Jelöld a nem igazolt, hiányzó vagy ellentmondó felelősöket és határidőket. Ne írd át automatikusan a tervezetet.",
    quick_summary: "Készíts rövid vezetői összefoglalót: értekezlet célja, fő témák, döntések, feladatok, nyitott kérdések és következő lépések. Legfeljebb 10 tömör pontot használj.",
    draft_minutes: "Készíts tárgyilagos, témakörönként tagolt szakmai értekezleti összefoglalót. Szerkezet: alapadatok, cél, részletes témák, minden fontos téma után LÉNYEG RÖVIDEN blokk, döntések és nyitott kérdések, feladatlista, következő egyeztetés, mellékletek. Ne legyen túl sok félkövér kiemelés.",
    key_takeaways: "A bemeneti témákhoz készíts külön LÉNYEG RÖVIDEN blokkokat. Blokkonként 2–4 gondolatjeles pont: megállapítás, döntés, továbbtervezési irány, teendő, nyitott kérdés, egyértelmű felelős vagy határidő.",
    edited_transcript: "Készíts tömörített, szerkesztett átiratot. Hagyd el a hangpróbát, csatlakozási problémát, ismétlést, töltelékszót, töredéket és nyilvánvaló átírási hibát. Tartsd meg az időrendet, műszaki álláspontokat, döntéseket, feladatokat, nyitott kérdéseket és véleménykülönbségeket. Az elején szerepeljen a kötelező figyelmeztetés, hogy nem szó szerinti jegyzőkönyv.",
    full_document_package: "Készíts egységes dokumentumtervezetet: címlapadatok, résztvevők, cél, témakörönkénti részletes összefoglaló LÉNYEG RÖVIDEN blokkokkal, döntés/nyitottkérdés tábla, feladatlista, 1. melléklet szerkesztett átirat, 2. melléklet az eredeti átirat rövid leírása. Az eredeti átirat tartalmát ne másold be teljes egészében.",
    quality_check: "Ellenőrizd a tervezetet az eredeti források alapján. Sorold fel: nem igazolt állítás, kihagyott lényeges téma, téves döntés, téves vagy hiányzó felelős/határidő, ellentmondás, túl erős megfogalmazás. Csak javítási javaslatot adj, ne írd felül a dokumentumot.",
    language_polish: "Finomítsd a dokumentum nyelvezetét tárgyilagos, professzionális magyar stílusra úgy, hogy semmilyen tényt, döntést, felelőst vagy határidőt ne változtass meg. Csökkentsd a túlzott félkövér kiemelést.",
    shorter_version: "Készíts rövidebb változatot úgy, hogy minden döntés, konkrét feladat, felelős, határidő és kritikus nyitott kérdés megmaradjon.",
    detailed_version: "Készíts részletesebb változatot kizárólag a forrásokban igazolható információk felhasználásával. A bizonytalan pontokat jelöld, ne töltsd ki feltételezéssel.",
  };
  return `${instruction[action]}\n\nBemeneti adatok:\n${JSON.stringify(context, null, 2).slice(0, 180000)}`;
}

function extractResponseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const parts: string[] = [];
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("\n").trim();
}

async function readUsageFile(): Promise<UsageFile> {
  try {
    const parsed = JSON.parse(await readFile(USAGE_FILE, "utf8")) as Partial<UsageFile> & { records?: MeetingAiUsageRecord[] };
    return { version: 2, records: Array.isArray(parsed.records) ? parsed.records : [] };
  } catch {
    return { version: 2, records: [] };
  }
}

async function appendUsage(record: Omit<MeetingAiUsageRecord, "id" | "createdAt">) {
  const file = await readUsageFile();
  file.records.push({ id: `meeting-ai-${randomUUID()}`, createdAt: new Date().toISOString(), ...record });
  await mkdir(path.dirname(USAGE_FILE), { recursive: true });
  const temp = `${USAGE_FILE}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify({ version: 2, records: file.records.slice(-20000) }, null, 2)}\n`, "utf8");
  await rename(temp, USAGE_FILE);
}

export function getMeetingAiConfig() {
  const models = Object.values(MEETING_AI_MODELS);
  return {
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    model: MEETING_AI_MODELS.balanced.modelKey,
    usdHufRate: USD_HUF_RATE,
    maxSingleRequestHuf: GLOBAL_MAX_SINGLE_REQUEST_HUF,
    models,
    budgets: {
      monthlyUserHuf: envNumber("MEETING_AI_MONTHLY_USER_BUDGET_HUF", 5000),
      monthlyProjectHuf: envNumber("MEETING_AI_MONTHLY_PROJECT_BUDGET_HUF", 25000),
      monthlyOrganizationHuf: envNumber("MEETING_AI_MONTHLY_ORGANIZATION_BUDGET_HUF", 100000),
      warningPercent: Math.min(100, envNumber("MEETING_AI_BUDGET_WARNING_PERCENT", 80)),
    },
    actions: Object.entries(MEETING_AI_ACTIONS).map(([key, definition]) => ({
      key: key as MeetingAiAction,
      ...definition,
    })),
  };
}

export async function getMeetingAiUsageSummary(meetingId: string) {
  const file = await readUsageFile();
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthRecords = file.records.filter((record) => record.createdAt.startsWith(monthPrefix));
  const meetingRecords = file.records.filter((record) => record.meetingId === meetingId);
  const sum = (records: MeetingAiUsageRecord[]) => records.reduce((total, record) => total + Number(record.actualCostHuf || 0), 0);
  return {
    meetingActualCostHuf: sum(meetingRecords),
    monthlyActualCostHuf: sum(monthRecords),
    successfulRuns: meetingRecords.filter((record) => record.status === "success").length,
    failedRuns: meetingRecords.filter((record) => record.status === "error").length,
    recentRuns: meetingRecords.slice(-30).reverse(),
  };
}

export async function runMeetingAi(input: {
  meetingId: string;
  projectId?: string;
  userId?: string;
  action: MeetingAiAction;
  modelTier?: MeetingAiModelTier;
  context: unknown;
  confirmedMaxHuf: number;
  confirmedPremium?: boolean;
}) {
  const definition = MEETING_AI_ACTIONS[input.action];
  const estimate = estimateMeetingAi(input.action, input.context, input.modelTier);
  const model = MEETING_AI_MODELS[estimate.modelTier];
  const requestLimit = Math.min(GLOBAL_MAX_SINGLE_REQUEST_HUF, model.maxSingleRequestHuf);
  if (estimate.maximumCostHuf > requestLimit) {
    throw new Error(`A maximális becsült költség meghaladja az engedélyezett ${requestLimit.toFixed(2)} Ft-os kéréslimitet.`);
  }
  if (!Number.isFinite(input.confirmedMaxHuf) || input.confirmedMaxHuf + 0.0001 < estimate.estimatedCostHuf) {
    throw new Error("A futtatás előtt jóvá kell hagyni a kijelzett becsült költséget.");
  }
  if (model.premiumApprovalRequired && !input.confirmedPremium) {
    throw new Error("A prémium modell futtatásához külön költségjóváhagyás szükséges.");
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Az OPENAI_API_KEY nincs beállítva a DIMPRO szerveren.");

  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model.modelKey,
          input: [
            { role: "system", content: [{ type: "input_text", text: systemPrompt() }] },
            { role: "user", content: [{ type: "input_text", text: actionPrompt(input.action, input.context) }] },
          ],
          reasoning: { effort: estimate.modelTier === "premium" ? "medium" : "low" },
          max_output_tokens: definition.maxOutputTokens,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
      error?: { message?: string };
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        input_tokens_details?: { cached_tokens?: number };
      };
      id?: string;
    };
    if (!response.ok) throw new Error(payload.error?.message || `OpenAI API hiba (${response.status}).`);
    const text = extractResponseText(payload);
    if (!text) throw new Error("Az AI nem adott feldolgozható választ.");

    const inputTokens = Number(payload.usage?.input_tokens ?? estimate.inputTokens);
    const cachedInputTokens = Number(payload.usage?.input_tokens_details?.cached_tokens ?? 0);
    const outputTokens = Number(payload.usage?.output_tokens ?? 0);
    const actual = calculateCost(model, inputTokens, cachedInputTokens, outputTokens);
    const durationMs = Date.now() - startedAt;

    await appendUsage({
      completedAt: new Date().toISOString(),
      meetingId: input.meetingId,
      projectId: input.projectId || "",
      userId: input.userId || "",
      action: input.action,
      provider: model.provider,
      modelTier: estimate.modelTier,
      model: model.modelKey,
      status: "success",
      inputTokens,
      cachedInputTokens,
      outputTokens,
      estimatedCostHuf: estimate.estimatedCostHuf,
      approvedMaxCostHuf: input.confirmedMaxHuf,
      actualCostHuf: actual.costHuf,
      actualCostUsd: actual.costUsd,
      durationMs,
      responseId: payload.id,
      retryCount: 0,
    });

    return {
      ok: true,
      text,
      provider: model.provider,
      modelTier: estimate.modelTier,
      model: model.modelKey,
      modelDisplayName: model.displayName,
      estimate,
      usage: { inputTokens, cachedInputTokens, outputTokens },
      actualCostHuf: actual.costHuf,
      actualCostUsd: actual.costUsd,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    await appendUsage({
      completedAt: new Date().toISOString(),
      meetingId: input.meetingId,
      projectId: input.projectId || "",
      userId: input.userId || "",
      action: input.action,
      provider: model.provider,
      modelTier: estimate.modelTier,
      model: model.modelKey,
      status: "error",
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      estimatedCostHuf: estimate.estimatedCostHuf,
      approvedMaxCostHuf: input.confirmedMaxHuf,
      actualCostHuf: 0,
      actualCostUsd: 0,
      durationMs,
      retryCount: 0,
      errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Ismeretlen AI hiba",
    });
    throw error;
  }
}