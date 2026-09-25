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


## 2026-09-25 – DROP → DRIVE Beérkező V0.1.0

Elkészült a Projektkapu Dokumentumforgalom Pilot első runtime összekötése DEV candidate-ként.

A Beküldőkapu (`submission_gate`) projektkapcsolt, véglegesített csomagja a külön `DROP_DRIVE_INCOMING_ENABLED` feature flag mellett automatikusan átadható a Projektkapu DRIVE részére.

A beérkező útvonal:
1. csak véglegesített, projekthez kapcsolt Beküldőkapu csomagot kezel;
2. minden aktív fájlnál CLEAN DROP security/virus állapotot követel;
3. a projekt meglévő `Beérkező Drop` mappáját használja;
4. a DROP objektumot a DRIVE saját bucketjébe másolja;
5. szerveroldali SHA-256 ellenőrzést végez;
6. a DRIVE verziót `source=DROP`, `QUARANTINED` technikai állapotban finalizálja;
7. eltárolja a Drop package/file provenance-t és – ha a tárhely szolgáltatja – az S3 VersionId-t;
8. a governance állapot `ELLENORZES_ALATT / PENDING`;
9. a meglévő DRIVE review jóváhagyás után `ERVENYES / APPROVED`, elutasításkor `ELLENORZES_ALATT / REJECTED`;
10. `KIADOTT` továbbra is kizárólag külön formális dokumentumkiadási RPC-vel hozható létre.

Az import idempotens `dropIncomingKey` alapján, és a már véglegesített DROP csomag ismételt véglegesítési kérése reconciliation célból újra ellenőrzi a DRIVE beérkezést. Lejárt INITIATED munkamenet kontrolláltan újraindítható.

A külső beküldő véglegesítését a belső DRIVE import hibája nem teszi sikertelenné: a belső szinkron fail-soft, külön `drive.incoming.completed` / `drive.incoming.failed` audit eseménnyel.

DEV ellenőrzések:
- Document Flow contract: 23/23 PASS
- DROP → DRIVE Incoming contract: 22/22 PASS
- DRIVE Core: 24/24 PASS
- DRIVE Object Storage: 29/29 PASS
- DECIDE Core: 82/82 PASS
- `git diff --check`: PASS

A régi DROP 0.8.0 / 0.9.1 contractok exact régi verziószámot várnak, ezért a jelenlegi DROP 1.2.13 baseline-on eleve hibásak. A DRIVE quarantine review contract ismert baseline CSS ellenőrzése 28/29. Ezeket ez a fejlesztés nem módosította.

A Document Flow migráció továbbra sincs alkalmazva, a `DROP_DRIVE_INCOMING_ENABLED` nincs aktiválva, deploy/restart nem történt.


## 2026-09-25 – Document Flow API/UI V0.1.0

A dokumentumforgalmi pilothoz elkészült a DEV API/UI réteg candidate-je.

Új API:
- `GET /api/projects/[projectId]/drive/document-flow` – `document.read` jogosultsággal betölti a governance és formális kiadási állapotokat;
- `POST /api/projects/[projectId]/drive/documents/[documentId]/versions/[versionId]/issue` – `document.approve` jogosultsággal formális kiadást hoz létre.

A DRIVE health válasz külön `documentFlow` blokkban jelzi, hogy a 0.1.0 adatmodell aktív-e.

A DRIVE felületen a dokumentum technikai státusza mellett megjelenhet az üzleti státusz:
- Bejövő
- Ellenőrzés alatt
- Érvényes
- Kiadott
- Archív

A `Kiadás` művelet csak akkor jelenik meg, ha:
- a felhasználónak `document.approve` jogosultsága van;
- a Document Flow séma aktív;
- a verzió technikailag `AVAILABLE`;
- a governance `ERVENYES + APPROVED`;
- még nincs aktív `ISSUED` kiadás.

A pilot UI-ban a címzettek e-mail címmel adhatók meg; a művelet jelenleg auditált formális kiadási rekordot és címzettlistát hoz létre. Ez a blokk még nem küld külön kiadási e-mailt, és nem hoz létre külső címzetti letöltőkaput.

Ellenőrzés:
- Document Flow schema contract: 23/23 PASS
- DROP → DRIVE Incoming: 22/22 PASS
- Document Flow API/UI: 11/11 PASS
- DRIVE Core: 24/24 PASS
- Object Storage: 29/29 PASS
- DECIDE Core: 82/82 PASS
- módosított TS/TSX fájlok TypeScript syntactic transpile check: PASS
- `git diff --check`: PASS

Teljes `tsc --noEmit` nem zárult le a DEV-en a korábbi megosztott dependency-kísérlet időtúllépése miatt; ezt nem tekintjük PASS-nak. Migráció/deploy/restart továbbra sem történt.
