import { createHash } from "node:crypto";
import { scanSensitiveText } from "./ai-worker/secret-scanner";

export const MANUAL_BRIDGE_STATES = ["WAITING_HANDOFF", "HANDED_OFF", "RUNNING", "RESULT_PENDING"] as const;
export type ManualBridgeState = typeof MANUAL_BRIDGE_STATES[number];

export type ManualBridgeHandoff = {
  prompt: string;
  sha256: string;
  sensitiveFindings: string[];
  sanitized: boolean;
};

export type ManualBridgeResultInput = {
  summary: string;
  commit?: string | null;
  buildId?: string | null;
  tests?: string | null;
  docs?: string | null;
  nextStep?: string | null;
};

export type ManualBridgeResult = {
  summary: string;
  commit: string | null;
  buildId: string | null;
  tests: string | null;
  docs: string | null;
  nextStep: string | null;
  sha256: string;
  sanitized: boolean;
  sensitiveFindings: string[];
};

function sanitizeResultText(value: unknown, max: number) {
  const raw = clean(value, max);
  if (!raw) return { value: null as string | null, findings: [] as string[] };
  const findings = scanSensitiveText(raw);
  return { value: findings.length ? `[ÉRZÉKENY ADAT MASZKOLVA – ${findings.join(", ")}]` : raw, findings };
}

export function buildManualBridgeResult(input: ManualBridgeResultInput): ManualBridgeResult {
  const summary = sanitizeResultText(input.summary, 2400);
  const tests = sanitizeResultText(input.tests, 2400);
  const docs = sanitizeResultText(input.docs, 2400);
  const nextStep = sanitizeResultText(input.nextStep, 2400);
  const findings = [...new Set([...summary.findings, ...tests.findings, ...docs.findings, ...nextStep.findings])];
  const commit = clean(input.commit, 80) || null;
  const buildId = clean(input.buildId, 160) || null;
  const canonical = {
    summary: summary.value || "",
    commit,
    buildId,
    tests: tests.value,
    docs: docs.value,
    nextStep: nextStep.value,
  };
  return {
    ...canonical,
    sha256: createHash("sha256").update(JSON.stringify(canonical)).digest("hex"),
    sanitized: findings.length > 0,
    sensitiveFindings: findings,
  };
}

function clean(value: unknown, max = 8000) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

export function normalizeManualBridgeState(value: unknown): ManualBridgeState | null {
  const state = clean(value, 40).toUpperCase();
  return (MANUAL_BRIDGE_STATES as readonly string[]).includes(state) ? state as ManualBridgeState : null;
}

export function buildManualBridgeHandoff(input: {
  taskId: string;
  projectId?: string | null;
  workerName: string;
  instruction: string;
}): ManualBridgeHandoff {
  const rawInstruction = clean(input.instruction);
  const sensitiveFindings = scanSensitiveText(rawInstruction);
  const instruction = sensitiveFindings.length
    ? `[ÉRZÉKENY ADAT MASZKOLVA – ${sensitiveFindings.join(", ")}]. Az eredeti taskot csak SANITIZED adattal add át az AI-nak.`
    : rawInstruction;
  const prompt = [
    "BENJADMIN FEJLESZTÉSI TASK",
    `Task: ${clean(input.taskId, 160) || "—"}`,
    `Projekt: ${clean(input.projectId, 160) || "—"}`,
    `Felelős: ${clean(input.workerName, 160) || "—"}`,
    "Utasítás:",
    instruction || "—",
    "",
    "DEV-only végrehajtás.",
    "Kötelező lánc: status -> read -> backup -> task/session/worktree/scope -> code -> docs -> tsc -> lint -> targeted acceptance -> build -> DEV restart -> smoke -> commit/handoff.",
    "Kódolási aktivitás: analysis / coding / file-change / diff / test / build / commit / release mérföldköveknél küldj SANITIZED worker activity eseményt a `node scripts/benjadmin-worker-activity.mjs` helpernek JSON stdin-en. Minden eseményben add meg, ha ismert: `mainModule`, `moduleName`, `submoduleName`, `workItem`, `activityAction`, `workStageIndex` és 2–4 mondatos `activityNarrative`. A 6-os fázisskála: 1 elemzés/előkészítés, 2 fejlesztés, 3 tesztelés, 4 ellenőrzés/javítás, 5 build/kiadás, 6 lezárás/átadás. Nyers terminálkimenetet vagy titkot ne naplózz.",
    "PROD módosítás nincs. Titkokat, nyers credentialt, .env értéket vagy privát kulcsot ne adj vissza és ne írj naplóba.",
  ].join("\n");
  return {
    prompt,
    sha256: createHash("sha256").update(prompt).digest("hex"),
    sensitiveFindings,
    sanitized: sensitiveFindings.length > 0,
  };
}

export function assertManualBridgeTransition(currentValue: unknown, target: Exclude<ManualBridgeState, "WAITING_HANDOFF">) {
  const current = normalizeManualBridgeState(currentValue) || "WAITING_HANDOFF";
  const expected: Record<typeof target, ManualBridgeState> = {
    HANDED_OFF: "WAITING_HANDOFF",
    RUNNING: "HANDED_OFF",
    RESULT_PENDING: "RUNNING",
  };
  return { current, expected: expected[target], allowed: current === expected[target] };
}
