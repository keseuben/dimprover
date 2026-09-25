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
