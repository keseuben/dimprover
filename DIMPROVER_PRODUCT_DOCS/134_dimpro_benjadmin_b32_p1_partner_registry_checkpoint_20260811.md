# DIMPRO BENJADMIN B3.2 – P1 Partner Registry checkpoint – 2026-08-11

## Állapot

A B3.2 **P1 Partner Registry kódalap** elkészült és DEV-en aktív. A source-of-truth Supabase partner sémamigrációja szándékosan továbbra is **STAGED**, ezért a P1 teljes kilépési feltétele még nem tekinthető lezártnak: valódi partnerprojekt létrehozás csak a forrásadatbázis biztonságos mentése és a migráció külön aktiválása után engedélyezhető.

- Worktree: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`
- Branch: `feat/benjadmin-operator-ui-v2`
- Előző checkpoint: `46fbb4b`
- DEV runtime: `dimpro-benjadmin-operator-ui-v2-dev`
- DEV port: `3100`
- PROD: **nem módosult**
- B3.2 P2 technikai OutminAI izoláció: **még nem indult**

## Biztonsági mentés

A kritikus adatbázis dry-run előtt a `dimpro-db-backup.service` lefutott:

- eredmény: SUCCESS
- idő: 2026-08-11 09:59 CEST
- Restic snapshot: `76f4e427`

Fontos: ez a `dimpro-db` infrastruktúra mentése. A BENJADMIN alkalmazás source-of-truth adatbázisa továbbra is a külső Supabase; ezért a staged migrációt erre a körre nem alkalmaztuk.

## Staged migráció

Fájl:

`supabase/migrations/20260811094500_benjadmin_partner_development_plane_v010.sql`

SHA-256:

`1a4841bf8a1c393271fbc413828d2be9216d771a1d697cd23d6bcdab1b3baf09`

Partner extension táblák:

1. `dev_center_partner_projects`
2. `dev_center_partner_environments`
3. `dev_center_partner_access_policies`
4. `dev_center_partner_engine_entitlements`
5. `dev_center_partner_delivery_targets`
6. `dev_center_partner_handoffs`
7. `dev_center_secret_references`

A migráció a meglévő `dev_center_*` generikus B3/B3.1 motorhoz kapcsolódik. Nem hoz létre második task/session/scope/lock/build/release motort.

### Fő adatvédelmi és lifecycle szabályok

- `project_code` automatikus `PART-####`, immutable.
- `delivery_model`: `DIMPRO_HOSTED | PARTNER_HOSTED | HANDOFF`.
- `data_classification`: `NORMAL | CONFIDENTIAL | RESTRICTED`.
- default worker: `worker_outminai`.
- `internal_engine_access` alapérték: `NONE`.
- secret tábla kizárólag referenciát tárol; raw secret mező nincs.
- RLS mind a 7 partner táblán bekapcsolva.
- anon/authenticated közvetlen hozzáférés tiltva.
- service role hozzáférés kontrollált.
- a publikus atomic RPC execute joga visszavonva.

### Idempotens draft létrehozás

Új atomic RPC:

`dev_center_create_partner_project_draft_atomic(...)`

Tulajdonságai:

- advisory lock alapú idempotencia;
- `creation_key` alapú stable újrahívás;
- slug konfliktus ellenőrzés;
- kizárólag `OUTMINAI` default worker elfogadás;
- egyszerre hozza létre a generic project + partner extension + audit rekordot;
- második azonos hívás nem duplikál projektet.

## PostgreSQL izolált dry-run

A migrációt a `dimpro_dev` helyi, üres tesztadatbázison ideiglenes generikus stub táblákkal, egyetlen tranzakcióban futtattuk, a végén `ROLLBACK` történt.

Eredmény:

- migration DDL: PASS
- atomic RPC első hívás: `created=true`, `PART-0001`
- azonos `creation_key` második hívás: `created=false`, `idempotent=true`
- generic project count: 1
- partner project count: 1
- audit event count: 1
- `internal_engine_access=NONE`
- project code immutable trigger: PASS
- raw-secret column count: 0
- RLS mind a 7 táblán: true
- rollback után public table count: 0

Tehát a dry-run nem hagyott alkalmazástáblát a `dimpro_dev` tesztadatbázisban.

## Backend

Új service:

`app/lib/dev-center/partner-projects.ts`

Fő funkciók:

- partner schema readiness probe;
- 7 kötelező partner tábla ellenőrzése;
- partner schema marker (`0.1.0`) ellenőrzése;
- partnerprojekt lista;
- partnerprojekt részlet;
- atomic draft létrehozás;
- `PGRST205` / hiányzó schema esetén kontrollált fail-closed állapot.

Új API:

- `GET /api/dev/engine/partner-projects`
- `POST /api/dev/engine/partner-projects`
- `GET /api/dev/engine/partner-projects/[projectId]`

Biztonság:

- GET: reporter/admin olvasás;
- POST: admin write;
- schema pending állapotban POST: `503 PARTNER_SCHEMA_NOT_READY`;
- raw SQL/shell nincs;
- provisioning még nincs a P1-ben.

## Operator UI

Új view: **Partner fejlesztések**

Új komponens:

`components/admin/BenjadminPartnerDevelopmentPanel.tsx`

Megjelenített fő információk:

- partner schema readiness;
- partner projekt darabszám;
- default worker: OUTMINAI;
- delivery modell;
- DEV / STAG / PROD-Handoff státusz;
- utolsó activity és health;
- draft projekt létrehozó űrlap.

A view szándékosan jelzi:

`OUTMINAI · DEFAULT DENY · P2 GATE`

Ez **nem azt állítja, hogy a P2 OS/MCP izoláció már működik**; azt jelzi, hogy P1-ben a partner registry default-deny policy modellre készül, a tényleges technikai enforcement a P2 feladata.

Amíg a source-of-truth schema nincs alkalmazva:

- a UI `SCHEMA PENDING`;
- nincs fake partner adat;
- a draft létrehozó gomb disabled;
- a felület egyértelműen jelzi a staged migrációt.

A B3.2 partner view törzsszöveg / táblázat / form tipográfiája minimum **12 px**.

## Acceptance

### B3.2 P1 acceptance

`scripts/benjadmin-b32-p1-acceptance.mjs`

**16/16 PASS**

Ellenőrzések között:

- partner registry GET elérhető;
- source-of-truth schema PGRST205/pending helyesen látszik;
- unauthenticated create 401;
- authenticated create schema nélkül fail-closed 503;
- Partner fejlesztések tab;
- B3.2/OutminAI/default-deny/P2 gate jelzés;
- nincs fake partner sor;
- create gomb schema readinessig tiltva;
- minimum 12 px tipográfia;
- 1440×900 desktop egy viewport;
- desktop/tablet/telefon nincs oldal-szintű horizontális overflow.

### B3.1 Control regression

`benjadmin-b31-control-acceptance.mjs`

**13/13 PASS**

### Operator regression

`benjadmin-operator-ui-v2-acceptance.mjs`

**30/30 PASS**

## Build / DEV aktiválás

Build:

- PASS
- build ID: `0D89EWghyMBHwafdT7U8o`
- 142 statikus chunk ellenőrizve

Ismert, korábban is meglévő Turbopack warning: `release-center.ts` dinamikus filesystem tracing. A warning nem blokkolta a buildet.

DEV coordinated restart:

- PASS
- process: `dimpro-benjadmin-operator-ui-v2-dev`
- status: online
- PROD restart/deploy nem történt.

## P1 állapotértékelés

**P1 kód checkpoint: KÉSZ.**

**P1 teljes runtime exit condition: PENDING**, mert a B3.2 szerint a partnerprojektnek valóban létrehozhatónak és lekérdezhetőnek kell lennie. Ehhez még szükséges:

1. source-of-truth Supabase biztonsági mentési / rollback pont megerősítése;
2. a staged partner schema migráció alkalmazása kizárólag DEV source-of-truth környezetre;
3. schema READY ellenőrzés;
4. valódi idempotens draft create/read teszt;
5. audit rekord és UI sor validáció;
6. csak ezután P1 végleges lezárása.

## Következő fejlesztési pont

A közvetlen következő feladat a source-of-truth DEV migráció biztonságos aktiválási útjának auditja. Ha a megfelelő mentési/rollback pont biztosított, a P1 schema alkalmazható, majd indulhat a B3.2 **P2 – OutminAI technikai izoláció**:

- `/srv/partner-dev`
- külön Linux identity
- külön Git/MCP credential
- partner-aware repository/path policy
- plane-aware worktree root
- internal DIMPRO repository/path/secret default DENY enforcement
- DB/storage scoped credential policy.

A Control VPS továbbra is könnyű vezérlőtorony; partner build/runtime nem kerül rá.
