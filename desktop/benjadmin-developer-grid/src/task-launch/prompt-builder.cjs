"use strict";

const LAUNCHABLE_TASK_STATUSES = new Set(["ready", "claimed"]);
const TASK_LAUNCH_PROMPT_MARKER = "BENJADMIN_PROMPT_KIND: TASK_LAUNCH_V3";

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
  const branchOk = Boolean(cleanText(task.branchName, 500));
  const worktreeOk = Boolean(cleanText(task.worktreePath, 800));
  const headOk = /^[0-9a-f]{40}$/i.test(cleanText(task.sourceHead ?? task.baseHead ?? task.startHead, 80));
  const sessionOk = Boolean(cleanText(task.sessionId ?? task.activeSessionId, 220));
  if (!scopeOk || !acceptanceOk || !branchOk || !worktreeOk || !headOk || !sessionOk) {
    const missing = [!scopeOk ? "engedélyezett scope" : "", !acceptanceOk ? "acceptance" : "", !branchOk ? "branch" : "", !worktreeOk ? "worktree" : "", !headOk ? "base HEAD" : "", !sessionOk ? "sessionId" : ""].filter(Boolean).join(", ");
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
  const sourceHead = cleanText(task?.sourceHead ?? task?.baseHead ?? task?.startHead, 80);
  const sessionId = cleanText(task?.sessionId ?? task?.activeSessionId, 220);
  const projectId = cleanText(task?.projectId, 200);
  const priority = Number.isFinite(Number(task?.priority)) ? String(Number(task.priority)) : "";
  const label = cleanText(workerLabel, 80) || cleanText(workerCode, 80) || "Kódmérnök";
  const context = [presence?.mainModule, presence?.moduleName, presence?.submoduleName]
    .map((item) => cleanText(item, 200)).filter(Boolean).join(" › ");

  const lines = [TASK_LAUNCH_PROMPT_MARKER, `${label}, új BENJADMIN fejlesztési feladat érkezett.`, "", "LAUNCH PACKET · AUTHORITATIVE", `FELADAT: ${title}`];
  if (description) lines.push(`LEÍRÁS: ${description}`);
  if (priority) lines.push(`PRIORITÁS: ${priority}`);
  if (projectId) lines.push(`PROJECT ID: ${projectId}`);
  if (context) lines.push(`BENJADMIN KONTEXTUS: ${context}`);
  const continuityWorker = cleanText(task?.continuityPreviousWorkerCode, 80);
  const continuityTask = cleanText(task?.continuityPreviousTaskId, 220);
  const continuityHandoff = cleanText(task?.continuityHandoffId, 220);
  const continuitySummary = cleanText(task?.continuityHandoffSummary, 1200);
  const continuityRouting = cleanText(task?.continuityRouting, 80);
  if (continuityWorker || continuityTask || continuityHandoff || continuitySummary) {
    lines.push("", "FOLYTATÁSI KONTEXTUS – CENTRAL CORE:");
    if (continuityWorker) lines.push(`Előző kódmérnök: ${continuityWorker}`);
    if (continuityTask) lines.push(`Előző task: ${continuityTask}`);
    if (continuityHandoff) lines.push(`Legfrissebb hiteles handoff ID: ${continuityHandoff}`);
    if (continuityRouting) lines.push(`Routing: ${continuityRouting}`);
    if (continuitySummary) lines.push(`Átadó összefoglaló: ${continuitySummary}`);
    lines.push("A folytatás előtt ellenőrizd a legfrissebb hiteles handoffot és a hozzárendelt Context Packot. Ha eltérés van a jelenlegi utasítással, jelöld: SOURCE_CONFLICT / BENJADMIN DECISION REQUIRED.");
  }
  lines.push(`ENGEDÉLYEZETT SCOPE: ${scope}`);
  if (branch) lines.push(`BRANCH: ${branch}`);
  if (worktree) lines.push(`WORKTREE: ${worktree}`);
  if (sourceHead) lines.push(`BASE HEAD: ${sourceHead}`);
  if (sessionId) lines.push(`SESSION ID: ${sessionId}`);
  lines.push(`ACCEPTANCE: ${acceptance}`);

  lines.push(
    "",
    "KÖRNYEZET: kizárólag DEV.",
    "PROD DENY: production hozzáférés, módosítás, deploy, restart vagy adatváltoztatás tilos.",
    "Más worker scope-ját és fájljait ne módosítsd. Shared build/release/migration/restart/cutover csak központi koordinációs lock alatt történhet.",
    "",
    "Ez TASK_LAUNCH prompt. Csak explicit BenjAdmin / Central Core INDÍTÁS után használható; ÁTADÁS folyamatból soha nem indulhat automatikusan.",
    "KÓDOLÁS ELŐTT kötelező a BOOT ACKNOWLEDGEMENT. Az ACK előtt semmilyen fájlírás, commit, build, release vagy konfigurációmódosítás nem engedélyezett.",
    "Az első válaszod pontosan tartalmazza ezt a blokkot:",
    "BOOT ACKNOWLEDGEMENT",
    `Worker: ${cleanText(workerCode, 40)}`,
    `Task: ${cleanText(task?.id, 220)}`,
    `Session: ${sessionId}`,
    `Project/Module: ${projectId || "—"} / ${context || "—"}`,
    `Branch: ${branch}`,
    `Worktree: ${worktree}`,
    `Base HEAD: ${sourceHead}`,
    `Read/Write scope: ${scope}`,
    "Deny scope: PROD, más worker scope, nem engedélyezett path",
    "Active directive: DEV ONLY · PROD DENY",
    "Prior state: ellenőrizendő a Context Pack / handoff alapján",
    "First check: git branch + HEAD + worktree clean/expected + scope/lock",
    "Risk/blocker: <röviden>",
    "Coding allowed: YES vagy NO",
    "Ha branch/worktree/HEAD/scope eltér: Coding allowed: NO és SOURCE_BASELINE_MISMATCH / CLARIFICATION_REQUIRED. Ne írj fájlt.",
    "Ha minden egyezik, az ACK után ugyanabban a válaszban csak az elemzési/preflight eredményt add meg; tényleges fájlírást csak az ACK érvényessége után kezdj.",
    "MUNKAFELVÉTEL: YYYY.MM.DD. HH:MM",
    "Minden érdemi munkarész után frissítsd a Developer Grid központi fejlesztési állapotát: mit végeztél, mely fájlokon/területen, milyen teszt/commit/build eredménnyel és mi a következő lépés. Ne csak a munka végén legyen központi nyoma.",
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
