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
- `004_auth_v022_runtime_privileges.sql`

Alkalmazás előtt kötelező a DEV DB backup és az explicit migration gate. A runtime és a migráció külön PostgreSQL role-t/connection stringet használ (`dimpro_auth_app_dev` vs. `dimpro_auth_migrator_dev`). PROD továbbra is DENY.

## Tesztállapot

- AUTH V0.1 contract: 26/26 PASS.
- AUTH V0.2 internal SSO contract: 38/38 PASS.
- AUTH V0.2.1 security contract: 53/53 PASS.
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

## DEV TLS / SNI activation gate

A `scripts/dimpro-auth/tls-readiness.mjs` read-only ellenőrzés DNS, TLS SNI és certificate SAN lefedettséget vizsgál az `auth.dev`, `login.dev` és `drive.dev` hostokon. A 2026-10-03-i eredmény 2/3 PASS:

- `auth.dev.dimpro.hu`: TLS 1.3 PASS, SAN lefedett;
- `drive.dev.dimpro.hu`: TLS 1.3 PASS, SAN lefedett;
- `login.dev.dimpro.hu`: FAIL, `ERR_SSL_TLSV1_UNRECOGNIZED_NAME`.

A jelenlegi `dev.dimpro.hu` Let's Encrypt tanúsítvány SAN listája tartalmazza többek között az `auth.dev.dimpro.hu` és `drive.dev.dimpro.hu` neveket, de a `login.dev.dimpro.hu` nevet nem. Ezért a friendly login host aktiválásához **két feltétel** szükséges a 213.160.68.32 DEV ingressen: `login.dev.dimpro.hu` TLS vhost/SNI binding és olyan tanúsítvány, amelynek SAN listája ezt a hostnevet is tartalmazza. A script PROD hostot nem érint.

## Prepared DEV nginx ingress template

- `ops/nginx/dimpro-auth/dev-vhosts.conf.template` elkészült az `auth.dev.dimpro.hu` és `login.dev.dimpro.hu` DEV ingresshez; a Drive saját candidate vhostját szándékosan nem definiálja felül.
- `scripts/dimpro-auth/render-nginx-dev.mjs` csak explicit TLS cert/key útvonal és loopback `http://127.0.0.1:<port>` upstream mellett renderel. Külső upstream, alacsony/érvénytelen port vagy relatív cert útvonal fail-closed.
- A proxy felülírja az `X-Real-IP` értéket `$remote_addr`-ra, és beállítja a `Host`, `X-Forwarded-For`, `X-Forwarded-Proto=https`, `X-Forwarded-Host` fejléceket.
- Ez **előkészített konfiguráció**, nem került telepítésre a 213.160.68.32 DEV ingressre. Aktiválás előtt a `login.dev.dimpro.hu` nevet tartalmazó új/megújított tanúsítvány és `nginx -t` ellenőrzés szükséges.

## Atomic migration ledger

- A migration SQL fájlok már nem tartalmaznak saját `BEGIN/COMMIT` blokkot; a `migrate.mjs` futtató nyit tranzakciót minden egyes migrációhoz.
- A séma-módosítás és az `auth_schema_migrations` checksum/ledger bejegyzés **ugyanabban a tranzakcióban** történik.
- Ha a SQL vagy a ledger insert hibázik, teljes `ROLLBACK` történik; nem maradhat alkalmazott, de nem naplózott migráció.
- Mivel AUTH migráció még nem került APPLY-ra a cél DB-n, az 001–004 checksumok a mostani pre-activation forrásállapothoz lettek újraszámolva. Az első éles/DEV APPLY után ezek a fájlok immutable-ként kezelendők.

## Serialized migration APPLY

- A migrációs futtató session-szintű PostgreSQL advisory lockkal sorosítja a DEV APPLY futásokat, ezért két párhuzamos migrátor nem tud versenyhelyzetben egymásra futni.
- A migration ledger létezését `to_regclass` ellenőrzi; általános SQL hibát többé nem nyel el `catch` úgy, mintha a ledger csak nem létezne.
- Üres ledger esetén a 001 migrációnak kell elsőnek lennie; eltérő állapot fail-closed.
- A lock felszabadítása `finally` ágban történik.

## OTP input and level gating

- Az OTP policy pontosan 5 perc / 5 hibás próbálkozás / 30 másodperc újraküldési idő; ezek a kötelező értékek környezeti változóval nem gyengíthetők.
- A verify API kizárólag pontosan hat számjegyet fogad el; tetszőleges szövegből nem tisztít ki „használható” kódot.
- `STAFF`, `PROJECT_MANAGER`, `ORG_ADMIN`, `SUPERADMIN` felhasználónak a SIMPLE e-mail OTP ág nem küld kódot; a publikus válasz továbbra is account-enumeration ellen védett.

## AUTH host-bound API surface

- A központi OTP, `/me`, `/me/permissions` és `logout-all` végpontok kizárólag az `auth.dev.dimpro.hu` / `auth.dimpro.hu` technikai AUTH hoston futhatnak; Drive vagy más termékhostról 404 fail-closed választ adnak.
- A `session` és `logout` végpont kettős szerepű: csak központi AUTH host vagy explicit Drive host engedélyezett.
- A Drive `/login` többé nem rendereli közvetlenül a központi OTP UI-t; a Drive SSO start végpontjára irányít, amely ezután az AUTH hostra visz.
- Ezzel az `__Host-dimpro_auth` cookie nem kerülhet véletlenül termékhostra.

## Central-host-only health and launcher

- `/health/live`, `/health/ready`, `/health/auth` és `/auth/apps` csak a technikai AUTH hoston használható.
- A health endpointok termékhostról 404 fail-closed választ adnak; a launcher nem AUTH hoston `notFound()` ágra kerül.
- A launcher DEV/PROD Drive linkje az AUTH hostból felismert környezet alapján készül, nem általános `.dev.dimpro.hu` suffix alapján.

## Isolated AUTH TypeScript gate

- `tsconfig.dimpro-auth.json` külön TypeScript projektként ellenőrzi az AUTH library/API/health/launcher/login/session-guard/proxy forrásokat.
- `npx tsc -p tsconfig.dimpro-auth.json --pretty false`: PASS.
- Ez külön bizonyítja az AUTH típushelyességet; a teljes monorepóban maradó 4 `pilotFolder` TS2741 hiba a Drive egy korábbi, AUTH-tól független állapota.

## Central login entry consistency

- `app.dimpro.hu/login` és `app.dev.dimpro.hu/login` közvetlenül a központi `login.dimpro.hu` / `login.dev.dimpro.hu` belépési címre irányít.
- Ez megakadályozza, hogy az app host a saját hostján renderelje a központi OTP UI-t, amelynek API-i szándékosan csak az AUTH hoston engedélyezettek.

## DEV DB source-IP split

- Runtime application role: `dimpro_auth_app_dev` is allowed only from `213.160.68.32/32` (active DEV runtime/ingress host).
- Migration role: `dimpro_auth_migrator_dev` is allowed only from `213.160.68.24/32` (authoritative source/control node).
- Both rules are database-specific (`dimpro_auth_dev`), `hostssl` + `scram-sha-256`; no broad `all/all` rule is permitted.
- PROD database/roles remain outside this DEV activation path.

## OTP e-mail tárgysor

- A központi `noreply@dimpro.hu` profil marad az AUTH feladója.
- A tárgysor formátuma: `DIMPRO belépési kód: 123456`, tehát az aktuális egyszer használatos kód már a tárgyban is megjelenik.
- A levéltörzsben a kód továbbra is jól látható, a DB-ben továbbra sem tároljuk olvasható formában.
