# DIMPRO BENJADMIN B3.2 – Source DB activation guard – 2026-08-11

## Cél

A B3.2 P1 Partner Registry kódalap DEV-en aktív, de a partner schema source-of-truth Supabase alkalmazása előtt kötelező a céladatbázis, a rollback/backup és a PROD-szeparáció egyértelmű igazolása.

Ez a checkpoint olyan **fail-closed preflight guardot** ad a migráció elé, amely nem engedi, hogy egy rendelkezésre álló, de más Supabase projekthez tartozó PostgreSQL credential véletlenül céladatbázissá váljon.

PROD ebben a körben nem módosult.

## Audit eredmény

A jelenlegi BENJADMIN DEV alkalmazás egy Supabase projekthez kapcsolódik az API/service-role konfigurációján keresztül.

A management host `.env.local` fájljában elérhető `SUPABASE_DB_URL` + `SUPABASE_DB_PASSWORD` páros viszont **más Supabase projektre** mutat.

Következmény:

- a management DB credential jelenleg **NEM használható** a BENJADMIN DEV source-of-truth migrációjához;
- a B3.2 P1 partner migráció alkalmazása blokkolt;
- a blokk még a DB-kapcsolat létrehozása előtt felismerhető;
- PROD target elkülönülése továbbra sincs igazolva, ezért az is külön kötelező gate.

Ez biztonsági blokk, nem alkalmazáshiba.

## Új preflight script

`scripts/benjadmin-b32-source-db-preflight.mjs`

Bemeneti környezeti változók:

- `BENJADMIN_EXPECTED_SUPABASE_URL` vagy `NEXT_PUBLIC_SUPABASE_URL`: az aktív DEV API cél;
- `SUPABASE_DB_URL`: a migrációhoz használandó PostgreSQL cél;
- `SUPABASE_DB_PASSWORD`: DB hitelesítés;
- `BENJADMIN_PROD_SUPABASE_URL`: a PROD Supabase cél kizárási ellenőrzéshez.

A script credential értéket nem ír ki.

## Fail-closed kapuk

1. DEV cél nem azonosítható → `SOURCE_DB_EXPECTED_TARGET_MISSING`.
2. DB credential hiányzik → `SOURCE_DB_CREDENTIAL_MISSING`.
3. DB project ref nem egyezik az aktív DEV project reffel → `SOURCE_DB_TARGET_MISMATCH`.
4. PROD target ismeretlen → `SOURCE_DB_PROD_TARGET_UNKNOWN`.
5. DEV és PROD ugyanaz a Supabase project → `SOURCE_DB_SHARED_WITH_PROD`.
6. `psql` vagy `pg_dump` hiányzik → `SOURCE_DB_TOOLING_MISSING`.
7. generikus B3/B3.1 prerequisite schema hiányos → `SOURCE_DB_PREREQUISITES_MISSING`.

Csak minden gate PASS után adhat `readyForApply=true` eredményt.

## Read-only source DB probe

A preflight kizárólag akkor kapcsolódik adatbázishoz, ha:

- a DB target megegyezik az aktív DEV Supabase projekttel;
- a PROD target ismert és eltérő;
- a szükséges tooling elérhető.

Ezután read-only módon ellenőrzi a következő generikus prerequisite táblákat:

- `dev_center_projects`
- `dev_center_workers`
- `dev_center_environments`
- `dev_center_releases`
- `dev_center_infra_assets`
- `dev_center_schema_meta`
- `dev_center_audit_events`

Továbbá visszaolvassa a generikus Development Center schema version és bootstrap ID értékét.

A script maga **nem futtat migrációt**.

## Acceptance

Új teszt:

`scripts/benjadmin-b32-source-db-preflight-acceptance.mjs`

Eredmény: **5/5 PASS**

Tesztelt fail-closed esetek:

1. hiányzó DEV target;
2. hiányzó DB credential;
3. eltérő DB project;
4. ismeretlen PROD target;
5. azonos DEV/PROD Supabase project.

A tesztek fake URL-ekkel futnak, és a blokkolt ágakban nem nyitnak DB kapcsolatot.

## Valós környezeti preflight eredmény

A management host jelenlegi DB credentialjével és az aktív BENJADMIN DEV Supabase targettel lefuttatott preflight:

- exit: `2`
- eredmény: `SOURCE_DB_TARGET_MISMATCH`
- DB művelet: **nem indult**
- migráció: **nem indult**
- PROD: **nem módosult**

Ezzel igazoltuk, hogy a guard a jelenlegi veszélyes célkeveredést blokkolja.

## Következő biztonságos aktiválási sorrend

A B3.2 P1 source-of-truth migráció csak akkor folytatható, ha rendelkezésre áll:

1. az **aktuális BENJADMIN DEV Supabase projekthez tartozó PostgreSQL DB URL + DB password**;
2. a **PROD Supabase target** egyértelmű azonosítása;
3. igazolt, hogy DEV és PROD fizikailag külön project, vagy ha közös, akkor külön explicit PROD schema approval szükséges;
4. source-of-truth DEV `pg_dump` backup;
5. backup integritás/listing ellenőrzés;
6. titkosított külső snapshot/mentési pont;
7. explicit staged migration gate;
8. migration után schema readiness + idempotent create/read/audit/UI acceptance.

Amíg ezek nem teljesülnek, a Partner Registry UI helyesen `SCHEMA PENDING` állapotban marad és nem enged draft projektet létrehozni.

## Fejlesztési állapot

- B3.2 P0: KÉSZ.
- B3.2 P1 kódalap: KÉSZ, DEV-en aktív.
- B3.2 P1 source-of-truth schema: PENDING, biztonsági gate mögött.
- B3.2 P2 OutminAI technikai izoláció: még nem aktivált.

A következő kódolási körben P2 előkészítő policy/worktree kód csak úgy kezdhető meg, hogy a P1 schema-függő enforcement alapértelmezetten fail-closed maradjon. A valódi OutminAI partner write csak a partner schema READY és a P2 default-deny acceptance után engedélyezhető.
