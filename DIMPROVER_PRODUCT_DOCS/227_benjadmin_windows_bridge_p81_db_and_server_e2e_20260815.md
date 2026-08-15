# 227 — BENJADMIN Windows Bridge P8.1 · DEV DB migráció + server-side E2E checkpoint

Dátum: 2026-08-15
Állapot: DEV DB migráció alkalmazva, pairing secret provisionálva, server-side pairing életciklus E2E PASS. Windows Bridge / Pairing / Execution live flag továbbra is OFF.

## Git/runtime
- integrációs baseline a művelet elején: `61e1a49`;
- aktív Next build: `XR4JDXq1W-fVQA68otcGI`;
- PROD nem módosult.

## DEV / PROD target szeparáció
Read-only ellenőrzés:
- DEV Supabase ref: `pbgyuznivqvestuksvif`;
- PROD Supabase ref: `hlgntizemijaemphleiw`;
- DEV root-only `.pgpass`: 600, DEV poolerhez illeszkedik;
- targetMatches=true;
- sharedWithProduction=false.

## Migráció előtti gate
- migration SHA-256: `20930c71f841dd3b56aee64a9f5f50894838fa3c87959d6ad35b8fd68a61a061`;
- read-only migration preflight: READY FOR APPLY;
- előzetes schema: minden P8.1 objektum hiányzott;
- teljes tranzakciós rollback-próba: PASS;
- rollback után devices/pairings/sessions/function/marker mind false maradt.

## DEV migráció
Központi `migration` lock alatt alkalmazva.

Backup:
- könyvtár: `/srv/dimpro-dev/backups/benjadmin-windows-bridge-p81-db/20260815T052238Z`;
- fájl: `dev-center-before-p81.dump`;
- backup SHA-256: `7841523636ab5b7dae14f72b53f5841997ca68c4926626fccaad4e7b6c572d5a`;
- `pg_restore --list`: PASS.

Apply eredmény:
- devices table: true;
- pairings table: true;
- sessions table: true;
- activation function: true;
- schema marker: true;
- migration runner: PASS.

## DB security acceptance
- marker: `benjadmin-windows-bridge / 0.1.0 / migration_count=1`;
- devices RLS: ON;
- pairings RLS: ON;
- sessions RLS: ON;
- anon SELECT: false;
- authenticated SELECT: false;
- service_role SELECT: true;
- activation function public execute: false;
- activation function service_role execute: true;
- kezdeti devices/pairings/sessions rows: 0/0/0.

## Pairing HMAC secret
A DEV szerveren 64 karakteres pairing HMAC secret lett generálva és az operator `.env.local` fájlba provisionálva.

- secret érték nem került logba vagy dokumentációba;
- minimum length gate: PASS;
- rollback env backup: `/srv/dimpro-dev/backups/benjadmin-p81-pairing-secret-20260815T072314`;
- live Bridge / Pairing / Execution flagek továbbra is OFF.

## Server-side P8.1 E2E candidate
Külön 3199-es candidate runtime:
- Bridge: ON;
- Pairing: ON;
- Execution: OFF;
- Terminal Execution: OFF;
- PROD Terminal: OFF.

Életciklus acceptance:
1. pairing create: HTTP 201;
2. agent claim: HTTP 200;
3. pending claim poll: HTTP 200;
4. pending device admin listben: PASS;
5. admin approve: HTTP 200;
6. active claim poll + egyszeri device token: HTTP 200;
7. ugyanazon claim token második poll: HTTP 401 `CLAIM_TOKEN_INVALID`;
8. heartbeat: HTTP 200;
9. heartbeat `commands`: 0;
10. admin revoke: HTTP 200;
11. revoke utáni heartbeat: HTTP 401 `DEVICE_TOKEN_INVALID`;
12. final device status: revoked.

## DB E2E utóellenőrzés
- device status: revoked;
- device token hash: null revoke után;
- pairing status: completed;
- pairing code hash: 64 karakter;
- claim hash: null aktiválás után;
- session status: revoked;
- session closed_at: present;
- audit események: 5.

Az E2E fixture tranzakciós takarítással eltávolítva. Utána:
- devices: 0;
- pairings: 0;
- sessions: 0;
- test audit: 0.

Candidate runtime leállítva, synthetic admin key és ideiglenes token/adatfájlok törölve.

## Következő gate
A szerveroldali pairing réteg kész a valódi Windows E2E-re. Következő lépés:
1. live runtime restart a provisionált pairing secret betöltéséhez, továbbra is Bridge/Pairing/Execution OFF;
2. P8.1 Windows package generálás;
3. Windows tesztgépen VERIFY-AND-INSTALL + SELF-CHECK;
4. kontrollált candidate Bridge/Pairing ON, Execution OFF;
5. valós Windows Pair → admin approval → HEARTBEAT-ONCE → revoke → heartbeat deny;
6. csak sikeres Windows E2E után P8.2 execution design.
