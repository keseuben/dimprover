"use strict";

const api = window.chatGrid;
const WORKER_OPTIONS = ["ARMINAI", "OUTMINAI", "BENAI", "JAZMINAI"];
const WORKER_DEFAULT_LABELS = {
  ARMINAI: "ÁrminAI",
  JAZMINAI: "JázminAI",
  OUTMINAI: "OutminAI",
  BENAI: "BenjáminAI"
};
const WORKER_SPEECH_LABELS = {
  ARMINAI: "Ármin AI",
  JAZMINAI: "Jázmin AI",
  OUTMINAI: "Outmin AI",
  BENAI: "Benjámin AI",
  MFORGE: "M Forge AI",
  VGUARD: "V Guard AI"
};
const WORKER_AVATAR_PATHS = {
  BENAI: "../assets/team/benai.webp",
  OUTMINAI: "../assets/team/outminai.webp",
  ARMINAI: "../assets/team/arminai.webp",
  JAZMINAI: "../assets/team/jazminai.webp"
};
const WORKER_ROLE_LABELS = Object.freeze({
  ARMINAI: "BELSŐ KÓDMÉRNÖK",
  OUTMINAI: "PARTNER KÓDMÉRNÖK",
  BENAI: "INTEGRÁLT KÓDMÉRNÖK",
  JAZMINAI: "BELSŐ KÓDMÉRNÖK"
});
const BENJADMIN_PROFILES = {
  BENAI: {
    code: "BENAI", name: "Benjámin-AI", title: "Integrált AI kódmérnök · full-stack / rendszerintegráció", category: "Integrált kódmérnök", image: "../assets/team/benai.webp",
    shortDescription: "Full-stack, rendszerintegrációs és több modult összekapcsoló fejlesztési feladatok integrált AI kódmérnöke.",
    detailedDescription: "A BENJADMIN Central Core által kiosztott teljes értékű DEV fejlesztési feladatokon dolgozik. Full-stack implementációt, rendszerintegrációt, hibajavítást, API- és Windows/desktop fejlesztést, tesztelést, acceptance és build/release-gate feladatokat is végezhet a saját task/session/worktree scope-ján belül. A központi koordináció a BENJADMIN Central Core / Grid Orchestrator feladata.",
    responsibilities: ["Full-stack implementáció és hibajavítás", "Rendszerintegráció, API és Windows/desktop fejlesztés", "Teszt, acceptance, build és release-gate feladatok"]
  },
  OUTMINAI: {
    code: "OUTMINAI", name: "Outmin-AI", title: "Külső kódmérnök · partner fejlesztési sík", category: "Partner kódmérnök", image: "../assets/team/outminai.webp",
    shortDescription: "Partner- és külső termékek izolált fejlesztési síkjának kódmérnöke.",
    detailedDescription: "Kizárólag a Partner Development Plane kijelölt projektjein dolgozhat. Saját repository/worktree/secret/storage izolációt kap, a belső DIMPRO írás és a PROD hozzáférés alapértelmezetten tiltott. A partnerfejlesztések átadását auditált handoff folyamat zárja.",
    responsibilities: ["Partner- és külső projektek fejlesztése", "Elkülönített partner worktree és scope", "Belső DIMPRO/PROD hozzáférés: DEFAULT DENY"]
  },
  ARMINAI: {
    code: "ARMINAI", name: "Ármin-AI", title: "Belső kódmérnök · frontend / alkalmazás", category: "Belső kódmérnök", image: "../assets/team/arminai.webp",
    shortDescription: "Frontend, alkalmazáslogika és reszponzív felületek elsődleges belső kódmérnöke.",
    detailedDescription: "A DIMPRO és DIMPROVER felhasználói felületeinek, komponenseinek és kliensoldali alkalmazáslogikájának fejlesztésére specializált belső kódmérnök. Munkája izolált DEV task/session/worktree és scope-lock keretben történik, kötelező teszt- és acceptance ellenőrzéssel.",
    responsibilities: ["Frontend és komponensfejlesztés", "Reszponzív UI és alkalmazáslogika", "Frontend teszt és browser acceptance"]
  },
  JAZMINAI: {
    code: "JAZMINAI", name: "Jázmin-AI", title: "Belső kódmérnök · backend / adatbázis", category: "Belső kódmérnök", image: "../assets/team/jazminai.webp",
    shortDescription: "Backend, API, adatmodell és tesztelés elsődleges belső kódmérnöke.",
    detailedDescription: "A szerveroldali logika, API-k, adatmodellek, migrációs tervek, integrációk és backend tesztek fejlesztésére fókuszál. Adatbázis- és biztonságérzékeny változtatásai a BENJADMIN szabályai szerint külön preflight és acceptance kapukon mennek át.",
    responsibilities: ["Backend és API implementáció", "Adatmodell és migrációs fejlesztés", "Backend teszt, regresszió és adatbiztonság"]
  },
  BENJADMIN: {
    code: "BENJADMIN", name: "BenjAdmin", title: "Rendszergazda · fejlesztési vezető · rendszertulajdonos", category: "Emberi főirányító", image: "../assets/team/benjadmin.webp",
    shortDescription: "A DIMPRO BENJADMIN fejlesztési és üzemeltetési rendszer végső emberi döntéshozója.",
    detailedDescription: "Meghatározza a fejlesztési prioritásokat, jóváhagyja a műszaki irányokat és az érzékeny műveleteket. A PROD környezetet érintő módosításokhoz kizárólag az ő explicit engedélye adhat felhatalmazást. A csapat és az AI workerek működését termék- és műszaki nyelven vezérli.",
    responsibilities: ["Fejlesztési prioritások és végső döntések", "BENJADMIN Gate és érzékeny műveletek jóváhagyása", "PROD módosítások explicit engedélyezése"]
  }
};
const STAGE_LABELS = {
  1: "1/6 · ELEMZÉS",
  2: "2/6 · FEJLESZTÉS",
  3: "3/6 · TESZTELÉS",
  4: "4/6 · ELLENŐRZÉS",
  5: "5/6 · BUILD / KIADÁS",
  6: "6/6 · LEZÁRÁS"
};
const STAGE_SPEECH_LABELS = {
  1: "elemzési",
  2: "fejlesztési",
  3: "tesztelési",
  4: "ellenőrzési",
  5: "build és kiadási",
  6: "lezárási"
};
let notificationAudioContext = null;

const state = {
  security: null,
  config: null,
  live: null,
  connection: { benjadmin: false, configured: false, mode: "none", device: null, pairing: { status: "idle" } },
  layout: { maximizedCellId: null, centralVisible: false, layoutMode: "grid4", splitView: { left: "cell-1", right: "cell-2" }, workspaceZoomPercent: 100, openCellIds: [] },
  setupMode: false,
  lockoutTimer: null,
  review: { snapshot: null, selectedTaskId: null, loading: false, lastFetchedAt: 0, timer: null },
  notificationDiagnostics: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeText(value) {
  return String(value ?? "");
}

function workerCodeForCell(cellId) {
  return state.config?.cells?.find((cell) => cell.id === cellId)?.workerCode || "";
}

function cellForWorker(workerCode) {
  return state.config?.cells?.find((cell) => cell.workerCode === workerCode) || null;
}

function setConnectionUi(label, tone = "offline") {
  const dot = $("#connectionDot");
  dot.classList.remove("is-online", "is-warning", "is-offline");
  dot.classList.add(tone === "online" ? "is-online" : tone === "warning" ? "is-warning" : "is-offline");
  $("#connectionLabel").textContent = label;
}

function renderSecurity(security) {
  state.security = security;
  const gate = $("#authGate");
  const unlocked = security?.unlocked === true;
  gate.classList.toggle("is-hidden", unlocked);
  $("#themeButton").disabled = !unlocked;
  $("#settingsButton").disabled = !unlocked;
  $("#dailyStartButton").disabled = !unlocked;
  $("#reviewButton").disabled = !unlocked;
  $("#lockButton").disabled = !unlocked;
  $("#layoutModeButton").disabled = !unlocked;
  $("#workspaceZoomOut").disabled = !unlocked;
  $("#workspaceZoomValue").disabled = !unlocked;
  $("#workspaceZoomIn").disabled = !unlocked;

  if (unlocked) {
    stopLockoutCountdown();
    setConnectionUi(state.connection.benjadmin ? "BENJADMIN élő kapcsolat" : "BENJADMIN kapcsolat ellenőrzése…", state.connection.benjadmin ? "online" : "warning");
    return;
  }

  $("#workerProfileLayer")?.classList.add("is-hidden");
  $("#reviewLayer")?.classList.add("is-hidden");
  stopReviewPolling();
  state.setupMode = !security?.hasPassword;
  $("#authTitle").textContent = state.setupMode ? "Developer Grid jelszó létrehozása" : "Munkatér feloldása";
  $("#authDescription").textContent = state.setupMode
    ? "Első indítás: állíts be helyi jelszót. A négy ChatGPT fejlesztői felület csak ezután jön létre."
    : "A négy ChatGPT fejlesztői felület csak a helyi jelszó megadása után jelenik meg.";
  $("#authSubmit").textContent = state.setupMode ? "Jelszó mentése és megnyitás" : "Feloldás";
  $("#confirmGroup").classList.toggle("is-hidden", !state.setupMode);
  $("#passwordConfirmInput").required = state.setupMode;
  $("#authError").textContent = "";
  $("#passwordInput").value = "";
  $("#passwordConfirmInput").value = "";
  setConnectionUi("Zárolva", "offline");
  if (security?.lockedUntil > Date.now()) startLockoutCountdown(security.lockedUntil);
  window.setTimeout(() => $("#passwordInput").focus(), 30);
}

function startLockoutCountdown(until) {
  stopLockoutCountdown();
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    $("#authSubmit").disabled = remaining > 0;
    $("#authError").textContent = remaining > 0 ? `Túl sok hibás próbálkozás. Újrapróbálás ${remaining} mp múlva.` : "";
    if (remaining <= 0) stopLockoutCountdown();
  };
  tick();
  state.lockoutTimer = window.setInterval(tick, 250);
}

function stopLockoutCountdown() {
  if (state.lockoutTimer) window.clearInterval(state.lockoutTimer);
  state.lockoutTimer = null;
  $("#authSubmit").disabled = false;
}

async function loadUnlockedState() {
  const [configResult, connectionResult] = await Promise.all([api.getConfig(), api.getConnectionState()]);
  if (configResult?.ok && configResult.config) {
    state.config = configResult.config;
    renderConfig();
  }
  state.connection.configured = Boolean(connectionResult?.configured);
  state.connection.mode = connectionResult?.mode || "none";
  state.connection.device = connectionResult?.device || null;
  state.connection.pairing = connectionResult?.pairing || { status: "idle" };
  if (!state.connection.configured) setConnectionUi("BENJADMIN élő státuszkapcsolat nincs párosítva", "warning");
  renderConnectionSettings();
  startReviewPolling();
}

function activeTaskForWorker(workerCode) {
  if (!state.live || !workerCode) return null;
  const worker = state.live.workers?.find((item) => item.code === workerCode);
  if (!worker) return null;
  const openStatuses = new Set(["claimed", "in_progress", "testing", "blocked", "ready"]);
  return state.live.tasks?.find((task) => openStatuses.has(task.status) && (task.assignedWorkerId === worker.id || task.requestedWorkerId === worker.id)) || null;
}

function recentCompletedTaskForWorker(workerCode) {
  if (!state.live || !workerCode) return null;
  const worker = state.live.workers?.find((item) => item.code === workerCode);
  if (!worker) return null;
  const cutoff = Date.now() - 36 * 60 * 60 * 1000;
  return [...(state.live.tasks || [])]
    .filter((task) => {
      if (String(task.status || "").toLowerCase() !== "completed") return false;
      if (task.assignedWorkerId !== worker.id && task.requestedWorkerId !== worker.id) return false;
      const returnedAt = Date.parse(task.completedAt || task.updatedAt || task.createdAt || "");
      return Number.isFinite(returnedAt) && returnedAt >= cutoff;
    })
    .sort((a, b) => Date.parse(b.completedAt || b.updatedAt || b.createdAt || "") - Date.parse(a.completedAt || a.updatedAt || a.createdAt || ""))[0] || null;
}

function displayTaskForWorker(workerCode, presence) {
  return activeTaskForWorker(workerCode) || (!presence?.active ? recentCompletedTaskForWorker(workerCode) : null);
}

function presenceForWorker(workerCode) {
  return state.live?.workerPresence?.find((presence) => presence.workerCode === workerCode) || null;
}

function isTaskAwaitingChatLaunch(task) {
  if (!task) return false;
  return ["ready", "claimed"].includes(String(task.status || "").toLowerCase()) && !task.startedAt;
}

function deriveVisualStatus(presence, task) {
  const taskStatus = String(task?.status || "").toLowerCase();
  if (taskStatus === "blocked" || taskStatus === "failed") return { label: "BLOKKOLVA", tone: "blocked", cellClass: "is-blocked" };
  if (isTaskAwaitingChatLaunch(task)) {
    return task?.chatLaunch?.preparedAt
      ? { label: "CHAT ELŐKÉSZÍTVE", tone: "launch", cellClass: "is-launch-pending" }
      : { label: "INDÍTÁSRA VÁR", tone: "launch", cellClass: "is-launch-pending" };
  }

  // Az aktív BENJADMIN task elsőbbséget élvez a stale/hiányos worker-presence jelzéssel szemben.
  // Így nem fordulhat elő, hogy IN_PROGRESS task mellett a fejléc INAKTÍV állapotot mutat.
  const taskIsActive = new Set(["claimed", "in_progress", "testing", "ready"]).has(taskStatus);
  if (taskIsActive || presence?.active) {
    const stageIndex = Number(presence?.workStageIndex || 0);
    if (stageIndex === 1) return { label: "ELEMZÉS", tone: "active", cellClass: "is-active" };
    if (stageIndex === 2) return { label: "FEJLESZT", tone: "active", cellClass: "is-active" };
    if (taskStatus === "testing" || stageIndex === 3) return { label: "TESZTEL", tone: "testing", cellClass: "is-active" };
    if (stageIndex === 4) return { label: "ELLENŐRIZ", tone: "testing", cellClass: "is-active" };
    if (stageIndex === 5) return { label: "BUILD", tone: "testing", cellClass: "is-active" };
    if (stageIndex === 6) return { label: "LEZÁRÁS", tone: "active", cellClass: "is-active" };
    return { label: taskIsActive ? "AKTÍV" : "DOLGOZIK", tone: "active", cellClass: "is-active" };
  }
  return { label: "INAKTÍV", tone: "idle", cellClass: "" };
}

function applyAppearance() {
  const appearance = state.config?.appearance === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = appearance;
  document.body.classList.toggle("hide-worker-avatars", state.config?.showAvatars === false);
  const button = $("#themeButton");
  if (button) {
    button.textContent = appearance === "dark" ? "☀" : "☾";
    button.title = appearance === "dark" ? "Világos mód bekapcsolása" : "Sötét mód bekapcsolása";
  }
}

function populateSplitSelect(select, selectedId, otherId) {
  select.replaceChildren();
  for (const cell of state.config?.cells || []) {
    const option = document.createElement("option");
    option.value = cell.id;
    option.textContent = cell.label || WORKER_DEFAULT_LABELS[cell.workerCode] || cell.workerCode;
    option.selected = cell.id === selectedId;
    option.disabled = cell.id === otherId;
    select.append(option);
  }
}

function renderSplitControls() {
  if (!state.config) return;
  const split = state.config.splitView || { left: "cell-1", right: "cell-2" };
  populateSplitSelect($("#splitLeftSelect"), split.left, split.right);
  populateSplitSelect($("#splitRightSelect"), split.right, split.left);
  const splitMode = state.config.layoutMode === "split2";
  $("#splitControls").classList.toggle("is-hidden", !splitMode);
  $("#layoutModeButton").textContent = splitMode ? "▥" : "▦";
  $("#layoutModeButton").title = splitMode ? "Vissza 4 cellás nézetre (Ctrl+Alt+6)" : "2 cellás nézet (Ctrl+Alt+6)";
}

function renderConfig() {
  if (!state.config) return;
  applyAppearance();
  for (const cellConfig of state.config.cells) {
    const cell = document.querySelector(`[data-cell-id="${cellConfig.id}"]`);
    if (!cell) continue;
    $("[data-role=worker-label]", cell).textContent = cellConfig.label || WORKER_DEFAULT_LABELS[cellConfig.workerCode] || cellConfig.workerCode;
    const avatar = $("[data-role=worker-avatar]", cell);
    if (avatar) {
      avatar.src = WORKER_AVATAR_PATHS[cellConfig.workerCode] || WORKER_AVATAR_PATHS.BENAI;
      avatar.alt = `${BENJADMIN_PROFILES[cellConfig.workerCode]?.name || cellConfig.label || cellConfig.workerCode} avatar`;
    }
    const avatarButton = $("[data-worker-profile]", cell);
    if (avatarButton) {
      const profileName = BENJADMIN_PROFILES[cellConfig.workerCode]?.name || cellConfig.label || cellConfig.workerCode;
      avatarButton.title = `${profileName} avatar nagyítása · kattintás: munkaköri profil`;
      avatarButton.setAttribute("aria-label", `${profileName} munkaköri profil`);
    }
    const roleBadge = $("[data-role=worker-role]", cell);
    if (roleBadge) {
      roleBadge.textContent = WORKER_ROLE_LABELS[cellConfig.workerCode] || "KÓDMÉRNÖK";
      roleBadge.title = BENJADMIN_PROFILES[cellConfig.workerCode]?.title || roleBadge.textContent;
    }
    cell.classList.toggle("is-disabled", cellConfig.enabled === false);
  }
  const central = state.config.centralChat;
  if (central) $("#centralLabel").textContent = central.label || "BenjAdmin";
  $("#quietModeBadge")?.classList.toggle("is-hidden", state.config.notifications?.quietMode !== true);
  $("#workspaceZoomValue").textContent = `${state.config.workspaceZoomPercent || 100}%`;
  renderSplitControls();
  renderLive();
  renderLayout();
}
function moduleContextForWorker(workerCode, presence, task) {
  const meaningful = (item) => Boolean(String(item?.mainModule || "").trim() || String(item?.moduleName || "").trim());
  if (presence?.active && meaningful(presence)) return presence;
  const haystack = [
    task?.title, task?.description, task?.scopeText,
    presence?.summary, presence?.workItem, presence?.branch, presence?.worktree, presence?.target
  ].map((value) => String(value || "")).join(" ").toLocaleLowerCase("hu-HU");
  const healthContext = /(dimpro[\s_-]*one[^\n]{0,100}(?:health|egészség|egeszseg)|(?:health|egészség|egeszseg)[^\n]{0,100}dimpro[\s_-]*one|one\.dev\.dimpro\.hu\/egeszseg|health_private|dimpro-one-health)/i.test(haystack);
  if (healthContext) {
    return { mainModule: "DIMPRO ONE", moduleName: "Egészség", submoduleName: "Health MVP" };
  }
  if (task && /(commerce|árutér|storefront|productvariant|fulfillment|inventory)/i.test(haystack)) {
    return { mainModule: "DIMPRO Árutér", moduleName: "Commerce Core", submoduleName: "Aktuális fejlesztési munkarész" };
  }
  if (task && /(terep|field capture|gyorsrögzítő|f3|f4)/i.test(haystack)) {
    return { mainModule: "DIMPRO Drop", moduleName: "Terepi Gyorsrögzítő", submoduleName: "Aktuális fejlesztési munkarész" };
  }
  if (task && /(benjadmin|chatgrid|benjadmin-engine)/i.test(haystack)) {
    return { mainModule: "BENJADMIN", moduleName: /chatgrid/i.test(haystack) ? "ChatGrid Desktop" : "AI Fejlesztői Tér", submoduleName: "Aktuális fejlesztési munkarész" };
  }
  if (presence?.active) {
    const historical = (state.live?.workerPresenceHistory || []).find((item) => item.workerCode === workerCode && meaningful(item));
    if (historical) return historical;
  }
  return null;
}

function moduleBadgeText(context, task) {
  const parts = [context?.mainModule, context?.moduleName]
    .map((value) => String(value || "").trim()).filter(Boolean)
    .filter((value, index, all) => all.findIndex((item) => item.toLocaleLowerCase("hu-HU") === value.toLocaleLowerCase("hu-HU")) === index);
  if (parts.length) return parts.join(" · ").toLocaleUpperCase("hu-HU");
  if (task) return "MODUL NINCS MEGADVA";
  return "NINCS AKTÍV MODUL";
}

const STAGE_ACTIONS = Object.freeze({
  1: [{ id: "current-task", label: "AKTUÁLIS TASK" }, { id: "context", label: "KONTEXTUS" }, { id: "checkpoint", label: "CHECKPOINT" }],
  2: [{ id: "current-task", label: "AKTUÁLIS TASK" }, { id: "checkpoint", label: "CHECKPOINT" }],
  3: [{ id: "current-task", label: "AKTUÁLIS TASK" }, { id: "tests", label: "TESZTEK" }, { id: "checkpoint", label: "CHECKPOINT" }],
  4: [{ id: "current-task", label: "AKTUÁLIS TASK" }, { id: "review", label: "REVIEW" }, { id: "checkpoint", label: "CHECKPOINT" }],
  5: [{ id: "build-runtime", label: "BUILD / RUNTIME" }, { id: "checkpoint", label: "CHECKPOINT" }],
  6: []
});

async function handleStageAction(cell, action, task, moduleContext, workItem) {
  const workerCode = cell?.dataset.workerCode || "";
  if (!workerCode || !action) return;
  if (action === "current-task") {
    const moduleLabel = moduleBadgeText(moduleContext, task);
    showToast("Aktuális task", `${task?.title || "Nincs aktív task"}${moduleLabel ? ` · ${moduleLabel}` : ""}${workItem ? ` · ${workItem}` : ""}`);
    return;
  }
  if (action === "context") {
    const result = await api.contextWorkspaceMode("open");
    if (!result?.ok) showToast("Kontextus", result?.error || "A Fejlesztői Vezérlőpult nem nyitható meg.");
    return;
  }
  if (action === "review") {
    await openReviewRoom(task?.id || null);
    return;
  }
  const button = cell.querySelector(`[data-stage-action="${action}"]`);
  if (button) button.disabled = true;
  try {
    const result = await api.prepareStageAction(workerCode, action);
    if (!result?.ok) {
      showToast("Developer Grid művelet", result?.error || "A stage action nem készíthető elő.");
      return;
    }
    showToast(result.mode === "inserted" ? "Prompt előkészítve" : "Prompt a vágólapon", result.message || "Ellenőrizd, majd kézzel küldd el.");
  } finally {
    if (button) button.disabled = false;
  }
}

function renderStageActions(cell, stageIndex, task, moduleContext, workItem) {
  const host = cell.querySelector("[data-role=stage-actions]");
  if (!host) return;
  host.replaceChildren();
  for (const action of STAGE_ACTIONS[stageIndex] || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stage-action-button";
    button.dataset.stageAction = action.id;
    button.textContent = action.label;
    button.title = action.id === "checkpoint"
      ? "Biztonságos DEV checkpoint prompt előkészítése; elküldés csak kézzel"
      : action.id === "tests"
        ? "Célzott tesztelési prompt előkészítése"
        : action.id === "build-runtime"
          ? "DEV build/runtime kapu prompt előkészítése"
          : action.id === "review"
            ? "External Review Room megnyitása az aktuális taskhoz"
            : action.id === "context"
              ? "BENJADMIN Fejlesztői Vezérlőpult megnyitása"
              : "Aktuális task összefoglaló";
    button.addEventListener("click", () => void handleStageAction(cell, action.id, task, moduleContext, workItem));
    host.append(button);
  }
}

function renderLive() {
  if (!state.config) return;
  let workingCount = 0;
  let needsAttentionCount = 0;
  for (const cellConfig of state.config.cells) {
    const cell = document.querySelector(`[data-cell-id="${cellConfig.id}"]`);
    if (!cell) continue;
    const presence = presenceForWorker(cellConfig.workerCode);
    const task = displayTaskForWorker(cellConfig.workerCode, presence);
    const visual = deriveVisualStatus(presence, task);
    const moduleContext = moduleContextForWorker(cellConfig.workerCode, presence, task);
    cell.classList.remove("is-active", "is-blocked", "is-launch-pending");
    if (visual.cellClass) cell.classList.add(visual.cellClass);
    const status = $("[data-role=status]", cell);
    status.textContent = visual.label;
    status.className = `status-pill is-${visual.tone}`;
    if (["active", "testing"].includes(visual.tone)) workingCount += 1;
    if (["blocked", "launch"].includes(visual.tone)) needsAttentionCount += 1;
    const moduleBadge = $("[data-role=module-badge]", cell);
    if (moduleBadge) {
      moduleBadge.textContent = moduleBadgeText(moduleContext, task);
      moduleBadge.title = moduleBadge.textContent;
    }

    const pathParts = moduleContext ? [moduleContext.mainModule, moduleContext.moduleName, moduleContext.submoduleName].filter(Boolean) : [];
    $("[data-role=context-path]", cell).textContent = pathParts.length ? pathParts.join(" › ") : "Nincs aktív BENJADMIN kontextus";
    const workItem = presence?.active
      ? (presence.workItem || task?.title || presence.summary || "Dolgozik")
      : (task?.title || "Várakozik");
    $("[data-role=work-item]", cell).textContent = workItem;
    $("[data-role=work-item]", cell).title = workItem;
    const awaitingLaunch = isTaskAwaitingChatLaunch(task);
    const handoffState = String(cell.dataset.handoffState || "");
    const handoffBlocksLaunch = ["HANDOFF_PROMPT_INSERTED", "HANDOFF_RESPONSE_READY", "RECOVERY_REQUIRED", "RECOVERY_PREPARE_REQUIRED"].includes(handoffState);
    const launchButton = $("[data-task-launch-action=prepare]", cell);
    if (launchButton) {
      launchButton.classList.toggle("is-hidden", !awaitingLaunch || handoffBlocksLaunch);
      launchButton.disabled = handoffBlocksLaunch;
      launchButton.dataset.taskId = awaitingLaunch ? String(task?.id || "") : "";
      launchButton.dataset.workerCode = cellConfig.workerCode;
      launchButton.textContent = task?.chatLaunch?.preparedAt ? "Újra" : "Indítás";
      launchButton.title = handoffBlocksLaunch
        ? "Task indítás tiltva az aktív/helyreállítandó ÁTADÁS alatt"
        : (task?.chatLaunch?.preparedAt
            ? "A kiosztási prompt újbóli előkészítése a worker ChatGPT-ben"
            : "A kiosztási prompt előkészítése a worker ChatGPT-ben; elküldés csak kézzel");
    }
    const taskStatus = String(task?.status || "").toLowerCase();
    const stageIndex = awaitingLaunch
      ? 0
      : (!presence?.active && taskStatus === "completed"
          ? 6
          : (presence?.active && Number.isInteger(Number(presence?.workStageIndex))
              ? Math.max(1, Math.min(6, Number(presence.workStageIndex)))
              : (taskStatus === "testing" ? 3 : 0)));
    const stage = awaitingLaunch
      ? (task?.chatLaunch?.preparedAt ? "ELLENŐRIZD · KÜLDD EL" : "ÚJ FELADAT")
      : (stageIndex ? (STAGE_LABELS[stageIndex] || `${stageIndex}/6`) : (task?.status ? task.status.toUpperCase() : "—"));
    cell.dataset.workStageIndex = String(stageIndex || 0);
    cell.dataset.currentTaskTitle = String(task?.title || "").slice(0, 500);
    $("[data-role=stage]", cell).textContent = stage;
    renderStageActions(cell, stageIndex, task, moduleContext, workItem);
  }
  const summary = $("#workerSummaryLabel");
  if (summary) summary.textContent = `${workingCount} dolgozik · ${needsAttentionCount} vár rád`;
  const openProfileCode = $("#workerProfileLayer")?.dataset.workerCode;
  if (openProfileCode && !$("#workerProfileLayer").classList.contains("is-hidden")) {
    const live = workerProfileLive(openProfileCode);
    $("#workerProfileStatus").textContent = live.status;
    $("#workerProfileModule").textContent = live.module;
    $("#workerProfileTask").textContent = live.task;
  }
}

function renderLayout() {
  const openIds = new Set(state.layout.openCellIds || []);
  const hasLayoutSignal = Array.isArray(state.layout.openCellIds);
  const layoutMode = state.layout.layoutMode || state.config?.layoutMode || "grid4";
  const split = state.layout.splitView || state.config?.splitView || { left: "cell-1", right: "cell-2" };
  for (const cell of $$(".chat-cell")) {
    const cellId = cell.dataset.cellId;
    const configCell = state.config?.cells?.find((item) => item.id === cellId);
    const isOpen = hasLayoutSignal ? openIds.has(cellId) : configCell?.enabled !== false;
    cell.classList.toggle("is-closed", !isOpen && configCell?.enabled !== false);
    cell.classList.toggle("is-maximized-cell", state.layout.maximizedCellId === cellId);
    cell.classList.toggle("is-split-left", layoutMode === "split2" && split.left === cellId);
    cell.classList.toggle("is-split-right", layoutMode === "split2" && split.right === cellId);
    const maxButton = $("[data-cell-action=toggle-maximize]", cell);
    if (maxButton) maxButton.textContent = state.layout.maximizedCellId === cellId ? "▣" : "□";
  }
  document.body.classList.toggle("has-maximized-cell", Boolean(state.layout.maximizedCellId));
  document.body.classList.toggle("has-split2", layoutMode === "split2" && !state.layout.maximizedCellId);
  if (state.config) {
    state.config.layoutMode = layoutMode;
    state.config.splitView = split;
    if (Number.isFinite(Number(state.layout.workspaceZoomPercent))) state.config.workspaceZoomPercent = Number(state.layout.workspaceZoomPercent);
    $("#workspaceZoomValue").textContent = `${state.config.workspaceZoomPercent || 100}%`;
    renderSplitControls();
  }
}
function renderConnectionSettings() {
  const note = $("#reporterState");
  const badge = $("#connectionModeBadge");
  const deviceLabel = $("#connectionDeviceLabel");
  const mode = state.connection.mode || "none";
  badge.classList.toggle("is-active", mode === "device" || mode === "reporter");
  if (mode === "device") {
    badge.textContent = state.connection.benjadmin ? "ÉLŐ · PÁROSÍTVA" : "ESZKÖZ PÁROSÍTVA";
    deviceLabel.textContent = state.connection.device?.deviceLabel || "BENJADMIN Developer Grid eszköz";
    note.textContent = state.connection.benjadmin
      ? "A worker-státuszok élőben érkeznek. A kész / blokkolt / hibás események értesítése aktív."
      : "Az eszköz párosítva van; az élő kapcsolat ellenőrzése folyamatban vagy átmenetileg megszakadt.";
  } else if (mode === "reporter") {
    badge.textContent = state.connection.benjadmin ? "ÉLŐ · REPORTER" : "REPORTER KULCS";
    deviceLabel.textContent = "Kompatibilitási kapcsolat";
    note.textContent = "Régi reporter kulcsos kapcsolat. Javasolt áttérni az eszközpárosításra.";
  } else {
    badge.textContent = "NINCS PÁROSÍTVA";
    deviceLabel.textContent = "Developer Grid eszköz";
    note.textContent = "Az élő worker-státuszhoz egyszer párosítsd ezt a Windows gépet a BENJADMIN-nal.";
  }

  const pairing = state.connection.pairing || { status: "idle" };
  const pairingNote = $("#pairingState");
  const cancelButton = $("#pairingCancelButton");
  const forgetButton = $("#forgetDeviceButton");
  const startButton = $("#pairingStartButton");
  cancelButton.classList.toggle("is-hidden", !["claiming", "pending_approval"].includes(pairing.status));
  forgetButton.classList.toggle("is-hidden", mode !== "device");
  startButton.disabled = mode === "device" || ["claiming", "pending_approval"].includes(pairing.status);
  if (pairing.status === "claiming") pairingNote.textContent = "Párosítási igény küldése a BENJADMIN-nak…";
  else if (pairing.status === "pending_approval") pairingNote.textContent = "A Windows gép regisztrálva. A BENJADMIN weboldalon nyomd meg a Jóváhagyás gombot; a Developer Grid utána automatikusan aktiválódik.";
  else if (pairing.status === "active") pairingNote.textContent = "Párosítás kész. Az élő státuszkapcsolat indul.";
  else if (pairing.status === "error") pairingNote.textContent = pairing.error || "A párosítás sikertelen.";
  else pairingNote.textContent = mode === "device" ? "A gép párosítva van." : "Nincs folyamatban párosítás.";
}
function renderCellSettings() {
  const host = $("#cellSettings");
  host.replaceChildren();
  for (const [index, cell] of (state.config?.cells || []).entries()) {
    const article = document.createElement("article");
    article.className = "cell-config";
    article.dataset.settingsCellId = cell.id;

    const head = document.createElement("div");
    head.className = "cell-config__head";
    const title = document.createElement("strong");
    title.textContent = `${String(index + 1).padStart(2, "0")} · ${cell.label || WORKER_DEFAULT_LABELS[cell.workerCode] || cell.workerCode}`;
    const enabledLabel = document.createElement("label");
    enabledLabel.textContent = "Aktív";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.dataset.field = "enabled";
    enabled.checked = cell.enabled !== false;
    enabledLabel.append(enabled);
    head.append(title, enabledLabel);

    const grid = document.createElement("div");
    grid.className = "cell-config__grid";
    grid.append(
      makeSettingsField("Kódmérnök", "workerCode", cell.workerCode, "select"),
      makeSettingsField("Megjelenített név", "label", cell.label, "text"),
      makeSettingsField("ChatGPT csevegés URL", "url", cell.url, "url", true)
    );
    article.append(head, grid);
    host.append(article);
  }
}

function makeSettingsField(labelText, field, value, kind, spanTwo = false) {
  const wrapper = document.createElement("div");
  if (spanTwo) wrapper.className = "span-two";
  const label = document.createElement("label");
  label.textContent = labelText;
  let control;
  if (kind === "select") {
    control = document.createElement("select");
    for (const code of WORKER_OPTIONS) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = WORKER_DEFAULT_LABELS[code] || code;
      option.selected = code === value;
      control.append(option);
    }
  } else {
    control = document.createElement("input");
    control.type = kind;
    control.value = value || "";
    control.autocomplete = "off";
  }
  control.dataset.field = field;
  wrapper.append(label, control);
  return wrapper;
}

function workerProfileLive(workerCode) {
  const presence = presenceForWorker(workerCode);
  const task = displayTaskForWorker(workerCode, presence);
  const visual = deriveVisualStatus(presence, task);
  return {
    status: visual.label,
    module: moduleBadgeText(moduleContextForWorker(workerCode, presence, task), task),
    task: task?.title || presence?.workItem || presence?.summary || "Nincs aktív BENJADMIN feladat."
  };
}

async function openWorkerProfile(workerCode) {
  if (!state.security?.unlocked) return;
  const profile = BENJADMIN_PROFILES[workerCode];
  if (!profile) return;
  const live = workerProfileLive(workerCode);
  await api.setUiOverlay(true);
  $("#workerProfileAvatar").src = profile.image;
  $("#workerProfileAvatar").alt = `${profile.name} avatar`;
  $("#workerProfileCategory").textContent = profile.category;
  $("#workerProfileCode").textContent = profile.code;
  $("#workerProfileName").textContent = profile.name;
  $("#workerProfileTitle").textContent = profile.title;
  $("#workerProfileShort").textContent = profile.shortDescription;
  $("#workerProfileDetail").textContent = profile.detailedDescription;
  $("#workerProfileStatus").textContent = live.status;
  $("#workerProfileModule").textContent = live.module;
  $("#workerProfileTask").textContent = live.task;
  const list = $("#workerProfileResponsibilities");
  list.replaceChildren(...profile.responsibilities.map((item) => { const li = document.createElement("li"); li.textContent = item; return li; }));
  $("#workerProfileLayer").dataset.workerCode = workerCode;
  $("#workerProfileLayer").classList.remove("is-hidden");
  window.setTimeout(() => $("#workerProfileClose").focus(), 20);
}

async function closeWorkerProfile() {
  $("#workerProfileLayer").classList.add("is-hidden");
  delete $("#workerProfileLayer").dataset.workerCode;
  const settingsOpen = !$("#settingsLayer").classList.contains("is-hidden");
  if (state.security?.unlocked && !settingsOpen) await api.setUiOverlay(false);
}


function setDiagnosticStatus(element, text, tone = "") {
  if (!element) return;
  element.textContent = text;
  element.classList.remove("is-warning", "is-error");
  if (tone) element.classList.add(tone);
}

function renderNotificationDiagnostics(diagnostics) {
  state.notificationDiagnostics = diagnostics || null;
  const windowsStatus = $("#notificationWindowsStatus");
  const windowsDetail = $("#notificationWindowsDetail");
  const webStatus = $("#notificationWebStatus");
  const webDetail = $("#notificationWebDetail");
  const note = $("#notificationDiagnosticNote");
  const requestButton = $("#requestWebNotificationButton");
  if (!diagnostics) {
    setDiagnosticStatus(windowsStatus, "NEM ELLENŐRIZHETŐ", "is-warning");
    setDiagnosticStatus(webStatus, "NEM ELLENŐRIZHETŐ", "is-warning");
    if (note) note.textContent = "A diagnosztika nem adott vissza állapotot.";
    return;
  }
  if (diagnostics.windows?.supported && diagnostics.windows?.enabled) {
    setDiagnosticStatus(windowsStatus, "MŰKÖDŐ FALLBACK");
    windowsDetail.textContent = "A Developer Grid saját Windows toast csatornája támogatott és be van kapcsolva.";
  } else if (diagnostics.windows?.supported) {
    setDiagnosticStatus(windowsStatus, "KIKAPCSOLVA", "is-warning");
    windowsDetail.textContent = "A Windows toast támogatott, de a Developer Grid beállításban ki van kapcsolva.";
  } else {
    setDiagnosticStatus(windowsStatus, "NEM TÁMOGATOTT", "is-error");
    windowsDetail.textContent = "Az Electron ezen a rendszeren nem támogat natív Windows értesítést.";
  }
  const web = diagnostics.web || {};
  const map = {
    GRANTED: ["ENGEDÉLYEZVE", ""],
    GRANTED_LIMITED: ["ENGEDÉLYEZVE · KORLÁTOZOTT", "is-warning"],
    DENIED: ["LETILTVA", "is-error"],
    DEFAULT: ["ENGEDÉLYRE VÁR", "is-warning"],
    MIXED: ["VEGYES ÁLLAPOT", "is-warning"],
    NO_CHATGPT_VIEW: ["NINCS NYITOTT CHATGPT", "is-warning"],
  };
  const [label, tone] = map[web.status] || ["ISMERETLEN", "is-warning"];
  setDiagnosticStatus(webStatus, label, tone);
  const viewCount = Number(web.openChatGptViews || 0);
  webDetail.textContent = viewCount
    ? `${viewCount} ChatGPT nézet · engedélyezve ${Number(web.grantedCount || 0)} · tiltva ${Number(web.deniedCount || 0)} · várakozik ${Number(web.defaultCount || 0)} · Push-ready ${Number(web.webPushReadyCount || 0)}.`
    : "Nincs megnyitott chatgpt.com nézet, ezért a webes jogosultság nem mérhető.";
  if (requestButton) requestButton.disabled = viewCount === 0 || web.status === "GRANTED";
  if (note) {
    if (web.status === "GRANTED") note.textContent = "A ChatGPT webes értesítés jogosultsága engedélyezett. A Developer Grid saját Windows worker-riasztása ettől független fallbackként továbbra is aktív.";
    else if (web.status === "GRANTED_LIMITED") note.textContent = "A Notification jogosultság engedélyezett, de a teljes web-push lánc (Service Worker / Push API) nem minden nézetben áll készen. A Developer Grid saját Windows értesítése marad a megbízható fallback.";
    else if (web.status === "DENIED") note.textContent = "A beágyazott ChatGPT nézet a webes értesítést tiltottként látja. Az Engedélyezés gomb felhasználói műveletként újrakéri a Chromium jogosultságot.";
    else note.textContent = "A ChatGPT webes értesítése külön böngészős csatorna; a Developer Grid saját Windows worker-riasztása ettől függetlenül működik.";
  }
}

async function refreshNotificationDiagnostics({ notifyOnError = false } = {}) {
  const result = await api.getNotificationDiagnostics();
  if (!result?.ok) {
    if (notifyOnError) showToast("Értesítési diagnosztika", result?.error || "Az állapot nem kérdezhető le.");
    renderNotificationDiagnostics(null);
    return false;
  }
  renderNotificationDiagnostics(result.diagnostics);
  return true;
}

async function requestWebNotificationPermission() {
  const button = $("#requestWebNotificationButton");
  if (button) button.disabled = true;
  try {
    const result = await api.requestWebNotificationPermission();
    if (!result?.ok) throw new Error(result?.error || "A ChatGPT webes értesítési engedély nem kérhető.");
    renderNotificationDiagnostics(result.diagnostics);
    const status = result.diagnostics?.web?.status;
    if (status === "GRANTED") showToast("ChatGPT webes értesítés", "A megnyitott ChatGPT nézetek Notification jogosultsága engedélyezve.");
    else if (status === "GRANTED_LIMITED") showToast("ChatGPT webes értesítés", "A jogosultság megvan, de a web-push lánc Electronban korlátozott lehet. A Developer Grid Windows értesítése aktív fallback.");
    else showToast("ChatGPT webes értesítés", "A webes jogosultság nem lett teljesen engedélyezett. A Developer Grid Windows értesítése ettől függetlenül használható.");
  } catch (error) {
    showToast("ChatGPT webes értesítés", error instanceof Error ? error.message : "Az engedélykérés sikertelen.");
  } finally {
    if (button) button.disabled = false;
  }
}

async function openSettings(focusCellId = null) {
  if (!state.config || !state.security?.unlocked) return;
  await api.setUiOverlay(true);
  $("#baseUrlInput").value = state.config.benjadminBaseUrl || "https://admin.dev.dimpro.hu";
  $("#appearanceInput").value = state.config.appearance || "dark";
  $("#showAvatarsInput").checked = state.config.showAvatars !== false;
  $("#showAvatarWatermarksInput").checked = state.config.showAvatarWatermarks !== false;
  $("#microphoneEnabledInput").checked = state.config.microphoneEnabled !== false;
  $("#centralLabelInput").value = state.config.centralChat?.label || "BenjAdmin";
  $("#centralUrlInput").value = state.config.centralChat?.url || "https://chatgpt.com/";
  $("#reporterKeyInput").value = "";
  $("#pairingActivationInput").value = "";
  $("#launchAtLoginInput").checked = state.config.launchAtLogin === true;
  $("#rememberLastConversationInput").checked = state.config.rememberLastConversation !== false;
  $("#quietModeInput").checked = state.config.notifications?.quietMode === true;
  $("#completionSoundInput").checked = state.config.notifications?.completionSound !== false;
  $("#stageSoundInput").checked = state.config.notifications?.stageSound !== false;
  $("#windowsToastInput").checked = state.config.notifications?.windowsToast !== false;
  $("#spokenCompletionInput").checked = state.config.notifications?.spokenCompletion !== false;
  $("#spokenStageInput").checked = state.config.notifications?.spokenStage !== false;
  $("#flashTaskbarInput").checked = state.config.notifications?.flashTaskbar !== false;
  updateAudibleNotificationControls();
  $("#settingsError").textContent = "";
  renderConnectionSettings();
  renderCellSettings();
  $("#settingsLayer").classList.remove("is-hidden");
  void refreshNotificationDiagnostics();
  if (focusCellId) {
    const article = $(`[data-settings-cell-id="${focusCellId}"]`, $("#cellSettings"));
    if (article) {
      article.classList.add("is-focused");
      window.setTimeout(() => article.scrollIntoView({ block: "center", behavior: "smooth" }), 40);
      window.setTimeout(() => article.classList.remove("is-focused"), 2600);
    }
  }
}

async function closeSettings() {
  $("#settingsLayer").classList.add("is-hidden");
  if (state.security?.unlocked) await api.setUiOverlay(false);
}

function readSettingsConfig() {
  const next = structuredClone(state.config);
  next.benjadminBaseUrl = $("#baseUrlInput").value.trim();
  next.appearance = $("#appearanceInput").value === "light" ? "light" : "dark";
  next.showAvatars = $("#showAvatarsInput").checked;
  next.showAvatarWatermarks = $("#showAvatarWatermarksInput").checked;
  next.microphoneEnabled = $("#microphoneEnabledInput").checked;
  next.centralChat = {
    ...(next.centralChat || {}),
    id: "central",
    label: $("#centralLabelInput").value.trim() || "BenjAdmin",
    url: $("#centralUrlInput").value.trim(),
    enabled: true
  };
  next.launchAtLogin = $("#launchAtLoginInput").checked;
  next.rememberLastConversation = $("#rememberLastConversationInput").checked;
  next.notifications = {
    quietMode: $("#quietModeInput").checked,
    completionSound: $("#completionSoundInput").checked,
    stageSound: $("#stageSoundInput").checked,
    windowsToast: $("#windowsToastInput").checked,
    spokenCompletion: $("#spokenCompletionInput").checked,
    spokenStage: $("#spokenStageInput").checked,
    flashTaskbar: $("#flashTaskbarInput").checked
  };
  next.cells = $$(".cell-config", $("#cellSettings")).map((article, index) => ({
    id: next.cells[index].id,
    workerCode: $("[data-field=workerCode]", article).value,
    label: $("[data-field=label]", article).value.trim(),
    url: $("[data-field=url]", article).value.trim(),
    enabled: $("[data-field=enabled]", article).checked
  }));
  return next;
}

async function saveSettings() {
  const error = $("#settingsError");
  const button = $("#settingsSave");
  error.textContent = "";
  button.disabled = true;
  try {
    const next = readSettingsConfig();
    const configResult = await api.updateConfig(next);
    if (!configResult?.ok) throw new Error(configResult?.error || "A beállítások nem menthetők.");
    state.config = configResult.config;
    const reporterKey = $("#reporterKeyInput").value.trim();
    if (reporterKey) {
      const keyResult = await api.setReporterKey(reporterKey);
      if (!keyResult?.ok) throw new Error(keyResult?.error || "A BENJADMIN reporter kulcs nem menthető.");
      state.connection.configured = true;
    }
    renderConfig();
    await closeSettings();
    showToast("Beállítások mentve", "A Developer Grid konfiguráció frissült.");
  } catch (err) {
    error.textContent = err instanceof Error ? err.message : "A beállítások mentése sikertelen.";
  } finally {
    button.disabled = false;
  }
}

function updateAudibleNotificationControls() {
  const quiet = $("#quietModeInput")?.checked === true;
  for (const row of $$('[data-audible-notification]')) {
    row.classList.toggle("is-muted-by-master", quiet);
    const input = $("input", row);
    if (input) input.disabled = quiet;
  }
}

function notificationAudio() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!notificationAudioContext || notificationAudioContext.state === "closed") notificationAudioContext = new AudioCtx();
    return notificationAudioContext;
  } catch { return null; }
}

async function primeNotificationAudio() {
  const ctx = notificationAudio();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    return ctx.state === "running";
  } catch { return false; }
}

function playWorkerTone(type) {
  if (state.config?.notifications?.quietMode === true) return;
  const isStage = type === "stage_completed";
  if (isStage ? state.config?.notifications?.stageSound === false : state.config?.notifications?.completionSound === false) return;
  const schedule = (ctx) => {
    try {
      const gain = ctx.createGain();
      const start = ctx.currentTime + 0.01;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(type === "completed" ? 0.20 : isStage ? 0.11 : 0.14, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + (type === "completed" ? 1.25 : 0.82));
      gain.connect(ctx.destination);
      const frequencies = isStage ? [587.33, 698.46]
        : type === "assigned" ? [659.25, 783.99]
          : type === "completed" ? [784, 1046.5, 1318.51]
            : type === "blocked" ? [523.25, 392] : [440, 329.63, 261.63];
      frequencies.forEach((frequency, index) => {
        const osc = ctx.createOscillator();
        osc.type = type === "failed" ? "triangle" : "sine";
        const at = start + index * (isStage ? 0.13 : 0.16);
        osc.frequency.setValueAtTime(frequency, at);
        osc.connect(gain);
        osc.start(at);
        osc.stop(at + (isStage ? 0.28 : 0.38));
      });
    } catch { /* toast/TTS ettől még működik */ }
  };
  const ctx = notificationAudio();
  if (!ctx) return;
  if (ctx.state === "running") schedule(ctx);
  else void ctx.resume().then(() => schedule(ctx)).catch(() => {});
}

function speakText(text) {
  if (state.config?.notifications?.quietMode === true) return;
  if (!window.speechSynthesis || !String(text || "").trim()) return;
  try {
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = "hu-HU";
    utterance.rate = 0.98;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices?.() || [];
    const huVoice = voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith("hu"));
    if (huVoice) utterance.voice = huVoice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume?.();
    window.speechSynthesis.speak(utterance);
  } catch { /* opcionális réteg */ }
}

function speechLabelForWorker(workerCode, fallbackLabel = "Kódmérnök") {
  return WORKER_SPEECH_LABELS[String(workerCode || "").toUpperCase()] || fallbackLabel;
}

function speakCompletion(workerCode, fallbackLabel) {
  if (state.config?.notifications?.spokenCompletion === false) return;
  speakText(`${speechLabelForWorker(workerCode, fallbackLabel)} befejezte a munkát.`);
}

function speakStage(workerCode, fallbackLabel, stageIndex) {
  if (state.config?.notifications?.spokenStage === false) return;
  const stageName = STAGE_SPEECH_LABELS[stageIndex] || `${stageIndex}.`;
  speakText(`${speechLabelForWorker(workerCode, fallbackLabel)} befejezte a ${stageIndex}. ${stageName} szakaszt.`);
}

function pulseWorkerCell(workerCode) {
  const configCell = cellForWorker(workerCode);
  if (!configCell) return;
  const cell = document.querySelector(`[data-cell-id="${configCell.id}"]`);
  if (!cell) return;
  cell.classList.remove("is-complete-pulse");
  void cell.offsetWidth;
  cell.classList.add("is-complete-pulse");
  window.setTimeout(() => cell.classList.remove("is-complete-pulse"), 2600);
}

function showToast(title, detail) {
  const toast = document.createElement("div");
  toast.className = "toast";
  const strong = document.createElement("strong");
  strong.textContent = escapeText(title);
  const span = document.createElement("span");
  span.textContent = escapeText(detail);
  toast.append(strong, span);
  $("#toastRegion").append(toast);
  window.setTimeout(() => toast.remove(), 5200);
}

function handleWorkerEvent(event) {
  if (!event || !["assigned", "stage_completed", "completed", "blocked", "failed"].includes(event.type)) return;
  const configCell = cellForWorker(event.workerCode);
  if (!configCell) return; // csak a négy Developer Grid worker adjon hangot/értesítést
  const label = configCell.label || WORKER_DEFAULT_LABELS[event.workerCode] || event.workerCode || "Kódmérnök";
  playWorkerTone(event.type);
  if (event.type === "assigned") {
    showToast(`${label}: új feladat érkezett`, event.taskTitle || "A worker új BENJADMIN feladatot kapott. Kattints az Indítás gombra.");
  } else if (event.type === "stage_completed") {
    const stageIndex = Number(event.stageIndex) || 0;
    speakStage(event.workerCode, label, stageIndex);
    showToast(`${label}: fejlesztési rész elkészült`, STAGE_LABELS[stageIndex] || `${stageIndex}/6 szakasz kész.`);
  } else if (event.type === "completed") {
    speakCompletion(event.workerCode, label);
    pulseWorkerCell(event.workerCode);
    showToast(`${label} befejezte a munkát`, event.taskTitle || "Fejlesztési feladat elkészült.");
  } else if (event.type === "blocked") {
    showToast(`${label} elakadt / döntést kér`, event.taskTitle || "A worker figyelmet kér.");
  } else {
    showToast(`${label} hibát jelzett`, event.taskTitle || "A fejlesztési feladat hibára futott.");
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const password = $("#passwordInput").value;
  const confirm = $("#passwordConfirmInput").value;
  const error = $("#authError");
  const submit = $("#authSubmit");
  error.textContent = "";
  if (state.setupMode && password !== confirm) {
    error.textContent = "A két jelszó nem egyezik.";
    return;
  }
  submit.disabled = true;
  try {
    const result = state.setupMode ? await api.setupPassword(password) : await api.unlock(password);
    if (!result?.ok) {
      error.textContent = result?.error || "A feloldás sikertelen.";
      if (result?.lockedUntil) startLockoutCountdown(result.lockedUntil);
      return;
    }
    renderSecurity(result.state);
    await loadUnlockedState();
    void primeNotificationAudio();
  } catch (err) {
    error.textContent = err instanceof Error ? err.message : "A feloldás sikertelen.";
  } finally {
    if (!state.lockoutTimer) submit.disabled = false;
  }
}

function applyWorkspaceZoomResult(result) {
  const zoom = Number(result?.workspaceZoomPercent ?? result?.zoomPercent);
  if (!Number.isFinite(zoom)) return;
  if (state.config) state.config.workspaceZoomPercent = zoom;
  state.layout.workspaceZoomPercent = zoom;
  const readout = $("#workspaceZoomValue");
  if (readout) {
    readout.textContent = `${zoom}%`;
    readout.title = `01–05 közös ChatGPT zoom: ${zoom}% · kattintás: visszaállítás 100%-ra`;
  }
}

async function changeWorkspaceZoom(action) {
  const result = await api.workspaceAction(action);
  if (!result?.ok) {
    if (result?.error) showToast("Developer Grid zoom", result.error);
    return result;
  }
  applyWorkspaceZoomResult(result);
  return result;
}

async function handleCellAction(button) {
  const cell = button.closest(".chat-cell");
  const cellId = cell?.dataset.cellId;
  const action = button.dataset.cellAction;
  if (!cellId || !action) return;
  if (action === "settings") { await openSettings(cellId); return; }
  const result = await api.cellAction(cellId, action);
  if (!result?.ok && result?.error) showToast("Developer Grid művelet", result.error);
  else if (action === "microphone" && result?.microphoneAttempted && !result?.microphoneButtonFound) {
    showToast("Mikrofon engedélyezve", "A ChatGPT saját mikrofon gombja nem volt automatikusan felismerhető; használd a csevegés alsó mikrofon ikonját.");
  }
}

async function handleTaskLaunch(button) {
  const cell = button.closest(".chat-cell");
  const cellId = cell?.dataset.cellId;
  const workerCode = button.dataset.workerCode || workerCodeForCell(cellId);
  const taskId = button.dataset.taskId;
  if (!workerCode || !taskId) return;
  button.disabled = true;
  try {
    const result = await api.prepareTaskLaunch(workerCode, taskId);
    if (!result?.ok) {
      showToast("Worker indítás", result?.error || "A ChatGPT indítás nem készíthető elő.");
      return;
    }
    const task = activeTaskForWorker(workerCode);
    if (task && task.id === taskId && result.chatLaunch) task.chatLaunch = result.chatLaunch;
    renderLive();
    showToast(
      result.mode === "inserted" ? "Feladatprompt előkészítve" : "Feladatprompt a vágólapon",
      result.message || "Ellenőrizd a worker ChatGPT mezőjét, majd kézzel küldd el."
    );
  } finally {
    button.disabled = false;
  }
}

function localShortcutAction(event) {
  if (!event.ctrlKey || !event.altKey || !state.security?.unlocked) return false;
  const map = {
    "1": "cell-1",
    "2": "cell-2",
    "3": "cell-3",
    "4": "cell-4",
    "5": "central",
    "6": "layout-toggle",
    "9": "guide",
    "n": "quiet-toggle",
    "N": "quiet-toggle",
    "z": "lock",
    "Z": "lock",
    " ": "shell-toggle"
  };
  const shortcut = map[event.key];
  if (!shortcut) return false;
  event.preventDefault();
  void api.workspaceAction("shortcut", { shortcut });
  return true;
}


function reviewTaskAttentionCount(snapshot) {
  const attention = new Set(["WORKER_DONE", "APPROVED", "HUMAN_DECISION_REQUIRED"]);
  return (snapshot?.tasks || []).filter((task) => attention.has(String(task.workflowState || "").toUpperCase())).length;
}

function updateReviewButton() {
  const count = reviewTaskAttentionCount(state.review.snapshot);
  const badge = $("#reviewCount");
  if (!badge) return;
  badge.textContent = String(count);
  badge.classList.toggle("has-attention", count > 0);
  $("#reviewButton").title = count > 0
    ? `External Review Room · ${count} figyelmet igénylő review`
    : "External Review Room · M.Forge-AI + V.Guard-AI";
}

function reviewDateTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

function compactCommit(value) {
  const raw = String(value || "");
  return raw ? raw.slice(0, 12) : "—";
}

function providerDisplay(role, task) {
  const direct = role === "MFORGE" ? task?.mforge : task?.vguard;
  if (direct?.provider || direct?.modelId) return [direct.provider || "provider", direct.modelId || "modell nincs megadva"].join(" · ");
  const ready = (state.review.snapshot?.adapters || []).find((adapter) => adapter.ready && (adapter.roles || []).includes(role));
  if (ready) return `${ready.label || ready.provider} · ${ready.modelId || "modell nincs megadva"}`;
  return "Nincs READY provider";
}

function populateReviewTaskSelect() {
  const select = $("#reviewTaskSelect");
  if (!select) return;
  const tasks = state.review.snapshot?.tasks || [];
  const previous = state.review.selectedTaskId;
  select.replaceChildren();
  if (!tasks.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Nincs külső AI task";
    select.append(option);
    state.review.selectedTaskId = null;
    return;
  }
  for (const task of tasks) {
    const option = document.createElement("option");
    option.value = task.id;
    option.textContent = `${task.workflowState || task.engineStatus || "—"} · ${task.title || task.id}`;
    select.append(option);
  }
  const selected = tasks.some((task) => task.id === previous) ? previous : tasks[0].id;
  select.value = selected;
  state.review.selectedTaskId = selected;
}

function selectedReviewTask() {
  return (state.review.snapshot?.tasks || []).find((task) => task.id === state.review.selectedTaskId) || null;
}

function renderReviewPaths(task) {
  const target = $("#reviewForgePaths");
  target.replaceChildren();
  for (const path of task?.mforge?.changedPaths || []) {
    const item = document.createElement("div");
    item.className = "review-path-item";
    item.textContent = path;
    target.append(item);
  }
}

function renderReviewFindings(task) {
  const target = $("#reviewGuardFindingList");
  target.replaceChildren();
  for (const finding of task?.vguard?.findings || []) {
    const item = document.createElement("div");
    item.className = "review-finding-item";
    const title = document.createElement("strong");
    title.textContent = `${finding.severity || "INFO"} · ${finding.category || "OTHER"}${finding.path ? ` · ${finding.path}` : ""}`;
    const copy = document.createElement("span");
    copy.textContent = finding.message || "—";
    item.append(title, copy);
    target.append(item);
  }
}

function renderReviewThread(task) {
  const target = $("#reviewThread");
  target.replaceChildren();
  const messages = (state.review.snapshot?.thread || []).filter((message) => !task || message.taskId === task.id);
  if (!messages.length) {
    const empty = document.createElement("p");
    empty.className = "review-thread-empty";
    empty.textContent = task ? "Ehhez a külső AI taskhoz még nincs auditált review üzenet vagy esemény." : "Még nincs External Review Room esemény.";
    target.append(empty);
    return;
  }
  for (const message of messages) {
    const article = document.createElement("article");
    article.className = `review-message is-${message.level || "info"}`;
    article.dataset.author = message.author || "SYSTEM";
    const header = document.createElement("header");
    const author = document.createElement("strong");
    author.textContent = message.target ? `${message.author || "SYSTEM"} → ${message.target}` : (message.author || "SYSTEM");
    const time = document.createElement("span");
    time.textContent = reviewDateTime(message.createdAt);
    header.append(author, time);
    const summary = document.createElement("p");
    summary.textContent = message.summary || "—";
    article.append(header, summary);
    if (message.detail) {
      const detail = document.createElement("small");
      detail.textContent = message.detail;
      article.append(detail);
    }
    target.append(article);
  }
  target.scrollTop = target.scrollHeight;
}

function renderReviewRoom() {
  updateReviewButton();
  populateReviewTaskSelect();
  const task = selectedReviewTask();
  $("#reviewThreadTitle").textContent = task ? `${task.workflowState || task.engineStatus || "—"} · ${task.title}` : "Összes külső AI esemény";
  $("#reviewGeneratedAt").textContent = `frissítve: ${reviewDateTime(state.review.snapshot?.generatedAt)}`;
  $("#reviewForgeState").textContent = task?.mforge?.state || task?.workflowState || "VÁRAKOZIK";
  $("#reviewForgeProvider").textContent = providerDisplay("MFORGE", task);
  $("#reviewForgeCommit").textContent = compactCommit(task?.mforge?.commit);
  $("#reviewForgeFiles").textContent = String(task?.mforge?.changedFileCount || 0);
  renderReviewPaths(task);
  $("#reviewGuardResult").textContent = task?.vguard?.result || "NINCS REVIEW";
  $("#reviewGuardProvider").textContent = providerDisplay("VGUARD", task);
  $("#reviewGuardState").textContent = task?.vguard?.state || task?.workflowState || "—";
  $("#reviewGuardFindings").textContent = String(task?.vguard?.findings?.length || 0);
  $("#reviewGuardSummary").textContent = task?.vguard?.summary || "Még nincs V.Guard összefoglaló.";
  renderReviewFindings(task);
  renderReviewThread(task);
}

async function refreshReviewRoom({ notifyOnError = false } = {}) {
  if (!state.security?.unlocked || state.review.loading) return false;
  state.review.loading = true;
  try {
    const result = await api.getReviewRoom();
    if (!result?.ok || !result.reviewRoom) throw new Error(result?.error || "A Review Room nem tölthető be.");
    state.review.snapshot = result.reviewRoom;
    state.review.lastFetchedAt = Date.now();
    if (!state.review.selectedTaskId || !(result.reviewRoom.tasks || []).some((task) => task.id === state.review.selectedTaskId)) {
      state.review.selectedTaskId = result.reviewRoom.tasks?.[0]?.id || null;
    }
    updateReviewButton();
    if (!$("#reviewLayer").classList.contains("is-hidden")) renderReviewRoom();
    return true;
  } catch (error) {
    if (notifyOnError) showToast("External Review Room", error instanceof Error ? error.message : "A Review Room nem tölthető be.");
    return false;
  } finally {
    state.review.loading = false;
  }
}

function stopReviewPolling() {
  if (state.review.timer) window.clearInterval(state.review.timer);
  state.review.timer = null;
}

function startReviewPolling() {
  stopReviewPolling();
  if (!state.security?.unlocked) return;
  void refreshReviewRoom();
  state.review.timer = window.setInterval(() => void refreshReviewRoom(), 10000);
}

async function openReviewRoom(preferredTaskId = null) {
  if (!state.security?.unlocked) return;
  if (!$("#workerProfileLayer").classList.contains("is-hidden")) await closeWorkerProfile();
  if (!$("#settingsLayer").classList.contains("is-hidden")) await closeSettings();
  await api.setUiOverlay(true);
  $("#reviewLayer").classList.remove("is-hidden");
  const ok = await refreshReviewRoom({ notifyOnError: true });
  if (ok) {
    if (preferredTaskId && (state.review.snapshot?.tasks || []).some((task) => task.id === preferredTaskId)) state.review.selectedTaskId = preferredTaskId;
    renderReviewRoom();
  }
}

async function closeReviewRoom() {
  $("#reviewLayer").classList.add("is-hidden");
  const profileOpen = !$("#workerProfileLayer").classList.contains("is-hidden");
  const settingsOpen = !$("#settingsLayer").classList.contains("is-hidden");
  if (state.security?.unlocked && !profileOpen && !settingsOpen) await api.setUiOverlay(false);
}

function bindUi() {
  document.addEventListener("pointerdown", () => { void primeNotificationAudio(); }, { capture: true });
  document.addEventListener("keydown", () => { void primeNotificationAudio(); }, { capture: true });
  $("#authForm").addEventListener("submit", handleAuthSubmit);
  $("#pairingPageButton").addEventListener("click", async () => {
    const result = await api.openPairingPage();
    if (!result?.ok) showToast("BENJADMIN párosítás", result?.error || "A párosítási oldal nem nyitható meg.");
  });
  $("#pairingStartButton").addEventListener("click", async () => {
    const activationCode = $("#pairingActivationInput").value.trim();
    if (!activationCode) { showToast("BENJADMIN párosítás", "Másold be az egyszer használatos párosítási kódot."); return; }
    const result = await api.startPairing(activationCode);
    if (!result?.ok) showToast("BENJADMIN párosítás", result?.error || "A párosítás nem indítható.");
    else { state.connection.pairing = result.pairing || { status: "pending_approval" }; renderConnectionSettings(); }
  });
  $("#pairingCancelButton").addEventListener("click", async () => {
    await api.cancelPairing();
    state.connection.pairing = { status: "idle" };
    renderConnectionSettings();
  });
  $("#forgetDeviceButton").addEventListener("click", async () => {
    const result = await api.forgetDevice();
    if (!result?.ok) { showToast("BENJADMIN kapcsolat", result?.error || "A helyi eszközkapcsolat nem törölhető."); return; }
    state.connection.configured = Boolean(result.configured);
    state.connection.mode = result.mode || "none";
    state.connection.device = null;
    state.connection.benjadmin = false;
    renderConnectionSettings();
    setConnectionUi("BENJADMIN élő státuszkapcsolat nincs párosítva", "warning");
    showToast("Helyi kapcsolat törölve", "Szükség esetén a BENJADMIN párosítási oldalon vond vissza a régi eszközt is.");
  });
  $("#dailyStartButton").addEventListener("click", async () => {
    const result = await api.prepareDailyStart();
    if (!result?.ok) showToast("Napi indítás", result?.error || "A BenAI napi indítás nem készíthető elő.");
    else showToast(result.mode === "inserted" ? "BenAI napi indítás előkészítve" : "Napi indítás a vágólapon", result.message || "Ellenőrizd, majd kézzel küldd el.");
  });
  $("#reviewButton").addEventListener("click", () => void openReviewRoom());
  $("#reviewClose").addEventListener("click", () => void closeReviewRoom());
  $("#reviewBackdrop").addEventListener("click", () => void closeReviewRoom());
  $("#reviewRefresh").addEventListener("click", () => void refreshReviewRoom({ notifyOnError: true }));
  $("#reviewTaskSelect").addEventListener("change", (event) => { state.review.selectedTaskId = event.target.value || null; renderReviewRoom(); });
  $("#workspaceZoomOut").addEventListener("click", () => void changeWorkspaceZoom("zoom-out"));
  $("#workspaceZoomValue").addEventListener("click", () => void changeWorkspaceZoom("zoom-reset"));
  $("#workspaceZoomIn").addEventListener("click", () => void changeWorkspaceZoom("zoom-in"));
  $("#layoutModeButton").addEventListener("click", () => void api.workspaceAction("toggle-layout"));
  $("#splitLeftSelect").addEventListener("change", async (event) => {
    const result = await api.workspaceAction("set-split", { side: "left", chatId: event.target.value });
    if (!result?.ok) showToast("Kétcellás nézet", result?.error || "A bal oldali csevegő nem váltható.");
  });
  $("#splitRightSelect").addEventListener("change", async (event) => {
    const result = await api.workspaceAction("set-split", { side: "right", chatId: event.target.value });
    if (!result?.ok) showToast("Kétcellás nézet", result?.error || "A jobb oldali csevegő nem váltható.");
  });
  $("#themeButton").addEventListener("click", async () => {
    if (!state.config || !state.security?.unlocked) return;
    const next = structuredClone(state.config);
    next.appearance = next.appearance === "light" ? "dark" : "light";
    const result = await api.updateConfig(next);
    if (result?.ok && result.config) { state.config = result.config; renderConfig(); }
  });
  $("#settingsButton").addEventListener("click", async () => { if (!$("#reviewLayer").classList.contains("is-hidden")) await closeReviewRoom(); await openSettings(); });
  $("#lockButton").addEventListener("click", async () => { await closeReviewRoom(); await closeSettings(); await api.lock(); });
  $("#settingsClose").addEventListener("click", () => void closeSettings());
  $("#settingsCancel").addEventListener("click", () => void closeSettings());
  $("#settingsBackdrop").addEventListener("click", () => void closeSettings());
  $("#settingsSave").addEventListener("click", saveSettings);
  $("#quietModeInput").addEventListener("change", updateAudibleNotificationControls);
  $("#notificationDiagnosticsButton").addEventListener("click", () => void refreshNotificationDiagnostics({ notifyOnError: true }));
  $("#requestWebNotificationButton").addEventListener("click", () => void requestWebNotificationPermission());
  for (const button of $$("[data-notification-test]")) button.addEventListener("click", async () => {
    const result = await api.testNotification(button.dataset.notificationTest);
    if (!result?.ok) showToast("Értesítés teszt", result?.error || "A teszt nem indítható.");
  });
  for (const avatarButton of $$("[data-worker-profile]")) avatarButton.addEventListener("click", () => {
    const cellId = avatarButton.closest("[data-cell-id]")?.dataset.cellId || "";
    const workerCode = workerCodeForCell(cellId);
    if (workerCode) void openWorkerProfile(workerCode);
  });
  $("#workerProfileClose").addEventListener("click", () => void closeWorkerProfile());
  $("#workerProfileBackdrop").addEventListener("click", () => void closeWorkerProfile());
  for (const button of $$("[data-window-action]")) button.addEventListener("click", () => api.windowAction(button.dataset.windowAction));
  for (const button of $$("[data-cell-action]")) button.addEventListener("click", () => handleCellAction(button));
  for (const button of $$("[data-task-launch-action]")) button.addEventListener("click", () => void handleTaskLaunch(button));
  for (const button of $$("[data-central-action]")) button.addEventListener("click", async () => {
    const action = button.dataset.centralAction;
    if (action === "close") { await api.cellAction("central", "close"); return; }
    const result = await api.cellAction("central", action);
    if (!result?.ok && result?.error) showToast("Központi csevegő", result.error);
    else if (action === "microphone" && result?.microphoneAttempted && !result?.microphoneButtonFound) {
      showToast("Mikrofon engedélyezve", "Használd a ChatGPT alsó mikrofon ikonját.");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (localShortcutAction(event)) return;
    if (event.key === "Escape" && !$("#reviewLayer").classList.contains("is-hidden")) { void closeReviewRoom(); return; }
    if (event.key === "Escape" && !$("#workerProfileLayer").classList.contains("is-hidden")) { void closeWorkerProfile(); return; }
    if (event.key === "Escape" && !$("#settingsLayer").classList.contains("is-hidden")) void closeSettings();
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "l" && state.security?.unlocked) api.lock();
    if (event.ctrlKey && !event.altKey && state.security?.unlocked) {
      if (["+", "=", "Add"].includes(event.key)) { event.preventDefault(); void changeWorkspaceZoom("zoom-in"); }
      else if (["-", "Subtract"].includes(event.key)) { event.preventDefault(); void changeWorkspaceZoom("zoom-out"); }
      else if (event.key === "0") { event.preventDefault(); void changeWorkspaceZoom("zoom-reset"); }
    }
  });
}

function bindIpc() {
  api.onSecurityState(async (security) => {
    renderSecurity(security);
    if (security?.unlocked) await loadUnlockedState();
  });
  api.onConfig((config) => {
    state.config = config;
    if (Number.isFinite(Number(config?.workspaceZoomPercent))) state.layout.workspaceZoomPercent = Number(config.workspaceZoomPercent);
    renderConfig();
  });
  api.onLiveState((live) => { state.live = live; renderLive(); });
  api.onLiveConnection((connection) => {
    if (connection?.kind === "large-paste") {
      const label = WORKER_DEFAULT_LABELS[connection.workerCode] || connection.workerCode || "ChatGPT";
      if (connection.ok) {
        const elapsed = Number(connection.elapsedMs || 0);
        showToast(`${label}: nagy beillesztés kész`, `${Number(connection.chars || 0).toLocaleString("hu-HU")} karakter bekerült${elapsed > 0 ? ` · ${elapsed.toLocaleString("hu-HU")} ms` : ""}. Küldés előtt ellenőrizd.`);
      }
      else showToast(`${label}: nagy beillesztés sikertelen`, connection.error || "A hosszú tartalom nem illeszthető be biztonságosan.");
      return;
    }
    if (connection?.kind !== "benjadmin") return;
    state.connection.benjadmin = connection.ok === true;
    state.connection.configured = connection.configured === true;
    if (connection.mode) state.connection.mode = connection.mode;
    if (!state.security?.unlocked) return;
    if (connection.ok && connection.transport === "GRID_DELTA_NATIVE") setConnectionUi("BENJADMIN · DELTA LIVE", "online");
    else if (connection.ok && connection.transport === "LEGACY_BOOTSTRAP_ONCE") setConnectionUi("BENJADMIN · COMPATIBILITY SNAPSHOT", "warning");
    else if (connection.ok) setConnectionUi("BENJADMIN kapcsolat", "online");
    else if (!connection.configured) setConnectionUi("BENJADMIN élő státuszkapcsolat nincs párosítva", "warning");
    else setConnectionUi("BENJADMIN delta kapcsolat várakozik", "warning");
    renderConnectionSettings();
  });
  api.onWorkerEvent(handleWorkerEvent);
  api.onOpenSettings?.(() => { void openSettings(); });
  api.onPairingState(async (pairing) => {
    state.connection.pairing = pairing || { status: "idle" };
    renderConnectionSettings();
    if (pairing?.status === "active") {
      showToast("BENJADMIN párosítás kész", "Az élő worker-státuszkapcsolat aktiválva.");
      window.setTimeout(async () => {
        const connection = await api.getConnectionState();
        state.connection.configured = Boolean(connection?.configured);
        state.connection.mode = connection?.mode || "none";
        state.connection.device = connection?.device || null;
        renderConnectionSettings();
      }, 400);
    } else if (pairing?.status === "error") {
      showToast("BENJADMIN párosítás", pairing.error || "A párosítás sikertelen.");
    }
  });
  api.onLayout((layout) => {
    state.layout = { ...state.layout, ...layout };
    if (state.config && Number.isFinite(Number(layout?.workspaceZoomPercent))) state.config.workspaceZoomPercent = Number(layout.workspaceZoomPercent);
    renderLayout();
  });
}

async function init() {
  bindUi();
  bindIpc();
  const appInfo = await api.getAppVersion?.();
  const versionLabel = $("#appVersionLabel");
  if (versionLabel && appInfo?.version) versionLabel.textContent = `v${appInfo.version}`;
  const security = await api.getSecurityState();
  renderSecurity(security);
  if (security?.unlocked) await loadUnlockedState();
}

void init();
