"use strict";

const PHASE_ADVANCE = Object.freeze({
  1: {
    title: "1/6 ELEMZÉS LEZÁRÁSA → 2/6 FEJLESZTÉS",
    body: [
      "Zárd le az ELEMZÉS fázist: ellenőrizd a feladatot, scope-ot, branch/worktree/HEAD-et, kockázatokat, blokkolókat, acceptance feltételeket és teszttervet.",
      "Ebben a körben még csak akkor kezdj tényleges kódmódosításba, ha az elemzés PASS és nincs scope/source blocker.",
      "PASS esetén a gépi stage report stage mezője 2 legyen; FAIL/BLOCKED esetén maradjon 1 és rögzíts ERROR evidence-et."
    ]
  },
  2: {
    title: "2/6 FEJLESZTÉS LEZÁRÁSA → 3/6 TESZTELÉS",
    body: [
      "Fejezd be a kijelölt DEV scope tényleges kód-/konfiguráció-/dokumentációmódosítását.",
      "Ellenőrizd a git diffet, a módosított fájlokat és a source HEAD-et; félkész vagy scope-on kívüli módosítással ne lépj tovább.",
      "PASS esetén a gépi stage report stage mezője 3 legyen; sorold fel a módosított fájlokat FILE evidence-ként és adj legalább egy technikai PASS ellenőrzést."
    ]
  },
  3: {
    title: "3/6 TESZTELÉS LEZÁRÁSA → 4/6 ELLENŐRZÉS",
    body: [
      "Futtasd le a taskhoz szükséges célzott teszteket: legalább git diff --check és a releváns unit/contract/acceptance/typecheck/lint ellenőrzéseket.",
      "Csak valós PASS eredményt jelents. FAIL/BLOCKED esetén javíts a scope-on belül és ismételd a tesztet; ne lépj tovább hamis PASS-szal.",
      "PASS esetén a gépi stage report stage mezője 4 legyen, és legalább egy TEST/PASS evidence kötelező."
    ]
  }
});

const ACTIONS = Object.freeze({
  checkpoint: {
    title: "BIZTONSÁGOS DEV CHECKPOINT",
    body: [
      "Készíts biztonságos DEV checkpointot az aktuális munkáról.",
      "Ellenőrizd a source/worktree/branch/HEAD/provenance állapotot és a git status-t.",
      "Futtasd a releváns gyors minőségi kapukat (git diff --check + célzott teszt/acceptance; szükség szerint tsc/lint).",
      "Ha a módosítás koherens és zöld, készíts checkpoint commitot; ha nem, ne commitolj félkész vagy hibás állapotot.",
      "FULL BUILD-et ebből a worker-csevegésből ne indíts; azt kizárólag a Central Core FULL BUILD INDÍTÁSA kapuja kérheti BUILD01/BUILD02 runneren.",
      "A végén add meg röviden: HEAD, commit, tesztek, blocker, következő lépés."
    ]
  },
  tests: {
    title: "CÉLZOTT TESZTELÉSI KÖR",
    body: [
      "Végezd el az aktuális task célzott tesztelési körét DEV környezetben.",
      "A scope szerint futtasd a releváns contract/acceptance teszteket, git diff --check-et, valamint szükség szerint tsc/lint ellenőrzést.",
      "Ne indíts teljes buildet automatikusan, ha a tesztelési acceptance-hez nem szükséges.",
      "Hiba esetén javítsd a scope-on belül, majd ismételd meg a célzott teszteket.",
      "A végén rögzíts PASS/FAIL összesítést és a következő fejlesztési lépést."
    ]
  },
  "build-runtime": {
    title: "BUILD / RUNTIME DEV KAPU",
    body: [
      "Ellenőrizd, hogy az aktuális task valóban elérte-e az indokolt build/runtime mérföldkövet.",
      "A worker csak a source readiness-t ellenőrizze: branch/worktree/current HEAD, git status és szükséges célzott tesztek legyenek rendben.",
      "FULL BUILD-et a worker NEM indíthat. A Central Core BUILD Runner Pool kizárólag BUILD01-et használ elsődlegesen, BUILD02-t fallbackként; ha egyik sem READY + FREE, a kérés QUEUED marad.",
      "build:raw, közvetlen next build, DEV-host FULL BUILD fallback és kerülő/párhuzamos build tilos.",
      "Release/restart/cutover külön központi, globális DEV gate; a worker ezeket nem hajthatja végre ebből a promptból.",
      "PROD DENY. A végén csak a build-readiness és esetleges blocker állapotot jelentsd; BUILD_ID-t csak a Central Core build evidence adhat."
    ]
  }
});

function clean(value, max = 1200) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function buildStageActionPrompt({ action, workerCode, workerLabel, task, presence }) {
  const stage = Number.isFinite(Number(presence?.workStageIndex)) ? Number(presence.workStageIndex) : null;
  const phaseAdvance = action === "advance-stage";
  const spec = phaseAdvance ? PHASE_ADVANCE[stage] : ACTIONS[action];
  if (!spec) throw new Error(phaseAdvance ? "A stage továbblépés csak az 1–3. fázisban worker-vezérelt; a 4–6. fázist a Central Core kapui kezelik." : "Ismeretlen Developer Grid stage action.");
  const reportStage = phaseAdvance ? Math.min(6, Number(stage || 1) + 1) : Number(stage || 1);
  const lines = [
    "BENJADMIN_PROMPT_KIND: DEVELOPER_GRID_STAGE_ACTION_V1",
    `MŰVELET: ${spec.title}`,
    "KÖRNYEZET: DEV ONLY · PROD DENY",
    `WORKER: ${clean(workerLabel, 120)} (${clean(workerCode, 40)})`,
    `TASK ID: ${clean(task?.id, 180) || "NINCS"}`,
    `TASK: ${clean(task?.title, 500) || "NINCS AKTÍV TASK"}`,
    `STÁTUSZ: ${clean(task?.status, 80) || "NINCS"}`,
    `SZAKASZ: ${stage ? `${stage}/6` : "NINCS HITELESÍTETT STAGE"}`,
    `PROJEKT: ${clean(task?.projectId || presence?.projectId, 180) || "NINCS"}`,
    `MODUL: ${clean([presence?.mainModule, presence?.moduleName, presence?.submoduleName].filter(Boolean).join(" › "), 500) || "NINCS"}`,
    `MUNKARÉSZ: ${clean(presence?.workItem || presence?.summary || task?.description, 1200) || "NINCS"}`,
    `BRANCH: ${clean(presence?.branch || task?.branchName, 500) || "NINCS"}`,
    `WORKTREE: ${clean(presence?.worktree || task?.worktreePath, 800) || "NINCS"}`,
    `SESSION ID: ${clean(task?.sessionId, 240) || "NINCS"}`,
    `INDULÓ/UTOLSÓ AUTHORITATIVE HEAD: ${clean(task?.sourceHead, 80) || "NINCS"}`,
    "",
    ...spec.body.map((line) => `- ${line}`),
    "",
    "KÖTELEZŐ GÉPI STAGE REPORT",
    "A normál rövid összefoglaló után pontosan add vissza az alábbi két marker közötti EGYETLEN JSON objektumot. Markdown code fence tilos.",
    "A head mezőbe a művelet VÉGÉN futtatott git rev-parse HEAD teljes 40 karakteres értéke kerüljön. Ha checkpoint commit készült, ez már az új commit legyen.",
    "Evidence-be csak technikai, sanitizált tény kerüljön; secret, .env érték, token, jelszó, üzleti dokumentumtartalom tilos.",
    "FILE: path/changeType/contentSha256; TEST: testName/status/durationMs/outputSha256; ERROR: errorCode/status/severity. Legalább egy evidence kötelező.",
    "BENJADMIN_STAGE_REPORT_V1",
    JSON.stringify({ schemaVersion:1, workerCode:clean(workerCode,40), taskId:clean(task?.id,220), sessionId:clean(task?.sessionId,240), head:"REPLACE_WITH_CURRENT_40_CHAR_HEAD", stage:reportStage, result:"PASS", summary:phaseAdvance?`${stage}/6 fázis PASS; továbblépés ${reportStage}/6 fázisba.`:"technikai stage összesítés", evidence:[{kind:"TEST",status:"PASS",severity:"INFO",summary:"célzott ellenőrzés",attributes:{testName:"git diff --check",durationMs:0,outputSha256:null}}] }),
    "BENJADMIN_STAGE_REPORT_END",
    "",
    phaseAdvance ? "A fázislépést BenjAdmin a felső 6-lépcsős sávból explicit indította. A desktop a promptot ellenőrzötten elküldheti és a stage reportot automatikusan validálja/evidence-ként rögzíti." : "A promptot a Developer Grid készítette elő. Az elküldés csak kézzel történhet; a stage reportot a desktop automatikusan validálja és evidence-ként rögzíti."
  ];
  return lines.join("\n");
}

module.exports = { ACTIONS, buildStageActionPrompt };
