# DIMPRO AUTH V0.2.1 – DEV aktiválási readiness

Dátum: 2026-10-03
Állapot: PRE-ACTIVATION · DEV ONLY · PROD DENY

## Source
- Branch: `worker/arminai/dimpro-auth-v01-own-postgres-20261002`
- Base: `1b9c6a2b0ab0b59f4f5b0ba7db3a7d820c071a10`
- Előző pushed HEAD: `7d7f9b36a153d6314a0085754b2fd125f60944d0`

## Kész
- Saját PostgreSQL OTP/session/authz alap.
- Drive internal SSO exact redirect allowlist + state + PKCE S256 + egyszer használatos code.
- Host-only central auth és Drive app session.
- Parent central-session érvényesség kötelező a Drive app sessionhöz.
- Permission/session-version alapú azonnali invalidálás.
- OTP delivery audit és általános login-failure audit.
- Explicit retention/cleanup script.
- Auth/login browser security headers: no-store, nosniff, DENY frame, no-referrer, COOP same-origin, restrictive permissions policy, CSP frame-ancestors none.
- PostgreSQL runtime alapértelmezés: `verify-full`; authoritative belső CA szükséges.
- SMTP `noreply` profil konfiguráció + TLS/authentication verify: PASS. Küldés nem történt.

## Teszt
- AUTH V0.1 contract: 22/22 PASS.
- AUTH V0.2 SSO contract: 27/27 PASS.
- AUTH V0.2.1 security contract: 27/27 PASS.
- Célzott ESLint: PASS.
- `git diff --check`: PASS.
- Full repository TypeScript: AUTH változtatásokra nincs hiba; 4 korábbi, AUTH-tól független Drive `pilotFolder` TS2741 hiba marad.

## Aktiválást blokkoló DB feltételek
1. `dimpro_auth_dev` adatbázis létrehozása.
2. `dimpro_auth_migrator_dev` és `dimpro_auth_app_dev` külön role.
3. `pg_hba.conf`: a DEV alkalmazásszerver címéről SSL-kapcsolat engedélyezése csak ezekre a szerepkörökre/adatbázisra.
4. `DIMPRO Internal PostgreSQL CA` authoritative root CA telepítése az auth runtime hostra.
5. Külön migrator/runtime connection string secret.
6. OTP/session/SSO pepper secret generálás és titkos secret-store beállítás.
7. Migráció 001→002→003 backup után.
8. Első DEV user bootstrap `--grant-drive` kapcsolóval.
9. Fizikai E2E: `drive.dev.dimpro.hu` → `auth.dev.dimpro.hu` → e-mail OTP → code exchange → Drive app session.

## Jelenlegi hálózati bizonyíték
- `db.dimpro.hu:5432`: accepting connections.
- TLS 1.3: PASS.
- Jelenlegi `dimproadmin` próbát a DB `pg_hba.conf` elutasítja a DEV alkalmazásszerver IP-jéről; ezért DB-write nem történt.


## SSO authorization hardening

- Minden AUTH kliens kötelező `required_permission_code` mezőt kap; a Drive DEV kliens `drive.access` jogosultságot követel.
- Authorization code csak aktív termékjogosultság mellett adható ki; a token exchange ugyanezt ismét ellenőrzi.
- Az `auth.dev.dimpro.hu` kizárólag DEV klienst, az `auth.dimpro.hu` kizárólag PROD klienst fogad; környezetek közötti code exchange fail-closed.
