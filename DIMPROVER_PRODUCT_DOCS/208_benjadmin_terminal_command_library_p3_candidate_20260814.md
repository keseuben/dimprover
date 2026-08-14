# 208 — BENJADMIN Terminál Parancstár P3 · pre-DB candidate checkpoint

Dátum: 2026-08-14
Környezet: DEV feature worktree
Branch: `feat/benjadmin-terminal-command-library-p3`
Baseline: `69059ea`
Állapot: KÓD + MIGRÁCIÓ + ROLLBACK CANDIDATE KÉSZ · DB MÉG NEM MÓDOSULT

## Funkcionális cél

A **BENJADMIN Fejlesztői Konzol / Terminál Parancstár** külön modul a ChatGPT Parancstártól.

Feladata:
- shell/Git/PowerShell parancsok deduplikált, maszkolt tudástára;
- egy normalizált parancshoz egy felhasználói katalóguskártya;
- minden tényleges használat külön esemény/audit sor;
- első/utolsó használat és usage count;
- környezet, projekt, session, cél, eredmény és címkék;
- raw secret/parancsváltozat tárolása nélkül.

A P3 **nem terminál-végrehajtó**. A felületben nincs Futtatás/Execute gomb.

## Adatmodell

Új DEV migráció:
`20260814160000_benjadmin_terminal_command_library_v010.sql`

SHA-256:
`a2075c0868e0174bb0156c306d05d6c10440054e371e7516c4332702de122f46`

Új táblák:
- `dev_center_terminal_command_catalog`;
- `dev_center_terminal_command_events`.

Új RPC:
- `dev_center_record_terminal_command(...)`.

A katalógus deduplikációs kulcsa:
`SHA-256(shell_family + "\n" + sanitized_normalized_command)`.

A környezet és projekt szándékosan nem része a hashnek: ugyanaz a parancs egy kártya marad, a kontextus külön event sorokban gyűlik.

RLS: ON.
Anon/authenticated: REVOKE.
Service role: explicit grant.
Rollback SQL elkészült.

## Backend

Új modul:
`app/lib/dev-center/terminal-hub/command-library.ts`

Lánc:
`raw input -> ANSI/control strip -> normalizálás -> meglévő Terminal data-policy sanitization -> SHA-256 -> RPC upsert + event insert`.

A DB-be csak sanitizált `normalized_command` és `display_command` kerül.

Purpose/result/tags is sanitizált.

## API

- `GET /api/dev/terminal-hub/command-library`;
- `POST /api/dev/terminal-hub/command-library`;
- `GET /api/dev/terminal-hub/command-library/[commandId]/events`.

Mind admin-only.

Kézi rögzítés P3 DEV-ben csak DEV vagy LOCAL környezethez engedélyezett.

## UI

Új komponens:
`TerminalCommandLibrary.tsx`.

Funkciók:
- keresés;
- shell filter;
- környezet filter;
- projekt filter;
- kézi DEV/LOCAL rögzítés;
- deduplikált parancskártya usage counttal;
- cél, utolsó eredmény, címkék;
- első/utolsó használat;
- maszkolt parancs másolás;
- lenyitható használati eseménytörténet.

Feature flag:
`BENJADMIN_COMMAND_LIBRARY_ENABLED`.

A live DEV-en jelenleg OFF.

## Source DB preflight javítás

A B3.2 `benjadmin-b32-source-db-preflight.mjs` pooler-target felismerése javítva lett.

Korábban csak `*.supabase.co` URL-ből tudott projekt-refet felismerni, miközben a dokumentált migrációk Supabase poolert használnak.

Most `*.pooler.supabase.com` esetén a `postgres.<project-ref>` username alapján ismeri fel a targetet.

Contract: 6/6 PASS.

Tényleges source preflight:
- DEV: `pbgyuznivqvestuksvif`;
- PROD: `hlgntizemijaemphleiw`;
- targetMatches: true;
- sharedWithProduction: false;
- prerequisite: 7/7;
- dev-center-engine: 0.3.0 / migration_count 2;
- psql + pg_dump: READY.

## Acceptance a DB apply előtt

P2 regresszió:
- 64/64 PASS.

P3:
- schema contract: 19/19 PASS;
- backend/API/UI contract: 19/19 PASS;
- pooler preflight contract: 6/6 PASS.

Összesített contract:
**108/108 PASS**.

További gate:
- TypeScript: PASS;
- teljes lint: 0 error / 104 meglévő warning;
- central-lockos candidate build: PASS;
- candidate build ID: `FZ_q0xLPzFanfslieAHzL`;
- `git diff --check`: PASS.

## Következő lépés

1. friss DEV PostgreSQL logical backup;
2. pg_restore list + SHA ellenőrzés;
3. migráció central lock alatt;
4. DB schema/RLS/RPC acceptance;
5. API CRUD/deduplikáció/security acceptance;
6. csak ezután feature flag ON és DEV aktiválás.

PROD nem módosult.
