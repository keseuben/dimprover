# 223 — BENJADMIN Windows Bridge P8.1 · DB migration gate

Dátum: 2026-08-14
Baseline: `b744e09`
Állapot: migration tooling kész; migráció NEM futott le.

## Runner
Fájl:
`scripts/benjadmin-windows-bridge-p81-migration-gate.mjs`

Módok:
- `preflight` — alapértelmezett, csak olvas;
- `verify` — csak schema acceptance;
- `apply` — csak explicit DEV-only approval mellett.

Az `apply` kötelező approval értéke:
`BENJADMIN_WINDOWS_BRIDGE_P81_MIGRATION_APPROVED=DEV_ONLY_P81_APPLY_APPROVED`

## Kötelező biztonsági gate-ek
Az apply csak akkor haladhat tovább, ha:
- Windows Bridge OFF;
- Windows Bridge Pairing OFF;
- Windows Bridge Execution OFF;
- Terminal Execution OFF;
- PROD Terminal OFF;
- a migráció SHA-256 egyezik a sidecarral;
- `psql`, `pg_dump`, `pg_restore` elérhető;
- a meglévő `benjadmin-b32-source-db-preflight.mjs` DEV target match-et ad;
- DEV és PROD fizikailag elkülönített;
- közvetlen PostgreSQL DB URL + password rendelkezésre áll.

## Backup
Apply előtt automatikusan:
- célzott `public.dev_center_*` custom-format `pg_dump` készül;
- `pg_restore --list` ellenőrzi a backup visszaolvashatóságát;
- backup SHA-256 készül;
- backup root: `/srv/dimpro-dev/backups/benjadmin-windows-bridge-p81-db`;
- migration report 0600 jogosultsággal készül.

A runner nem logolja a DB jelszót.

## Apply
A migráció `psql -X -v ON_ERROR_STOP=1 -f ...` módban fut.
Utána kötelező schema acceptance:
- `dev_center_windows_bridge_devices`;
- `dev_center_windows_bridge_pairings`;
- `dev_center_windows_bridge_sessions`;
- `dev_center_windows_bridge_activate_device(uuid,uuid,text,text,uuid)`;
- `benjadmin-windows-bridge` / `0.1.0` schema marker.

Ha a schema már teljes, az apply idempotensen `alreadyApplied` állapottal kilép.

## Acceptance
- migration-gate contract: **23/23 PASS**;
- teljes P2–P8.1 + migration-gate regresszió: **352/352 PASS**;
- TypeScript: PASS;
- migration-gate célzott lint: PASS;
- teljes lint: **0 error / 104 meglévő warning**.

Valós operator-env preflight eredménye:
- exit: 2;
- code: `SOURCE_DB_CREDENTIAL_MISSING`;
- `readyForApply=false`.

Ez a helyes fail-closed eredmény, ezért sem backup, sem SQL apply nem indult el.

## Következő lépés
A P8.1 DB migráció csak akkor folytatható, amikor a biztonságos DEV PostgreSQL credential és a külön PROD target hitelesen elérhető. Addig minden Bridge/Pairing/Execution flag OFF marad.

PROD nem módosult.
