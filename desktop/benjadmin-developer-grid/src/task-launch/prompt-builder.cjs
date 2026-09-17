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
  const proof = task.sourceExecutionProof && typeof task.sourceExecutionProof === "object" ? task.sourceExecutionProof : null;
  const proofOk = Boolean(proof
    && proof.state === "VERIFIED"
    && proof.authority === "CENTRAL_CORE"
    && proof.handshakeStage === "READY"
    && proof.productionAccess === "DENY"
    && /^[0-9a-f]{64}$/i.test(cleanText(proof.sha256, 80))
    && Number(proof.activeScopeLockCount || 0) >= 1
    && Number(proof.activeWorktreeLeaseCount || 0) >= 1);
  if (!scopeOk || !acceptanceOk || !branchOk || !worktreeOk || !headOk || !sessionOk || !proofOk) {
    const missing = [!scopeOk ? "engedélyezett scope" : "", !acceptanceOk ? "acceptance" : "", !branchOk ? "branch" : "", !worktreeOk ? "worktree" : "", !headOk ? "base HEAD" : "", !sessionOk ? "sessionId" : "", !proofOk ? "Central Core source proof" : ""].filter(Boolean).join(", ");
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
  const sourceProof = task?.sourceExecutionProof && typeof task.sourceExecutionProof === "object" ? task.sourceExecutionProof : null;
  const sourceProofSha256 = cleanText(sourceProof?.sha256, 80).toLowerCase();
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
  const continuityContextId = cleanText(task?.continuityContextSnapshotId, 240);
  const continuityContextRevision = Number(task?.continuityContextRevision) || null;
  const continuityContextSummary = cleanText(task?.continuityContextSummary, 5000);
  const continuityRouting = cleanText(task?.continuityRouting, 80);
  if (continuityWorker || continuityTask || continuityHandoff || continuitySummary || continuityContextId || continuityContextSummary) {
    lines.push("", "FOLYTATÁSI KONTEXTUS – CENTRAL CORE:");
    if (continuityWorker) lines.push(`Előző kódmérnök: ${continuityWorker}`);
    if (continuityTask) lines.push(`Előző task: ${continuityTask}`);
    if (continuityHandoff) lines.push(`Legfrissebb hiteles handoff ID: ${continuityHandoff}`);
    if (continuityContextId) lines.push(`Legfrissebb automatikus Context Snapshot: ${continuityContextId}${continuityContextRevision ? ` · r${continuityContextRevision}` : ""}`);
    if (continuityRouting) lines.push(`Routing: ${continuityRouting}`);
    if (continuitySummary) lines.push(`Átadó összefoglaló: ${continuitySummary}`);
    if (continuityContextSummary) lines.push(`Automatikus folytatási kontextus:
${continuityContextSummary}`);
    lines.push("A folytatás előtt ellenőrizd a legfrissebb hiteles handoffot, automatikus Context Snapshotot és a hozzárendelt Context Packot. A RAW Black Box transcript nem feladatprompt és nem másolható vissza vakon. Ha eltérés van a jelenlegi utasítással, jelöld: SOURCE_CONFLICT / BENJADMIN DECISION REQUIRED.");
  }
  lines.push(`ENGEDÉLYEZETT SCOPE: ${scope}`);
  if (branch) lines.push(`BRANCH: ${branch}`);
  if (worktree) lines.push(`WORKTREE: ${worktree}`);
  if (sourceHead) lines.push(`BASE HEAD: ${sourceHead}`);
  if (sessionId) lines.push(`SESSION ID: ${sessionId}`);
  if (sourceProofSha256) {
    lines.push(
      "",
      "CENTRAL CORE SOURCE PREFLIGHT PROOF",
      `State: ${cleanText(sourceProof?.state, 40)}`,
      `Authority: ${cleanText(sourceProof?.authority, 40)}`,
      `Proof SHA-256: ${sourceProofSha256}`,
      `Verified at: ${cleanText(sourceProof?.verifiedAt, 100)}`,
      `Engine session: ${cleanText(sourceProof?.engineSessionId, 240)}`,
      `Handshake: ${cleanText(sourceProof?.handshakeStage, 40)}`,
      `Scope locks: ${Number(sourceProof?.activeScopeLockCount || 0)}`,
      `Worktree leases: ${Number(sourceProof?.activeWorktreeLeaseCount || 0)}`,
      "Production access: DENY"
    );
  }
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
    `Source proof: ${sourceProofSha256}`,
    `Read/Write scope: ${scope}`,
    "Deny scope: PROD, más worker scope, nem engedélyezett path",
    "Active directive: DEV ONLY · PROD DENY",
    "Prior state: ellenőrizendő a Context Pack / handoff alapján",
    "First check: ellenőrizd a Launch Packet CENTRAL CORE SOURCE PREFLIGHT PROOF blokkját, a proof SHA-256 értékét és a Context Pack / handoff folytonosságát",
    "Risk/blocker: <röviden>",
    "Coding allowed: YES vagy NO",
    "SOURCE AUTHORITY SZABÁLY: a Launch Packet WORKTREE/BRANCH/BASE HEAD + CENTRAL CORE SOURCE PREFLIGHT PROOF együtt authoritative. Ne helyettesítsd /root/dimprover, scratch repo, default MCP cwd vagy más lokális Git nézettel.",
    "Ha a CENTRAL CORE proof State=VERIFIED, Authority=CENTRAL_CORE, Handshake=READY, legalább 1 scope lock és 1 worktree lease szerepel, valamint a BOOT ACK Source proof mezőjébe pontosan visszaadod a Proof SHA-256 értéket, akkor a source/scope preflight teljesítettnek tekintendő. A ChatGPT saját környezetéből közvetlen /srv fájlrendszer- vagy MCP-mount hiánya önmagában NEM preflight blocker és emiatt Coding allowed: NO nem adható.",
    "SOURCE_BASELINE_MISMATCH csak a Central Core által jelzett proof/provenance eltérésre használható. A saját ChatGPT sandboxból hiányzó /srv útvonalat ne minősítsd source mismatchnek.",
    "EXECUTION CHANNEL: CENTRAL_CORE_EXECUTION_BRIDGE_V1. ChatGPT surface esetén ez az authoritative, task-worktree + scope-lock + lease kötött DEV végrehajtási csatorna; külön VPS/MCP mount nem szükséges.",
    "A Central Core proof VERIFIED + READY állapotában ne jelents EXECUTION_TOOL_UNAVAILABLE hibát pusztán azért, mert nincs közvetlen shell/MCP fájlrendszered. A tényleges fájlműveleteket a BOOT ACK validálása után kapott BENJADMIN_EXECUTION_REQUEST_V1 protokollal kérd.",
    "A bridge kizárólag DEV: PROD/deploy/restart/migration tiltott, nyers shell-parancsot nem fogad.",
    "Ne írj fájlt, amíg a BOOT ACK nincs validálva.",
    "Ha minden egyezik, az ACK után ugyanabban a válaszban csak az elemzési/preflight eredményt add meg; tényleges fájlírást csak az ACK érvényessége után kezdj.",
    "MUNKAFELVÉTEL: YYYY.MM.DD. HH:MM",
    "Minden érdemi munkarész után frissítsd a Developer Grid központi fejlesztési állapotát: mit végeztél, mely fájlokon/területen, milyen teszt/commit/build eredménnyel és mi a következő lépés. Ne csak a munka végén legyen központi nyoma.",
    "A 6 lépcsős folyamat minden állomásának végén kötelező a DEVELOPER_GRID_STAGE_ACTION_V1 által kért BENJADMIN_STAGE_REPORT_V1 gépi blokk. A desktop ezt automatikusan evidence-ként rögzíti; stage-et szöveges állítással átugrani tilos.",
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
