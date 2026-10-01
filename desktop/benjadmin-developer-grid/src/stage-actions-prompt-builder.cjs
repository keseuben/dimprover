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
  "review-rework": {
    title: "4/6 ELLENŐRZÉS · REVIEW FAIL JAVÍTÁSI KÖR",
    body: [
      "Az előző INTERNAL_REVIEW_FALLBACK vagy review kapu FAIL eredményt adott. Javítsd a jelenlegi beszélgetésben felsorolt blokkoló findingokat a kijelölt DEV scope-on belül.",
      "A javítás után futtasd újra a releváns célzott teszteket és git diff --check-et, majd készíts stabil checkpoint commitot/pusht.",
      "A stage report maradjon 4/6; a head mező már a javított current HEAD legyen. Adj FILE és TEST evidence-et. FAIL/BLOCKED esetén ne állíts PASS-t."
    ]
  },
  "build-rework": {
    title: "5/6 BUILD / KIADÁS · BUILD FAIL JAVÍTÁSI KÖR",
    body: [
      "A Central Core FULL BUILD FAIL/BLOCKED eredményt adott. Azonosítsd és javítsd a build hibát a kijelölt DEV scope-on belül.",
      "Futtasd újra a releváns célzott teszteket és git diff --check-et, majd commit/push után adj current-HEAD stage reportot.",
      "A stage report maradjon 5/6. A FULL BUILD-et ne indítsd közvetlenül; PASS stage report után a Central Core automatikusan újrakéri BUILD01/BUILD02 runneren."
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
    "IDŐMÉRÉS ÉS BECSLÉS: a részfeladat megkezdése ELŐTT rögzíts becsült részfeladat-időt + teljes feladat-időt + estimateCreatedAt + bizonytalanságot. Minden állapotközlésben őrizd meg az eredeti startedAt értéket. Lezáráskor kötelező finishedAt, elapsedSeconds, actualElapsedSeconds és estimateVarianceSeconds. Időzóna: Europe/Budapest.",
    "Az eredeti becslést tilos visszamenőleg átírni. Scope-változás esetén revisedEstimatedSeconds adható meg, az eredeti estimatedSeconds változatlan marad.",
    "BENJADMIN_STAGE_REPORT_V1",
    JSON.stringify({ schemaVersion:2, workerCode:clean(workerCode,40), taskId:clean(task?.id,220), sessionId:clean(task?.sessionId,240), head:"REPLACE_WITH_CURRENT_40_CHAR_HEAD", stage:reportStage, result:"PASS", summary:phaseAdvance?`${stage}/6 fázis PASS; továbblépés ${reportStage}/6 fázisba.`:"technikai stage összesítés", workUnit:clean(spec.title,500), startedAt:"REPLACE_WITH_WORK_UNIT_START_ISO8601", reportedAt:"REPLACE_WITH_REPORT_ISO8601", finishedAt:"REPLACE_WITH_FINISH_ISO8601", timezone:"Europe/Budapest", elapsedSeconds:"REPLACE_WITH_ELAPSED_SECONDS", estimatedSeconds:"REPLACE_WITH_ORIGINAL_SUBTASK_ESTIMATE_SECONDS", estimatedTotalSeconds:"REPLACE_WITH_ORIGINAL_TOTAL_TASK_ESTIMATE_SECONDS", estimateCreatedAt:"REPLACE_WITH_ESTIMATE_CREATED_ISO8601", estimateConfidence:"ALACSONY|KOZEPES|MAGAS", revisedEstimatedSeconds:null, remainingEstimateSeconds:0, actualElapsedSeconds:"REPLACE_WITH_ACTUAL_ELAPSED_SECONDS", estimateVarianceSeconds:"REPLACE_WITH_ACTUAL_MINUS_EFFECTIVE_ESTIMATE_SECONDS", evidence:[{kind:"TEST",status:"PASS",severity:"INFO",summary:"célzott ellenőrzés",attributes:{testName:"git diff --check",durationMs:0,outputSha256:null}}] }),
    "BENJADMIN_STAGE_REPORT_END",
    "",
    phaseAdvance
      ? "A fázislépést a Developer Grid Central Core/Desktop autopilot indította. Nincs szükség BenjAdmin kattintására vagy újabb „folytasd” üzenetre. A worker kizárólag a fenti szakmai feladatot végzi; a desktop a stage reportot automatikusan validálja, evidence-ként rögzíti és PASS esetén továbblép."
      : action === "checkpoint"
        ? "A checkpoint szakmai source-checkpoint. A desktop exact task/session/worker + DEV provenance guard mellett kezeli az evidence-et. A worker ne végezzen Grid state/session/stage/build/handoff adminisztrációt. FULL BUILD és PROD művelet ebből a worker workflow-ból tilos."
        : "A promptot a Developer Grid Central Core/Desktop készítette és automatikusan koordinálja. A workernek nem kell kézi stage-kezelést, Grid recoveryt vagy build-orchestrationt végeznie; a stage reportot a desktop automatikusan validálja és evidence-ként rögzíti."
  ];
  return lines.join("\n");
}

module.exports = { ACTIONS, buildStageActionPrompt };
