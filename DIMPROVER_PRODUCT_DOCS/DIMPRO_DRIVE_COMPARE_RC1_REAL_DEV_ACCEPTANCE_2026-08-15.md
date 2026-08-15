# DIMPRO Drive + Compare RC1 – valós DEV acceptance

Dátum: 2026-08-15

## Összefoglaló

A DIMPRO Drive + Compare RC1 a BENJADMIN aktív DEV forráságába konfliktusmentesen beolvadt, majd valós DEV Supabase + S3 környezetben, kizárólag szintetikus QA tervdokumentumokkal end-to-end ellenőrzésre került.

A Drive feature merge commitja: `3efd40f3cad8920404865fe2101c197b45b55b57` (`merge(drive): integrate Drive Compare RC1 into BENJADMIN DEV`).

A merge előtti BENJADMIN forrás külön biztonsági branchként megmaradt: `backup/benjadmin-pre-drive-compare-20260815_081156`.

Az aktív DEV build: `TSfAJnYlrLhEvRpX2gNeR`.

## Project Core provider-hiba és javítás

A valós E2E első körében kiderült, hogy a Project Core file-backed providerrel futott, miközben a Drive Core kizárólag a Supabase `project_core_projects` táblát használja. Emiatt a projekt a webes Project Core felületen látszott, de a Drive mappa RPC `DRIVE_CORE_PROJECT_NOT_FOUND` / PostgreSQL `P0002` hibával leállt.

Az architektúra szerint a hivatalos Project Core provider Supabase, ezért a file állapot a meglévő admin bootstrap útvonalon migrálásra került.

Migráció előtti Supabase rekordok:

- projektek: 0
- tagságok: 0
- auditbejegyzések: 0

File → Supabase bootstrap eredménye:

- projektek: 2
- tagságok: 4
- eredeti auditbejegyzések: 2
- bootstrap: PASS

Migrált projektek:

- `d6-irodaepulet` – D6 Irodaépület
- `project-drive-compare-rc1-qa` – DIMPRO QA – Drive Compare RC1

Az aktív provider visszaállt az architektúrában előírt értékre:

`PROJECT_CORE_STORAGE_PROVIDER=supabase`

Provider/migráció backup:

`/srv/dimpro-dev/backups/drive_rc1_project_core_provider_fix_20260815_075614`

## Valós DEV QA projekt

A QA projekt kizárólag szintetikus tesztadatot tartalmaz; nem valós felhasználói vagy projektdokumentáció.

Projekt:

- id: `project-drive-compare-rc1-qa`
- kód: `QA-DRIVE-RC1`
- név: `DIMPRO QA – Drive Compare RC1`

Mappák:

- `01_Tervek`
- `02_Metszetek`

A valódi DEV S3 feltöltési folyamaton – signed PUT, HEAD, szerveroldali SHA-256, atomikus finalize és quarantine review – létrehozott dokumentumok:

1. `A-101_Alaprajz.pdf`
   - Rev.01 – AVAILABLE
   - Rev.02 – AVAILABLE
2. `A-201_Metszet.pdf`
   - Rev.01 – AVAILABLE

Összesen:

- mappák: 2
- dokumentumok: 2
- dokumentumverziók: 3
- metadata-only verzió: 0

## Compare CsomagBOX

Valós DB-backed Compare BOX:

- név: `QA Revízió Compare`
- purpose: `COMPARE`
- box id: `drive-box-3b9995391c7c`

A BOX ugyanazon A-101 dokumentum két külön történeti verziójára hivatkozik:

- Rev.01 – `drive-version-f136d665ded7`
- Rev.02 – `drive-version-b869ad66ab4d`

A fájl nem duplikálódik: a BOX `documentId + versionId` referenciát tárol.

## Valós S3 + Compare böngészős acceptance

A végső `TSfAJnYlrLhEvRpX2gNeR` build külön, csak `127.0.0.1:3210` candidate-en `DIMPRO_DRIVE_STORAGE_MODE=active` override-dal futott. Az aktív DEV biztonsági módja ettől nem változott.

Eredmény: **23/23 PASS**.

Ellenőrzött fő pontok:

- Rev.01 valódi preview init: PASS
- Rev.02 valódi preview init: PASS
- HTTP Range 206 mindkét verzión: PASS
- PDF MIME és `%PDF` tartalom: PASS
- `nosniff` biztonsági header: PASS
- QA projekt/mappák/CsomagBOX valós API-ból betöltve: PASS
- CsomagBOX → Összevetés: PASS
- ugyanazon dokumentum Rev.01 + Rev.02 történeti Compare: PASS
- két valódi PDF.js canvas render az S3 objektumokból: PASS
- Átfedés mód: PASS
- Auto Align valós generált terv-PDF-en: PASS
- Auto Align eredmény: **3 alternatíva**
- browser pageerror: 0

Artifact:

`/srv/dimpro-dev/artifacts/drive-compare-rc1-real-browser-2026-08-15T06-15-27-084Z`

## Aktív DEV storage biztonsági állapot

Az aktív `3100`-as DEV runtime továbbra is:

- `DIMPRO_DRIVE_STORAGE_MODE=quarantine`
- valós objektumfeltöltés: engedélyezett
- quarantine review: működik
- általános objektumletöltés/preview: tiltott

Az AVAILABLE QA PDF-re az aktív runtime preview kérés HTTP 503 / `DRIVE_OBJECT_PREVIEW_DISABLED` választ ad. Ez **elvárt biztonsági kapu**, nem Compare hiba.

Az `active` mód csak izolált tesztcandidate-en került használatra. Az architektúra szerint a közös DEV/éles letöltési mód csak vírusellenőrzés vagy dokumentált biztonsági jóváhagyás után kapcsolható be.

## BENJADMIN runtime identity guard

A végleges integráció nem irányítja át a BENJADMIN PM2 processzt másik worktree-re. A Drive feature közvetlenül a BENJADMIN aktív forráságába került.

Aktív PM2:

- process: `dimpro-benjadmin-operator-ui-v2-dev`
- cwd: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`
- port: 3100
- host: 127.0.0.1
- build: `TSfAJnYlrLhEvRpX2gNeR`
- restart count a záró ellenőrzéskor: 0

Runtime identity guard: PASS.

A build átemelésekor a másik worktree-re mutató standalone `.dimprover` symlinket a guard helyesen elutasította. A téves symlink eltávolítása után a start-script a BENJADMIN worktree saját központi `.dimprover` tárára mutató symlinket hozta létre, és a runtime stabilan elindult.

Runtime rollback backup:

`/srv/dimpro-dev/backups/benjadmin_drive_rc1_runtime_20260815_081613`

## Záró contract kapuk

- Drive web/Compare: **173/173 PASS**
- Drive Workspace V1.00: **22/22 PASS**
- Drive Core V0.30: **24/24 PASS**
- Project Core V0.20: **19/19 PASS**
- BENJADMIN Live Workspace P7: **43/43 PASS**
- Windows Bridge P8.1: **44/44 PASS**
- Windows Bridge P8.1 hardening: **30/30 PASS**
- Windows Bridge P8.1 package: **13/13 PASS**
- Terminal Hub P9 security: **55/55 PASS**
- BENJADMIN runtime identity guard: **20/20 PASS**

Aktív quarantine runtime audit artifact:

`/srv/dimpro-dev/artifacts/drive-compare-rc1-live-quarantine-2026-08-15T06-18-25-199Z`

## RC1 állapot

A Drive + Compare RC1 forrás- és adatoldali integrációja DEV-en elkészült. A rendszer már valós Supabase projektadaton, valós S3 objektumfeltöltéssel, valódi történeti verziókkal és DB-backed Compare CsomagBOX-szal validált.

A következő külön release-gate a Drive tárhely `active` letöltési/preview módjának biztonsági aktiválása. Ez nem kapcsolható be csak azért, hogy a Compare megjelenjen; előbb a dokumentált vírusellenőrzési/biztonsági kaput kell lezárni.
