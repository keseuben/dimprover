# DIMPRO Projektkapu – DRIVE dokumentuméletciklus v0.1.0 DEV

**Dátum:** 2026-09-25
**Worker:** BENJAMINAI
**Task:** `dev-task-grid-22b48c4d9bae10e22e09`
**Környezet:** DEV ONLY · PROD DENY

## Cél

A meglévő Projektkapu DRIVE technikai verzióállapotainak és a dokumentum üzleti életciklusának szétválasztása anélkül, hogy a jelenlegi tárolási, review- vagy letöltési működést ebben a lépésben átírnánk.

## Audit megállapítás

A jelenlegi DRIVE modellben a `DriveVersionStatus` technikai állapotokat kezel:

- `METADATA_ONLY`
- `STAGED`
- `QUARANTINED`
- `AVAILABLE`
- `REJECTED`

A review jelenleg `QUARANTINED → AVAILABLE` vagy `QUARANTINED → REJECTED` technikai változást végez. A letöltés `AVAILABLE` állapothoz kötött. A DROP trusted archive út szintén képes `AVAILABLE` verziót létrehozni, ezért az `AVAILABLE` nem használható automatikusan formális `KIADOTT` üzleti státuszként.

## Bevezetett domain contract

Új, elkülönített üzleti életciklus:

`BEJOVO → ELLENORZES_ALATT → ERVENYES → KIADOTT → ARCHIV`

Külön döntési tengely:

`PENDING | APPROVED | REJECTED`

Külön kiadási tengely:

`NOT_ISSUED | ISSUED | WITHDRAWN | SUPERSEDED`

Külön technikai hozzáférési tengely:

`BLOCKED | INTERNAL | DOWNLOADABLE`

A compatibility projection szándékosan nem konvertálja az `AVAILABLE` állapotot `KIADOTT`-ra. A formális kiadáshoz később explicit, auditált issue rekord szükséges.

## Gap-mátrix

| Követelmény | Meglévő megoldás | Hiány | Következő irány |
|---|---|---|---|
| Feltöltési session | Megvan | nincs üzleti lifecycle mező | additív üzleti állapot |
| SHA-256 / méretellenőrzés | Megvan | S3 `versionId` nincs végig perzisztálva | storage ref bővítés |
| Security scan | Megvan | üzleti állapottól külön kell maradnia | külön scan tengely megtartása |
| Human review | Megvan | DRIVE review és DECIDE authoritative viszonya nincs lezárva | célzott döntés + integráció |
| Jóváhagyott dokumentum | technikailag `AVAILABLE` | `ERVENYES` nincs külön perzisztálva | üzleti lifecycle mező/rekord |
| Formális kiadás | nincs | `DocumentIssue`, címzettek, kiadó, időpont hiányzik | külön issue modell |
| Jogosult letöltés | project `document.read` + AVAILABLE | kiadási címzetti jogosultság nincs | issue-aware access gate |
| Direct incoming | nincs teljes reconciliation | DB-regisztráció nélküli objektum kockázat | idempotens incoming reconciliation |
| Audit | Project Core audit részben megvan | lifecycle/issue események hiányoznak | append-only lifecycle audit |
| S3 versioning | S3 helper PUT esetén lát `VersionId`-t | normál uploadnál DB modell nem őrzi | perzisztált object version ref |

## Fontos korlát

Ez a v0.1.0 lépés nem módosít adatbázist, nem futtat migrációt, nem változtat letöltési jogosultságot, nem deployol, és nem ér PROD erőforráshoz. A cél a domainhatár kódba rögzítése és regressziós contract létrehozása.


## 2026-09-25 – Document Flow V0.1.0 adatmodell-candidate

Elkészült a Projektkapu Dokumentumforgalom Pilot additív DEV adatmodell-candidate-je. A migráció még nincs alkalmazva.

Új perzisztens rétegek:
- dokumentumverzió governance: üzleti életciklus, review döntés, review mód, issue státusz, DROP provenance;
- formális dokumentumkiadás és kiadási sorszám;
- kiadási címzettek;
- S3 object `storage_version_id` helye a dokumentumverzió- és upload-session rekordokon.

Alapszabály: a technikai `AVAILABLE` nem jelent automatikusan `KIADOTT` állapotot. A jóváhagyás `ERVENYES` állapotot hoz létre; `KIADOTT` csak külön formális issue művelettel, legalább egy címzettel jöhet létre.

A DECIDE nem külön dokumentum-truth-source: a governance rekord marad authoritative, a DECIDE opcionális jóváhagyási workflow-ként kapcsolható.

Candidate:
- `supabase/migrations/20260925_drive_document_flow_v010.sql`
- `supabase/DIMPRO_PROJEKTKAPU_DRIVE_DOCUMENT_FLOW_V010_MIGRATION.sql`
- `scripts/drive-document-flow-v010-contract.mjs`

Contract: 21/21 PASS. Migráció futtatása külön jóváhagyásig tilos.
