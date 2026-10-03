# DIMPRO AUTH V0.2 – Drive belső SSO + session invalidation

Dátum: 2026-10-03
Állapot: DEV candidate · PROD DENY

## Cél

A V0.1 saját PostgreSQL OTP/session alap továbbfejlesztése a DIMPRO Drive első valódi központi AUTH integrációjához. A megoldás a specifikációban engedélyezett szűk belső authorization-code folyamatot használja: pontos redirect URI allowlist, legalább 128 bites state, PKCE S256, legfeljebb 60 másodperces egyszer használatos authorization code és termékoldali host-only app session.

## Hostmodell

- Barátságos DEV belépési cím: `login.dev.dimpro.hu`.
- Központi technikai AUTH: `auth.dev.dimpro.hu`.
- Első termék: `drive.dev.dimpro.hu`.
- `login.dev.dimpro.hu` 307-tel a központi `auth.dev.dimpro.hu/login` felületre irányít. A központi auth session cookie kizárólag az AUTH hoston használatos az új Drive SSO flow-ban.
- A Drive saját `__Host-dimpro_app` cookie-t kap; nincs közös `.dimpro.hu` session cookie.

## SSO folyamat

1. Drive session hiányában `/api/dimpro-auth/start` indul.
2. A Drive 192 bites `state` értéket és 256 bites PKCE verifiert generál; a flow egy aláírt, HttpOnly/Secure host-only cookie-ban marad a Drive hoston.
3. A böngésző `auth.dev.dimpro.hu/api/dimpro-auth/authorize` címre kerül. A kliens és redirect URI az adatbázis exact allowlistjéből ellenőrződik.
4. Az authorization request teljes állapota szerveroldali DB rekordba kerül. Ha nincs központi auth session, az AUTH a login oldalra irányít egy opaque request ID-val.
5. Sikeres e-mail OTP után ugyanaz a szerveroldali request folytatódik.
6. Az AUTH 256 bites egyszer használatos code-ot ad ki, csak hash formában tárolja, és 60 másodperc után lejár.
7. A Drive callback ellenőrzi a saját `state` értékét, majd szerveroldalon, PKCE verifierrel beváltja a code-ot.
8. Sikeres exchange után a Drive saját opaque app session tokent kap, amely szintén csak hash formában van adatbázisban.
9. `/drive` és a Drive API-k a termék app sessiont és a `drive.access` permissiont szerveroldalon ellenőrzik.

## Session invalidation

A V0.2.1 `session_version` mechanizmussal azonnali session érvénytelenítást ad:

- security level / státusz / login_enabled / e-mail azonosító változásakor a user session verzió nő;
- access grant változásakor automatikus trigger növeli az érintett user session verzióját;
- role-permission változáskor minden érintett aktív user session verziója nő;
- mind a központi auth session, mind a termék app session csak az aktuális user session verzióval érvényes.

## Health

- `GET /health/live`
- `GET /health/ready`
- `GET /health/auth`

A health válaszok nem tartalmaznak DB URL-t, titkot vagy stack trace-t.

## Migrációk

- `001_auth_v010_core.sql`
- `002_auth_v020_internal_sso.sql`
- `003_auth_v021_session_version.sql`

Alkalmazás előtt kötelező a DEV DB backup és az explicit migration gate. A runtime és a migráció külön PostgreSQL role-t/connection stringet használ (`dimpro_auth_app_dev` vs. `dimpro_auth_migrator_dev`). PROD továbbra is DENY.

## Tesztállapot

- AUTH V0.1 contract: 22/22 PASS.
- AUTH V0.2 internal SSO contract: 31/31 PASS.
- AUTH V0.2.1 security contract: 29/29 PASS.
- Célzott ESLint: PASS.
- Full repository TypeScript ellenőrzés futott; az AUTH fájlokra nem jelzett hibát. A teljes project exit code 2 négy már meglévő, AUTH-tól független Drive `pilotFolder` típushiba miatt.
- Full production build emiatt jelenleg nem tekinthető bizonyított PASS-nak; a különálló AUTH változtatásokon új type/lint hiba nem látszik.
- `npm audit --omit=dev` a közös monorepóban meglévő sérülékenységeket jelez, köztük a közös `next` és `nodemailer` csomagokhoz javítható találatokat. A hozzáadott `pg` csomagra nem jelzett külön találatot. A globális framework/mail dependency upgrade más modulokat is érint, ezért ezt külön koordinált dependency-frissítésként kell végrehajtani a PROD engedélyezés előtt.

## Aktiválási blokk

A `db.dimpro.hu` authoritative DEV DB-hozzáférés ebből a végrehajtási csatornából továbbra sem hitelesített, ezért egyetlen migration sem lett APPLY módban futtatva, és runtime secret sem lett beállítva. E2E csak a DEV adatbázis, SMTP és auth runtime env aktiválása után indulhat.

## SMTP readiness

A DEV runtime mail profile ellenőrzés szerint a `noreply` profil konfigurált és az SMTP `verify()` hitelesítés PASS állapotú 465/TLS kapcsolaton. Teszt e-mail küldése ebben a blokkban nem történt, ezért a recipient-delivery/relay útvonal még E2E ellenőrzendő.

## DB hálózati readiness

- `db.dimpro.hu:5432` elérhető és PostgreSQL kapcsolatot fogad.
- TLS 1.3 kapcsolat létrejön; a szerver tanúsítványa `db.dimpro.hu`, a lánc belső `DIMPRO Internal PostgreSQL CA` gyökérre épül.
- A DEV alkalmazásszerver (`213.160.68.24`) jelenlegi `dimproadmin` kapcsolatát a PostgreSQL `pg_hba.conf` elutasítja. Ezért a DEV AUTH migráció nem futott APPLY módban.
- Aktiválás előtt a DB szerveren külön `pg_hba.conf` engedély szükséges legalább a `dimpro_auth_migrator_dev` és `dimpro_auth_app_dev` szerepköröknek a DEV alkalmazásszerver címéről, SSL-kényszerítéssel.
- A belső PostgreSQL CA gyökértanúsítványt authoritative forrásból kell az alkalmazásszerverre telepíteni; hálózatról lekért tanúsítványt nem használunk trust anchor-ként.

## Retention / audit

- OTP challenge alapértelmezett megőrzés: 7 nap.
- Authorization request/code: 1 nap.
- Lezárt/lejárt session: 30 nap utómegőrzés.
- Audit esemény: 365 nap.
- Cleanup csak explicit `DIMPRO_AUTH_CLEANUP_CONFIRM=APPLY_DEV_AUTH_CLEANUP` + `--apply` mellett destruktív; alapelve fail-closed.
- OTP e-mail kézbesítés SUCCESS/FAILURE külön audit eseményként rögzül.

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
