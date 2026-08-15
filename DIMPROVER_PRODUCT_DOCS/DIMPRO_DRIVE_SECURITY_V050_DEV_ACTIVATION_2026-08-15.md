# DIMPRO Drive Security V0.5.0 – DEV aktiválás és valós acceptance

Dátum: 2026-08-15

## Cél

A DIMPRO Drive WEB/DESKTOP feltöltési folyamata ugyanazt a ClamAV alapú `clamd INSTREAM` vírusvizsgálati motort használja, amelyre a DIMPRO DROP vírusellenőrzése is épül. Nem készült párhuzamos, második vírusvédelmi engine.

A PROD DROP és a DEV DIMPRO alkalmazás külön VPS-en fut. A DEV Drive nem kapcsolódik át a PROD scannerhez; ugyanaz a ClamAV motor és ugyanaz a DIMPRO INSTREAM implementáció külön DEV daemonon fut.

## Infrastruktúra

DEV host:

- ClamAV engine: `1.5.3`
- freshclam: aktív
- clamd: aktív
- socket: `/var/run/clamav/clamd.ctl`
- `PING`: `PONG`
- DEV acceptance alatti signature version: `28093`
- `MaxScanSize`: 120 MB
- `MaxFileSize`: 110 MB
- `StreamMaxLength`: 110 MB
- Drive alkalmazásoldali scan limit: 100 MB
- `EnableVersionCommand`: true
- `EnableReloadCommand`: true
- `SelfCheck`: 600 s
- freshclam `NotifyClamd`: aktív
- kézi `RELOAD` próba: `RELOADING`

A helyes 68 byte-os EICAR tesztminta eredménye:

- `Eicar-Test-Signature FOUND`

Tiszta kontrollfájl eredménye:

- `OK`

## Biztonsági állapotmodell

Drive security scan státuszok:

- `PENDING`
- `SCANNING`
- `CLEAN`
- `INFECTED`
- `ERROR`

A scan audit az adott valós Drive upload session `metadata.driveSecurityScan` mezőjében marad meg. Tárolt adatok többek között:

- attempt
- startedAt / completedAt
- engine / engineVersion
- signatureVersion
- signatureName
- SHA-256
- bytesScanned
- errorCode / errorMessage
- scannerSource

Scanner source: `shared-drop-clamd`.

## Kötelező release workflow

Normál WEB/DESKTOP feltöltés:

1. signed PUT a privát S3 tárhelyre;
2. szerveroldali objektumméret ellenőrzés;
3. szerveroldali SHA-256 ellenőrzés;
4. verzió mindig `QUARANTINED` állapotban jön létre, a storage `active` módjától függetlenül;
5. automatikus ClamAV INSTREAM vizsgálat;
6. scan közbeni SHA-256 újraellenőrzés;
7. `CLEAN` esetén a verzió továbbra is karanténban marad;
8. külön emberi `APPROVE` szükséges;
9. APPROVE csak CLEAN scan + egyező SHA-256 mellett engedélyezett;
10. csak ezután lesz `AVAILABLE`;
11. preview és download csak CLEAN audit mellett engedélyezett.

`INFECTED` esetén:

1. ClamAV signature eltárolása;
2. automatikus `REJECT`;
3. meglévő Quarantine Review cleanup folyamat indul;
4. az S3 objektum törlődik;
5. a security audit megmarad.

Scanner hiba esetén:

- upload finalize nem vész el;
- a verzió karanténban marad;
- scan állapot `ERROR`;
- jóváhagyás fail-closed tiltott.

## DROP kompatibilitás

A DROP által Drive-ba archivált fájl külön trusted útvonal marad. A DROP pipeline már a saját ClamAV kapuján átengedett fájlt archivál, ezért a `documentSource=DROP` + `AVAILABLE` + S3 objektum kombináció nem fut újra kötelező Drive scanen.

Ez megakadályozza a dupla vizsgálatot, miközben a WEB/DESKTOP forrás szigorú CLEAN gate-et kap.

## Release-gate

`active` storage módban sem elég az adatbázis `AVAILABLE` státusza.

Nem-DROP dokumentum preview/download esetén a szerver újra ellenőrzi:

- van-e `CLEAN` Drive security audit;
- a scan SHA-256 egyezik-e a dokumentumverzió SHA-256 értékével.

Ezért a Security V0.5.0 előtti legacy WEB/DESKTOP AVAILABLE rekordok automatikusan blokkoltak, amíg nincs migrált/backfill security auditjuk.

DEV példa:

- régi V1/V2 security status: `PENDING`, preview: `409 DRIVE_REVIEW_SECURITY_SCAN_REQUIRED`;
- új V3/V4 security status: `CLEAN`, preview: `200`.

PROD aktiválás előtt a legacy WEB/DESKTOP állományokra külön re-quarantine/backfill migrációs terv szükséges. Ezt nem szabad a release-gate megkerülésével megoldani.

## UI

### Projektkapu Drive

- ClamAV scanner állapot megjelenik;
- karanténverzión külön vírusellenőrzés indítható;
- jóváhagyás scanner nélkül tiltott;
- fertőzött fájl automatikus elutasítása látható.

### DIMPRO Drive standalone web UI

- security health bekerült a Drive health típusba;
- feltöltés után megjelenik az automatikus scan eredménye;
- karanténverzión `Vírusellenőrzés`, `Jóváhagyás`, `Elutasítás` művelet érhető el;
- scanner kiesésnél fail-closed figyelmeztetés jelenik meg;
- APPROVE szerveroldalon CLEAN audit nélkül akkor is tiltott, ha a kliens hibásan próbálná meghívni.

## Forrás

Security source commit:

- `6b4ad96 feat(drive): gate releases with shared ClamAV`

Fő új komponensek:

- `app/lib/drive-core/securityScanRepository.ts`
- `app/lib/drive-core/securityScanService.ts`
- `app/api/projects/[projectId]/drive/documents/[documentId]/versions/[versionId]/security-scan/route.ts`
- `scripts/drive-security-v050-contract.mjs`

## Build

Aktív DEV build:

- `Es_1tfzv1TRIkUuW-Z17V`
- 245 standalone statikus chunk ellenőrizve

Aktív runtime:

- PM2: `dimpro-benjadmin-operator-ui-v2-dev`
- kötelező cwd: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`
- port: 3100
- host: 127.0.0.1
- storage mode: `active`
- security `activationSafe=true`

## Acceptance

Statikus / regressziós kapuk:

- Drive Security V0.5.0: **47/47 PASS**
- Drive/Compare: **173/173 PASS**
- Drive Workspace: **22/22 PASS**
- Drive Core V0.30: **24/24 PASS**
- Project Core: **19/19 PASS**
- BENJADMIN P7: **43/43 PASS**
- BENJADMIN P9 Security: **55/55 PASS**
- Runtime Identity Guard: **20/20 PASS**
- TypeScript: PASS
- célzott ESLint: PASS
- production build: PASS

### Valós ClamAV/S3 E2E – izolált exact build

Artifact:

`/srv/dimpro-dev/artifacts/drive-security-v050-real-e2e-2026-08-15T06-59-01-822Z`

Eredmény:

- **30/30 PASS**
- valós signed PUT
- valós S3 objektum
- valós ClamAV INSTREAM
- CLEAN PDF
- scan SHA-256 egyezés
- karantén jóváhagyás előtti preview tiltás
- emberi APPROVE
- AVAILABLE
- same-origin PDF preview
- HTTP Range 206
- EICAR felismerés
- `Eicar-Test-Signature`
- automatikus REJECT
- cleanup COMPLETED

### Aktív DEV post-cutover E2E

Az aktív 3100 runtime-on a teljes tiszta + EICAR lánc újra lefutott. Az eredeti teszt 29/30 értéket jelzett, mert a `legacy` kiválasztó az előző körben már CLEAN-re vizsgált V3-at választotta. Ez tesztlogikai hiba volt, nem termékhiba.

A célzott post-check igazolta:

- régi V1: PENDING → preview 409;
- régi V2: PENDING → preview 409;
- CLEAN V3: preview 200;
- CLEAN V4: preview 200;
- új EICAR: INFECTED → REJECTED + cleanup.

## Security Compare

Létrejött:

- `QA Security Compare`
- purpose: `COMPARE`
- tartalom: CLEAN `Sec.3` + CLEAN `Sec.4`

Aktív DEV valódi böngészős Compare artifact:

`/srv/dimpro-dev/artifacts/drive-security-v050-live-compare-2026-08-15T07-05-47-860Z`

Eredmény:

- **19/19 PASS**
- valós Drive API
- valós security-gated preview
- valódi PDF canvasok
- Sec.3 / Sec.4 historikus választás
- Side-by-side / Overlay elérhető
- nincs pageerror
- nincs vízszintes overflow
- PDF preview HTTP válaszok érvényesek

A Security QA PDF-ek szándékosan egyszerűek, ezért Auto Align esetén az explicit `nem javasolható` eredmény elfogadott. A korábbi geometriai Auto Align acceptance továbbra is külön igazolja a több alternatívás illesztést.

## Rollback

Forrás backup branch:

`backup/benjadmin-pre-drive-security-20260815_082904`

Biztonsági backup könyvtár:

`/srv/dimpro-dev/backups/drive_security_v050_20260815_082904`

Tartalmazza többek között:

- security előtti `.env.local`;
- `active` mód előtti `.env.local`;
- security előtti aktív `.next` release-t.

## Következő biztonsági feladat PROD előtt

A Security V0.5.0 előtti nem-DROP `AVAILABLE` Drive verziókat nem szabad automatikusan megbízhatónak tekinteni. PROD `active` kapcsolás előtt szükséges egy auditálható legacy backfill/re-quarantine migráció, amely a régi objektumokat ClamAV-val újraellenőrzi, és csak CLEAN eredménnyel ad nekik security auditot.
