# 222 — BENJADMIN Windows Desktop Bridge P8.1 · DEV kódaktiválási checkpoint

Dátum: 2026-08-14
Állapot: P8.1 secure pairing KÓDRÉTEG DEV-en aktív. DB migráció pending. Windows Bridge / Pairing / Execution OFF.

- funkcionális commit: `ab40af2`;
- aktív build: `KVt8dHUfCMRlWj8ppovBB`;
- PM2: `dimpro-benjadmin-operator-ui-v2-dev` ONLINE;
- rollback: `/srv/dimpro-dev/backups/benjadmin-windows-bridge-p81-preintegrate-20260814T233707`;
- PROD nem módosult.

## Aktív P8.1 kódréteg
- secure agent identity contract;
- one-time pairing API és UI;
- kézi device approval;
- claim token + device token hash-only tárolási modell;
- device revoke + session lezárás;
- heartbeat contract, kötelező `commands: []`;
- DPAPI CurrentUser tokenvédelemre kész PowerShell agent;
- migration + rollback + SHA-256 sidecar repositoryban.

## Live flagállapot
- `BENJADMIN_WINDOWS_BRIDGE_ENABLED=0`;
- `BENJADMIN_WINDOWS_BRIDGE_PAIRING_ENABLED=0`;
- `BENJADMIN_WINDOWS_BRIDGE_EXECUTION_ENABLED=0`;
- `BENJADMIN_TERMINAL_EXECUTION_ENABLED=0`;
- `BENJADMIN_PROD_TERMINAL_ENABLED=0`;
- `BENJADMIN_SECRET_VAULT_ENABLED=0`.

`BENJADMIN_WINDOWS_BRIDGE_PAIRING_SECRET` nincs provisionálva.

## DB állapot
A `20260814230000_benjadmin_windows_bridge_p81.sql` migráció NEM lett alkalmazva.

Blokkoló ok: a rendelkezésre álló operator env-ben nincs `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD`, `BENJADMIN_PROD_SUPABASE_URL`, `BENJADMIN_EXPECTED_SUPABASE_URL`, ezért a meglévő biztonsági preflight nem tudja bizonyítani a DEV céladatbázist és a PROD fizikai elkülönítését. A credential-forrás kényszerített felderítését a szervervédelmi réteg blokkolta, ezt nem kerültük meg.

Bridge OFF esetén az új device/pairing backend DB-hozzáférés ELŐTT fail-closed, ezért a kódréteg migráció nélkül is biztonságosan aktív maradhat.

## Acceptance
- P8 contract: **37/37 PASS**;
- P8.1 contract: **44/44 PASS**;
- teljes P2–P8.1 regresszió: **329/329 PASS**;
- TypeScript: PASS;
- teljes lint: **0 error / 104 meglévő warning**;
- candidate build: `-FXCK_w3uoPWzBx8N7UMO` PASS;
- operator build: `KVt8dHUfCMRlWj8ppovBB` PASS;
- pre-migration candidate pairing POST Bridge OFF: 403;
- pre-migration candidate device GET Bridge OFF: 403;
- candidate browser: P8.1 UI PASS, pairing gomb disabled, execution OFF;
- browser console/page/network/external errors: **0/0/0/0**;
- live `/admin/dev-console`: 200;
- live detached workspace: 200;
- live readiness/pairing/devices API auth nélkül: 401/401/401;
- PM2 online;
- error-log 10 s stabilitásvizsgálat: változatlan.

A PM2 error-logban látható `EPROTO / wrong version number` továbbra is a korábbi 21:24:11-es bejegyzés; a P8.1 aktiválási vizsgálat 23:52-kor történt, a log nem változott.

## Következő kötelező gate
P8.1-E2E csak az alábbi sorrendben folytatható:
1. biztonságosan azonosított DEV PostgreSQL migration credential + külön PROD target;
2. read-only DB preflight;
3. source-of-truth DB backup és visszaolvashatósági ellenőrzés;
4. P8.1 migráció alkalmazása DEV-re;
5. schema acceptance;
6. 32+ karakteres pairing secret secure provisionálása;
7. Bridge + Pairing flag kontrollált candidate ON, Execution továbbra is OFF;
8. valódi Windows gépen agent Pair → approval → one-time token → heartbeat → revoke E2E;
9. csak sikeres E2E után lehet külön P8.2 execution designról beszélni.
