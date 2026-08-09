# DIMPRO BENJADMIN B3 – M0 PROD → DEV migráció és tiszta baseline

Dátum: 2026-08-09
Állapot: infrastruktúra-baseline elkészült; M0 funkcionális adatoldali validációra vár
Mérföldkő: M0

## Cél

A BENJADMIN B3 fejlesztés előtt a jelenlegi PROD rendszer kontrollált felmérése, visszaállítható mentése, a valódi működő forrás állapotának rögzítése, majd elkülönített Large DEV környezet kialakítása. A BENJADMIN M1 UI fejlesztése csak az M0 teljes elfogadása után indulhat.

## Szerverkiosztás

- PROD / ÉLES: `213.160.68.24`
- DEV / Large VPS: `213.160.68.32`, hostname: `dimpro-dev`
- DB VPS: `213.160.68.33`, hostname: `dimpro-db`
- PROD projektmappa: `/root/dimprover`
- DEV fejlesztési gyökér: `/srv/dimpro-dev`

DEV kapacitás:

- 4 vCPU
- 8 GB RAM
- 120 GB SSD

DB VPS kapacitás:

- 2 vCPU
- 4 GB RAM
- 80 GB SSD

## PROD read-only audit

- Git branch: `main`
- PROD Git HEAD: `12cea45f7e942809015f4c6613898d75eb6c3e2d`
- Origin `main`: ugyanaz a commit
- Git tracked fájlok: 103
- módosított/staged fájlok: 42
- untracked elemek: 2668
- PROD root lemezhasználat az audit során: 90–91%

Következtetés: a távoli Git `main` önmagában nem tartalmazza a teljes, jelenleg működő PROD forrásállapotot. A PROD working tree vak commitolása tilos, mert forrás, build-, backup-, work- és runtime-maradványok keverednek.

## PROD backup és visszaállíthatóság

A meglévő titkosított BX11 / Restic mentés működik.

- M0 kézi snapshot: `74a53b72`
- adatbázis-dump: PASS
- külön fájl-visszaállítási próba: PASS, SHA-256 egyezés
- post-audit napi snapshot: `da481bf4`
- külön BENJADMIN M0 audit snapshot: `168311d3`
- blocker/checkpoint snapshot: `a0e110ad`

A `/root/dimprover/backups` könyvtár a napi backupból szándékosan kizárt, ezért az M0 auditcsomag külön Restic snapshotba került.

## Migrációs osztályozás

### MIGRATE

- `app/`
- `components/`
- `public/` a runtime letöltési és ideiglenes tartalmak nélkül
- `scripts/`
- `ops/`
- `docs/`
- `DIMPROVER_PRODUCT_DOCS/`
- `supabase/`
- szükséges package/build/runtime konfigurációk

### REVIEW

- `.data/`
- `.dimprover/`
- `desktop_clients/`
- `launcher_source/`
- `teams-package/`
- `etc/`
- `notes/`

### ARCHIVE / NEM DEV FORRÁS

- `.next-*`
- `.work_*`
- `backups/`
- régi ZIP és BAK fájlok

### REGENERATE

- `node_modules/`
- TypeScript/build cache-ek

### DO NOT COPY

- `.env*`
- production credentialök és környezetspecifikus secret értékek

## Szelektív forrásbaseline

A DEV-be vitt tiszta forráscsomag a `public/downloads` és `public/tmp_check` runtime tartalmát kizárja.

- csomag: `dimpro-prod-source-selective-v2-20260809T1509Z.tar.gz`
- méret: kb. 24 MB
- bejegyzések: 2083
- `.env` találat: 0
- kizárt runtime download/tmp találat: 0
- SHA-256: `bd087d5840a56ca6611ad4d7832d11cd61f02543700e7e850b87af61fd68aea2`

A PROD `main` teljes Git története külön bundle-ben is rögzítve lett.

## DEV Git és worktree struktúra

Létrehozott könyvtárak:

- `/srv/dimpro-dev/repositories`
- `/srv/dimpro-dev/worktrees`
- `/srv/dimpro-dev/integration`
- `/srv/dimpro-dev/dev-runtime`
- `/srv/dimpro-dev/staging`
- `/srv/dimpro-dev/releases`
- `/srv/dimpro-dev/artifacts`
- `/srv/dimpro-dev/temp`
- `/srv/dimpro-dev/logs`
- `/srv/dimpro-dev/source-import`
- `/srv/dimpro-dev/coordination`

DEV baseline Git:

- bare repo: `/srv/dimpro-dev/repositories/dimprover.git`
- baseline branch: `baseline/benjadmin-b3-m0`
- baseline commit: `2ab23591da6de3426b7f96228c8937b805bc2e46`
- parent PROD commit: `12cea45f7e942809015f4c6613898d75eb6c3e2d`
- baseline tracked fájlok: 1566
- tag: `benjadmin-b3-m0-prod-baseline`
- aktív infra worktree: `/srv/dimpro-dev/worktrees/benjadmin-m0-infra`
- aktív branch: `infra/benjadmin-b3-m0`
- utolsó funkcionális infrastruktúra/kód commit: `c60424610e8a39904bba8dbfd45ab6c5145ed484`
- ezt követően kizárólag M0 dokumentációs commitok készültek

Fontos M0 commitok:

- `b2c6a207ad8e7add5a9a3571f9da10d5d8e78e2e` – DEV route-ok leválasztása PROD redirectekről
- `27a46ea8850daa668d5cd7f815e173d35311b7c8` – központi, worktree-k közötti kizárólagos műveleti lock
- `785e0e1585554abcf0df49b385ebce944cdcffc0` – runtime/migrációs állományok Git-ignore szabályai
- `5fdeb1e72928490924b91f526c54e91c3d47ff36` – Large DEV build erőforrás-tuning
- `c60424610e8a39904bba8dbfd45ab6c5145ed484` – explicit DEV hostok és PROD-kiszivárgás elleni redirect javítás

A DEV Git origin olvasása működik. GitHub push jelenleg nincs engedélyezve a DEV VPS-en, mert nincs külön biztonságosan telepített GitHub write credential/deploy key. A lokális bare repo és az offsite Restic backup ettől függetlenül működik.

## DEV alapkomponensek

Telepített/ellenőrzött komponensek:

- Ubuntu 24.04
- Git 2.43
- Node.js 22.23.2
- npm 10.9.8
- pnpm 11.21.0
- PM2 7.0.3
- Nginx 1.24
- PostgreSQL client 16
- Certbot
- build-essential
- Puppeteer Chrome Headless Shell és szükséges Linux függőségek a vizuális smoke tesztekhez

PM2 process:

- `dimpro-benjadmin-m0-dev`
- port: `3100`
- runtime bind: `0.0.0.0`
- Nginx felől továbbra is loopback proxy: `127.0.0.1:3100`
- systemd PM2 startup/recovery: PASS

A `HOSTNAME=127.0.0.1` beállítás DEV Drop HTTPS rewrite esetén hibás belső HTTPS proxyzást okozott. A javított runtime bind `0.0.0.0`, amellyel a Drop DEV host HTTPS alatt is stabilan működik.

## Központi build koordináció

A korábbi koordinátor worktree-nként külön `.dimprover/locks` könyvtárat használt, ezért nem garantálta az egyidejű full build kizárását több worktree esetén.

Javítás:

- DEV környezetben közös koordinációs gyökér: `/srv/dimpro-dev/coordination`
- kizárólagos lock: `/srv/dimpro-dev/coordination/locks/exclusive-operation.lock`
- közös aktív műveleti állapot és history log
- két külön worktree-vel végzett lock teszt: PASS; a második művelet megvárta az első lock feloldását

Large DEV build tuning:

- build CPU quota: 200%
- build worker: 2 CPU
- Node old space: 4 GB
- MemoryHigh: 4 GB
- MemoryMax: 6 GB
- swap max: 1 GB

A régi 1.8 GB MemoryHigh korlát a Large DEV-en szükségtelen build-throttlingot okozott. A tuning után a koordinált Next.js build stabilan lefut.

## Build és statikus validáció

- `npm ci`: PASS
- `npx tsc --noEmit`: PASS
- `npm run lint`: PASS, 0 error; 108 meglévő warning
- izolált DEV production build: PASS
- központi lockon keresztüli production build: PASS
- végső izolált környezet build ID: `B_82Fa31MaPPh7NjaljGR`
- Next.js standalone asset ellenőrzés: 141 statikus chunk PASS

A build egy ismert Turbopack NFT warningot jelez a `next.config.ts` / release-center dinamikus fájlműveleti trace miatt; a build ettől sikeres. A warning későbbi refaktor feladatként kezelendő.

## DEV DNS, Nginx és TLS

Publikusan feloldódó DEV hostok:

- `dev.dimpro.hu`
- `app.dev.dimpro.hu`
- `drive.dev.dimpro.hu`
- `drop.dev.dimpro.hu`
- `projektkapu.dev.dimpro.hu`
- `license.dev.dimpro.hu`
- `auth.dev.dimpro.hu`
- `aruter.dev.dimpro.hu`

Mindegyik a `213.160.68.32` DEV VPS-re mutat.

TLS:

- Let’s Encrypt certificate: `dev.dimpro.hu`
- SAN hostok: a fenti nyolc aktív DEV hostname
- lejárat: 2026-11-07

Nginx hardening:

- csak explicit DEV hostok érik el az alkalmazást
- ismeretlen HTTP host: default deny
- ismeretlen HTTPS SNI: TLS handshake reject
- `mcp.dev.dimpro.hu` jelenleg nem kap véletlenül alkalmazásválaszt, amíg a külön MCP gateway nincs telepítve

Nyitott DNS pont:

- `admin.dev.dimpro.hu` továbbra sem rendelkezik publikus A rekorddal
- az Nginx konfigurációban elő van készítve, de TLS-be csak a DNS rekord létrehozása után vehető fel

## Explicit DEV host routing

A `proxy.ts` most felismeri a fő DEV hostokat, ezért a DEV környezet nem irányít át véletlenül PROD felületre.

Ellenőrzött példák:

- `app.dev.dimpro.hu/login` → DEV login
- `drive.dev.dimpro.hu/drive` → DEV login/auth gate
- `drop.dev.dimpro.hu/` → DEV Drop
- `projektkapu.dev.dimpro.hu/` → DEV login/auth gate
- `license.dev.dimpro.hu/` → DEV admin
- `aruter.dev.dimpro.hu/` → `https://app.dev.dimpro.hu/aruter`, belső port kiszivárgása nélkül

## DEV env izoláció

PROD `.env` vagy production secret nem került át a DEV VPS-re.

A DEV `.env.local` csak környezet-specifikus, nem production credential értékeket tartalmaz. Fő biztonsági elvek:

- Supabase URL: lokális placeholder; nincs PROD adatkapcsolat
- service-role secret: nincs DEV-ben
- Drive Object Storage: külön DEV bucket kijelölve, de credential nincs DEV-ben és mode `disabled`
- Drop Object Storage: külön DEV bucket kijelölve, de credential nincs DEV-ben és mode `disabled`
- Drop release gate: `false`
- Drop e-mail értesítés: `false`
- Drop Send: `false`
- Drop runtime stage: development
- Drop publikus DEV base URL: `https://drop.dev.dimpro.hu`
- általános DEV app URL: `https://app.dev.dimpro.hu`

Ez fail-closed állapot: a DEV build és UI működik, de nem írhat production adatba vagy production Object Storage-ba.

## Object Storage izoláció

A meglévő providerben külön, üres DEV bucket készült Drive és Drop számára. A bucket létrehozás egyszeri, PROD oldali credentiallel történt, a credential maga nem került át a DEV szerverre.

Ellenőrzés:

- Drive DEV bucket: létezik, objektumszám 0
- Drop DEV bucket: létezik, objektumszám 0
- DEV szerveren Object Storage credential: nincs
- DEV storage mód: disabled

Egy korai provisioning próbából létrejött extra üres bucketet a rendszer ürességellenőrzés után törölte; adat nem volt benne.

## DB VPS – PostgreSQL izoláció és mTLS

PostgreSQL 16 telepítve és aktív.

Külön adatbázisok és role-ok:

- `dimpro_dev` → owner `dimpro_dev`
- `dimpro_stag` → owner `dimpro_stag`
- `dimpro_prod` → owner `dimpro_prod`

Role-ok:

- login engedélyezett
- nem superuser
- nincs createdb
- nincs createrole
- nincs replication jog

PostgreSQL listener:

- `127.0.0.1`
- `213.160.68.33`

UFW 5432:

- DEV `213.160.68.32` engedélyezett
- PROD `213.160.68.24` engedélyezett
- más publikus forrás nincs engedélyezve

DEV adatkapcsolat:

- belső DIMPRO PostgreSQL CA
- DB szerver TLS certificate `db.dimpro.hu` SAN-nal
- DEV saját privát client key helyben generálva
- DEV CSR a DB VPS-en aláírva
- privát DEV client key nem hagyta el a DEV VPS-t
- `sslmode=verify-full` kapcsolat: PASS
- adatbázis: `dimpro_dev`
- role: `dimpro_dev`
- SSL aktív: PASS

A jelenlegi PROD továbbra is a meglévő Supabase PostgreSQL/API rendszert használja. PROD cutover nem történt és M0 alatt nem is történhet.

## Supabase-kompatibilis külön DEV backend

A korábbi M0 blokk feloldására külön hosted Supabase projekt készült kizárólag DEV célra.

- projekt: `dimpro-dev`
- régió: Central EU (Frankfurt), `eu-central-1`
- PROD Supabase-től teljesen külön projekt
- Session pooler: `aws-0-eu-central-1.pooler.supabase.com:5432`
- PostgreSQL kapcsolat DEV VPS-ről: PASS
- Project URL, legacy anon/service-role, új publishable/secret és DB-jelszó root-only titkos tárban
- DEV `.env.local` csak a külön DEV Supabase-t használja
- PROD Supabase secret nem került DEV-re

A migráció első futása két valós clean-install hibát tárt fel és fail-closed módon megállt:

1. A `20260802_*` fájlok lexikografikus sorrendje a `decide_core` migrációt a kötelező Project Core / Project Calendar előtt futtatta. Javítás: explicit, verziózott függőségi sorrend készült `supabase/DIMPRO_MIGRATION_ORDER_V1.txt` néven, hozzá automatikus szerződéses teszttel.
2. Az Identity Core V010 Project Core compatibility backfill friss adatbázisban is feltételezte a legacy `dimpro_companies` és `dimpro_account_users` táblákat. A migráció és bootstrap clean-install kompatibilis lett: legacy táblák hiányában nullable canonical organization/user hivatkozással folytat, meglévő legacy környezetben az eredeti bridge működés megmarad.

A Supabase projekt létrehozásakor az `Automatically expose new tables` biztonsági opció kikapcsolva maradt. Emiatt a trusted `service_role` sem kapta meg automatikusan a szükséges táblajogokat. Külön explicit migráció készült: `20260809214500_service_role_backend_grants_v010.sql`. Ez csak a szerveroldali `service_role` számára ad DML jogot; `anon`/`authenticated` automatikus táblakitettséget nem hoz létre.

Aktuális DEV adatbázis eredmény:

- public táblák: 68
- public függvények: 93
- RLS-enabled public táblák: 68
- Identity Core marker: `0.1.0`
- Project Core marker: `0.2.0`
- Drop storage marker: `DROP 0.5.0`
- Drop Identity consumer/admin bridge: `DROP 1.1.0`
- service-role PostgREST olvasás: HTTP 200
- Identity Core SQL acceptance: 24/24 PASS, tranzakció végén ROLLBACK
- Identity Core schema/security contract: PASS
- Project Core / Calendar / Drive / Dialog / Decide / Diary fő contract tesztek: PASS

Valós DEV Supabase környezettel a Next.js build PASS. Build ID: `JdxzQt-R_wMr3_deTbqTJ`. A `dimpro-benjadmin-m0-dev` PM2 folyamat újraindult és online.

Runtime smoke:

- `https://dev.dimpro.hu/login`: HTTP 200
- `https://app.dev.dimpro.hu/login`: HTTP 200
- `/api/dimpro-identity/health`: HTTP 200, `ready=true`
- Project/Drive health token nélkül HTTP 401: helyes védett viselkedés
- Drop health HTTP 200, de release/storage gate továbbra is szándékosan fail-closed

A Supabase DEV `public` sémáról PostgreSQL 17 klienssel custom-format logical dump készült, `pg_restore --list` validációval. A dump titkosított Restic offsite snapshotba került; snapshot: `570dce86`, restore-stream SHA-256 egyezés: PASS.

## DEV és DB offsite backup

Mindkét új VPS külön Storage Box SSH kulcsot és ugyanahhoz a titkosított Restic repositoryhoz elkülönített host-identitást kapott.

DEV backup:

- systemd service/timer: `dimpro-dev-backup`
- napi ütemezés: aktív
- source/worktree/repo/config/Nginx/TLS/PM2/SSH/firewall állapot mentése
- PostgreSQL DEV client certificate/private key és a külön Supabase DEV root-only secret készlet titkosított Restic snapshotba bekerül
- legfrissebb M0 checkpoint snapshot: `751a2ae0`
- legfrissebb snapshotból külön Nginx fájl restore teszt és byte-compare: PASS

DB backup:

- systemd service/timer: `dimpro-db-backup`
- napi ütemezés: aktív
- PostgreSQL globals + `dimpro_dev`, `dimpro_stag`, `dimpro_prod` logical dump
- `pg_restore --list` validáció
- PostgreSQL config és belső CA/TLS anyag titkosított Restic mentése
- checkpoint snapshot: `49210f27`
- `globals.sql` tényleges restore és byte-compare: PASS

## Desktop / tablet / mobil vizuális smoke

Puppeteer Chrome Headless Shell használatával három viewport készült:

- desktop: 1440×1000
- tablet: 1024×1366
- mobile: 390×844

Tesztelt felületek viewportonként:

- DEV login
- DEV admin root
- App DEV login
- Drop DEV root
- Drop DEV open
- Projektkapu DEV
- Drive DEV
- License DEV
- Árutér DEV

Eredmény:

- 27 vizuális smoke eset
- 27 PASS
- 0 page error
- 0 horizontal overflow
- 0 Internal Server Error

A képernyőképek és a `results.json` a DEV logkönyvtárban találhatók: `/srv/dimpro-dev/logs/m0-visual-smoke/`.

## M0 jelenlegi állapot és nyitott pontok

Az infrastruktúra-baseline és a külön Supabase DEV backend működik. A korábbi legnagyobb M0 blokkoló megszűnt: Identity/Core adatbázis és PostgREST funkcionális DEV validáció futtatható anélkül, hogy a PROD Supabase-hez írás történne.

M0-t még nem szabad teljesen lezártnak jelölni az alábbi pontok miatt:

1. Supabase Auth DEV kézi konfiguráció és valódi 6 számjegyű e-mail OTP end-to-end teszt még hátravan. A jelenlegi DIMPRO login `signInWithOtp` + `verifyOtp(type=email)` folyamatot használ; az e-mail sablonnak OTP tokent kell küldenie.
2. `admin.dev.dimpro.hu` publikus DNS A rekord még hiányzik.
3. DEV VPS GitHub write credential/deploy key még nincs telepítve; origin read működik, push nem.
4. DEV Object Storage írás továbbra is tudatosan disabled, amíg külön DEV-only storage credential nem kerül provisionálásra.

A következő közvetlen lépés a Supabase Auth DEV URL- és e-mail OTP sablon konfigurációja, majd egy engedélyezett DEV tesztfiókkal request/verify/session smoke. Ezután a teljes M0 funkcionális acceptance újrafuttatható és az M0 lezárható, ha a többi release-gate is teljesül.

## Biztonsági korlát

PROD-on a magas lemezhasználat ellenére régi build-, backup- és work-állomány nem törölhető addig, amíg a DEV/STAG migráció, a külső mentés és a szükséges restore-próbák nem igazoltak. PROD Supabase secret, production Object Storage credential vagy production write-jog nem használható a DEV funkcionális teszt megkerülésére.