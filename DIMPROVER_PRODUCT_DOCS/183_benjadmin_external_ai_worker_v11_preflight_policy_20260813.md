# 183 — BENJADMIN Külső AI Worker V1.1 — preflight, worker policy és checkpoint

Dátum: 2026-08-13  
Környezet: DEV  
Kapcsolódó dokumentumok: 180, 181, 182  
Normatív forrás: `05_DIMPRO_BENJADMIN_Kulso_AI_Worker_V1_fejlesztoi_kiegeszites_v2_2026-08-12.pdf`

## Cél

A V1.1 automatikus scope-felderítése után létrejött a végrehajtás előtti biztonsági kapu. A felhasználónak továbbra sem kell technikai scope-ot, branchet vagy worktree-t kiválasztania.

A jelen checkpoint még **nem indít külső AI providert**, és nem tart fenn feleslegesen aktív worker sessiont vagy scope lockot. Előkészíti és ellenőrzi a későbbi M.Forge futás feltételeit.

## Külső worker identitások a Development Centerben

A meglévő `dev_center_workers` motorba két valós DEV worker került:

### M.Forge-AI — Márk

- worker ID: `worker_mforge`
- code: `MFORGE`
- layer: `EXTERNAL_AI`
- `productionAccess = DENY`
- engedett környezet: `DEV`
- engedett engine műveletek: `write`, `build`, `test`
- provider még nincs hozzárendelve

### V.Guard-AI — Viktória

- worker ID: `worker_vguard`
- code: `VGUARD`
- layer: `EXTERNAL_AI`
- `productionAccess = DENY`
- engedett környezet: `DEV`
- engedett engine műveletek: `build`, `test`
- `reviewOnly = true`
- közvetlen write tiltott
- provider még nincs hozzárendelve

A worker bootstrap dry-run alapú és kizárólag a `dimpro-dev` hoston futtatható.

Backup az első DEV aktiválás előtt:

`/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2/.dimprover/backups/external-ai-workers-20260813T070117388Z`

## Technikai policy

Új modul:

`app/lib/dev-center/ai-worker/external-worker-policy.ts`

A policy nem promptszabály. Az engine authorization réteg technikailag ellenőrzi:

- M.Forge / V.Guard kizárólag belső DEV projekten fut;
- PRODUCTION környezet nem használható;
- M.Forge nem futtathat migration / restart / deploy műveletet;
- V.Guard write / migration / restart / deploy művelete tiltott;
- hibás vagy hiányos external-worker metadata esetén fail-closed.

Az Outmin-AI Partner Development Plane logikája változatlan maradt.

## ScopeExpansionRequest

YELLOW találatok esetén az analyzer strukturált `scopeExpansionRequest` objektumot hoz létre a task metadata alatt:

- egyedi ID;
- `PENDING` állapot;
- kérő: Ben-AI;
- YELLOW candidate path lista;
- indoklás.

A felhasználónak nem kell fájlonként döntést hoznia.

V1.1 jelenlegi biztonságos döntési út:

`EXCLUDE_YELLOW`

Eredménye:

- `scopeAnalysisState = REVIEW_RESOLVED_SAFE`
- ScopeExpansionRequest = `RESOLVED_EXCLUDED`
- a YELLOW elemek nem kerülnek write scope-ba;
- kizárólag a korábban GREEN / AUTO_APPROVED elemek maradnak végrehajthatók.

YELLOW write-jóváhagyást a V1.1 még szándékosan nem enged.

## Preflight

Új szolgáltatás:

`app/lib/dev-center/ai-worker/preflight.ts`

Új API:

`POST /api/dev/ai-worker/tasks/:id/preflight`

A preflight csak `READY` workflow állapotból indul, és ellenőrzi:

1. a scope elemzés elkészült;
2. nincs RED tiltás;
3. nincs feloldatlan YELLOW review;
4. van végrehajtható GREEN scope;
5. `repo_dimprover` és trusted DEV baseline READY;
6. a task repository-kötése egyezik a baseline repositoryval;
7. M.Forge-AI regisztrált, READY, PROD DENY policyval;
8. a javasolt scope nem ütközik más aktív globális B3 scope-lockkal.

A preflight **nem követeli meg** a külső providert és a későbbi natív model executort, mert ezen a ponton még nem indul külső modell.

## Task checkpoint / rollback pont

Sikeres preflight előtt task-specifikus checkpoint készül:

`/srv/dimpro-dev/data/benjadmin-ai-worker-checkpoints/<taskId>/`

A checkpoint:

- JSON;
- mode 0600;
- task állapot;
- scope;
- metadata;
- trusted baseline ref/commit;
- tervezett M.Forge workspace;
- SHA-256 integritásérték.

A checkpoint nem tartalmaz secretet.

## Worker Context Pack meta

A V1.1-ben még nem adunk teljes fájltartalmat külső modellnek.

A context pack jelenleg meta-szintű:

- baseline commit;
- GREEN scope darabszám;
- fájllista;
- baseline Git blob hash fájlonként;
- létezett-e az adott fájl a baseline-on;
- `secretContentIncluded = false`;
- YELLOW kizárási állapot.

Ez előkészíti a V1.2 provider context packot úgy, hogy a secret-szűrés már a provider bekötése előtt érvényesüljön.

## M.Forge workspace terv

A preflight létrehozza, de még nem foglalja le fizikailag:

- worker: `worker_mforge`
- repository: `repo_dimprover`
- environment: `env_dev`
- trusted baseline ref / commit
- branch: `worker/mforge/<task-id>`
- worktree: `/srv/dimpro-dev/worktrees/worker-mforge-<task-id>`

A tényleges branch/worktree/session/scope-lock csak just-in-time worker indításkor jön létre. Így provider nélkül nem tartunk nyitva hamis worker sessiont és nem blokkolunk más fejlesztést.

## UI

Az `AI Workerek` drawer kiegészült:

- `BIZTONSÁGOS SCOPE` gomb YELLOW esetben;
- `PREFLIGHT` gomb biztonságosan végrehajtható scope esetén;
- `PREFLIGHT PASS` állapot;
- context fájlszám;
- M.Forge branch terv;
- `WORKSPACE TERV KÉSZ` jelzés.

A felhasználó továbbra is terméknyelvű igényt ad meg; a technikai scope és workspace terv háttérfolyamat.

## Build-hardening megjegyzés

A V1.1b első buildje egy Tailwind/Turbopack scanner sajátosság miatt megállt: az új forrásban használt `/[-:.]/g` regex literált hibás arbitrary utility-jelöltként értelmezte.

Javítás:

- regex helyett láncolt `replaceAll()` használat;
- `app/globals.css` nem került módosításra;
- második build PASS.

A jövőben Tailwind által scannelt source fájlban kerülendő az ilyen arbitrary-classra hasonlító regex literal.

## Acceptance

- külső worker operation policy contract: **7/7 PASS**;
- V1.1b preflight/runtime/browser acceptance: **15/15 PASS**;
- M.Forge és V.Guard valós Development Center worker: PASS;
- PROD DENY: PASS;
- V.Guard review-only/write-deny: PASS;
- YELLOW review nélküli preflight fail-closed: PASS;
- biztonságos YELLOW exclusion: PASS;
- preflight: PASS;
- checkpoint SHA: PASS;
- context pack secret-free meta: PASS;
- 1366 px UI overflow: PASS;
- TypeScript: PASS;
- full lint: 0 error / 104 meglévő warning;
- build: `oLs9fiCDylKnfxgIvNdB2`;
- DEV PM2: online;
- PROD: nem módosult.

## Következő checkpoint

Következő V1.1 lépés a meglévő B3 motor **tranziens, valós workspace handshake acceptance**:

`session -> Ben-AI -> M.Forge -> task claim -> branch -> fizikai DEV worktree -> scope lease/lock -> READY -> release/cleanup`

A teszt után minden session, lease, lock és fizikai acceptance worktree törlendő/felszabadítandó. Tartós M.Forge session csak a V1.2 provider indításakor nyílhat.
