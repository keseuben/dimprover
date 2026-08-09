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
- jelenlegi infra commit: `c60424610e8a39904bba8dbfd45ab6c5145ed484`

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

## Fontos adatoldali korlát

A jelenlegi DIMPRO/DIMPROVER modulok jelentős része `@supabase/supabase-js` / Supabase Auth / PostgREST szerződésre épül. A nyers PostgreSQL 16 adatbázis önmagában nem helyettesíti ezt az API/Auth réteget.

Ezért a DEV VPS szándékosan nem kapott PROD Supabase service-role secretet. Az eredmény:

- build/UI/shell smoke működik
- raw PostgreSQL DEV kapcsolat működik
- PROD adat írása kizárt
- teljes adatbázis-, auth-, Project Core-, Drive Core- és Identity Core funkcionális regresszió még nem végezhető el
- `/api/dimpro-identity/health` DEV alatt helyesen HTTP 503-at ad `DIMPRO_IDENTITY_DATABASE_CONFIG_MISSING` állapottal

Az M0 teljes elfogadásához külön Supabase-kompatibilis DEV backend szükséges, vagy külön jóváhagyott repository/API migráció a központi PostgreSQL felé. Ezt nem szabad a PROD Supabase bekötésével megkerülni.

## DEV és DB offsite backup

Mindkét új VPS külön Storage Box SSH kulcsot és ugyanahhoz a titkosított Restic repositoryhoz elkülönített host-identitást kapott.

DEV backup:

- systemd service/timer: `dimpro-dev-backup`
- napi ütemezés: aktív
- source/worktree/repo/config/Nginx/TLS/PM2/SSH/firewall állapot mentése
- PostgreSQL DEV client certificate/private key titkosított Restic snapshotba bekerül
- legfrissebb M0 checkpoint snapshot: `a0e897f5`
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

Az infrastruktúra-baseline stabil és izolált. Elkészült:

- PROD audit
- külső backup és restore teszt
- migrációs osztályozás
- tényleges PROD állapotból tiszta Git baseline
- Large DEV VPS alapozás
- szelektív forrásmigráció
- külön worktree/repo struktúra
- központi build lock
- DEV-specifikus build tuning
- explicit DNS-host routing
- TLS
- PM2 recovery
- Nginx default deny
- külön DEV/STAG/PROD PostgreSQL struktúra
- DEV→DB mTLS
- külön DEV Object Storage targetek fail-closed módban
- DEV/DB automatikus offsite backup + restore teszt
- TypeScript/lint/build smoke
- desktop/tablet/mobile vizuális smoke

M0-t még nem szabad teljesen lezártnak jelölni az alábbi pontok miatt:

1. Külön Supabase-kompatibilis DEV backend hiányzik, ezért a meglévő adat/auth modulok teljes funkcionális regressziója nem végezhető el biztonságosan.
2. `admin.dev.dimpro.hu` publikus DNS A rekord még hiányzik.
3. DEV VPS GitHub write credential/deploy key még nincs telepítve; origin read működik, push nem.

Az 1. pont M0 acceptance blocker, mert a B3 kifejezetten előírja a meglévő modulok funkcionális DEV validálását. A 2–3. pont előkészített, külön kezelhető infrastruktúra-feladat.

## Következő lépés

A legkisebb kockázatú folytatás külön Supabase DEV projekt/backend létrehozása, majd a szükséges schema/migration snapshot alkalmazása erre a DEV backend-re. Ezután:

1. DEV-only Supabase URL/anon/service-role secret biztonságos szerveroldali telepítése.
2. Identity Core, Project Core, Drive Core, Drop és auth schema/readiness tesztek.
3. Jogosultság- és írási regresszió kizárólag DEV adatokkal.
4. M0 teljes acceptance.
5. Csak ezután BENJADMIN M1 shell/login/protective screen fejlesztés.

## Biztonsági korlát

PROD-on a magas lemezhasználat ellenére régi build-, backup- és work-állomány nem törölhető addig, amíg a DEV/STAG migráció, a külső mentés és a szükséges restore-próbák nem igazoltak. PROD Supabase secret, production Object Storage credential vagy production write-jog nem használható a DEV funkcionális teszt megkerülésére.