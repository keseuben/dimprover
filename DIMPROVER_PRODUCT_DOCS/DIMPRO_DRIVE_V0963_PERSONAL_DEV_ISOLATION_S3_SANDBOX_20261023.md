# DIMPRO Drive V0.9.63 – DEV izolációs kapu és helyi S3-integrációs próba

**2026-10-23** · SOURCE ONLY · DEV ONLY · **PROD DENY**.

## 1. A V0.9.62 folytatásának célja

A 100 MiB-os Saját Drive feltöltés valódi, hitelesített DEV browser + S3 + DB E2E-je csak akkor indítható el, ha az S3 bucket, adatbázis és hitelesített szintetikus próbafelhasználó írási céljai bizonyítottan elkülönülnek az üzemi adatoktól. Az előző szakasz 500 fájl / 100 MiB/fájl forráscélja nem változott, de az új funkció nincs aktiválva a publikus DEV-ben.

## 2. Valódi infrastruktúra READ-ONLY audit

- Publikus `drive.dev.dimpro.hu/drive`: HTTP 307 / Central AUTH belépés, `X-DIMPRO-Drive-Candidate: 1402cd6e5`, V0.9.52.
- DEV Central AUTH readiness: HTTP 200.
- DEV adathordozó: kb. 236 GiB teljes / 111 GiB használt / 125 GiB szabad.
- A korábbi V0.9.62 izolált, nem futó release `db76b827c5db` ép.
- A Drive konfigurációs fájl S3 végpontot, bucketet és credential-hivatkozásokat tartalmaz, de **az aktív, forrásból rekonstruált effective env + az önállóan jóváhagyott PROD ellenreferencia összevetése nem áll rendelkezésre**.
- Önmagában a `dev`, `prod` szövegrészlet vagy a port/domain alapján a bucket vagy a DB elkülönítése NEM bizonyítható. Az állapot jelenleg **NO-GO**, nem lehet valódi próbaobjektumot írni ugyanebbe a konfigurációba.
- A vizsgálat nem jelenített meg S3 kulcsot, service role tokent vagy más titkot, és nem lépett be üzemi adatbázisba.

## 3. Új, read-only izolációs policy

Fájl: `app/lib/content-core/personalPilotIsolation.ts`.

- Kötelező `DIMPRO_PRODUCTION_ACCESS=DENY`, `DIMPRO_AUTH_ENVIRONMENT=DEV`, expliciten engedélyezett személyes pilot, aktív és teljes S3 config, igazolt DEV adatbázis és 100 MiB-os pilothatár.
- Külön jóváhagyott (nem ugyanabból az env-ből származó) `approvedDevStorageEndpoint`, `approvedDevBucket`, `approvedDevDatabaseUrl` és PROD DB/bucket ellenreferencia.
- Azonos DEV/PROD bucket vagy DB URL esetén tiltás; eltérő vagy nem jóváhagyott endpoint/bucket/DB esetén tiltás.
- Csak szintetikus test USER és külön `_dimpro_e2e/personal/<test-id>/` kulcsnévtérrel megengedett a teszt-felkészültség pozitív minősítése.
- Policy ellenőrzése: `scripts/tests/dimpro-drive-v0963-pilot-isolation-contract.mjs`, 28 pozitív/negatív eset PASS.
- Ops diagnosztika: `scripts/drive-personal-v0963-isolation-preflight.mjs`. Személyes/Prod S3-ba, adatbázisba, AUTH-ba **nem kapcsolódik**, csak a paramétereket minősíti, és kimeneten kizárólag státuszkódokat jelez; hiányzó inventory esetén NO-GO. **A JSON inventory `independentlyVerified` mezője nem kriptográfiai bizonyíték**: a release controllernek külön ellenőriznie kell a provenance-t/emberi jóváhagyást.
- Ez SOURCE/QA preflight, még **nem az éles alkalmazásban futó runtime access-control middleware**. A jelenlegi 100 MiB-os personal upload feature flag a publikus DEV-en OFF maradt.

## 4. Valódi AWS SDK – teljesen helyi, szintetikus S3 REST

`scripts/tests/dimpro-drive-v0963-isolated-s3-http-contract.mjs`:

- Kizárólag `127.0.0.1` és OS által kiosztott véletlenszerű port. Memóriában tartott S3-szerű objektum, hamis kulcsok és tesztbucket. Nem érinti sem a DIMPRO-tárhelyet, sem ügyfelek tartalmát.
- 17 MiB szintetikus állomány `@aws-sdk/client-s3` `PutObject` stream protokollon történő átvitele PASS.
- `HeadObject` méret PASS, `GetObject` teljes visszaolvasás és SHA-256 egyezés PASS, `DeleteObject` után nincs tesztobjektum PASS.
- Ez valós SDK/HTTP/stream-integráció a **helyi tesztszerver ellen**; nem jelent valós DEV bucketet, Content Core DB-refet, authentikált Next.js útvonalat vagy vírusvizsgálatot.

## 5. QA / release státusz

- TypeScript `npx tsc --noEmit`: PASS.
- Célzott ESLint: PASS.
- V0.9.63 isolation contract: PASS (28 eset).
- V0.9.63 local-loopback S3 HTTP 17 MiB PUT/HEAD/GET/SHA/DELETE: PASS.
- V0.9.62 és V0.9.50–61 szerződéses regresszió: 20/20 tesztfájl PASS.
- V0.9.60 izolált PGlite migráció/ownership/quota: korábban PASS; a V0.9.63 nem futtatott új tényleges DEV DB migrációt.
- Publikus DEV V0.9.52, aktív rollback online, PROD DENY.

## 6. Következő V0.9.64 előfeltételek és cél

1. A PROD és DEV bucket/DB összevetéshez **függetlenül igazolt inventory**: a konkrét célok és test ACL/role, credential scope, host, dedicated test project/user. Nem megengedett a futó konfigurációból egyszerűen bemásolt „jóváhagyás”.
2. A különálló, nem publikus DEV runtime indulási és visszaállítási runbookja. Az átállítás nem automatikus, külön jóváhagyást igényel.
3. A tényleges Next.js personal upload útvonalak izolált S3/DB próbája 1/16/17/99/100/101 MiB fájllal, EICAR AV tiltással; biztos/ref integrity/S3 readback.
4. A Transfer Center 50/100/500 fájlos, szintetikus böngészős batch tesztje, mappák és két USER keresztellenőrzéssel.
5. Meghiúsult upload, eltűnt ack, belépési session expiry, quota race és a visszaállítás auditja.
6. Csak ha minden gate PASS és külön DEV pilot jóváhagyás van: a V0.9.64 vagy későbbi candidate nyilvános DEV pilotba helyezhető. **PROD DENY** külön döntésig.

**Fontos:** nincs éles vagy DEV DB írás, nincs valódi S3 PUT, nincs PM2 vagy Nginx módosítás. A V0.9.63 „SOURCE-ONLY” kifejezés a policy/kód változására utal, nem tagadja a helyi, szintetikus S3 SDK valós HTTP tesztjét.

## BUILD01 állapot és biztonsági blokk

- A forráscommit `03d78ea6078ef9fd0921a5d35192e2fa28737094` Gitben és az origin munkágon rögzítve.
- A BUILD01 előzetes `dimpro-build-node-health-v1 build01` vizsgálat: READY, buildLockHeld=false, storageGovernor=SAFE.
- Az adott forrásból elkészített Git source bundle felkerült a BUILD01 elkülönített temp útvonalára.
- A hivatalos build runner indítását az OpenAI eszközbiztonsági rétege még a végrehajtás előtt blokkolta. A tiltást **nem kerültük meg**.
- READ-ONLY utóellenőrzés: a v0963 buildhez **nincs result JSON és nincs build log**.
- Következmény: **BUILD01 státusz = PENDING / NOT RUN**, nem PASS, és nincs V0.9.63 artifact / új DEV release.
- Következő szükséges művelet: a BUILD01 futtatás külön, az engedélyezett Central Core/operátori kiadási csatornán, a biztonsági jóváhagyástól függően. A már ellenőrzött git/bundle forrás módosítás nélkül újrahasználható; a blokkolás feloldásának megkerülése tilos.
- A publikus DEV továbbra is V0.9.52, és semmilyen üzemelő runtime vagy PROD beállítás nem módosult.
