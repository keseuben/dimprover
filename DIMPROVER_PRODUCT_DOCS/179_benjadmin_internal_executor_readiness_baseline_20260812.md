# 179 — BENJADMIN belső worker executor readiness és trusted DEV baseline

Dátum: 2026-08-12  
Környezet: DEV  
Kapcsolódó dokumentumok: 176, 177, 178

## Cél

A Fejlesztői Konzol következő végrehajtási szintjének előkészítése úgy, hogy a rendszer csak akkor tekinthesse a natív worker indítást READY állapotúnak, ha a fizikai repository, a trusted baseline, az AI provider és a worker executor ténylegesen rendelkezésre áll.

PROD továbbra is read-only; PROD deploy, restart, migráció vagy secret-művelet nem történt.

## Trusted baseline

Létrejött a kanonikus belső DEV integrációs ref:

`refs/heads/integration/benjadmin-dev`

Első rögzített commit:

`ab89c25e5089599d08053a47795c15346cc45948`

A baseline forrása az aktuális, acceptance-en átesett BENJADMIN fejlesztési branch volt:

`refs/heads/feat/benjadmin-operator-ui-v2`

A `repo_dimprover` metadata tartalmazza:

- `trustedBaselineRef`
- `trustedBaselineCommit`
- `trustedBaselineSourceRef`
- `trustedBaselineUpdatedAt`

A baseline frissítő script eltérő meglévő baseline esetén alapból fail-closed. Előreléptetés csak explicit `--advance` kapcsolóval engedett.

Backup:

`/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2/.dimprover/backups/trusted-baseline-20260812T213645372Z`

## Readiness service

Új modul:

`app/lib/dev-center/internal-executor-readiness.ts`

Ellenőrzések:

1. `repo_dimprover` aktív és a várt DEV bare repositoryra mutat;
2. shared internal monorepo policy READY;
3. scope-lock repository ID egységes;
4. trusted baseline ref létezik a bare repositoryban;
5. metadata commit és live Git ref commit egyezik;
6. szerveroldali AI provider konfiguráció jelenléte;
7. natív BENJADMIN worker executor konfiguráció jelenléte.

A teljes `ready=true` csak mind a négy fő gate esetén lehetséges:

`repositoryReady && baselineReady && providerConfigured && executorConfigured`

## Aktuális valós állapot

- repository: **READY**
- trusted baseline: **READY**
- AI provider: **NINCS KONFIGURÁLVA**
- natív worker executor: **NINCS KONFIGURÁLVA**
- összesített executor readiness: **FALSE / FAIL-CLOSED**

A rendszer ezért továbbra sem állít autonóm kódvégrehajtást.

## Biztonságos branch/worktree névképzés

Pure helper került be a worker branch és worktree nevek képzésére.

Példa:

- worker: `ARMINAI`
- task: `dev-task-ABC_123`
- branch: `worker/arminai/dev-task-abc-123`
- worktree: `/srv/dimpro-dev/worktrees/worker-arminai-dev-task-abc-123`

A bemenetből veszélyes/traversal karakterek eltávolításra kerülnek; a worktree a belső DEV root alatt marad.

## UI

A Fejlesztői Konzol fejlécében új, valós állapotjelző:

`BASELINE · KÉSZ`

Az Élő munka panel új `VÉGREHAJTÓ KAPU` blokkja külön mutatja:

- Repo
- Baseline
- AI provider
- Executor

Jelenleg a UI helyesen jelzi, hogy a repo és baseline kész, de a provider és executor még nincs bekötve.

## Bootstrap

`scripts/benjadmin-internal-baseline-bootstrap.mjs`

Tulajdonságok:

- alapból dry-run;
- csak `dimpro-dev` hoston fut;
- pontos bare repository path ellenőrzés;
- shared monorepo readiness kötelező;
- apply előtt backup;
- atomic Git `update-ref` használat;
- eltérő már meglévő baseline explicit `--advance` nélkül tiltott;
- apply után Git ref + DB metadata visszaellenőrzés.

## Acceptance

- executor naming pure contract: **4/4 PASS**
- executor readiness runtime: **7/7 PASS**
- Developer Console browser acceptance: **40/40 PASS**
- Developer Console dispatch integration: **8/8 PASS**
- shared monorepo runtime: **5/5 PASS**
- B3.2 P5 final regression: **53/53 PASS**
- TypeScript: PASS
- full lint: **0 error / 104 meglévő warning**
- build: **`j-druZ-t04fhvsZRKfxLX`**
- DEV PM2: online
- PROD: nem módosult

## Következő technikai blokk

A korábbi cél-lánc jelenlegi valós állapota:

`BENJADMIN -> Ben-AI -> task -> worker -> repo_dimprover -> trusted baseline`

Következő blokk:

`worker executor adapter -> session -> branch -> worktree -> scope lock -> READY`

A tényleges AI modell/provider adapter csak ezután kap végrehajtási jogot. A provider szerepkör és a worker szerepkör külön kezelendő; a worker név nem lehet provider/model névhez kötve.
