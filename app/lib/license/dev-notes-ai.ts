import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DevNote, DevNoteDraft } from "@/app/lib/license/dev-notes";
import { readDevNoteStore } from "@/app/lib/license/dev-notes";

export type DevNotesAiActionId =
  | "field_check"
  | "improve_handoff"
  | "coder_prompt"
  | "test_checklist"
  | "related_analysis"
  | "module_report"
  | "mvp_gap_check"
  | "contradiction_scan"
  | "changelog"
  | "roadmap"
  | "release_audit";

export type DevNotesAiTier = "low" | "medium" | "high";

export type DevNotesAiAction = {
  id: DevNotesAiActionId;
  label: string;
  shortLabel: string;
  description: string;
  tier: DevNotesAiTier;
  maxOutputTokens: number;
  estimatedHufMin: number;
  estimatedHufMax: number;
  applyTargets: Array<"aiContext" | "codingInstruction" | "nextStep" | "handoffSummary" | "description">;
};

export type DevNotesAiLiteNote = Pick<
  DevNote,
  | "id"
  | "title"
  | "module"
  | "type"
  | "status"
  | "priority"
  | "summary"
  | "epic"
  | "surfaces"
  | "updatedAt"
>;

export type DevNotesAiUsageSummary = {
  dailyEstimatedUsd: number;
  monthlyEstimatedUsd: number;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  warningLimitUsd: number;
  remainingDailyUsd: number;
  remainingMonthlyUsd: number;
  callsToday: number;
  callsThisMonth: number;
};

export type DevNotesAiMeta = {
  enabled: boolean;
  configured: boolean;
  model: string;
  actions: DevNotesAiAction[];
  usage: DevNotesAiUsageSummary;
  note: string;
};

type OpenAiUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

type UsageLogEntry = {
  id: string;
  createdAt: string;
  actionId: string;
  noteTitle: string;
  model: string;
  estimatedUsd: number;
  estimatedHuf: number;
  inputTokenEstimate: number;
  maxOutputTokens: number;
  actualUsage?: OpenAiUsage;
  success: boolean;
  error?: string;
};

const AI_ACTIONS: DevNotesAiAction[] = [
  {
    id: "field_check",
    label: "AI mezőellenőrzés",
    shortLabel: "Mezőellenőrzés",
    description: "Hiányzó vagy gyenge fejlesztési napló mezők, kapcsolatok és következő lépések ellenőrzése.",
    tier: "low",
    maxOutputTokens: 900,
    estimatedHufMin: 1,
    estimatedHufMax: 8,
    applyTargets: ["handoffSummary", "nextStep"],
  },
  {
    id: "improve_handoff",
    label: "AI átadó blokk rendezése",
    shortLabel: "Átadó rendezés",
    description: "Új csevegőbe, Codexnek vagy más AI-nak másolható tiszta átadó kontextus készítése.",
    tier: "low",
    maxOutputTokens: 1300,
    estimatedHufMin: 2,
    estimatedHufMax: 12,
    applyTargets: ["aiContext", "handoffSummary"],
  },
  {
    id: "coder_prompt",
    label: "AI kódoló chat prompt",
    shortLabel: "Kódoló prompt",
    description: "Másik kódoló csevegőbe illeszthető részletes feladatindító prompt készítése.",
    tier: "low",
    maxOutputTokens: 1500,
    estimatedHufMin: 2,
    estimatedHufMax: 15,
    applyTargets: ["codingInstruction", "aiContext"],
  },
  {
    id: "test_checklist",
    label: "AI tesztlista készítése",
    shortLabel: "Tesztlista",
    description: "Fejlesztés utáni ellenőrző lista készítése 10–20 konkrét tesztponttal.",
    tier: "low",
    maxOutputTokens: 1200,
    estimatedHufMin: 2,
    estimatedHufMax: 12,
    applyTargets: ["codingInstruction", "nextStep"],
  },
  {
    id: "related_analysis",
    label: "AI kapcsolódó bejegyzések elemzése",
    shortLabel: "Kapcsolatok elemzése",
    description: "A kapcsolódó bejegyzésekből összefoglalja, hogyan állnak egymáshoz a webes, desktopos és API fejlesztések.",
    tier: "medium",
    maxOutputTokens: 1800,
    estimatedHufMin: 5,
    estimatedHufMax: 35,
    applyTargets: ["handoffSummary", "aiContext"],
  },
  {
    id: "module_report",
    label: "AI modulállapot riport",
    shortLabel: "Modulriport",
    description: "Az adott modul vagy epic aktuális állapotának összefoglalása: kész, hiányzik, kockázat, következő lépés.",
    tier: "medium",
    maxOutputTokens: 1800,
    estimatedHufMin: 5,
    estimatedHufMax: 40,
    applyTargets: ["handoffSummary", "description"],
  },
  {
    id: "mvp_gap_check",
    label: "AI alapverzió hiányosság ellenőrzés",
    shortLabel: "MVP hiányok",
    description: "Megnézi, hogy az alapverzióhoz hiányzik-e adatmodell, API, jogosultság, teszt, dokumentáció vagy rollback.",
    tier: "medium",
    maxOutputTokens: 1800,
    estimatedHufMin: 5,
    estimatedHufMax: 40,
    applyTargets: ["nextStep", "codingInstruction"],
  },
  {
    id: "contradiction_scan",
    label: "AI ellentmondáskeresés",
    shortLabel: "Ellentmondások",
    description: "Kapcsolódó és azonos epic bejegyzések közötti ellentmondások, nyitott döntések és kockázatok keresése.",
    tier: "high",
    maxOutputTokens: 2200,
    estimatedHufMin: 10,
    estimatedHufMax: 80,
    applyTargets: ["handoffSummary", "nextStep"],
  },
  {
    id: "changelog",
    label: "AI verziónapló szöveg",
    shortLabel: "Changelog",
    description: "Dokumentációba vagy release leírásba illeszthető verziónapló szöveg készítése.",
    tier: "low",
    maxOutputTokens: 1100,
    estimatedHufMin: 2,
    estimatedHufMax: 12,
    applyTargets: ["description", "handoffSummary"],
  },
  {
    id: "roadmap",
    label: "AI következő fejlesztési sorrend",
    shortLabel: "Roadmap",
    description: "Reális következő fejlesztési sorrend és prioritásjavaslat az aktuális modulhoz.",
    tier: "medium",
    maxOutputTokens: 1600,
    estimatedHufMin: 5,
    estimatedHufMax: 35,
    applyTargets: ["nextStep", "handoffSummary"],
  },
  {
    id: "release_audit",
    label: "AI release előtti audit",
    shortLabel: "Release audit",
    description: "Erősebb ellenőrzés: hiányok, kockázatok, tesztelés, dokumentáció, rollback, másik csevegő átadás.",
    tier: "high",
    maxOutputTokens: 2600,
    estimatedHufMin: 15,
    estimatedHufMax: 120,
    applyTargets: ["handoffSummary", "nextStep", "codingInstruction"],
  },
];

function resolveProjectRoot() {
  const cwd = process.cwd();
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;
  if (cwd.endsWith(standaloneSuffix)) return cwd.slice(0, -standaloneSuffix.length);
  return cwd;
}

const projectRoot = process.env.DIMPRO_PROJECT_ROOT ?? resolveProjectRoot();
const aiDir = path.join(projectRoot, ".dimprover", "dev-notes-ai");
const usageLogFile = path.join(aiDir, "usage.jsonl");

function nowIso() {
  return new Date().toISOString();
}

function getUsdToHuf() {
  const value = Number(process.env.DIMPRO_DEV_NOTES_AI_USD_HUF ?? "370");
  return Number.isFinite(value) && value > 0 ? value : 370;
}

function getModel() {
  return process.env.DIMPRO_DEV_NOTES_AI_MODEL?.trim() || "gpt-4.1-mini";
}

function getPricing() {
  const inputUsdPer1M = Number(process.env.DIMPRO_DEV_NOTES_AI_INPUT_USD_PER_1M ?? "0.4");
  const outputUsdPer1M = Number(process.env.DIMPRO_DEV_NOTES_AI_OUTPUT_USD_PER_1M ?? "1.6");
  return {
    inputUsdPer1M: Number.isFinite(inputUsdPer1M) && inputUsdPer1M > 0 ? inputUsdPer1M : 0.4,
    outputUsdPer1M: Number.isFinite(outputUsdPer1M) && outputUsdPer1M > 0 ? outputUsdPer1M : 1.6,
  };
}

function getLimits() {
  const dailyLimitUsd = Number(process.env.DIMPRO_DEV_NOTES_AI_DAILY_LIMIT_USD ?? "2");
  const monthlyLimitUsd = Number(process.env.DIMPRO_DEV_NOTES_AI_MONTHLY_LIMIT_USD ?? "40");
  const warningLimitUsd = Number(process.env.DIMPRO_DEV_NOTES_AI_WARNING_LIMIT_USD ?? "15");
  return {
    dailyLimitUsd: Number.isFinite(dailyLimitUsd) && dailyLimitUsd > 0 ? dailyLimitUsd : 2,
    monthlyLimitUsd: Number.isFinite(monthlyLimitUsd) && monthlyLimitUsd > 0 ? monthlyLimitUsd : 40,
    warningLimitUsd: Number.isFinite(warningLimitUsd) && warningLimitUsd > 0 ? warningLimitUsd : 15,
  };
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateUsd(inputTokens: number, outputTokens: number) {
  const pricing = getPricing();
  return (inputTokens / 1_000_000) * pricing.inputUsdPer1M + (outputTokens / 1_000_000) * pricing.outputUsdPer1M;
}

function extractResponseText(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const maybe = data as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown; type?: unknown }> }>;
  };

  if (typeof maybe.output_text === "string") return maybe.output_text.trim();

  const parts: string[] = [];
  for (const item of maybe.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function extractUsage(data: unknown): OpenAiUsage | undefined {
  if (!data || typeof data !== "object") return undefined;
  const usage = (data as { usage?: OpenAiUsage }).usage;
  return usage && typeof usage === "object" ? usage : undefined;
}

function normalizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function normalizeNote(input: unknown): DevNoteDraft & {
  surfaces?: string[];
  epic?: string;
  relatedNoteIds?: string[];
  dependencies?: string;
  blockers?: string;
  crossChatStatus?: string;
  externalAiNote?: string;
  handoffSummary?: string;
} {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    title: normalizeString(value.title),
    type: normalizeString(value.type) as DevNoteDraft["type"],
    status: normalizeString(value.status) as DevNoteDraft["status"],
    module: normalizeString(value.module),
    priority: normalizeString(value.priority) as DevNoteDraft["priority"],
    summary: normalizeString(value.summary),
    description: normalizeString(value.description),
    codingInstruction: normalizeString(value.codingInstruction),
    aiContext: normalizeString(value.aiContext),
    source: normalizeString(value.source),
    tags: normalizeArray(value.tags),
    relatedFiles: normalizeString(value.relatedFiles),
    nextStep: normalizeString(value.nextStep),
    surfaces: normalizeArray(value.surfaces),
    epic: normalizeString(value.epic),
    relatedNoteIds: normalizeArray(value.relatedNoteIds),
    dependencies: normalizeString(value.dependencies),
    blockers: normalizeString(value.blockers),
    crossChatStatus: normalizeString(value.crossChatStatus),
    externalAiNote: normalizeString(value.externalAiNote),
    handoffSummary: normalizeString(value.handoffSummary),
  };
}

function truncate(value: string, max = 2200) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n...[rövidítve]`;
}

function liteNote(note: DevNote): DevNotesAiLiteNote {
  return {
    id: note.id,
    title: note.title,
    module: note.module,
    type: note.type,
    status: note.status,
    priority: note.priority,
    summary: note.summary,
    epic: note.epic,
    surfaces: note.surfaces,
    updatedAt: note.updatedAt,
  };
}

async function readUsageEntries() {
  try {
    const raw = await readFile(usageLogFile, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as UsageLogEntry);
  } catch {
    return [];
  }
}

async function appendUsage(entry: UsageLogEntry) {
  await mkdir(aiDir, { recursive: true });
  await writeFile(usageLogFile, `${JSON.stringify(entry)}\n`, { encoding: "utf8", flag: "a" });
}

export async function getDevNotesAiUsageSummary(): Promise<DevNotesAiUsageSummary> {
  const entries = await readUsageEntries();
  const limits = getLimits();
  const now = new Date();
  const dayPrefix = now.toISOString().slice(0, 10);
  const monthPrefix = now.toISOString().slice(0, 7);
  const successfulEntries = entries.filter((entry) => entry.success !== false);
  const daily = successfulEntries.filter((entry) => entry.createdAt.startsWith(dayPrefix));
  const monthly = successfulEntries.filter((entry) => entry.createdAt.startsWith(monthPrefix));
  const dailyEstimatedUsd = daily.reduce((sum, entry) => sum + (entry.estimatedUsd || 0), 0);
  const monthlyEstimatedUsd = monthly.reduce((sum, entry) => sum + (entry.estimatedUsd || 0), 0);

  return {
    dailyEstimatedUsd,
    monthlyEstimatedUsd,
    dailyLimitUsd: limits.dailyLimitUsd,
    monthlyLimitUsd: limits.monthlyLimitUsd,
    warningLimitUsd: limits.warningLimitUsd,
    remainingDailyUsd: Math.max(0, limits.dailyLimitUsd - dailyEstimatedUsd),
    remainingMonthlyUsd: Math.max(0, limits.monthlyLimitUsd - monthlyEstimatedUsd),
    callsToday: daily.length,
    callsThisMonth: monthly.length,
  };
}

export async function getDevNotesAiMeta(): Promise<DevNotesAiMeta> {
  const configured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const enabled = process.env.DIMPRO_DEV_NOTES_AI_DISABLED === "1" ? false : configured;
  return {
    enabled,
    configured,
    model: getModel(),
    actions: AI_ACTIONS,
    usage: await getDevNotesAiUsageSummary(),
    note: configured
      ? "Az AI csak kézi gombnyomásra fut. A költség becslés, nem számlaérték."
      : "OPENAI_API_KEY nincs beállítva. A gombok látszanak, de AI futtatás csak kulcs beállítása után működik.",
  };
}

function getAction(actionId: string) {
  return AI_ACTIONS.find((action) => action.id === actionId);
}

function buildNoteContext(note: ReturnType<typeof normalizeNote>) {
  return [
    `Cím: ${note.title || "-"}`,
    `Modul: ${note.module || "-"}`,
    `Fejlesztési csomag / Epic: ${note.epic || "-"}`,
    `Érintett felületek: ${note.surfaces?.length ? note.surfaces.join(", ") : "-"}`,
    `Típus / státusz / prioritás: ${note.type || "-"} / ${note.status || "-"} / ${note.priority || "-"}`,
    `Címkék: ${note.tags?.length ? note.tags.join(", ") : "-"}`,
    "",
    "Rövid összefoglaló:",
    truncate(note.summary || "-"),
    "",
    "Részletes leírás:",
    truncate(note.description || "-"),
    "",
    "Kódolási utasítás:",
    truncate(note.codingInstruction || "-"),
    "",
    "AI kontextus:",
    truncate(note.aiContext || "-"),
    "",
    "Forrás / előzmény:",
    truncate(note.source || "-", 1200),
    "",
    "Kapcsolódó fájlok:",
    truncate(note.relatedFiles || "-", 1200),
    "",
    "Függőségek:",
    truncate(note.dependencies || "-", 1200),
    "",
    "Blokkolók:",
    truncate(note.blockers || "-", 1200),
    "",
    "Másik csevegő / párhuzamos fejlesztés állapota:",
    truncate(note.crossChatStatus || "-", 1200),
    "",
    "Külső AI / reviewer megjegyzés:",
    truncate(note.externalAiNote || "-", 1200),
    "",
    "Utolsó átadó összefoglaló:",
    truncate(note.handoffSummary || "-", 1200),
    "",
    "Következő lépés:",
    truncate(note.nextStep || "-", 1200),
  ].join("\n");
}

async function buildRelatedContext(note: ReturnType<typeof normalizeNote>) {
  const store = await readDevNoteStore();
  const relatedIds = new Set(note.relatedNoteIds ?? []);
  const related = store.notes.filter((item) => relatedIds.has(item.id)).slice(0, 10);
  const sameEpic = note.epic
    ? store.notes.filter((item) => item.epic === note.epic && !relatedIds.has(item.id) && item.title !== note.title).slice(0, 8)
    : [];

  const format = (items: DevNote[]) => items.map((item) => [
    `- ${item.title}`,
    `  Modul: ${item.module}`,
    `  Státusz: ${item.status}, prioritás: ${item.priority}`,
    `  Összefoglaló: ${truncate(item.summary || item.handoffSummary || "-", 600)}`,
    `  Következő lépés: ${truncate(item.nextStep || "-", 350)}`,
  ].join("\n")).join("\n");

  return {
    related,
    sameEpic,
    context: [
      "Kapcsolódó bejegyzések:",
      format(related) || "-",
      "",
      "Azonos epic/csomag további bejegyzései:",
      format(sameEpic) || "-",
    ].join("\n"),
    allNotes: store.notes.map(liteNote),
  };
}

function buildInstruction(action: DevNotesAiAction) {
  const common = [
    "Magyar nyelven válaszolj.",
    "DIMPRO/DIMPROVER fejlesztési naplóhoz dolgozol.",
    "Ne írj általános üres tanácsot, csak konkrét fejlesztési pontokat.",
    "Ne találj ki kész funkciót, ha a kontextus alapján nem bizonyított.",
    "A válasz legyen közvetlenül bemásolható a Fejlesztési Napló mezőibe.",
    "Használj rövid címsorokat és számozott lépéseket.",
  ];

  const specific: Record<DevNotesAiActionId, string[]> = {
    field_check: [
      "Ellenőrizd a fejlesztési bejegyzést.",
      "Add meg: hiányzó mezők, gyenge pontok, szükséges kapcsolódó bejegyzések, következő teendők.",
      "A végén adj rövid JAVASOLT KÖVETKEZŐ LÉPÉS blokkot.",
    ],
    improve_handoff: [
      "Készíts tiszta AI átadó blokkot új kódoló csevegő, Codex vagy más AI számára.",
      "Tartalmazza: projekt, modul, aktuális állapot, érintett fájlok, mit kell folytatni, mit nem szabad elrontani, tesztelés.",
    ],
    coder_prompt: [
      "Készíts teljes kódoló chat indító promptot.",
      "Tartalmazza a kötelező sorrendet: get_server_status, fájlolvasás, backup, kódmódosítás, dokumentáció, tsc, lint, build, PM2 restart.",
      "Legyen másolható és kezdő fejlesztő számára is egyértelmű.",
    ],
    test_checklist: [
      "Készíts konkrét tesztelési checklistet a bejegyzéshez.",
      "Legyen legalább 10 tesztpont, ha a kontextus engedi.",
      "Térj ki: API, oldalbetöltés, CSS/static, jogosultság, mentés/visszatöltés, dokumentáció, regresszió.",
    ],
    related_analysis: [
      "Elemezd az aktuális bejegyzést a kapcsolódó bejegyzésekkel együtt.",
      "Add meg: mi közös, mi hiányzik, melyik ág webes/desktop/API, mit kell összehangolni.",
    ],
    module_report: [
      "Készíts modulállapot riportot.",
      "Szerkezet: állapot, kész elemek, hiányzó elemek, kockázatok, következő 3 lépés, alapverzió státusz.",
    ],
    mvp_gap_check: [
      "Ellenőrizd, hogy az alapverzióhoz hiányzik-e valami.",
      "Vizsgáld: adatmodell, API, jogosultság, UI, export, tesztelés, dokumentáció, rollback, backup, monitoring.",
    ],
    contradiction_scan: [
      "Keresd az ellentmondásokat a kapcsolódó és azonos epic bejegyzések között.",
      "Csak valós vagy erősen valószínű ellentmondást írj. Ha nincs, írd le, hogy nincs egyértelmű ellentmondás.",
      "Adj döntési javaslatokat.",
    ],
    changelog: [
      "Készíts rövid verziónapló / changelog szöveget dokumentációhoz.",
      "Legyen dátumos, bulletpontos, tényszerű. Ne marketing szöveg legyen.",
    ],
    roadmap: [
      "Készíts reális fejlesztési sorrendet az aktuális állapotból.",
      "Különítsd el: most, következő kör, később, nem most.",
    ],
    release_audit: [
      "Készíts release előtti auditot.",
      "Vizsgáld: kritikus hiány, regressziós kockázat, teszt, dokumentáció, backup, rollback, jogosultság, költség, másik csevegő átadás.",
      "Adj döntést: KIADHATÓ / FELTÉTELESEN KIADHATÓ / NEM KIADHATÓ, indoklással.",
    ],
  };

  return [...common, ...specific[action.id]].join("\n");
}

export async function runDevNotesAiAction(input: {
  actionId: string;
  note: unknown;
}) {
  const action = getAction(input.actionId);
  if (!action) throw new Error("Ismeretlen AI művelet.");

  const meta = await getDevNotesAiMeta();
  if (!meta.configured) throw new Error("OPENAI_API_KEY nincs beállítva a szerveren.");
  if (!meta.enabled) throw new Error("A Fejlesztési Napló AI jelenleg le van tiltva.");

  const note = normalizeNote(input.note);
  const related = await buildRelatedContext(note);
  const systemPrompt = buildInstruction(action);
  const userPrompt = [
    "Aktuális fejlesztési bejegyzés:",
    buildNoteContext(note),
    "",
    related.context,
  ].join("\n");

  const inputTokenEstimate = estimateTokens(`${systemPrompt}\n${userPrompt}`);
  const estimatedUsd = estimateUsd(inputTokenEstimate, action.maxOutputTokens);
  const estimatedHuf = estimatedUsd * getUsdToHuf();
  const usage = await getDevNotesAiUsageSummary();

  if (usage.dailyEstimatedUsd + estimatedUsd > usage.dailyLimitUsd) {
    throw new Error(`Napi AI limit túllépés lenne. Becsült kérés: ${estimatedHuf.toFixed(0)} Ft.`);
  }

  if (usage.monthlyEstimatedUsd + estimatedUsd > usage.monthlyLimitUsd) {
    throw new Error(`Havi AI limit túllépés lenne. Becsült kérés: ${estimatedHuf.toFixed(0)} Ft.`);
  }

  const startedAt = nowIso();
  let output = "";
  let actualUsage: OpenAiUsage | undefined;
  let success = false;
  let errorMessage = "";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: getModel(),
        input: [
          { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
          { role: "user", content: [{ type: "input_text", text: userPrompt }] },
        ],
        max_output_tokens: action.maxOutputTokens,
      }),
    });

    const data = await response.json() as unknown;
    if (!response.ok) {
      const apiError = data && typeof data === "object" ? (data as { error?: { message?: string } }).error?.message : undefined;
      throw new Error(apiError || `OpenAI API hiba: HTTP ${response.status}`);
    }

    output = extractResponseText(data);
    actualUsage = extractUsage(data);
    success = true;

    if (!output) throw new Error("Az AI válasz üres volt.");
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Ismeretlen AI futtatási hiba.";
    throw new Error(errorMessage);
  } finally {
    await appendUsage({
      id: crypto.randomUUID(),
      createdAt: startedAt,
      actionId: action.id,
      noteTitle: note.title || "Cím nélküli bejegyzés",
      model: getModel(),
      estimatedUsd,
      estimatedHuf,
      inputTokenEstimate,
      maxOutputTokens: action.maxOutputTokens,
      actualUsage,
      success,
      error: errorMessage || undefined,
    }).catch(() => undefined);
  }

  return {
    ok: true,
    action,
    output,
    usage: await getDevNotesAiUsageSummary(),
    estimate: {
      inputTokenEstimate,
      maxOutputTokens: action.maxOutputTokens,
      estimatedUsd,
      estimatedHuf,
      hufRange: `${action.estimatedHufMin}–${action.estimatedHufMax} Ft`,
    },
    actualUsage,
    relatedNotes: related.related.map(liteNote),
    sameEpicNotes: related.sameEpic.map(liteNote),
  };
}
