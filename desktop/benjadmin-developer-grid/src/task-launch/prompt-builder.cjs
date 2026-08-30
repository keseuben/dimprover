"use strict";

const LAUNCHABLE_TASK_STATUSES = new Set(["ready", "claimed"]);
const TASK_LAUNCH_PROMPT_MARKER = "BENJADMIN_PROMPT_KIND: TASK_LAUNCH_V2";

function cleanText(value, maxLength = 4000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function hasMeaningfulList(value) {
  if (Array.isArray(value)) return value.some((item) => cleanText(item, 500));
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  const raw = cleanText(value, 5000);
  if (!raw) return false;
  if (["[]", "{}", "null", "undefined", "nincs", "none"].includes(raw.toLowerCase())) return false;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length > 0;
    if (parsed && typeof parsed === "object") return Object.keys(parsed).length > 0;
  } catch { /* free text is allowed */ }
  return true;
}

function taskLaunchGate(task) {
  if (!task || typeof task !== "object") return { ok: false, code: "TASK_MISSING", error: "A BENJADMIN task nem érhető el." };
  const scopeOk = hasMeaningfulList(task.scopeText ?? task.scope ?? task.allowedScope ?? task.allowedScopes);
  const acceptanceOk = hasMeaningfulList(task.acceptanceText ?? task.acceptance ?? task.acceptanceCriteria);
  if (!scopeOk || !acceptanceOk) {
    const missing = [!scopeOk ? "engedélyezett scope" : "", !acceptanceOk ? "acceptance" : ""].filter(Boolean).join(" és ");
    return {
      ok: false,
      code: "TASK_CONTRACT_INCOMPLETE",
      error: `A feladat nem indítható: hiányzik vagy üres a ${missing}. A ChatGrid fail-closed módban nem küld fejlesztési promptot.`
    };
  }
  return { ok: true, code: "READY" };
}

function isTaskAwaitingChatLaunch(task) {
  if (!task || typeof task !== "object") return false;
  const status = cleanText(task.status, 40).toLowerCase();
  const explicitChatPlan = Boolean(cleanText(task.chatLaunchMode ?? task.chatLaunch?.chatLaunchMode, 40));
  return LAUNCHABLE_TASK_STATUSES.has(status) && (explicitChatPlan || !cleanText(task.startedAt, 80));
}

function buildWorkerTaskPrompt({ task, workerCode, workerLabel, presence }) {
  const gate = taskLaunchGate(task);
  if (!gate.ok) throw new Error(gate.error);
  const title = cleanText(task?.title, 500) || "BENJADMIN fejlesztési feladat";
  const description = cleanText(task?.description, 7000);
  const scope = cleanText(task?.scopeText ?? task?.scope ?? task?.allowedScope, 2500);
  const acceptance = cleanText(task?.acceptanceText ?? task?.acceptance ?? task?.acceptanceCriteria, 2500);
  const branch = cleanText(task?.branchName, 500);
  const worktree = cleanText(task?.worktreePath, 800);
  const projectId = cleanText(task?.projectId, 200);
  const priority = Number.isFinite(Number(task?.priority)) ? String(Number(task.priority)) : "";
  const label = cleanText(workerLabel, 80) || cleanText(workerCode, 80) || "Kódmérnök";
  const context = [presence?.mainModule, presence?.moduleName, presence?.submoduleName]
    .map((item) => cleanText(item, 200)).filter(Boolean).join(" › ");

  const lines = [TASK_LAUNCH_PROMPT_MARKER, `${label}, új BENJADMIN fejlesztési feladat érkezett.`, "", `FELADAT: ${title}`];
  if (description) lines.push(`LEÍRÁS: ${description}`);
  if (priority) lines.push(`PRIORITÁS: ${priority}`);
  if (projectId) lines.push(`PROJECT ID: ${projectId}`);
  if (context) lines.push(`BENJADMIN KONTEXTUS: ${context}`);
  lines.push(`ENGEDÉLYEZETT SCOPE: ${scope}`);
  if (branch) lines.push(`BRANCH: ${branch}`);
  if (worktree) lines.push(`WORKTREE: ${worktree}`);
  lines.push(`ACCEPTANCE: ${acceptance}`);

  lines.push(
    "",
    "KÖRNYEZET: kizárólag DEV.",
    "PROD DENY: production hozzáférés, módosítás, deploy, restart vagy adatváltoztatás tilos.",
    "Más worker scope-ját és fájljait ne módosítsd. Shared build/release/migration/restart/cutover csak központi koordinációs lock alatt történhet.",
    "",
    "Ez TASK_LAUNCH prompt. Csak explicit BenjAdmin/BenAI INDÍTÁS után használható; ÁTADÁS folyamatból soha nem indulhat automatikusan.",
    "Munkakezdéskor az első státuszsor pontosan: MUNKAFELVÉTEL: YYYY.MM.DD. HH:MM",
    "Munka végén: MUNKA VISSZAADVA: YYYY.MM.DD. HH:MM; add meg az eltelt időt és az állapotot is.",
    `Lezáráskor frissítsd a worker tartós handoffját is: /srv/dimpro-dev/handoffs/${cleanText(workerCode, 40) || "WORKER"}_LATEST.md`,
    "A LATEST handoff tartalmazza: task, branch/worktree, HEAD commit, tesztek, blokkolók, aktuális állapot és következő lépés.",
    "",
    "A feladatot most vedd fel, ellenőrizd a DEV aktuális állapotát és csak ezután kezdj módosítani."
  );
  return lines.join("\n");
}

module.exports = {
  LAUNCHABLE_TASK_STATUSES,
  TASK_LAUNCH_PROMPT_MARKER,
  hasMeaningfulList,
  taskLaunchGate,
  isTaskAwaitingChatLaunch,
  buildWorkerTaskPrompt,
};
