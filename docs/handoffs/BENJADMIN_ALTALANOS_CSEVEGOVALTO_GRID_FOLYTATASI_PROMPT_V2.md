# BENJADMIN – Általános csevegőváltó és fejlesztés-folytatási prompt V2

**Cél:** ezt a fájlt bármely BENJADMIN AI-cellának / kódmérnöknek be lehet adni új csevegés indításakor, hogy a meglévő fejlesztést biztonságosan, ugyanazon taskon folytassa, és a munka ne maradjon csak helyi fájlban vagy helyi Git commitban.

**Alapszabály:** a fejlesztés csak akkor tekinthető szabályosan rögzítettnek, ha a releváns állapot **Gitben + remote branch-en + Central Grid authoritative state-ben + projekt handoffban** egymással összhangban van.

---

## 1. Indítóutasítás az új AI-nak

Te egy meglévő BENJADMIN / DIMPRO / DIMPROVER fejlesztési munkát folytatsz. **Ne kezdj új rendszert és ne hozz létre új taskot**, kivéve, ha a felhasználó ezt kifejezetten kéri.

Elsőként azonosítsd az aktuális worker/cellát.

Ha ezt a Gridből vagy a megadott anyagokból nem tudod biztosan megállapítani, az első kérdésed legyen:

> **Melyik BENJADMIN AI-cellában dolgozunk?**

Amíg a worker/cella nem azonosított, **csak olvasás és ellenőrzés engedélyezett; fájlírás, commit, push, migráció, build, restart, deploy vagy konfigurációmódosítás nem.**

---

## 2. Kötelező forrásprioritás

A folytatáskor az állapotot ebben a sorrendben ellenőrizd:

1. **Central Core / Developer Grid authoritative task + active worker session**
2. **source provenance**: repository, worktree, branch, base HEAD, current authoritative HEAD
3. **aktuális Git worktree tényleges HEAD + git status**
4. **legfrissebb projekt-specifikus handoff/checkpoint**
5. **aktuális beszélgetésben kapott kiegészítő utasítások**

Ha ezek között eltérés van, **ne találgasd, melyik a helyes**. Rögzítsd a mismatch-et, állj fail-closed módba, és előbb rendezd vagy kérj döntést.

A Central Gridet **tilos kézzel a state.json közvetlen szerkesztésével javítani**. Mindig a rendszer hivatalos state/evidence/session mechanizmusát használd.

---

## 3. Kötelező preflight minden fejlesztés előtt

Módosítás előtt ellenőrizd és bizonyítsd:

- workerCode / AI-cella;
- taskId;
- sessionId;
- projectId;
- modul / context module / scope;
- repository;
- worktree teljes útvonala;
- branch;
- base HEAD;
- Central Grid authoritative HEAD;
- tényleges Git HEAD;
- git status;
- source provenance = VERIFIED;
- BOOT ACK = VALIDATED / codingAllowed = true;
- aktív scope lock és worktree lease;
- környezet = DEV;
- productionAccess = DENY;
- a szerver valóban a kívánt DEV gép-e: hostname / IP / releváns mount;
- nincs-e más worker ugyanazon scope-on;
- nincs-e futó központi build/release/migration/restart lock.

**Ha a Git HEAD és a Grid HEAD eltér, előbb szinkronizálni kell. Fejlesztést elavult Grid HEAD-del ne folytass.**

---

## 4. Szerverkörnyezet-szabály

Az MCP belépési pont lehet vezérlő/PROD VPS, miközben a DEV/BUILD/DB szervereket SSH aliasokon keresztül érjük el.

Ezért minden szerverművelet előtt ellenőrizd a célgépet.

Példa:

- DEV: `ssh dimpro-dev`
- BUILD01: a konfigurált BUILD01 alias
- BUILD02: a konfigurált BUILD02 alias
- DB: a konfigurált DB alias

**A mappanév önmagában nem bizonyítja, hogy DEV-en vagy.** A `/srv/dimpro-dev` könyvtár létezése nem helyettesíti a hostname/IP ellenőrzést.

---

## 5. DEV ONLY / PROD DENY

Alapértelmezés:

**DEV ONLY · PROD DENY**

Külön felhasználói engedély nélkül tilos:

- PROD deploy;
- PROD restart;
- PROD migráció;
- PROD adatváltoztatás;
- éles bucket / éles adatbázis módosítása;
- más worker branchének vagy worktree-jének módosítása;
- destruktív törlés;
- bizonyítatlan „cleanup”.

Adatbázis-migrációnál külön ellenőrizd, hogy a DEV és PROD adatbázis/projektazonosító valóban különbözik-e.

---

## 6. Fejlesztési munkamódszer

Minden fejlesztési blokk előtt:

1. térképezd fel a meglévő megoldást;
2. ne duplikálj már létező modult vagy truth source-ot;
3. a legkisebb visszafordítható patch-et készítsd;
4. készíts backupot az érintett kritikus fájlokról, ha indokolt;
5. csak a kijelölt scope fájljait módosítsd;
6. futtasd a releváns contract / lint / TypeScript / smoke ellenőrzéseket;
7. `git diff --check`;
8. nézd át a diffet commit előtt.

Nem szabad PASS-ként jelenteni olyan tesztet, amely nem futott le vagy timeoutolt.

---

## 7. KÖTELEZŐ négypontos rögzítés minden logikai fejlesztési blokk után

Egy fejlesztési blokk **nem tekinthető befejezettnek**, amíg ez a négy pont nincs rendezve.

### A. Git commit

Készíts célzott, értelmes commitot.

Ellenőrizd:

- commit SHA;
- tiszta vagy ismert worktree state;
- commit csak a saját scope módosításait tartalmazza.

### B. Remote branch push

Ha az adott repository/branch policy engedi, a stabil checkpointot pushold a worker remote branchére.

Utána ellenőrizd:

- upstream be van-e állítva;
- remote HEAD = local HEAD.

Ha push technikailag nem lehetséges, ezt **BLOCKERként explicit rögzíteni kell**. Ne mondd, hogy a munka központilag mentve van, ha csak lokális commit létezik.

### C. Central Grid authoritative sync

A hivatalos Grid evidence/stage/session mechanizmuson keresztül rögzítsd:

- taskId;
- sessionId;
- workerCode;
- teljes 40 karakteres current HEAD;
- aktuális stage;
- result;
- FILE / TEST / ERROR evidence;
- rövid összefoglaló;
- releváns teszteredmények.

A Grid HEAD-et minden új checkpoint commit után frissíteni kell.

**Stage-et nem szabad átugrani.**

A hatfázisú modell:

1. ELEMZÉS
2. FEJLESZTÉS
3. TESZTELÉS
4. ELLENŐRZÉS
5. BUILD / KIADÁS
6. LEZÁRÁS

A 4→5, 5→6 és lezárási átmenetet csak a Central Core megfelelő review/build/closure gate-je végezheti.

### D. Projekt handoff/checkpoint

Frissítsd a projekt legfrissebb handoffját legalább ezekkel:

- aktuális task / worker;
- branch / worktree;
- base HEAD;
- current HEAD;
- elkészült funkciók;
- módosított fő fájlok;
- tesztek és pontos eredményük;
- ismert blocker;
- mi NEM történt;
- következő egyetlen konkrét lépés.

---

## 8. Kötelező visszaellenőrzés a rögzítés után

A következő fejlesztési blokk előtt **újra olvasd vissza**:

- local Git HEAD;
- remote branch HEAD;
- Central Grid authoritative HEAD;
- Central Grid workStageIndex;
- active session;
- handoff current HEAD.

Csak akkor folytass, ha:

`LOCAL HEAD = REMOTE HEAD = GRID HEAD`

és a handoff ugyanazt a checkpointot írja le.

Ha nem egyezik, előbb javítsd a szinkront.

---

## 9. BENJADMIN stage report minimum tartalom

Ha a rendszer a strukturált stage reportot várja, az alábbi mezők kötelezőek:

```text
BENJADMIN_STAGE_REPORT_V1
{
  "schemaVersion": 1,
  "workerCode": "<AKTUÁLIS_WORKER>",
  "taskId": "<TASK_ID>",
  "sessionId": "<SESSION_ID>",
  "head": "<40_KARAKTERES_GIT_HEAD>",
  "stage": <1-6>,
  "result": "PASS|BLOCKED|FAIL",
  "summary": "<RÖVID TÉNYALAPÚ ÖSSZEFOGLALÓ>",
  "evidence": [
    {
      "kind": "FILE|TEST|ERROR",
      "status": "RECORDED|PASS|FAIL|BLOCKED",
      "severity": "INFO|WARN|ERROR",
      "summary": "<BIZONYÍTÉK>",
      "attributes": {}
    }
  ]
}
BENJADMIN_STAGE_REPORT_END
```

A blokk kiírása önmagában **nem bizonyítja**, hogy a Central Grid befogadta. A befogadás után az authoritative state-et vissza kell olvasni és ellenőrizni.

---

## 10. Csevegőváltás előtt kötelező záró checkpoint

Mielőtt új csevegésre váltunk:

- commit;
- remote push;
- Grid HEAD sync;
- Grid stage sync;
- project handoff frissítés;
- final local/remote/Grid HEAD összehasonlítás;
- aktuális blockerlista;
- következő egyetlen lépés.

Ezután készíts részletes MD átadót.

Az új beszélgetésnek **nem szabad a régi chat memóriájára hagyatkoznia** a Git/Grid állapot helyett.

---

## 11. Kötelező státuszjelentés a felhasználónak

Fejlesztési blokk végén csak tényszerűen jelentsd:

- mit készítettél el;
- local commit SHA;
- remote push állapot;
- Grid task/stage/current HEAD;
- teszteredmények;
- deploy/migráció/restart történt-e;
- következő lépés.

Ne állíts olyat, hogy „rögzítve van a Gridben” vagy „GitHubon van”, amíg ezt vissza nem ellenőrizted.

---

## 12. Fail-closed szabályok

Azonnal állj meg és jelents BLOCKED állapotot, ha:

- task/session nem azonosítható;
- worker/cella nem biztos;
- source provenance nem VERIFIED;
- BOOT ACK nincs validálva;
- local és Grid branch/worktree eltér;
- HEAD nem bizonyítható;
- más worker scope-jába ütközöl;
- remote push sikertelen és a központi mentés elvárt;
- Grid evidence ingest sikertelen;
- DEV/PROD adatbázis-cél nem különíthető el biztosan;
- destruktív művelet lenne szükséges külön engedély nélkül.

Ilyenkor **ne menj tovább a következő fejlesztési fázisba**.

---

## 13. Rövid bemásolható indítóváltozat

> Folytasd a meglévő BENJADMIN fejlesztést. Először azonosítsd a worker/cellát; ha nem biztos, kérdezd meg, melyik AI-cellában dolgozunk. Ezután ellenőrizd a Central Grid task/session/source provenance állapotot, a branch/worktree-t, a local Git HEAD-et, a remote HEAD-et, BOOT ACK-et, scope lockot és a DEV szerverazonosságot. Módosítani csak VERIFIED + codingAllowed állapotban szabad. Minden logikai fejlesztési blokk után kötelező: Git commit → remote branch push → Central Grid evidence/stage/HEAD sync → projekt handoff frissítés → local/remote/Grid HEAD visszaellenőrzés. Ha bármelyik eltér vagy nem rögzíthető, állj fail-closed BLOCKED állapotba, és ne folytasd a következő szakaszt. PROD művelet külön engedély nélkül tilos.

---

**Verzió:** V2  
**Készült:** 2026-09-25  
**Alapelv:** nincs „kész” fejlesztési checkpoint bizonyított Git + remote + Grid + handoff konzisztencia nélkül.


### Handoff-commit önhivatkozási szabály

Ha maga a handoff frissítése hozza létre a következő Git commitot, **ne próbáld a fájlba beírni a saját, még nem létező commit SHA-ját**, mert az önhivatkozó és minden módosítás új SHA-t eredményezne.

Ilyenkor:

1. a handoffba írd be a handoff frissítése előtti **source checkpoint HEAD-et**;
2. commitold és pushold a handoffot;
3. a létrejött **final HEAD-et** szinkronizáld a Central Gridbe;
4. ellenőrizd: local = remote = Grid final HEAD;
5. a final HEAD bizonyítéka a Git/remote/Grid state legyen, ne önhivatkozó szöveg a commitolt fájlban.
