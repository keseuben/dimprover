# 181 — BENJADMIN Külső AI Worker V1.0 — Task és UI alap

Dátum: 2026-08-12/13  
Környezet: DEV  
Kapcsolódó dokumentumok: 176–180, B3, B3.1, B3.2  
Normatív forrás: `05_DIMPRO_BENJADMIN_Kulso_AI_Worker_V1_fejlesztoi_kiegeszites_v2_2026-08-12.pdf`

## Normatív forrás ellenőrzése

A teljes 12 oldalas V2 dokumentum beolvasásra került.

SHA-256:

`7d60b8a9a2930aa4e41e239d2df878ed6b3a5445a1bd51d0eae13e4c63b9e149`

A korábbi source-document gate feloldásra került a `dev-task-2d177745-cda` intake taskon. A task `recordType=INTAKE`, így nem keveredik a valódi külső worker futási taskokkal.

A V2 fő normatív döntései:

- Ármin-AI, Jázmin-AI és Outmin-AI megmarad belső BENJADMIN AI-kódolóként;
- M.Forge-AI / Márk és V.Guard-AI / Viktória új, kiegészítő külső worker réteg;
- felhasználói technikai fájl/mappa scope kézi kiválasztása tilos UX-követelményként;
- technikai scope BENJADMIN által automatikusan felderítendő;
- M.Forge -> V.Guard -> BENJADMIN Gate -> DEV READY;
- PROD közvetlen worker-hozzáférés technikailag tiltandó;
- task/worker/daily/monthly költség- és időkorlát szükséges;
- a worker identitás és a provider/model külön réteg;
- V1-ben max. két automatikus javítási kör;
- külső worker output automatikusan nem integrálható.

## Avatar segédanyag

BENJADMIN Fejlesztési Tár kötelező erőforrás:

- ID: `devres-860dcf5a-b085-4dd9-bc0a-4f10640eaa5d`
- fájl: `06_M_ForgeAI_V_GuardAI.zip`
- SHA-256: `100032cd10a4664e85d8d36bd6b95aae92cab2ce40275119fb3791af968bd748`

Tartalom:

- `06_M_ForgeAI.png` — 1254×1254 RGBA;
- `07_V_GuardAI.png` — 1254×1254 RGBA.

A biztonságos importer ZIP path traversal-, méret- és SHA-ellenőrzést végez, majd 768×768, alpha-kompatibilis WebP assetet készít:

- `public/benjadmin/team/06_M_ForgeAI.webp`
- `public/benjadmin/team/07_V_GuardAI.webp`

Backup:

`/.dimprover/backups/external-worker-avatars-20260812T220443380Z`

## V1.0 architektúra

A meglévő `dev_center_tasks` task motor marad a source-of-truth. V1.0-ban nem hoztunk létre párhuzamos task/session/worktree rendszert és nem vezettünk be új AI-worker DB sémát csak a UI kedvéért.

Külső worker task azonosító metadata:

- `workflowTarget = EXTERNAL_AI_WORKER_V1`
- `recordType = WORKER_TASK`
- `externalAiWorkerVersion = 1.0`
- `workflowState = DRAFT`
- `technicalScopeMode = AUTO_BENJADMIN`
- `scopeUserSelectionRequired = false`
- `productionAccess = DENY`
- `providerAdapter = MOCK`
- `providerExecutionEnabled = false`

A task ugyanahhoz a meglévő, globális scope-lockkal védett fizikai repository ID-hoz kötődik, mint a logikai DIMPRO/DIMPROVER projekt:

`repo_dimprover`

## Külső worker profilok

### M.Forge-AI · Márk

- code: `MFORGE`
- role: `Coding Worker`
- réteg: `EXTERNAL`
- fő képességek: frontend, backend, API, implementáció, refaktor, célzott javítás.

### V.Guard-AI · Viktória

- code: `VGUARD`
- role: `Review & Quality Worker`
- réteg: `EXTERNAL`
- fő képességek: review, security, regresszió, teszt, scope review, quality gate.

A Console message/avatar modell már felismeri a két új szerzőt, így későbbi élő worker worklog eseményeik a közös idővonalon saját hexagon avatarral jelenhetnek meg.

## Worker Model Adapter V1.0

Providerfüggetlen interface alap elkészült:

`app/lib/dev-center/ai-worker/model-adapter.ts`

V1.0 adapter:

`BENJADMIN_V1_MOCK`

Ez nem hív külső szolgáltatót. A cél az orchestration/UI szerződés stabilizálása külső költség és jogosultsági kockázat nélkül.

## Állapotgép

A teljes V1 célállapotgép kódban rögzített:

`DRAFT -> READY -> PREFLIGHT -> RUNNING_FORGE -> WORKER_DONE -> REVIEW_GUARD -> APPROVED -> BENJADMIN_GATE -> DEV_READY -> USER_APPROVED -> DEV_INTEGRATED`

Kiegészítő állapotok:

- `PAUSED`
- `FAILED`
- `HUMAN_DECISION_REQUIRED`

V1.0-ban kizárólag ezek az átmenetek aktívak:

- `DRAFT -> READY`
- `READY -> PAUSED`
- `PAUSED -> READY`

A `READY -> PREFLIGHT` és minden további végrehajtási lépés explicit fail-closed V1.1+ gate. A rendszer nem színlel workert, scope-ot, review-t vagy buildet.

## V1 alapkeretek

A normatív dokumentum példa alapértékei kerültek be:

- teljes task: 2 500 Ft;
- M.Forge: max. 1 500 Ft;
- V.Guard: max. 1 000 Ft;
- max. aktív workerfutás: 45 perc;
- max. automatikus javítási kör: 2;
- 75% warning;
- 90% strong warning;
- 100% hard stop.

V1.0 még nem fogyaszt külső API-t; ezek a későbbi guard engine konfigurációs alapjai.

## API

Elkészült:

- `GET /api/dev/ai-worker/tasks`
- `POST /api/dev/ai-worker/tasks`
- `POST /api/dev/ai-worker/tasks/:id/transition`

A POST admin mutációs jogot igényel. A GET a meglévő BENJADMIN/Development Center read authorizationt használja.

## UI

A meglévő Fejlesztői Konzol fejlécében új gomb:

`AI Workerek`

Nem új konzol nyílik, hanem a jelenlegi Konzol jobb oldali drawer rétege.

A drawer tartalmazza:

- M.Forge-AI és V.Guard-AI HQ hexagon avataros profilkártyát;
- új AI fejlesztési task űrlapot;
- terméknyelvű cél mezőt;
- opcionális modulválasztást;
- Gyors / Worker / Párhuzamos indítási módot;
- AUTO / Claude / OpenAI-Codex modellpreferenciát;
- költségkeretet;
- max. futási időt;
- automatikus technikai scope tájékoztatást;
- PROD tiltási figyelmeztetést;
- pipeline-t: `FELADAT -> FORGE -> GUARD -> GATE -> DEV`;
- négy információs blokkot: FELADAT / WORKER / ELLENŐRZÉS / EREDMÉNY;
- biztonságos V1.0 READY/PAUSED kontrollt.

A felületen nincs `Megengedett fájlok/mappák` kötelező mező.

## Csapat UI

A Konzol `Csapat` drawer kiegészült:

- M.Forge-AI · Márk;
- V.Guard-AI · Viktória.

Az új workerek V1.0-ban inaktív külső profilok; nincs mögöttük hamis aktív engine session.

## Acceptance

- external worker pure contract: **15/15 PASS**;
- V1.0 API/runtime/browser acceptance: **21/21 PASS**;
- Developer Console regression: **40/40 PASS**;
- B3.2 P5 final regression: **53/53 PASS**;
- BENJADMIN Team regression: **46/46 PASS**;
- TypeScript: PASS;
- full lint: **0 error / 104 meglévő warning**;
- build: **`Yb1wFC21-xA1eb6pE6QbB`**;
- laptop 1366 px: nincs full-page horizontal overflow;
- mobile 390 px: nincs full-page horizontal overflow;
- PROD: nem módosult.

## Következő fázis — V1.1 Scope & Worktree

Következő fejlesztési blokk:

1. automatikus scope analyzer;
2. GREEN / YELLOW / RED scope policy;
3. `ScopeExpansionRequest` modell;
4. secret/sensitive path kizárás;
5. preflight read model;
6. task-specifikus rollback checkpoint;
7. M.Forge izolált branch/worktree előkészítés;
8. globális B3 scope-lock újrahasznosítás;
9. Context Pack meta előállítás;
10. továbbra is külső provider futtatása nélkül, amíg a teljes V1.1 safety gate nem PASS.
