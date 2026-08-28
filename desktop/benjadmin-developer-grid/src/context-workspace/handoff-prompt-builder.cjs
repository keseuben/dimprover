"use strict";

const HANDOFF_PROMPT_MARKER = "BENJADMIN_PROMPT_KIND: HANDOFF_V2";

function text(value, max = 1600) { return String(value ?? "").trim().slice(0, max); }

function buildHandoffPrompt({ workerCode, workerLabel, chatSessionId, chatTitle, task, presence }) {
  const liveMainProject = text(presence?.mainModule) || "DIMPRO";
  const liveModule = text(presence?.moduleName) || "Nincs megadva";
  const liveSubmodule = text(presence?.submoduleName) || "Nincs megadva";
  const liveProject = text(task?.projectId) || text(presence?.projectId) || "Nincs megadva";
  const liveStart = text(task?.startedAt) || text(presence?.lastSeenAt) || "nincs megbízható szerveres adat";
  const liveTaskId = text(task?.id);
  const liveTaskTitle = text(task?.title);
  const liveBranch = text(task?.branchName) || text(presence?.branch) || "nincs adat";
  const liveWorktree = text(task?.worktreePath) || text(presence?.worktree) || "nincs adat";

  return `${HANDOFF_PROMPT_MARKER}
ÁTADÁSI FELADAT – BENJADMIN CHATGRID · HANDOFF V2

Az aktuális csevegési munkaszakaszt lezárjuk.

EZ NEM ÚJ FEJLESZTÉSI FELADAT.
MOST KIZÁRÓLAG A JELEN CSEVEGÉSBEN TÉNYLEGESEN ELVÉGZETT MUNKA ÁTADÓ METAADATAIT KÉSZÍTSD EL.

KÖTELEZŐ MŰKÖDÉS:
- Pontosan egy BENJADMIN_HANDOFF_META_V2 marker + JSON blokkot adj vissza.
- A marker és a JSON előtt vagy után semmilyen magyarázó szöveget ne írj.
- Ne készíts fájlt, attachmentet vagy külön Markdown dokumentumot. A kanonikus .md fájlt a ChatGrid generálja és tárolja.
- A worked* mezők kizárólag azt írják le, amin EBBEN A CSEVEGÉSBEN ténylegesen dolgoztál.
- A LIVE/NEXT task kizárólag referencia. Task ID, startedAt, branch és worktree nem bizonyítja, hogy azon dolgoztál.
- LIVE/NEXT adatot ne másolj worked adatba csak azért, mert a worked adat hiányzik.
- Ne találj ki task ID-t, branch-et, worktree-t, commitot, build ID-t, teszteredményt, dokumentumútvonalat vagy időpontot.
- Valódi forrásellentmondás: SOURCE_CONFLICT / BENJADMIN DECISION REQUIRED.
- Az átadó után NE kezdj új taskot, ne módosíts fájlt, ne buildelj, ne commitolj, ne restartolj és ne végezz cutovert.
- PROD minden esetben DENY.

TASK-SZEMANTIKA:
- status=COMPLETED csak akkor, ha a workedTask tényleges scope-ja lezárult.
- notCompleted kizárólag a workedTask ténylegesen el nem készült elemeit tartalmazhatja.
- Külön jövőbeli/LIVE/NEXT task nem kerülhet notCompleted alá.
- COMPLETED workedTask esetén, ha nincs hiány: \"notCompleted\": [\"NINCS\"].
- partial csak a workedTask vagy a jelen csevegésben ténylegesen megkezdett kapcsolódó munka részleges állapotát tartalmazhatja.
- Téves task-dispatchből származó, megszakított előkészítést ne könyvelj completed worked munkának; röviden technicalDebt/blockers/benjadminDecisions mezőben jelöld, ha releváns.

IDŐPONT-SZABÁLY:
- startedAt elsődleges forrása a tényleges MUNKAFELVÉTEL; ha nincs ilyen, csak egyértelműen igazolható első worked fejlesztési esemény használható.
- Ha startedAt nem igazolható, legyen üres string. A ChatGrid ezt \"NINCS HITELESÍTETT ADAT\" állapotként kezeli.
- finishedAt csak igazolható MUNKA VISSZAADVA / munkaszakasz-zárási idő legyen. Ha nem igazolható, legyen üres string; a ChatGrid a mentés rendszeridejét használja.
- Soha ne használd a LIVE/NEXT szerveres kezdését worked startedAt-ként.
- Ne egészíts ki kitalált másodperceket.

BRANCH / WORKTREE / COMMIT:
- branch/worktree/startCommit/endCommit a tényleges worked munkához tartozzon.
- LIVE/NEXT branch/worktree csak referencia; ne másold át worked mezőbe bizonyíték nélkül.
- Uncommitted/untracked állapotot tényszerűen jelöld; ne találj ki záró commitot.

DOKUMENTUMOK:
- requiredDocumentsWorkedTask: csak a lezárt worked munka megértéséhez/folytatásához ténylegesen szükséges, hiteles dokumentumok.
- requiredDocumentsNextTask: csak a külön LIVE/NEXT task explicit indítása után szükséges dokumentumok.
- Ne találj ki fájlútvonalat. Ha nincs hiteles adat: [\"NINCS HITELESÍTETT ADAT\"].

ADATTISZTASÁG:
- A JSON mezőkbe ne kerüljön contentReference, oaicite, belső citation-token, UI-artefaktum vagy más nem szakmai hivatkozási maradvány.
- A summary kizárólag emberileg olvasható szakmai összefoglaló legyen.
- workedModule ne ismételje szükségtelenül a workedMainProject teljes nevét.
- fileAreaKey rövid ASCII kulcs legyen; ne tartalmazzon dátumot, workernevet vagy teljes projektnevet.

TÖMÖRSÉGI SZABÁLY:
- startingState: legfeljebb 500 karakter.
- summary: 3–5 rövid mondat, legfeljebb 900 karakter.
- relatedAreas: legfeljebb 5 elem.
- workDone/completed/partial/notCompleted/technicalDebt/blockers/benjadminDecisions/nextStep: legfeljebb 6 elem/tömb.
- changedFiles/tests/requiredDocumentsWorkedTask/requiredDocumentsNextTask: legfeljebb 10 elem/tömb.
- Egy listaelem lehetőleg legfeljebb 220 karakter. Tényeket írj, ne esszét.

CHATGRID CSEVEGÉS:
- Worker: ${text(workerLabel) || text(workerCode)} (${text(workerCode)})
- Csevegés azonosító: ${text(chatSessionId) || "ismeretlen"}
- Csevegés neve: ${text(chatTitle) || "ismeretlen"}

JELENLEGI LIVE/NEXT KONTEXTUS – CSAK REFERENCIA, NEM WORKED ADAT:
- Főprojekt: ${liveMainProject}
- Projekt: ${liveProject}
- Modul: ${liveModule}
- Kontextus modul: ${liveSubmodule}
- Live/next Task ID: ${liveTaskId || "nincs aktív task"}
- Live/next Task: ${liveTaskTitle || "nincs aktív task"}
- Live/next szerveres kezdés: ${liveStart}
- Live/next Branch: ${liveBranch}
- Live/next Worktree: ${liveWorktree}
- PROD: DENY

FIGYELEM:
A fenti LIVE/NEXT blokk tájékoztató állapot. Ha a csevegésben hibás dispatcher miatt külön task-indító prompt jelent meg, azt önmagában NE tekintsd worked tasknak. Csak a ténylegesen megtörtént munkát rögzítsd, és a tévesen elindított, majd megszakított munkát külön jelöld.

A VÁLASZ FORMÁJA PONTOSAN:

BENJADMIN_HANDOFF_META_V2
\`\`\`json
{
  "schemaVersion": 2,
  "chatSessionId": "${text(chatSessionId) || ""}",
  "chatTitle": "${text(chatTitle) || ""}",
  "workerCode": "${text(workerCode)}",
  "workedMainProject": "tényleges főprojekt",
  "workedProject": "tényleges projekt",
  "workedModule": "tényleges modul, a főprojekt felesleges ismétlése nélkül",
  "workedContextModule": "tényleges almodul / kontextus",
  "primaryDevelopmentArea": "emberileg olvasható fő fejlesztési terület",
  "fileAreaKey": "rövid ASCII fájlnév-kulcs, pl. Health_runtime",
  "relatedAreas": ["kapcsolódó terület"],
  "workedTaskId": "tényleges fő task ID vagy üres string",
  "workedTaskTitle": "tényleges fő task neve",
  "liveNextTaskId": "${liveTaskId}",
  "liveNextTaskTitle": "${liveTaskTitle}",
  "startedAt": "igazolható ISO időpont vagy üres string",
  "finishedAt": "igazolható ISO zárási időpont vagy üres string",
  "status": "COMPLETED | PARTIAL | BLOCKED | FAILED",
  "startingState": "rövid konkrét kiinduló állapot",
  "workDone": ["elvégzett munka"],
  "changedFiles": ["útvonal — fő változás"],
  "branch": "worked branch vagy üres string",
  "worktree": "worked worktree vagy üres string",
  "startCommit": "ellenőrzött kiinduló HEAD vagy üres string",
  "endCommit": "ellenőrzött záró HEAD vagy üres string",
  "databaseChanges": "rövid DB/migráció összefoglaló vagy NINCS",
  "buildRelease": "rövid build/release/restart összefoglaló vagy NINCS",
  "tests": ["teszt — eredmény"],
  "completed": ["teljesen elkészült worked elem"],
  "partial": ["részleges worked elem; ha nincs: NINCS"],
  "notCompleted": ["csak worked hiány; COMPLETED esetén ha nincs: NINCS"],
  "technicalDebt": ["ismert hiba / technikai adósság; ha nincs: NINCS"],
  "blockers": ["aktív blokkoló; ha nincs: NINCS"],
  "benjadminDecisions": ["nyitott BenjAdmin döntés; ha nincs: NINCS"],
  "nextStep": ["következő javasolt, MOST NEM ELINDÍTANDÓ lépés"],
  "requiredDocumentsWorkedTask": ["lezárt worked munka hiteles dokumentuma"],
  "requiredDocumentsNextTask": ["külön live/next task hiteles dokumentuma"],
  "summary": "3–5 rövid mondatos folytatási összefoglaló",
  "prodDeny": "DEV ONLY; PROD DENY"
}
\`\`\`

VÉGSŐ ELLENŐRZÉS:
1. A jelen csevegés tényleges worked munkáját írtad le?
2. LIVE/NEXT adat nem szivárgott worked mezőbe bizonyíték nélkül?
3. notCompleted csak worked hiányt tartalmaz?
4. COMPLETED esetben nincs külön jövőbeli task hiányként feltüntetve?
5. branch/worktree/commit/időpont ténylegesen igazolható vagy szabályosan üres?
6. worked/next dokumentumlista nincs összekeverve?
7. fileAreaKey rövid ASCII?
8. nincs contentReference/oaicite/UI-artefaktum?
9. PROD DENY?
10. a válasz után megállsz?

A BENJADMIN_HANDOFF_META_V2 marker és a JSON blokk előtt vagy után SEMMILYEN MÁS SZÖVEGET NE ÍRJ.
A JSON lezárása után AZONNAL ÁLLJ MEG.
NE KEZDJ ÚJ TASKOT. NE MÓDOSÍTS FÁJLT. NE BUILD-ELJ. NE COMMITOLJ. NE INDÍTS RESTARTOT. NE VÉGEZZ CUTOVERT.
VÁRJ EXPLICIT BENJADMIN / BENAI INDÍTÁS UTASÍTÁSRA.`;
}

module.exports = { HANDOFF_PROMPT_MARKER, buildHandoffPrompt };
