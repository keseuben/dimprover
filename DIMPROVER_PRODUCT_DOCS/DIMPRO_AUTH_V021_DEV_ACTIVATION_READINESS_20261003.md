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
- AUTH V0.2 SSO contract: 35/35 PASS.
- AUTH V0.2.1 security contract: 46/46 PASS.
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
7. Migráció 001→002→003→004 backup után.
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

## SSO abuse protection

- Authorization request és code-exchange IP-alapú, közös DB-audit eseményekből számolt rate limitet kapott.
- Alapérték: 10 perces ablak, authorize 60/IP, token exchange 120/IP; környezeti változókkal szűkíthető.
- Tiltáskor is audit esemény készül, így az ismételt támadási kísérletek nem maradnak láthatatlanok.
- Inaktív termék nem adhat jogosultságot és SSO kliens sem használható hozzá.

## Runtime environment hardening

- `DIMPRO_AUTH_ENVIRONMENT` explicit `DEV`/`PROD`; hiánya fail-closed.
- DEV runtime kizárólag `db.dimpro.hu/dimpro_auth_dev` + `dimpro_auth_app_dev`, PROD runtime kizárólag `dimpro_auth_prod` + `dimpro_auth_app_prod` kapcsolattal indulhat.
- Aktiválási preflight ellenőrzi a külön runtime/migrator role-t, `verify-full` TLS-t, CA tanúsítványt és az OTP/session/SSO titkok egymástól való függetlenségét.
- DEV pilot user-admin script kizárólag explicit confirmation mellett fut, PROD módot elutasít, és minden módosítást auditál.

## Transaction denial persistence

- Hibás OTP, próbálkozási limit és SSO-deny esetén a számláló/audit módosítások explicit commitot kapnak akkor is, ha a publikus API hibát ad vissza.
- Nem várt adatbázis- vagy programhiba továbbra is rollbacket okoz.
- Ez biztosítja, hogy az OTP max-próbálkozás és az audit/rate-limit ne legyen megkerülhető rollback miatt.

## Strict PostgreSQL transport

- A DIMPRO AUTH runtime és minden DEV DB-műveleti script kizárólag `verify-full` TLS-sel működhet; `rejectUnauthorized=false`, `require` vagy `disable` downgrade nincs engedélyezve.
- A közös `strict-dev-db.mjs` helper az exact `db.dimpro.hu / dimpro_auth_dev` adatbázist és a művelethez tartozó role-t is ellenőrzi.
- A bootstrap, migráció, cleanup, readiness és pilot user-admin ugyanazt a fail-closed DB transport szabályt használja.

## Request metadata hardening

- Az IP-kezelés csak szintaktikailag érvényes IPv4/IPv6 címet fogad el, elsőként a reverse proxy `x-real-ip` értékét használja; X-Forwarded-For esetén a proxyhoz legközelebbi, utolsó érvényes címet veszi.
- Böngészős mutációknál HTTPS same-origin Origin ellenőrzés történik, a `Sec-Fetch-Site` cross-site/same-site kérések origin hiányában is elutasíthatók.
- Audit e-mail azonosító többé nem nyers SHA-256, hanem külön `DIMPRO_AUTH_AUDIT_PEPPER` HMAC; OTP/session/audit/SSO négy külön secret.

## Least-privilege runtime DB role

- A runtime DB role nem kap általános CRUD/default privilege-et.
- `004_auth_v022_runtime_privileges.sql` explicit, táblánkénti jogokat ad: policy/authz katalógusok csak SELECT; `auth_users` csak SELECT + `email_verified_at/updated_at` oszlopszintű UPDATE; challenge/session/SSO state SELECT+INSERT+UPDATE; audit csak SELECT+INSERT.
- DELETE és authz/admin módosítás a runtime role számára nincs engedélyezve.
- Pilot user/bootstrap admin műveletek a nem-runtime migrator credentialt használják, explicit confirmation mellett.

## Centralized Drive SSO environment mapping

- A Drive SSO kliens-konfiguráció egyetlen `client-config.ts` forrásból jön: DEV `dimpro-drive-dev` / `auth.dev.dimpro.hu`, PROD `dimpro-drive-prod` / `auth.dimpro.hu`.
- Start, callback, session, logout, proxy és AUTH health ugyanazt a host→environment→client mappinget használja.
- A SSO seed a cél AUTH adatbázis neve alapján választ DEV vagy PROD kliens/redirect értéket; idegen adatbázisnévnél fail-closed.
- A PROD Drive host többé nem esik bele a régi licenc-host redirectbe; tényleges PROD aktiválás továbbra is külön engedélyhez kötött.

## Secret separation hardening

- `DIMPRO_AUTH_SSO_STATE_SECRET` kötelező runtime secret; nincs session-pepper fallback.
- OTP, session, audit és SSO secret runtime szinten is négy külön érték kell legyen, nem csak aktiválási preflightban.
- Explicit hibás biztonsági numerikus konfiguráció nem clamping/fallback útvonalra kerül, hanem fail-closed indulási hibát okoz.

## Concurrency-safe rate limiting

- Az OTP e-mail/IP és SSO authorize/token rate-limit ellenőrzések tranzakciós advisory lockot használnak, ezért párhuzamos kérésekkel nem lehet a cooldown/limit számlálást egyszerű race conditionnel túllépni.
- OTP esetén e-mail és IP kulcs külön lockot kap; SSO esetén authorize-IP és token-IP külön kulcsot kap.
- A lockok csak a tranzakció élettartamáig élnek, így nem marad tartós zárolás hiba után.

## Drive return target hardening

- Az SSO `return_to` nem tetszőleges helyi útvonal: kizárólag a Drive workspace `/drive` vagy `/drive/...` útvonalai engedélyezettek.
- A validáció URL-parserrel ellenőrzi a same-origin tulajdonságot, elutasítja a backslash/control karakteres, fragmentes és 500 karakternél hosszabb értékeket.
- Ugyanez a validáció érvényes a start kérésnél és a HMAC-aláírt átmeneti SSO cookie visszaolvasásakor is.

## DB connection-string hardening

- Runtime és aktiválási ellenőrzés kizárólag `db.dimpro.hu:5432` host/portot, a környezethez tartozó adatbázist és role-t fogadja el.
- Az URL-ben `sslmode`, `sslcert`, `sslkey`, `sslrootcert` paraméter nem engedélyezett, így a külön kötelező `verify-full` TLS beállítást connection-string paraméterrel nem lehet felülírni.
- Üres DB-jelszó runtime/preflight szinten is fail-closed.

## DEV HTTP deployment readiness probe

A `scripts/dimpro-auth/http-readiness.mjs` kizárólag DEV hostokat ellenőriz és `productionAccess=DENY` állapotot jelent. Alapértelmezett `PRE_DB` módban a még nem aktivált DB miatt a readiness 503/`ready=false` választ várja; `--post-db` módban már 200/`ready=true` és legalább 4 migráció szükséges.

A 2026-10-03-i read-only live futás 1/6 PASS eredményt adott, ezért ez **deployment drift**, nem forráskód-contract hiba:

- `auth.dev.dimpro.hu/login`: HTTP 200, PASS;
- `login.dev.dimpro.hu`: kapcsolat/fetch nem állt fel, vhost/TLS/routing ellenőrzendő;
- `auth.dev.dimpro.hu/health/live`: 307 `/login`, a jelenlegi aktív candidate nem tartalmazza a kívánt health viselkedést;
- `auth.dev.dimpro.hu/health/ready`: 307 `/login`, ugyanez a deployment drift;
- `drive.dev.dimpro.hu/api/dimpro-auth/session`: HTTP 404, az aktív Drive candidate még nem tartalmazza az AUTH session route-ot;
- `drive.dev.dimpro.hu/drive`: 307 `/login`, még a régi login-flow fut.

A probe nem végez módosítást és nem aktivál candidate-et. Az aktív hostok jelenleg `213.160.68.32` címre oldódnak, miközben ez az AUTH forrás-worktree a `213.160.68.24` DEV VPS-en van. A candidate aktiválás külön, engedélyezett központi deployment csatornát igényel.

## SSO redirect leak protection

- A Drive SSO indító és callback válaszok `Cache-Control: no-store` és `Referrer-Policy: no-referrer` fejlécet kapnak.
- A callback hiba- és sikerágai ugyanazon `noLeak` fejléc-politikát használják, ezért az egyszer használatos `code` és `state` nem kerülhet normál referrer láncba.
- A callback `X-Content-Type-Options: nosniff` fejlécet is ad.

## Security-level downgrade protection

- Az AUTH V0.1 e-mail OTP kizárólag `SIMPLE` biztonsági szintű felhasználót hitelesít. `STAFF`, `PROJECT_MANAGER`, `ORG_ADMIN` és `SUPERADMIN` szintnél `AUTH_STRONG_AUTH_REQUIRED` fail-closed válasz készül, amíg a passkey/2FA réteg nincs aktiválva.
- Ez nem korlátozza a Drive termékjogosultságot: a pilot felhasználó lehet `SIMPLE` biztonsági szintű, miközben `DRIVE_USER`/`drive.access` jogosultsága van.
- A DEV bootstrap script magasabb biztonsági szint létrehozását elutasítja, és a bootstrap műveletet `ADMIN_USER_BOOTSTRAP` audit eseménnyel naplózza.
