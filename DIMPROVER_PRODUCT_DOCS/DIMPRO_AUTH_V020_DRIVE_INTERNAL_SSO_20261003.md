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
- AUTH V0.2 internal SSO contract: 25/25 PASS.
- AUTH V0.2.1 security contract: 17/17 PASS.
- Célzott ESLint: PASS.
- Full repository TypeScript ellenőrzés futott; az AUTH fájlokra nem jelzett hibát. A teljes project exit code 2 négy már meglévő, AUTH-tól független Drive `pilotFolder` típushiba miatt.
- Full production build emiatt jelenleg nem tekinthető bizonyított PASS-nak; a különálló AUTH változtatásokon új type/lint hiba nem látszik.
- `npm audit --omit=dev` a közös monorepóban meglévő sérülékenységeket jelez, köztük a közös `next` és `nodemailer` csomagokhoz javítható találatokat. A hozzáadott `pg` csomagra nem jelzett külön találatot. A globális framework/mail dependency upgrade más modulokat is érint, ezért ezt külön koordinált dependency-frissítésként kell végrehajtani a PROD engedélyezés előtt.

## Aktiválási blokk

A `db.dimpro.hu` authoritative DEV DB-hozzáférés ebből a végrehajtási csatornából továbbra sem hitelesített, ezért egyetlen migration sem lett APPLY módban futtatva, és runtime secret sem lett beállítva. E2E csak a DEV adatbázis, SMTP és auth runtime env aktiválása után indulhat.
