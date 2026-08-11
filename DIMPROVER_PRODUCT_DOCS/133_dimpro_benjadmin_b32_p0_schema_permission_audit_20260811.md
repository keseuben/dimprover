# DIMPRO BENJADMIN B3.2 – P0 schema és permission audit – 2026-08-11

## Cél és hatály

Ez a checkpoint a B3.2 Partner Development Plane első kötelező fázisát, a **P0 schema és permission auditot** rögzíti. A cél nem új, párhuzamos task/session/release motor létrehozása, hanem annak eldöntése, hogy a meglévő BENJADMIN B3/B3.1 generikus motor mely részei használhatók változatlanul, melyek igényelnek kiterjesztést, és mely partner-specifikus policy/metadata táblák indokoltak.

A P0 során PROD nem módosult. A source-of-truth külső Supabase-en partner migráció nem került alkalmazásra.

## Auditált jelenlegi engine

Aktív generikus engine:

- schema version: `0.3.0`
- bootstrap: `BENJADMIN-B3-M3-20260810`
- migration count: `2`
- health: READY

Alap migrációk:

- `20260810043000_benjadmin_dev_center_engine_v020.sql`
- `20260810061500_benjadmin_parallel_orchestration_v030.sql`
- `20260810154500_benjadmin_parallel_claim_task_fix_v030.sql`

A B3.1 Control Plane migráció (`20260811005500_benjadmin_control_plane_v031.sql`) továbbra is STAGED, ezért ez nem része a jelenleg alkalmazott 0.3.0 generikus engine-nek.

## Meglévő generikus táblák és B3.2 döntés

| Meglévő tábla | Jelenlegi szerep | B3.2 döntés |
|---|---|---|
| `dev_center_projects` | projekt törzs, slug, category, status, metadata | **REUSE** mint központi project rekord. Partnerprojekt ne kapjon második, duplikált név/slug/status törzset. |
| `dev_center_repositories` | project -> repository, default branch, dev path | **REUSE**. Egy partner repo is generikus repository rekord. Partner-hozzáférési policy külön kiterjesztésből jön. |
| `dev_center_versions` | projektverziók | **REUSE**. Partner release előtti fejlesztési verzió ugyanebbe a verziómotorba illeszthető. |
| `dev_center_workers` | ÁrminAI/JázminAI/OutminAI worker registry | **REUSE + policy**. OutminAI identitás megmarad, de partnerprojekt-szintű entitlement szükséges. |
| `dev_center_tasks` | project/repository/worker/task/scope | **REUSE**. `project_id` önmagában alkalmas partner audit dimenziónak. Külön `partner_project_id` nem kötelező. |
| `dev_center_worker_sessions` | worker/task/project/repository/environment handshake | **REUSE**. Partner session ugyanazt a handshake/lease motort használja, de partner policy gate kell a worker/task/repo bind elé. |
| `dev_center_scope_locks` | repository + scope lock | **REUSE**. Partner és internal ütközésvédelem közös motoron marad. |
| `dev_center_worktree_leases` | branch/worktree lease | **REUSE**, de a worktree validatornak plane/repository alapján több engedélyezett rootot kell támogatnia. |
| `dev_center_build_runs` | typecheck/lint/test/build/smoke/migration/restart | **REUSE**. Partner heavy build scheduler/policy külön réteg. |
| `dev_center_releases` | project/version/session/source-target release | **REUSE** mint release core. Partner delivery/handoff részletek külön extensionben. |
| `dev_center_environments` | DEV/STAGING/PRODUCTION, read-only, health | **REUSE + link extension**. A globális `env_dev/env_stag/env_prod` nem elég több partnerprojekthez. |
| `dev_center_infra_assets` | környezethez kapcsolt infrastruktúra asset | **REUSE** node/runtime registry alapként. |
| `dev_center_backup_runs` | környezet/asset backup | **REUSE**. |
| `dev_center_audit_events` | actor/action/entity/session/task/project audit | **REUSE**. `project_id` partner audit dimenzióként elegendő, ha minden partner event kitölti. |

## Javasolt partner-specifikus extension táblák

A P0 eredménye alapján a B3.2 logikai modellje a meglévő `dev_center_*` motor kiterjesztése legyen.

### `dev_center_partner_projects`
1:1 extension a `dev_center_projects` rekordhoz:
- `project_id` PK/FK
- `project_code` UNIQUE, immutable, pl. `PART-0001`
- `partner_org_id`
- `delivery_model`: `DIMPRO_HOSTED | PARTNER_HOSTED | HANDOFF`
- `data_classification`: `NORMAL | CONFIDENTIAL | RESTRICTED`
- `default_worker_id`
- `internal_engine_access`: `NONE | ALLOWLIST`
- `status`: `draft | provisioning | ready | paused | closed`
- `created_at`, `updated_at`, `metadata`

A név, slug, leírás és általános projektstatus továbbra is `dev_center_projects` source-of-truth.

### `dev_center_partner_environments`
Kapcsoló/policy a generikus environmenthez:
- `project_id`, `environment_id`
- `environment_type`: `PARTNER_DEV | PARTNER_STAG | PARTNER_PROD`
- `node_asset_id`
- `domain`, `runtime_ref`, `db_ref`, `storage_ref`
- `current_release_id`, `health_status`, `last_backup_at`

### `dev_center_partner_access_policies`
Default-deny resource policy:
- `project_id`, `subject_worker_id`
- `resource_type`: `repository | path | secret | database | storage | engine | environment | deploy_target`
- `resource_ref`
- `access_level`: `DENY | READ | WRITE | EXECUTE`
- `expires_at`, `created_by`, `created_at`, `metadata`

Kötelező alap: OutminAI internal DIMPRO repository/path/secret -> `DENY`.

### `dev_center_partner_engine_entitlements`
- `project_id`, `engine_key`
- `allowed_version_range`, `current_version`, `status`
- audit/version metadata

### `dev_center_partner_delivery_targets`
- `project_id`
- `target_type`: `DIMPRO_HOSTED | PARTNER_HOSTED | HANDOFF`
- `node_ref`, `domain`, `credential_ref`, `deploy_mode`, `approval_policy`, `status`

`credential_ref` csak referencia, nyers secret nem.

### `dev_center_partner_handoffs`
- `project_id`, `release_id`
- `manifest_json`, `checksum`
- `handed_over_at/by`, `accepted_at/by`, `status`

### `dev_center_secret_references`
Közös secret-reference registry nyers érték nélkül:
- `scope_type`, `scope_id`, `environment_id`
- `secret_key_name`, `provider`, `reference_path`, `rotated_at`, `metadata`

## OutminAI jelenlegi állapot audit

### Adatmodell

OutminAI jelenleg:
- worker id: `worker_outminai`
- code: `OUTMINAI`
- szerep: `Üzemeltetési / release worker`
- capability: `build`, `smoke`, `release`, `infra`

Ez B3/M3 átmeneti szerep. B3.2-ben OutminAI a Partner Development Plane fő worker-e.

### Történeti hozzáférés

Az M2/M3 acceptance során OutminAI a belső `project_dimprover` + `repo_dimprover` repositoryhoz kapott sessiont, és `/srv/dimpro-dev/worktrees/...` worktree-ket használt. Ez a korábbi B3 acceptance része volt, de **nem felel meg a B3.2 végleges partnerizolációnak**.

Jelenleg nincs aktív OutminAI session/lock/worktree lease, de egy korábbi M2 acceptance task `in_progress` állapotban maradt. Ezt külön cleanup tételben kell lezárni; a P0 audit nem módosította.

### Filesystem / OS izoláció

Audit eredmény:
- `/srv/partner-dev` jelenleg **nem létezik**;
- a jelenlegi Outmin worktree `/srv/dimpro-dev/worktrees/benjadmin-m3-worker-outmin`;
- worktree tulajdon: `root:root`, mód `755`;
- `/srv/dimpro-dev`, worktrees és repositories: `root:root`, `755`;
- külön `outmin` Linux user jelenleg **nincs**;
- külön Outmin Git `core.sshCommand` nincs;
- külön credential helper nincs;
- ugyanaz a `DIMPRO BENJADMIN <benjadmin@dimpro.local>` Git identity;
- BENJADMIN DEV PM2 runtime jelenleg `root`.

Következtetés: a B3.2 technikai partner izoláció **még nincs implementálva**. Ez P2 feladat.

### Worktree validator gap

A jelenlegi `validateDevGitWorktree()` fix rootja:

`/srv/dimpro-dev/worktrees`

A session `bind_worktree` is explicit `/srv/dimpro-dev/worktrees/` prefixet vár. A B3.2 cél szerinti `/srv/partner-dev/worktrees/outmin/...` ezért jelenleg nem bindolható.

P2-ben repository/plane-aware root policy kell:
- INTERNAL -> `/srv/dimpro-dev/worktrees/...`
- PARTNER -> `/srv/partner-dev/worktrees/...`

A plane-t a repository/project policyből kell levezetni, nem a kliens pathjából.

### Worker/project policy gap

A jelenlegi orchestration worker/task/repository egyezést és scope/worktree lease-t ellenőriz, de nincs partner-specific access policy, amely `worker_outminai` számára automatikusan megtagadná a `repo_dimprover` vagy belső resource scope használatát.

Kötelező új gate-ek:
1. task claim előtt project/worker entitlement;
2. worker bind előtt project/worker entitlement;
3. repository bind előtt repository access;
4. worktree bind előtt plane-aware root;
5. scope acquire előtt resource policy;
6. build/deploy/release előtt target/environment policy;
7. shared engine használat előtt engine entitlement.

## API authorization audit

A jelenlegi Development Center API-k központi admin/reporter kulcs alapú authorizationt használnak. Ez nem projekt- vagy worker-szintű RBAC.

B3.2-ben külön subject/context szükséges:
- BenjAdmin/admin -> registry/policy admin;
- BenAI -> orchestration;
- OutminAI -> kizárólag saját kiosztott partner task/session scope;
- partner/ügyfél -> acceptance/read RBAC szerint.

A worker identitás nem vezethető le pusztán request body `workerId` mezőből.

## Végleges P0 reuse/extend döntés

### REUSE
- task/dependency
- session/handshake/lease
- scope lock/conflict
- worktree lease mechanizmus
- build run
- release core
- backup run
- audit event

### EXTEND
- project -> partner project extension
- repository -> partner access policy
- environment -> partner environment binding
- worker -> project/resource entitlement
- worktree validation -> plane-aware root
- release -> delivery target/handoff
- infra asset -> node/runtime binding

### Új partner extension táblák
1. `dev_center_partner_projects`
2. `dev_center_partner_environments`
3. `dev_center_partner_access_policies`
4. `dev_center_partner_engine_entitlements`
5. `dev_center_partner_delivery_targets`
6. `dev_center_partner_handoffs`
7. `dev_center_secret_references`

Nem indokolt új partner task/session/scope/lock/build/release motor.

## P1 migration/API/UI implementációs terv

A következő staged migration:
1. létrehozza a 7 extension táblát;
2. FK-kat a generikus engine-hez köt;
3. `project_code` immutability védelmet kap;
4. delivery/data classification CHECK constraintet kap;
5. default-deny policy modellt készít elő;
6. RLS-t bekapcsolja;
7. anon/authenticated közvetlen hozzáférést tilt;
8. service role hozzáférést kontrolláltan enged;
9. raw secretet nem tárol;
10. PROD adatot/runtime-ot nem módosít.

Első backend szerződés:
- `GET /api/dev/engine/partner-projects`
- `POST /api/dev/engine/partner-projects`
- `GET /api/dev/engine/partner-projects/:id`

P1-ben a POST csak DRAFT partner project + extension rekordot hoz létre. Repo/DB/storage provisioning P3.

Első UI:
- új `Partner fejlesztések` view;
- partner kód, partner/termék, OutminAI, DEV/STAG/PROD-Handoff, delivery model, activity, health;
- read-only lista + „Új partnerprojekt” draft;
- partner UI törzsszöveg minimum **12 px**.

## P0 acceptance

1. generic schema azonosítva – PASS
2. engine 0.3.0 health READY – PASS
3. reuse/extend döntés – PASS
4. OutminAI DB/session történet audit – PASS
5. `/srv/partner-dev` audit – PASS, jelenleg MISSING
6. külön Outmin Linux identity audit – PASS, jelenleg MISSING
7. Git identity/credential szeparáció audit – PASS, jelenleg nincs
8. worktree root gap azonosítva – PASS
9. partner resource-policy gap azonosítva – PASS
10. raw secret nem került audit outputba – PASS
11. PROD write/deploy/migration/restart nem történt – PASS

## P0 kilépési feltétel

**P0 TELJESÍTVE.**

A Partner Development Plane a meglévő B3/B3.1 generikus engine kiterjesztése, nem második párhuzamos fejlesztési motor.

Következő lépés: **P1 Partner Registry staged schema + backend read/create contract + kompakt admin listanézet**, majd P2-ben a valódi OutminAI default-deny technikai izoláció.
