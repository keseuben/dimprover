# DIMPRO Drive V0.9.34 – Phase 7: BUILD01 és izolált PostgreSQL tesztek

Dátum: 2026-10-10
Állapot: **BUILD01 PASS / ISOLATED PGLITE PASS / DEV NOT DEPLOYED / PROD DENY / NO EMAIL SENT**

## BUILD01 forrás és artifact
- Git forrás: 2085743c5d282487e90a75c05851dab7106fa959
- Build-run: drive-v0934-2085743c5-20261010-build01-b1
- Build ID: eAhZBaX2jihMCwQMTOu3k
- Artifact SHA-256: f843d4c44914d4d8ce733ffe0a1319b664afa5ad0a93461b23985c8d4a3a2498
- Artifact BUILD gateway lokális tárhelyen: kb. 92 MB-os build-artifact.tar.gz.
- BUILD01 Next.js compile, TypeScript, 103 generált statikus oldal és asset-szinkron: PASS.
- Next NFT dynamic tracing figyelmeztetések voltak a next.config.ts/dev route környezetében; a buildet nem blokkolták.
- A működő DEV-en továbbra is V0.9.33 a publikus verzió; a buildet nem telepítettük.

## PostgreSQL WASM izolált sandbox teszt
- Ideiglenes csak teszt PGlite modul: /tmp/dimpro-drive934-pg-sandbox/node_modules/@electric-sql/pglite/dist/index.js.
- Reprodukálható forrásbeli teszt: scripts/tests/drive-notification-pglite-e2e.mjs.
- Indítás: DIMPRO_TEST_PGLITE_MODULE_PATH=/tmp/dimpro-drive934-pg-sandbox/node_modules/@electric-sql/pglite/dist/index.js node scripts/tests/drive-notification-pglite-e2e.mjs
- 7 Drive SQL-migráció egymás után: PASS a minimalizált Drive baseline és izolált service_role mellett.
- PL/pgSQL csomagfoglalás 250+2 eseménnyel; második worker kizárása; SMTP-ACK szimulációval cursor 250, második csomag SUPPRESSED után cursor 252; nem létező cursor tartomány és opt-out elleni védelem: PASS.
- Tervellenőrzés trigger: témakör átírására nem, reviewChecked változtatásra igen keletkezett döntési esemény.
- SMTP nem futott.

## Központi AUTH profilfotó SQL-teszt
- Reprodukálható teszt: scripts/tests/dimpro-auth-profile-photo-pglite-e2e.mjs.
- AUTH migration: db/auth/migrations/012_auth_v049_profile_photo.sql, izolált dimpro_auth_migrator_dev szerepben PASS.
- AUTH app szerep: függvényes profilfotó feltöltés, olvasás, törlés PASS; közvetlen tábla SELECT tiltva.
- Az AUTH teszt a saját külön sandbox sémán futott; db.dimpro.hu-t nem módosítottuk.

## Biztonsági és integrációs korlátok
- A PGlite PostgreSQL WASM motor, amely minimalizált baseline táblákat használ; eredménye NEM teljes DEV/PROD DB-séma integrációs bizonyíték.
- Külön jóváhagyott, teljes aktuális DEV schema sandbox, concurrency ACL, SMTP-mock, és autentikált böngészős QA még szükséges.
- DRIVE_DIGEST_SENDING_RELEASED=false és PRODUCER_RELEASED=false, email automatizálás kikapcsolva.
- A profilfotó AUTH migráció csak a saját, külön db.dimpro.hu adatbázisra készülhet, és jóváhagyásig nincs aktiválva.
- A Drive migrációi szintén kizárólag külön DBA review és jóváhagyás után alkalmazhatók.
- Nincs branch/worktree létrehozás, nincs destruktív törlés, PROD DENY.
