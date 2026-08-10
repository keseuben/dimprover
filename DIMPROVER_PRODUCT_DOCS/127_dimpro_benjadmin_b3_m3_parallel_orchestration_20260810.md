# DIMPRO BENJADMIN B3 M3 – Parallel worker orchestration – 2026-08-10

## Cél

Az M3 célja, hogy több ChatGPT / AI worker párhuzamosan fejleszthessen ugyanazon DIMPRO/DIMPROVER rendszerben úgy, hogy ne írják felül egymás munkáját és ne induljon ütköző build, migration, restart vagy deploy.

## Elkészült rétegek

- PostgreSQL schema: `0.3.0`
- atomikus explicit task claim
- atomikus next-task claim `FOR UPDATE SKIP LOCKED` használatával
- session lease és heartbeat
- task claim lease
- scope lock lease
- branch + worktree lease
- path scope hierarchikus ütközésvédelem
- worktree és branch konfliktusvédelem
- stale-session recovery
- lejárt session automatikus worker-felszabadítás
- lejárt session task requeue
- konfliktusnapló
- M3 orchestration API
- M3 státuszadatok a BENJADMIN Development Center panelen

## Kötelező workflow

`SESSION_OPEN → BENAI_ASSIGNED → WORKER_BOUND → TASK_BOUND → BRANCH_BOUND → WORKTREE_BOUND → READY`

M3-ban a `TASK_BOUND` atomikus PostgreSQL claimmel, a `READY` pedig atomikus scope + worktree lease tranzakcióval jön létre.

## M3 orchestration API

`GET /api/dev/engine/orchestration`

Állapot:
- aktív worktree lease-ek
- nyitott konfliktusok
- stale sessionök

`POST /api/dev/engine/orchestration`

Műveletek:
- `claim_task`
- `claim_next_task`
- `acquire_scope`
- `heartbeat`
- `release`
- `complete_task`
- `recover_stale`

## Biztonsági szabályok

- write/build/test/migration/restart/deploy csak READY sessionből indulhat
- a session lease nem lehet lejárt
- érvényes scope lock szükséges
- érvényes worktree lease szükséges
- PROD továbbra is read-only a BENJADMIN fejlesztési körben
- stale session automatikusan lezárható és a task visszakerülhet a queue-ba

## Adatbázis-migrációk

- `20260810061500_benjadmin_parallel_orchestration_v030.sql`
- `20260810154500_benjadmin_parallel_claim_task_fix_v030.sql`

Mindkét migráció checksumolt. Az első migráció dry-run rollbackkel PASS, majd koordinált migration lockkal alkalmazva. Az explicit task-claim fix külön dry-run után koordináltan alkalmazva.

M3 DB előmentés Restic snapshot: `f995a998`.
M3 DEV előmentés Restic snapshot: `74b12a5e`.

## Statikus kapuk

- TypeScript: PASS
- célzott ESLint: PASS
- teljes lint: 0 error / 108 örökölt warning
- production build: PASS
- build ID: `s4KjYzmBtK8cT9I77Clw7`
- standalone asset check: 141/141

## Candidate acceptance

Candidate port: `3301`.

Automatizált M3 acceptance: **48/48 PASS**.

Bizonyított fő esetek:
1. task létrehozás
2. session open
3. BenAI assignment
4. worker binding
5. két worker párhuzamosan ugyanazt a taskot claimeli
6. pontosan egy claim nyer
7. második claim 409 konfliktussal blokkolódik
8. branch binding
9. worktree binding
10. scope lease acquisition
11. azonos scope második workernek 409 konfliktus
12. eltérő scope párhuzamosan engedélyezett
13. 3 READY worker session
14. 3 aktív worktree lease
15. heartbeat lease-megújítás
16. DEV write authorization
17. DEV migration authorization
18. DEV build authorization
19. task completion felszabadítja a workert
20. kényszerített stale lease felismerése
21. stale session automatikus lezárása
22. stale task automatikus requeue
23. konfliktus audit rögzítése

A teljes acceptance napló:
`/srv/dimpro-dev/logs/benjadmin-m3-acceptance.log`

## Párhuzamos fejlesztési szabály HAGE és más külső munkákhoz

A HAGE-INVEST munkatér és más külön modulok párhuzamosan fejleszthetők, ha mindegyik külön:
- BENJADMIN task
- worker session
- branch
- Git worktree
- scope

alatt fut.

A közös build, migration, restart és release műveletek továbbra is központi koordinációs lockon keresztül futhatnak.

## Szerverállapot és módosított következő sorrend

2026-08-10 ellenőrzés:
- PROD root disk: **93%**
- DEV root disk: **12%**
- DB root disk: **4%**
- DEV RAM: egészséges
- DB PostgreSQL: active

A PROD 93%-os lemezfoglaltsága miatt az M3 lezárása után közbeiktatandó egy **M3.5 infrastruktúra-stabilizálási kör**:

1. M3 lezárás
2. M3.5 PROD/DEV szerver rendbetétel és tárhely-audit
3. BENJADMIN Operator UI 2.0 teljes felület-átalakítás
4. M4 licenc- és AI entitlement réteg

A PROD rendbetétel előtt csak read-only audit végezhető; törlés vagy áthelyezés csak külön jóváhagyott rollback tervvel.

## BENJADMIN Operator UI 2.0

A teljes felület-átalakítás továbbra is az M3 után következik, de a 93%-os PROD lemezhasználat miatt előtte az M3.5 infrastruktúra-stabilizálás szükséges.

Az új UI már a végleges M3 adatokra épül:
- task queue
- BenAI → ÁrminAI / JázminAI / OutminAI
- branch/worktree
- scope és worktree lease
- konfliktusok
- heartbeat és stale állapot
- DEV/STAGING/PRODUCTION
- build/test/release
- backup/audit/idő

