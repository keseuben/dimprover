# DIMPRO AUTH V0.2.1 – DEV aktiválási runbook

Állapot: DEV ONLY · PROD DENY

A folyamat szándékosan fail-closed. A `plan` mód nem kapcsolódik a DB-hez és nem módosít semmit. A `preflight` csak olvas és migrációs dry-runt futtat. A tényleges migráció csak három egymástól független megerősítő környezeti kapcsoló után indul.

## 1. Statikus terv és contractok

```bash
node scripts/dimpro-auth/activate-dev.mjs
```

Kötelező eredmény: V0.1, V0.2 és V0.2.1 contract PASS, tiszta AUTH branch/worktree, `productionAccess=DENY`.

## 2. DB szerver előkészítés

A `db.dimpro.hu` szerveren authoritative admin művelettel:

- `dimpro_auth_dev` adatbázis;
- `dimpro_auth_migrator_dev` DDL/migration role;
- `dimpro_auth_app_dev` least-privilege runtime role;
- `pgcrypto`;
- a DEV alkalmazásszerver `213.160.68.24/32` számára kizárólag a két AUTH role + `dimpro_auth_dev` hostssl/SCRAM bejegyzés;
- nincs `all/all` szabály.

Előkészített fájlok: `db/auth/bootstrap/000_create_dev_database.psql`, `db/auth/bootstrap/pg_hba.dev.example`.

## 3. Runtime trust/secrets

Az authoritative `DIMPRO Internal PostgreSQL CA` root telepítése után állítandó:

- `DIMPRO_AUTH_ENVIRONMENT=DEV`
- runtime és migrator connection string külön role-lal;
- `DIMPRO_AUTH_DB_SSL_MODE=verify-full`
- `DIMPRO_AUTH_DB_CA_FILE=...`
- három külön, legalább 32 karakteres OTP/session/SSO secret;
- authoritative DEV origin + Drive callback.

Valós secret nem kerül Gitbe.

## 4. Olvasási preflight

```bash
node scripts/dimpro-auth/activate-dev.mjs --preflight
```

Ez runtime-preflightot, DB-readiness ellenőrzést és migráció dry-runt futtat, de nem APPLY-ol.

## 5. Migráció APPLY

Csak DB backup/üres új DB igazolása után:

```bash
export DIMPRO_AUTH_ACTIVATION_CONFIRM=APPLY_DEV_AUTH_ACTIVATION
export DIMPRO_AUTH_MIGRATION_CONFIRM=APPLY_DEV_AUTH_MIGRATIONS
export DIMPRO_AUTH_BACKUP_CONFIRMED=YES
node scripts/dimpro-auth/activate-dev.mjs --apply-migrations
```

Elvárt postcondition: `migrationCount=4`.

Első pilot felhasználó ugyanebben a kontrollált körben opcionálisan:

```bash
export DIMPRO_AUTH_BOOTSTRAP_CONFIRM=BOOTSTRAP_DEV_AUTH_USER
node scripts/dimpro-auth/activate-dev.mjs --apply-migrations --bootstrap-email '<DEV_PILOT_EMAIL>'
```

## 6. Fizikai E2E

A DB/runtime aktiválás után: `drive.dev.dimpro.hu` → `auth.dev.dimpro.hu` → OTP e-mail → egyszer használatos code → Drive app session. Kötelező negatív tesztek: hibás/lejárt OTP, 5 próbálkozás, code replay, state mismatch, PKCE mismatch, permission revoke, logout-all, inactivity/absolute expiry.

PROD aktiválást ez a runbook nem végez és nem engedélyez.

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
