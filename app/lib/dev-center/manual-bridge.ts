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
