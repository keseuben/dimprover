"use strict";

const ACTIONS = Object.freeze({
  checkpoint: {
    title: "BIZTONSÁGOS DEV CHECKPOINT",
    body: [
      "Készíts biztonságos DEV checkpointot az aktuális munkáról.",
      "Ellenőrizd a source/worktree/branch/HEAD/provenance állapotot és a git status-t.",
      "Futtasd a releváns gyors minőségi kapukat (git diff --check + célzott teszt/acceptance; szükség szerint tsc/lint).",
      "Ha a módosítás koherens és zöld, készíts checkpoint commitot; ha nem, ne commitolj félkész vagy hibás állapotot.",
      "Buildet csak akkor indíts, ha az adott mérföldkőhöz valóban indokolt, és csak a központi exclusive lock alatt.",
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
      "Build előtt kötelező: source provenance, git status, df/free/swap, aktív műveletek és központi exclusive lock ellenőrzése.",
      "build01/build02 csak tényleges SSH READY állapotban használható; egyébként a canonical DEV szerver a hivatalos executor.",
      "Kizárólag a canonical koordinált build útvonalat használd; build:raw és kerülő/párhuzamos build tilos.",
      "Release/restart csak akkor történjen, ha a task explicit megköveteli és a release/runtime provenance zöld.",
      "PROD DENY. A végén add meg a build ID-t, release/runtime állapotot és smoke eredményt, ha build történt."
    ]
  }
});

function clean(value, max = 1200) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function buildStageActionPrompt({ action, workerCode, workerLabel, task, presence }) {
  const spec = ACTIONS[action];
  if (!spec) throw new Error("Ismeretlen Developer Grid stage action.");
  const stage = Number.isFinite(Number(presence?.workStageIndex)) ? Number(presence.workStageIndex) : null;
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
    "",
    ...spec.body.map((line) => `- ${line}`),
    "",
    "A promptot a Developer Grid készítette elő. Az elküldés csak kézzel történhet."
  ];
  return lines.join("\n");
}

module.exports = { ACTIONS, buildStageActionPrompt };
