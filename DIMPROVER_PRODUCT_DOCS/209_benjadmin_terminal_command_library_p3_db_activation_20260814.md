# 209 — BENJADMIN Terminál Parancstár P3 · DEV DB aktiválási checkpoint

Dátum: 2026-08-14
Környezet: DEV
Feature commit a DB apply előtt: `981bff3`
Állapot: DEV SÉMA AKTÍV · P3 UI/API CANDIDATE PASS · LIVE FEATURE FLAG MÉG OFF

## Source-of-truth azonosítás

Tényleges BENJADMIN DEV Supabase projekt:
- project ref: `pbgyuznivqvestuksvif`.

Tényleges PROD Supabase projekt read-only azonosítással:
- project ref: `hlgntizemijaemphleiw`.

Szeparáció:
- targetMatches: true;
- sharedWithProduction: false.

A korábbi átadási összefoglalóban szereplő másik DEV ref nem volt aktuális; a tényleges operator `.env.local`, pooler marker és B3.2 preflight alapján a `pbgyuznivqvestuksvif` projekt a source of truth.

## Pooler / preflight hardening

A `benjadmin-b32-source-db-preflight.mjs` javítva lett, hogy a Supabase pooler URL-ből is felismerje a projekt-refet a `postgres.<project-ref>` username alapján.

Pooler target:
- eu-central-1;
- root-only `.pgpass`;
- SSL;
- meglévő marker: `dev-center-engine 0.3.0`, migration count 2.

Preflight:
- 7/7 prerequisite PASS;
- psql READY;
- pg_dump READY;
- PROD külön projekt PASS.

## Pre-migration backup

Friss logical backup:

`/root/.dimpro-backups/benjadmin-source-dev/20260814T142458Z-p3-terminal-command-library`

Tartalom:
- `public_before_terminal_command_library_v010.dump`;
- `public_schema_before_terminal_command_library_v010.sql`;
- `public_before_terminal_command_library_v010.dump.list`;
- `SHA256SUMS`;
- `SHA256CHECK.txt`;
- `backup-status.txt`;
- `offsite-status.txt`.

Eredmény:
- public tables: 111;
- database size: 25 439 379 byte;
- custom dump: 1 261 727 byte;
- pg_restore list: 1049 bejegyzés;
- SHA-256 check: PASS.

## Offsite titkosított backup

A P3 előtti DB rollback pont a meglévő titkosított Restic repositoryba került.

- snapshot: `9408de98`;
- tag: `pre-terminal-command-library-v010`;
- restore próba: PASS;
- visszaállított dump SHA-256: PASS.

## Rollback-próba

A tényleges apply előtt a migráció teljes SQL teste külön tranzakcióban lefutott, majd ROLLBACK történt.

A rollback után:
- catalog table: false;
- events table: false;
- schema marker: false.

Eredmény: **ROLLBACK_TEST=PASS**.

## Tényleges migráció

Migráció:
`20260814160000_benjadmin_terminal_command_library_v010.sql`

SHA-256:
`a2075c0868e0174bb0156c306d05d6c10440054e371e7516c4332702de122f46`

A central migration lock alatt történt apply.

Előtte:
- catalog=false;
- events=false;
- marker=false.

Utána:
- catalog=true;
- events=true;
- marker=true.

Apply: **PASS**.

## DB security acceptance

Schema marker:
- version: `0.1.0`;
- migration count: `1`;
- target architecture: `CONTROL_VPS`.

RLS:
- catalog: true;
- events: true.

Sensitive/raw nevű oszlop:
- 0.

Jogosultság:
- anon catalog SELECT: false;
- authenticated catalog SELECT: false;
- service_role catalog SELECT: true.

RPC:
- `dev_center_record_terminal_command(...)`: present.

## Deduplikációs runtime acceptance

Tranzakciós fixture:
`git status --short`

Két rögzítés ugyanazzal a shell+sanitized command hash-sel:
- első environment: DEV;
- második environment: LOCAL.

Eredmény a tranzakción belül:
- ugyanaz a catalog ID mindkétszer;
- catalog rows: 1;
- usage_count: 2;
- event rows: 2;
- event envs: DEV,LOCAL.

Ezután ROLLBACK.

Rollback után fixture catalog rows: 0.

## Candidate UI/API smoke

P3 candidate runtime: localhost 3199, command library flag ON.

- `/admin/dev-console`: HTTP 200;
- `/api/dev/terminal-hub/command-library` auth nélkül: HTTP 401;
- `/api/dev/terminal-hub/command-library/<id>/events` auth nélkül: HTTP 401.

Candidate runtime utána leállítva.

## Kódoldali acceptance

- P2 regresszió: 64/64 PASS;
- P3 schema: 19/19 PASS;
- P3 backend/API/UI: 19/19 PASS;
- pooler preflight contract: 6/6 PASS;
- összesen: 108/108 PASS;
- TypeScript: PASS;
- teljes lint: 0 error / 104 meglévő warning;
- central-lockos build: PASS;
- candidate build ID: `FZ_q0xLPzFanfslieAHzL`.

## Aktiválási következő lépés

A DB réteg készen áll. A következő kontrollált lépés:
1. feature branch fast-forward operator/integration ágba;
2. `BENJADMIN_COMMAND_LIBRARY_ENABLED=1` DEV-en;
3. a veszélyes Terminal Hub flagek továbbra is OFF;
4. operator build;
5. kizárólag BENJADMIN operator DEV restart;
6. HTTPS/API smoke;
7. manuális UI acceptance.

PROD nem módosult.
