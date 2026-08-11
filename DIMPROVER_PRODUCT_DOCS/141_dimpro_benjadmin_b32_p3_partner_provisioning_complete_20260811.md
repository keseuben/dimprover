# DIMPRO BENJADMIN B3.2 – P3 Partner Provisioning lezárás

Dátum: 2026-08-11

## Állapot

A B3.2 P3 Partner Provisioning DEV környezetben elkészült és validált.

Minősítés: **P3 COMPLETE / DEV READY**

PROD módosítás, PROD migráció vagy PROD deploy nem történt.

## Schema

A Partner Development Plane schema verziója:

`0.2.0`

Bootstrap:

`BENJADMIN-B3.2-P3-20260811`

Migráció:

`supabase/migrations/20260811140500_benjadmin_partner_provisioning_v020.sql`

SHA-256:

`4d415f77f9fb72b9aaf14a9f34af40f4a76f82c0c68e9ee23791eb28aa0711a8`

Új partnerprojekt provisioning mezők:

- `provision_state`
- `provision_attempt`
- `provision_started_at`
- `provisioned_at`
- `last_provision_error`

Állapotgép:

`DRAFT -> VALIDATING -> PROVISIONING -> BASELINE_TEST -> READY`

A state transition és provisioning terv DB oldali atomic RPC-kkel működik.

## Source-of-truth DEV backup

A migráció előtt friss DEV Supabase public schema backup készült:

`/root/.dimpro-backups/benjadmin-source-dev/20260811T141039Z-p3`

Fő mentések:

- custom `pg_dump`
- schema-only SQL
- `pg_restore -l` lista
- SHA-256 integritási lista

Custom dump mérete: `826419` byte.

Restore-list entries: `1152`.

A mentés integritása: PASS.

## Külső titkosított backup

A source-of-truth mentés a külön DB/backup VPS-re átkerült.

Másolási hash: PASS.

Restic snapshot:

`363b07f0`

Restic restore próba és visszaállított dump hash: PASS.

## Migrációs gate

A DEV és PROD Supabase projektek szeparációja külön ellenőrzésen PASS eredményt adott.

A közvetlen Supabase DB host csak IPv6 címet adott és a DEV VPS-ről nem volt route. A migrációhoz a Supabase `eu-central-1` pooler szolgáltatás került használatra SSL kapcsolattal.

A migráció tényleges alkalmazása előtt teljes SQL rollback-próba futott tranzakcióban. A rollback teszt után a schema marker változatlanul `0.1.0` maradt.

Ezután checksum gate mellett történt a tényleges DEV migráció.

Eredmény:

- apply: PASS
- schema: `0.2.0`
- migration count: `2`
- új provisioning oszlopok: 5/5
- új atomic RPC-k: 3/3
- partnerprojekt a migráció pillanatában: 0

## P3 provisioning motor

Új modul:

`app/lib/dev-center/partner-provisioning.ts`

Új API:

`POST /api/dev/engine/partner-projects/[projectId]/provision`

Fő működés:

1. P2 runtime READY ellenőrzés;
2. atomic provisioning terv előkészítés;
3. determinisztikus partner bare repository;
4. OutminAI tulajdonú partner worktree;
5. partner DEV/STAG registry;
6. OutminAI explicit repository/path/environment allowlist;
7. korlátozott shared-engine entitlement;
8. secret reference registry raw secret nélkül;
9. baseline OS izolációs teszt;
10. READY állapot csak sikeres baseline után.

## Partner filesystem

Determinált minták:

- repository: `/srv/partner-dev/repositories/PART-XXXX.git`
- worktree: `/srv/partner-dev/worktrees/outmin/PART-XXXX`

Tulajdonos:

`outmin:dimpro-partner`

A provisioning motor a filesystem műveleteket az Outmin service identity UID/GID-jével futtatja.

## Delivery model

### HANDOFF

A HANDOFF provisioning jelenleg teljesen automatizált P3 útvonal:

- repo/worktree létrejön;
- DEV/STAG registry létrejön;
- DB/storage mezők `not-required://handoff` referenciát kapnak;
- baseline isolation lefut;
- delivery target `ready` lehet;
- projekt elérheti a `READY` állapotot.

### DIMPRO_HOSTED / PARTNER_HOSTED

A repository/worktree és registry terv elkészülhet, de a rendszer fail-closed módon `PARTNER_HOSTED_RESOURCE_PROVIDER_REQUIRED` gate-et ad, amíg nincs külön DB/storage provider provisioning.

Ez szándékos P3 biztonsági határ.

## Shared engine entitlement

A P3 alap allowlist csak:

- `dev-center:write`
- `dev-center:build`
- `dev-center:test`

Verzióhatár:

`>=0.3.0 <1.0.0`

A migration/restart/deploy nincs automatikusan partnernek megadva.

## Secret kezelés

A registry kizárólag referencia rekordokat hoz létre:

- `secretref://outminai/worker-token`
- `secretref://outminai/ssh-identity`

Raw secret nem kerül a source-of-truth partner adatmodellbe.

## Acceptance

Új script:

`scripts/benjadmin-b32-p3-provisioning-acceptance.mjs`

Eredmény:

**28/28 PASS**

Ellenőrzött fő pontok:

- schema 0.2.0 READY;
- P2 runtime READY;
- unauth provisioning DENY;
- HANDOFF DRAFT create;
- stabil PART kód;
- DRAFT start;
- READY provisioning;
- determinisztikus filesystem;
- baseline isolation;
- idempotent READY retry;
- DEV/STAG only, partner PROD nincs bindelve;
- repository registry partner root alatt;
- explicit allowlist;
- bounded engine entitlement;
- HANDOFF delivery target READY;
- secret references only;
- Outmin filesystem ownership;
- Git bare repository valid;
- main branch;
- Outmin -> INTERNAL továbbra is DENY;
- Operator UI P3 READY állapot;
- P3 provision gomb READY állapotban tiltott;
- partner UI minimum 12 px;
- desktop horizontal overflow nincs.

## Acceptance fixture cleanup

A tesztpartnerprojekt és saját kapcsolt DB rekordjai kontrollált tranzakcióban törlésre kerültek.

Utóállapot:

- partnerprojektek: 0
- partner kódszekvencia: `last_value=1`, `is_called=false`

A következő valódi partnerprojekt továbbra is `PART-0001` lehet.

A teszt repo/worktree nem került destruktívan törlésre; partner artifact quarantine területre került.

## Regressziók

- P2 runtime/policy: **12/12 PASS**, runtime `READY`
- P1 state-aware: **14/14 PASS**, schema `0.2.0`
- B3.1 Control: **13/13 PASS**
- Operator UI: **30/30 PASS**
- TypeScript: PASS
- lint: **0 error / 108 meglévő warning**
- `git diff --check`: PASS

## DEV build

Aktív candidate build:

`1LgQov-F2M-0RiQxKU4fo`

DEV PM2 process online.

## UI előkészítés

A Partner fejlesztések táblázat P3 provisioning státusz oszlopot és indítási műveletet kapott.

A legacy compact CSS öröklésből eredő 9.5 px-es wrapper tipográfia javítva lett; Partner táblázatban minimum 12 px az elfogadási szabály.

A következő külön vizuális fejlesztési kör a BENJADMIN UI V3 közös dashboard/táblázat/grafikon rendszer kialakítása, majd a teljes menürendszer fokozatos átépítése.

## Következő fejlesztési szint

P4: Partner release / handoff életciklus.

A P4 mellett párhuzamosan indítható a BENJADMIN UI V3 közös vizuális komponensréteg, hogy a P4/P5 új felületei már az új dashboard rendszerre épüljenek.
