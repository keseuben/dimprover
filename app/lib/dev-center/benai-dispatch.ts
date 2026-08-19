import { buildManualBridgeHandoff } from "./manual-bridge";
export type BenAiBridgeMode = "MANUAL_CHATGPT_BRIDGE" | "OPENAI_RESPONSES";
export type BenAiDispatchStage = "CHAT_ONLY" | "COORDINATOR_ROUTING" | "TASK_ASSIGNED" | "EXECUTOR_NOT_CONFIGURED";

export type BenAiEstimate = {
  minutes: number;
  minMinutes: number;
  maxMinutes: number;
  source: "BENAI_RULE_V1";
};

export type BenAiDispatch = {
  stage: BenAiDispatchStage;
  bridgeMode: BenAiBridgeMode;
  providerConfigured: boolean;
  executorConfigured: boolean;
  selectedWorkerId: string | null;
  selectedWorkerCode: string | null;
  selectedWorkerName: string | null;
  taskId: string | null;
  projectId: string | null;
  summary: string;
  nextStep: string;
  handoffPrompt: string;
  estimate: BenAiEstimate;
};

export function estimateDevelopmentMinutes(instruction: string): BenAiEstimate {
  const value = String(instruction || "").toLocaleLowerCase("hu-HU");
  let minutes = 45;
  if (value.length > 280) minutes += 20;
  if (value.length > 700) minutes += 25;
  const mediumSignals = [
    "api", "backend", "adatbaz", "database", "postgres", "supabase", "migr", "auth",
    "jogosults", "responsive", "e2e", "integr", "teszt",
  ];
  const highSignals = [
    "security", "biztons", "release", "build", "worktree", "scope", "infrastrukt",
    "terminal", "worker", "parhuzamos", "compare", "osszehasonl",
  ];
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  minutes += Math.min(60, mediumSignals.filter((token) => normalized.includes(token)).length * 15);
  minutes += Math.min(90, highSignals.filter((token) => normalized.includes(token)).length * 18);
  if (/\b(teljes|komplex|end[- ]?to[- ]?end|e2e|minden)\b/.test(normalized)) minutes += 30;
  minutes = Math.max(30, Math.min(360, Math.round(minutes / 15) * 15));
  return {
    minutes,
    minMinutes: Math.max(20, Math.round((minutes * 0.75) / 5) * 5),
    maxMinutes: Math.min(480, Math.round((minutes * 1.45) / 5) * 5),
    source: "BENAI_RULE_V1",
  };
}

const workerMap: Record<string, { id: string; code: string; name: string } | null> = {
  BENAI: null,
  ARMINAI: { id: "worker_arminai", code: "ARMINAI", name: "Ármin-AI" },
  JAZMINAI: { id: "worker_jazminai", code: "JAZMINAI", name: "Jázmin-AI" },
  OUTMINAI: { id: "worker_outminai", code: "OUTMINAI", name: "Outmin-AI" },
  MFORGE: { id: "worker_mforge", code: "MFORGE", name: "M.Forge-AI" },
  VGUARD: { id: "worker_vguard", code: "VGUARD", name: "V.Guard-AI" },
  EVERYONE: null,
};

export function getBenAiBridgeStatus() {
  const requested = String(process.env.DIMPRO_BENJADMIN_AI_BRIDGE_MODE || "manual_chatgpt_bridge").trim().toLowerCase();
  const providerConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const mode: BenAiBridgeMode = requested === "openai_responses" && providerConfigured ? "OPENAI_RESPONSES" : "MANUAL_CHATGPT_BRIDGE";
  const executorConfigured = Boolean(process.env.DIMPRO_BENJADMIN_WORKER_EXECUTOR_URL?.trim());
  return {
    mode,
    providerConfigured,
    executorConfigured,
    label: mode === "OPENAI_RESPONSES" ? "OpenAI Responses" : "Kézi ChatGPT híd",
  };
}

export function buildBenAiDispatch(input: {
  text: string;
  target: string;
  taskId?: string | null;
  projectId?: string | null;
}) : BenAiDispatch {
  const target = String(input.target || "BENAI").trim().toUpperCase();
  const worker = Object.prototype.hasOwnProperty.call(workerMap, target) ? workerMap[target] : null;
  const bridge = getBenAiBridgeStatus();
  const taskId = input.taskId || null;
  const projectId = input.projectId || null;
  const short = input.text.trim().replace(/\s+/g, " ").slice(0, 260);
  const estimate = estimateDevelopmentMinutes(input.text);

  if (!taskId) {
    return {
      stage: "CHAT_ONLY",
      bridgeMode: bridge.mode,
      providerConfigured: bridge.providerConfigured,
      executorConfigured: bridge.executorConfigured,
      selectedWorkerId: worker?.id || null,
      selectedWorkerCode: worker?.code || null,
      selectedWorkerName: worker?.name || null,
      taskId: null,
      projectId,
      summary: "Az üzenet bekerült a közös fejlesztői beszélgetésbe; fejlesztési task nem készült.",
      nextStep: "Kapcsold be a Fejlesztési feladat létrehozása jelölést és válassz projektet, ha végrehajtható taskot szeretnél.",
      handoffPrompt: `BENJADMIN üzenet: ${short}`,
      estimate,
    };
  }

  if (!worker) {
    const providerText = bridge.mode === "OPENAI_RESPONSES"
      ? "A Ben-AI provider készen áll a koordinációs terv elkészítésére."
      : "A Ben-AI automatikus provider még nincs bekapcsolva; a feladat a kézi ChatGPT-híd koordinációs sorába került.";
    return {
      stage: "COORDINATOR_ROUTING",
      bridgeMode: bridge.mode,
      providerConfigured: bridge.providerConfigured,
      executorConfigured: bridge.executorConfigured,
      selectedWorkerId: null,
      selectedWorkerCode: null,
      selectedWorkerName: null,
      taskId,
      projectId,
      summary: `Ben-AI koordináció szükséges. ${providerText}`,
      nextStep: bridge.mode === "OPENAI_RESPONSES" ? "Ben-AI feladatbontás és worker-választás." : "A ChatGPT Parancstár aktuális munkamenet-promptjával a koordináció folytatható.",
      handoffPrompt: buildManualBridgeHandoff({ taskId, projectId, workerName: "Ben-AI", instruction: `${input.text}\n\nFeladat: bontsd végrehajtható fejlesztési lépésekre, válassz belső workert, tartsd meg a B3/B3.1/B3.2 DEV biztonsági kapukat.` }).prompt,
      estimate,
    };
  }

  const executorText = bridge.executorConfigured
    ? "A worker executor konfigurálva van; a következő kapu a session/worktree előkészítés."
    : "A worker executor még nincs bekötve, ezért a task előirányozva van, de önálló kódfuttatás még nem indul.";
  return {
    stage: bridge.executorConfigured ? "TASK_ASSIGNED" : "EXECUTOR_NOT_CONFIGURED",
    bridgeMode: bridge.mode,
    providerConfigured: bridge.providerConfigured,
    executorConfigured: bridge.executorConfigured,
    selectedWorkerId: worker.id,
    selectedWorkerCode: worker.code,
    selectedWorkerName: worker.name,
    taskId,
    projectId,
    summary: `A task ${worker.name} részére előirányozva. ${executorText}`,
    nextStep: bridge.executorConfigured ? "Session -> repository -> branch -> worktree -> scope lock -> READY." : "A task ChatGPT/MCP átadással végrehajtható; a natív worker executor külön következő fejlesztési blokk.",
    handoffPrompt: buildManualBridgeHandoff({ taskId, projectId, workerName: worker.name, instruction: input.text }).prompt,
    estimate,
  };
}
