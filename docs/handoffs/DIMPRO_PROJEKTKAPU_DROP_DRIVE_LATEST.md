# DIMPRO Projektkapu DROP/DRIVE – BENJAMINAI checkpoint

**Dátum:** 2026-09-25
**Task:** `dev-task-grid-22b48c4d9bae10e22e09`
**Worker:** `BENJAMINAI`
**Környezet:** DEV ONLY · PROD DENY

## Forrás

- Branch: `worker/benjaminai/dev-task-grid-22b48c4d9bae10e22e09`
- Worktree: `/srv/dimpro-dev/worktrees/worker-benjaminai-dev-task-grid-22b48c4d9bae10e22e09`
- Base HEAD: `eea3bbb8a08888b205728b795096cd3fb35684bf`
- Baseline: tiszta `feature/benjadmin-developer-grid-v013-outminai-20260905`
- PROD művelet: NEM

## Elvégzett audit

A meglévő DRIVE technikai alapok bizonyítottan jelen vannak:

- signed upload / download;
- szerveroldali méret- és SHA-256 ellenőrzés;
- `QUARANTINED` feltöltési állapot;
- security scan;
- `APPROVE / REJECT` review;
- `AVAILABLE / REJECTED` technikai verzióállapot;
- Project Core audit;
- DROP → DRIVE archive;
- DECIDE Core külön jóváhagyási modell.

Fő gap: a technikai `AVAILABLE` jelenleg nem különül el perzisztált `ERVENYES / KIADOTT` üzleti életciklustól, és nincs explicit kiadási rekord/címzetti modell.

## Első DEV patch

Új `app/lib/drive-core/lifecycle.ts` domain contract:

- üzleti státuszok: `BEJOVO → ELLENORZES_ALATT → ERVENYES → KIADOTT → ARCHIV`;
- review döntés külön tengely;
- issue státusz külön tengely;
- technikai availability külön tengely;
- legacy projection;
- `AVAILABLE` szándékosan nem mapelődik automatikusan `KIADOTT` állapotra;
- `REJECTED` döntési eredmény, nem lifecycle státusz.

A közös `drive-core/store.ts` exportálja az új contractot.

## Tesztek

- `node scripts/drive-lifecycle-v010-contract.mjs`: **9/9 PASS**
- `node scripts/drive-core-v030-contract.mjs`: **24/24 PASS**
- `node scripts/drive-object-storage-v040-contract.mjs`: **29/29 PASS**
- `node scripts/decide-core-v070-contract.mjs`: **82/82 PASS**
- `node scripts/drive-quarantine-review-v041-contract.mjs`: **28/29**, egy már meglévő, patchtől független CSS minimum-font ellenőrzés bukik.
- `git diff --check`: **PASS**

A teljes TypeScript/lint/build ebben a körben nem futtatható biztonságosan: a DEV worker worktree-ben nincs dependency install, a VPS gyökérlemeze **99%** kihasználtságú (~957 MB szabad). Emiatt dependency install vagy build most nem indítható a Storage Governor elvével összhangban.

## Következő egyetlen lépés

Additív DEV adatmodell-terv és migrációs candidate készítése a perzisztált dokumentuméletciklus + issue rekord + S3 object version reference számára. Migrációt még nem szabad futtatni. Előtte az authoritative review kapcsolatot úgy kell kialakítani, hogy a meglévő DRIVE review és DECIDE ne tárolja ugyanazt a döntést két eltérő truth source-ként.


## 2026-09-25 – Document Flow V0.1.0 candidate elkészült

A DEV worktree-ben elkészült az additív dokumentumforgalmi adatmodell. A candidate migráció nem lett alkalmazva adatbázisra és PROD művelet nem történt.

Contract: 21/21 PASS.

Következő fejlesztési blokk:
1. DROP → DRIVE beérkező service a meglévő `Beérkező Drop` projektmappára építve;
2. új külső fájl: CLEAN DROP objektum → külön DRIVE bucket → `QUARANTINED` DRIVE verzió;
3. provenance: Drop package/file azonosító → governance;
4. DRIVE security scan;
5. meglévő review után governance `ERVENYES/REJECTED` szinkron;
6. csak külön formális kiadás után `KIADOTT`.


## 2026-09-25 – DROP → DRIVE Incoming V0.1.0 runtime candidate

Aktuális megvalósítás:
- `app/lib/drop/archive/dropDriveIncomingService.ts`
- `app/lib/drive-core/documentFlowRepository.ts`
- `app/lib/drive-core/documentFlowSchema.ts`
- feature flag: `DROP_DRIVE_INCOMING_ENABLED`
- Beküldőkapu finalize hook + idempotens finalized retry reconciliation
- DRIVE review → document governance szinkron
- S3 HeadObject VersionId továbbvezetés és perzisztálási hely
- külön DRIVE bucket másolat, server SHA-256, `QUARANTINED` célállapot
- DROP provenance: packageId + fileId + incoming idempotency key

Tesztállapot:
- document-flow 23/23 PASS
- drop-drive-incoming 22/22 PASS
- drive-core 24/24 PASS
- object-storage 29/29 PASS
- decide-core 82/82 PASS
- diff-check PASS

Nem történt:
- Document Flow SQL migráció futtatása
- feature flag aktiválás
- DEV/PROD deploy
- PM2 restart

Következő blokk: Projektkapu DRIVE API/UI governance nézet és formális Kiadás művelet. Az API-ban a meglévő Project Core permission mintát kell használni; a `KIADOTT` állapot csak a DocumentIssue RPC-n keresztül jöhet létre.


## 2026-09-25 – Document Flow API/UI candidate

Elkészült:
- project-scope document-flow read API;
- formális Kiadás API `document.approve` permissionnel;
- DRIVE health documentFlow readiness;
- üzleti státusz badge-ek a Drive listában;
- Kiadás gomb csak `AVAILABLE + ERVENYES + APPROVED + NOT_ISSUED` állapotban;
- kiadási sorszám megjelenítése a `KIADOTT` dokumentumnál.

Új contract: `scripts/drive-document-flow-api-ui-v010-contract.mjs` → 11/11 PASS.

A pilot jelenleg a kiadási rekordot és címzetteket kezeli, de külső címzetti e-mail/letöltőkapu még nincs bekötve.

Blokkoló a tényleges böngészős E2E előtt: a Document Flow SQL candidate még nincs alkalmazva, és a `DROP_DRIVE_INCOMING_ENABLED` feature flag nincs aktiválva. Ezekhez külön engedély szükséges.


## 2026-09-25 – Git / Central Grid / Dev Center Engine szinkron helyreállítás

A Projektkapu task központi rögzítése helyre lett állítva.

Task:
- `dev-task-grid-22b48c4d9bae10e22e09`
- worker: `BENJAMINAI`
- Grid session: `grid-work-dev-task-grid-22b48c4d9bae10e22e09-benjaminai`
- branch: `worker/benjaminai/dev-task-grid-22b48c4d9bae10e22e09`
- worktree: `/srv/dimpro-dev/worktrees/worker-benjaminai-dev-task-grid-22b48c4d9bae10e22e09`
- source checkpoint a jelen handoff-frissítés előtt: `7b74aec4ebf83e9e424ebe51a3c4efb80588d927`

Rendezett állapot:
- local worker branch pusholva az `origin` remote-ra;
- local és remote HEAD a source checkpointnál egyezett;
- Central Grid Projectkapu worker session: `3/6 TESZTELÉS`;
- Central Grid source state: `VERIFIED`;
- BOOT ACK: `VALIDATED`;
- korábbi stale BOOT ACK blocker evidence feloldva;
- unresolved Grid blocker: 0;
- Dev Center Engine task új aktív BenjáminAI sessionnel helyreállítva;
- engine session: `dev-session-fc723dc8-f48`;
- engine task status: `testing`;
- bridge state: `RESULT_PENDING`;
- workflow state: `TESTING`.

Fontos: a Developer Gridben más worker taskja lehet az aktuális globális task pointer. A Projektkapu task ettől függetlenül külön aktív BenjáminAI sessionként követett. Más worker globális taskját **tilos felülírni vagy elvenni** a Projektkapu szinkron kedvéért.

A további csevegőváltások és fejlesztési blokkok kötelező általános protokollja:

`docs/handoffs/BENJADMIN_ALTALANOS_CSEVEGOVALTO_GRID_FOLYTATASI_PROMPT_V2.md`

A jelen handoff-frissítést tartalmazó commit SHA önhivatkozás miatt nem kerül ebbe a fájlba; a commit után a final HEAD-et külön Git/remote/Grid ellenőrzés rögzíti.

Következő fejlesztési lépés továbbra is: DEV Document Flow migrációs gate + DEV runtime E2E, PROD DENY.


## 2026-09-25 – Document Flow V0.1.0 migration gate / REST probe

Elkészült a DEV-only migrációs biztonsági kapu:

- `scripts/drive-document-flow-v010-migration-gate.mjs`
- `scripts/drive-document-flow-v010-rest-probe.mjs`
- `scripts/drive-document-flow-v010-migration-gate-contract.mjs`

A gate:
- canonical DEV Supabase project refet ellenőriz;
- a migráció SHA-256 értékét rögzítetten ellenőrzi;
- PROD-ref egyezés esetén fail-closed blokkol;
- PostgreSQL credential nélkül nem futtat SQL-t;
- apply előtt külön explicit DEV approval phrase szükséges;
- apply előtt `pg_dump` backupot készít és `pg_restore -l` ellenőrzést futtat;
- a meglévő document/version/upload rekordszámokat védi;
- utóellenőrzi a Document Flow táblákat, marker verziót, RLS-t és service-role-only RPC jogokat.

Aktuális DEV runtime probe eredmény:
- canonical DEV projekt: igazolt;
- Document Flow readiness: `false`;
- `drive_core_document_governance`: PGRST205 / nincs alkalmazva;
- `drive_core_document_issues`: PGRST205 / nincs alkalmazva;
- `drive_core_document_issue_recipients`: PGRST205 / nincs alkalmazva;
- marker rekord: még nincs;
- SQL apply: **nem történt**;
- blokkoló ok: `DRIVE_DOCUMENT_FLOW_V010_DB_CREDENTIAL_REQUIRED`.

Contract:
- migration gate: 13/13 PASS;
- REST probe: read-only;
- `git diff --check`: PASS.

Következő: DEV runtime candidate/build ellenőrzés a séma nélkül is fail-closed health viselkedéssel; a tényleges SQL apply csak DEV DB credential rendelkezésre állásakor.


## 2026-09-25 – Interaktív DEV migration apply helper

Elkészült:
- `scripts/drive-document-flow-v010-dev-apply-interactive.sh`
- `scripts/drive-document-flow-v010-dev-apply-interactive-contract.mjs`

A helper:
- kizárólag `dimpro-dev` hoston fut;
- a DEV Supabase PostgreSQL-jelszót `read -s` módban kéri be;
- a jelszót nem írja ki és nem menti fájlba;
- EXIT trapben törli a jelszó és approval környezeti változókat;
- preflight után külön `APPLY` megerősítést kér;
- ezután backup + apply + verify + REST readiness probe sorrendben fut;
- PROD deploy/restart/parancsot nem tartalmaz.

Contract: 10/10 PASS.
A helper létrehozása önmagában nem futtatott SQL migrációt.


## 2026-09-25 – DROP → DRIVE pilot readiness a Projektkapu DRIVE felületen

A DRIVE health API és a DriveWorkspace most külön, összesített pilot readiness állapotot ad a külső Beküldőkapu → DRIVE folyamatra.

A readiness csak akkor `ready=true`, ha egyszerre teljesül többek között:
- DROP runtime elérhető;
- DROP release gate aktív;
- `DROP_DRIVE_INCOMING_ENABLED` aktív;
- Beküldőkapu és public upload kész;
- DROP vírusellenőrzés és objektumtárhely kész;
- DRIVE Document Flow 0.1.0 kész;
- DRIVE quarantine review kész;
- DRIVE objektumtárhely írható.

A health válasz `dropDriveIncoming.blockers` mezőben explicit blocker kódokat ad, és `nextStep` mezővel a következő szükséges lépést jelzi. A health végpont **nem kapcsolja be** a feature flaget.

A Drive „Rendszerállapot és haladó műveletek” panelen új „DROP → DRIVE beérkező · pilot” kártya jelenik meg:
- pilot kész / blokkolók száma;
- feature aktív / feature zárva;
- következő szükséges lépés.

Ellenőrzés:
- pilot readiness contract: 11/11 PASS;
- módosított health route TypeScript syntactic check: PASS;
- módosított DriveWorkspace TSX syntactic check: PASS;
- Document Flow, DROP→DRIVE, API/UI, DRIVE Core, Object Storage és DECIDE regressziós contractok: PASS;
- `git diff --check`: PASS.

A DEV SQL blocker továbbra is valós: a Document Flow 0.1.0 séma még nincs alkalmazva.


## 2026-09-25 – DRIVE üzleti státusz szűrő / ellenőrzési sor

A Drive dokumentumlistában külön üzleti státusz-szűrő készült a napi projektvezetői munkához.

Szűrők:
- Mind;
- Ellenőrzésre vár: BEJOVO / ELLENORZES_ALATT / PENDING;
- Érvényes: ERVENYES + APPROVED;
- Kiadott: KIADOTT vagy ISSUED;
- Elutasított: REJECTED;
- Archív: ARCHIV.

A szűrő a meglévő mappa-, forrás- és szöveges keresés után működik, ezért például külön megnyitható a Beérkező Drop mappa, majd azon belül csak az ellenőrzésre váró dokumentumok. Minden státuszgomb saját darabszámot mutat az aktuális alapnézetre.

A státuszsáv csak aktív Document Flow esetén jelenik meg; mobilon vízszintesen görgethető.

Ellenőrzés:
- business filter contract: 11/11 PASS;
- DriveWorkspace TSX syntactic TypeScript check: PASS;
- pilot readiness / Document Flow API-UI / DROP→DRIVE regresszió: PASS;
- `git diff --check`: PASS.


## 2026-09-25 – Projektkapuhoz kötött Beküldőkapu V0.1.0

A Projektkapu DRIVE felületből közvetlenül kezelhető projektkötött külső Beküldőkapu készült.

Új projekt-scope API:
- `GET /api/projects/[projectId]/drop/submission-gates`
- `POST /api/projects/[projectId]/drop/submission-gates`
- `PATCH /api/projects/[projectId]/drop/submission-gates`

Biztonsági és scope-szabályok:
- `document.write` projektjogosultság kötelező;
- a kliens nem adhat meg tetszőleges `projectId` értéket;
- a route az URL-ben lévő, jogosultsággal ellenőrzött projektet kényszeríti rá;
- gate type mindig `project`;
- projekt neve a Project Core-ból származik;
- a Drive célmappa mindig `Beérkező Drop`;
- egy projektkapuhoz pontosan egy belső címzett kerül átadásra;
- a külső link védelme `link_pin`;
- létrehozás és újraaktiválás csak teljes DROP → DRIVE readiness mellett engedett;
- lezárás readiness hiba esetén is elvégezhető;
- más projekthez tartozó gate PATCH művelete scope mismatch hibával blokkolódik.

Drive UI:
- új `Beküldőkapu` gomb a DRIVE fejlécben;
- projektkapu létrehozó űrlap;
- belső címzett név/e-mail;
- megőrzési idő;
- külső feltöltőnek szóló leírás;
- létrehozott publikus link másolása és megnyitása;
- meglévő projektkapuk listája;
- lezárás és readiness esetén újraaktiválás;
- mobilbarát megjelenítés.

A létrehozó UI fail-closed: amíg a Document Flow / DROP → DRIVE pipeline nem kész, az új kapu létrehozása tiltott, de a meglévő kapuk listája és lezárása elérhető.

Ellenőrzés:
- Project Drop gate route contract: 16/16 PASS;
- Project Drop gate UI contract: 15/15 PASS;
- route TypeScript syntactic check: PASS;
- DriveWorkspace TSX syntactic check: PASS;
- health import/export paths ellenőrizve;
- pilot readiness / business filter / DROP→DRIVE / Document Flow API-UI / Document Flow schema / DRIVE Core / Object Storage / DECIDE regresszió: PASS;
- `git diff --check`: PASS.

A DEV Document Flow SQL továbbra sem került alkalmazásra; a PostgreSQL credential blocker változatlanul nyitva marad.


## 2026-09-25 – Projekt Beküldőkapu audit / fail-closed visszaállítás

A Project Core repository közös, providerfüggetlen `recordProjectAuditEvent` író képességet kapott:
- Supabase-backed repository;
- file-backed DEV fallback;
- közös repository contract.

A Beküldőkapu projektműveletek auditáltak:
- `PROJECT_DROP_GATE_CREATED`;
- `PROJECT_DROP_GATE_REVOKED`;
- `PROJECT_DROP_GATE_REACTIVATED`.

Az audit a meglévő `entity_type = project` típust használja, ezért új audit entity-type SQL migráció nem szükséges. A gate azonosító, slug, célmappa, státusz és releváns technikai adatok metadata mezőbe kerülnek; címzetti e-mail nem kerül az audit metadata-ba.

Fail-closed viselkedés:
- ha új kapu létrejön, de a Project Core audit nem menthető, a rendszer az új kaput automatikusan lezárja;
- állapotváltás audit-hibánál a kapu előző aktív/lezárt állapota visszaáll;
- lejárt kapu API-ról sem aktiválható újra;
- audit hiba `PROJECT_DROP_GATE_AUDIT_FAILED` hibakóddal állítja meg a műveletet.

Ellenőrzés:
- Project Drop gate audit contract: 15/15 PASS;
- route + Project Core repository fájlok TypeScript syntactic check: PASS;
- Project Core V0.2.0 contract: PASS;
- Project Drop route/UI, pilot readiness, business filter, DROP→DRIVE, Document Flow, DRIVE Core, Object Storage, DECIDE célzott regresszió: PASS;
- `git diff --check`: PASS.


## 2026-09-25 – Projektkapu DROP → DRIVE live pilot preflight

Elkészült a read-only céges pilot előellenőrző:

- `scripts/projectkapu-drop-drive-pilot-preflight.mjs`
- `scripts/projectkapu-drop-drive-pilot-preflight-contract.mjs`

A preflight kizárólag DEV célra készült. A DEV hostot és a canonical Supabase project refet ellenőrzi, titokértékeket nem ír ki, konfigurációt nem módosít, SQL-t nem futtat, és a Supabase ellenőrzéseket read-only REST GET kérésekkel végzi.

Contract: **14/14 PASS**.

Aktuális élő DEV eredmény: **nem pilotkész, 15 blocker**.

Blockerek:
1. `DROP_RELEASE_GATE_DISABLED`
2. `DROP_PACKAGE_ENGINE_DISABLED`
3. `DROP_ACCESS_GATE_DISABLED`
4. `DROP_EMAIL_NOTIFICATIONS_DISABLED`
5. `DROP_STORAGE_CORE_DISABLED`
6. `DROP_QUARANTINE_UPLOAD_DISABLED`
7. `DROP_SUBMISSION_GATE_DISABLED`
8. `DROP_DRIVE_INCOMING_DISABLED`
9. `DROP_PUBLIC_UPLOAD_FEATURE_DISABLED`
10. `DROP_TOKEN_SECURITY_NOT_CONFIGURED`
11. `DROP_WORKER_SECRET_NOT_CONFIGURED`
12. `DROP_SCANNER_MODE_NOT_READY`
13. `DROP_STORAGE_NOT_ACTIVE`
14. `DROP_MAIL_PROFILE_NOT_READY`
15. `DRIVE_DOCUMENT_FLOW_SCHEMA_NOT_READY`

Figyelmeztetés:
- `DEV_DB_CREDENTIAL_REQUIRED_FOR_DOCUMENT_FLOW_MIGRATION`

Már kész / igazolt:
- canonical DEV host és Supabase projekt;
- Supabase service role konfigurálva;
- ClamAV socket létezik;
- DROP S3-compatible storage konfigurálva, jelenleg `quarantine` módban;
- DROP és DRIVE bucket/credential izoláció rendben;
- DRIVE storage konfigurálva és írható, jelenleg `quarantine`;
- `DROP_PUBLIC_BASE_URL` explicit konfigurálva;
- DROP core schema jelen van;
- DROP storage schema: `DROP 0.5.0`;
- DROP public workflow schema: `DROP 0.9.5`;
- public submission gate tábla read-only REST-ből elérhető;
- DRIVE object storage schema: `0.4.0`;
- DRIVE quarantine review schema: `0.4.1`.

A jelenlegi blockerlista alapján több akadály konfiguráció/aktiválás, nem forráskódhiba. A Document Flow SQL és a titokértékek hiánya miatt a feature flageket továbbra sem szabad vakon aktiválni.
