# 180 — BENJADMIN Külső AI Worker rendszer V1 — intake és illesztési terv

Dátum: 2026-08-12  
Állapot: **TERVBE VÉVE / SOURCE DOCUMENT PENDING**  
Környezet: DEV  
Kapcsolódó dokumentumok: 176, 177, 178, 179, B3, B3.1, B3.2

## 1. Beérkezett kiegészítő fejlesztési irány

A BENJADMIN Fejlesztői Konzol V1 következő kiegészítése nem külön konzol és nem külön agent-alkalmazás.

Cél:

- a meglévő Fejlesztői Konzol;
- Ben-AI koordináció;
- B3 task/session/worktree/scope-lock motor;
- Control Plane;
- DEV/PROD fail-closed szabályok;
- build/test/audit rendszer

kibővítése 1–2 kontrollált külső AI fejlesztő worker futtatására.

Első állandó külső worker szerepkörök:

- **M.Forge-AI — Márk** — Coding Worker;
- **V.Guard-AI — Viktória** — Review & Quality Worker.

A worker szerepkör nem AI provider és nem modellnév. A provider/model a worker mögött cserélhető adapteren keresztül.

## 2. Forrásdokumentum-gate

A felhasználói átadás szerint a teljes fejlesztés kötelező normatív forrása a:

`DIMPRO BENJADMIN – Külső AI Worker rendszer V1 – fejlesztői kiegészítés`

részletes dokumentum.

2026-08-12-én a teljes fájl még **nem jelenik meg a BENJADMIN Fejlesztési Tárban**. A Tár jelenleg 1 kötelező erőforrást tartalmaz: `01_BenjADMIN.zip`.

A chat fájlforrásából sem volt retrievable attachment.

Ezért a Külső AI Worker V1 **kódimplementációja nem indul el addig, amíg a teljes dokumentum közvetlenül nem olvasható**. Ez nem blokkolja az intake, architektúra-illesztés és backlog előkészítését.

## 3. Jelenlegi Konzol V1 térképe

Meglévő, újrahasználandó elemek:

### UI

- `components/admin/developer-console/DeveloperConsoleShell.tsx`
- `DeveloperConsoleTopbar.tsx`
- `DeveloperComposer.tsx`
- `DeveloperConversation.tsx`
- `DeveloperMessage.tsx`
- `DeveloperConsoleProjectRail.tsx`
- `LiveWorkPanel.tsx`
- `TeamQuickDrawer.tsx`
- `DevelopmentResourcesDrawer.tsx`
- `CommandLibraryDrawer.tsx`

### Konzol API

- `/api/dev/console/context`
- `/api/dev/console/live`
- `/api/dev/console/messages`
- `/api/dev/console/resources`
- `/api/dev/console/stream`

### B3 fejlesztési motor

- `app/lib/dev-center/engine-repository.ts`
- `app/lib/dev-center/orchestration-repository.ts`
- `app/lib/dev-center/worktree-validation.ts`
- `app/lib/dev-center/partner-isolation.ts`
- `app/lib/dev-center/control-plane.ts`
- `app/lib/dev-center/control-plane-commands.ts`
- `app/lib/dev-center/worker-auth.ts`

### Újabb Konzol hardening

- `app/lib/dev-center/benai-dispatch.ts`
- `app/lib/dev-center/internal-repository-binding.ts`
- `app/lib/dev-center/internal-executor-readiness.ts`

A meglévő task/session/worktree/scope-lock/build/audit rendszert **nem szabad duplikálni**.

## 4. Jelenlegi worker-modell

Meglévő Development Center workerek:

- Ármin-AI / `ARMINAI`
- Jázmin-AI / `JAZMINAI`
- Outmin-AI / `OUTMINAI`

Az új M.Forge-AI és V.Guard-AI ezek mellé, külső AI végrehajtási szerepkörként illesztendő. Nem helyettesítik a Ben-AI koordinátort és nem írják felül az Outmin-AI partner izolációt.

## 5. Cél workflow illesztése a meglévő motorhoz

Cél:

`Felhasználói igény -> Ben-AI -> automatikus scope -> preflight -> backup -> M.Forge -> V.Guard -> BENJADMIN Gate -> DEV READY`

Meglévő elemhez illesztés:

| Új funkció | Meglévő alap | Bővítési irány |
|---|---|---|
| Terméknyelvű feladat | DeveloperComposer + console/messages | alapértelmezett `Ben-AI / automatikus` task mód |
| Automatikus technikai scope | task `scope` + repo binding | új scope discovery service, nem új task rendszer |
| Preflight | engine gate + executor readiness | worker workflow preflight aggregátor |
| Backup | meglévő backup/audit logika | task-specifikus checkpoint kötelező gate |
| M.Forge worktree | session + worktree validation | új worker identity/role, ugyanaz a handshake |
| V.Guard review | session/audit/build adatok | független review run, M.Forge worktree write nélkül |
| Review eredmény | audit/build metadata | strukturált PASS / PASS_WITH_NOTES / FAIL read model |
| Max. 2 javítási kör | task/run metadata | központi orchestration policy |
| BENJADMIN Gate | build/test/smoke/control | egységes quality gate aggregátor |
| DEV READY | task/release státusz | külön workflow state, PROD-tól elválasztva |
| PROD | jelenlegi Control Plane | kizárólag explicit felhasználói release approval |

## 6. Felhasználói UX szabály

A felhasználótól nem kérhető:

- fájl;
- mappa;
- branch;
- worktree;
- API route;
- build parancs;
- tesztfájl;
- dokumentációs fájl;
- technikai scope.

A fő composerben a felhasználó termék- vagy műszaki nyelven írja le az igényt.

A technikai felderítés háttérfolyamat.

Megjeleníthető opcionális elem:

`Scope megtekintése`

Ez read-only magyarázó nézet, nem kötelező beállítási felület.

## 7. Automatikus scope — tervezett szolgáltatás

Javasolt új service, a meglévő task motor előtt:

`app/lib/dev-center/automatic-scope.ts`

Feladata:

1. projekt/repository feloldás;
2. kulcsszavas és strukturális repo-felderítés;
3. route/component/service/type/test/doc jelöltek;
4. dependency térkép;
5. scope konfliktus-előellenőrzés;
6. kockázati besorolás;
7. javasolt acceptance lista;
8. eredmény rögzítése a meglévő task `scope`/metadata mezőibe.

Nem hozhat létre külön párhuzamos scope-lock rendszert.

## 8. Külső Worker Model Adapter

A jelenlegi `OPENAI_API_KEY`-hez kötött readiness csak a Konzol átmeneti Ben-AI híd első lépése volt.

A Külső AI Worker V1 előtt ezt providerfüggetlen adapter registryre kell emelni.

Javasolt felület:

`WorkerModelAdapter`

Fő műveletek:

- `probe()`
- `startRun()`
- `streamEvents()` / `pollRun()`
- `cancelRun()`
- `usage()`
- `normalizeResult()`

Adapter példák később:

- OpenAI/Codex adapter;
- Claude adapter;
- további provider adapter.

A worker szerepkör (`MFORGE`, `VGUARD`) és a provider/model konfiguráció külön objektum.

## 9. PROD izoláció

M.Forge és V.Guard számára technikai szinten DEFAULT DENY:

- PROD SSH;
- PROD DB write;
- PROD secret/.env read;
- PROD PM2 restart;
- PROD deploy;
- PROD migration;
- más worker aktív worktree write;
- Control Plane production mutation.

Ezeket a meglévő authorization / environment / repository / worktree / Control Plane policy rétegen kell kikényszeríteni, nem prompttal.

## 10. M.Forge és V.Guard elkülönítés

M.Forge:

- writable DEV task worktree;
- kizárólag saját aktív worktree/scope;
- kód és teszt módosítás;
- integrációs jog nélkül.

V.Guard:

- M.Forge aktív worktree-jére **nem kap write jogot**;
- review inputként commit/diff/test artifactot kap;
- szükség esetén saját izolált review worktree-ben futtat tesztet;
- eredmény: `PASS | PASS_WITH_NOTES | FAIL`;
- FAIL esetén javítás M.Forge új köréhez kerül.

Maximális automatikus javítási kör: 2.

## 11. BENJADMIN Gate

Közös, modellfüggetlen quality gate:

`tsc -> lint -> targeted tests -> build -> smoke -> releváns regression/UI -> dokumentációellenőrzés`

A gate csak DEV környezetben fut automatikusan.

Sikeres eredmény:

`DEV READY`

Ez nem jelent PROD release-t.

## 12. Költség-, idő- és retry-kontroll

A meglévő build/audit/task adatok nem elegendők minden futásszintű méréshez. A részletes normatív dokumentum alapján valószínűleg külön run/usage read model szükséges, de ezt a teljes dokumentum elolvasása előtt nem véglegesítjük.

Kötelező mérendő mezők:

- worker role;
- provider;
- model;
- started/finished;
- wall time;
- active worker time;
- input/output/total token;
- API usage;
- HUF cost;
- changed files;
- tests;
- retry index;
- review result;
- stop reason.

Keretek:

- task;
- worker;
- napi;
- havi;
- futási idő;
- retry.

Threshold:

- 75% warning;
- 90% warning;
- 100% hard stop.

## 13. Javasolt V1 fejlesztési sorrend

### V1.0 — Task és UI alap

- új külső worker szerepkörök read modelje;
- automatikus feladat mód;
- Scope megtekintése drawer helye;
- workflow state vizualizáció;
- providerfüggetlen worker mezők.

### V1.1 — Automatikus scope + worktree

- scope discovery;
- scope preview;
- preflight;
- task backup;
- M.Forge session/worktree handshake;
- V.Guard izolációs policy alap.

### V1.2 — M.Forge első valódi model adapter

- adapter registry;
- első provider adapter;
- server-side secret only;
- run event napló;
- cancel/hard stop.

### V1.3 — V.Guard független review

- review artifact;
- review session;
- PASS / PASS_WITH_NOTES / FAIL;
- max. 2 retry loop.

### V1.4 — BENJADMIN Gate

- quality gate aggregátor;
- docs check;
- DEV READY állapot.

### V1.5 — Kontrollált DEV integráció

- csak gate után;
- trusted baseline/integration ref;
- konfliktusvédelem;
- rollback.

### V1.6 — Költség/idő/benchmark

- usage ledger;
- budget policy;
- hard stop;
- worker/provider/model benchmark.

## 14. Architektúraütközés / döntési pontok

Jelenleg nincs olyan ütközés, amely második konzolt vagy párhuzamos task/session/worktree rendszert indokolna.

Két meglévő pontot kötelező átépíteni, nem duplikálni:

1. a jelenlegi Ben-AI readiness OpenAI-specifikus provider-jelzőjét providerfüggetlen adapter registryre;
2. a composer jelenlegi explicit worker-target logikáját úgy, hogy a normál felhasználói út alapértelmezetten Ben-AI automatikus routing legyen, a technikai worker-választás pedig legfeljebb admin/advanced kompatibilitási funkció maradjon.

Ezek a felhasználói átadással összhangban vannak, ezért jelenleg nem igényelnek külön tisztázó kérdést.

## 15. Következő gate

A tényleges V1.0 kódmódosítás előtt kötelező:

1. a teljes normatív `Külső AI Worker rendszer V1` fájl elérhetővé tétele;
2. teljes fájl beolvasása;
3. jelen intake cross-check;
4. aktív worktree / git status újraellenőrzés;
5. külön backup/rollback pont;
6. csak ezután V1.0 implementáció.

