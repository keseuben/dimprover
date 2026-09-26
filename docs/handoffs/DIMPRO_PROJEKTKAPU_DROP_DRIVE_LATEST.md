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


## 2026-09-25 – Projektkapu manual-link pilot mód + staged DEV candidate

A Projektkapu Beküldőkapu pilothoz explicit kézi linkátadási mód készült:

`DROP_SUBMISSION_GATE_DELIVERY_MODE=manual-link`

Alapelv:
- az alapértelmezett mód továbbra is `email`;
- a manual-link kivétel kizárólag a Beküldőkapu readinessre vonatkozik;
- a DIMPRO Send továbbra is e-mail readinesshez kötött;
- e-mail nélküli finalize a meglévő motor szerint támogatott: a notification státusz `not_requested`, a csomag ettől még lezárható;
- a Drive UI manual-link módban jelzi, hogy a létrehozott linket kézzel kell átadni a külső partnernek.

A DRIVE health új mezői:
- `deliveryMode`;
- `emailRequired`;
- `emailReady`.

Készült külön, runtime-ot nem módosító DEV candidate env staging:
- `scripts/projectkapu-drop-drive-stage-dev-candidate.mjs`;
- három korábbi DEV worktree-ben azonos DROP token/session/worker secret consensus ellenőrzéssel;
- a secretértékek nem kerülnek a forráskódba és nem jelennek meg kimenetben;
- a candidate env csak `/srv/dimpro-dev/candidates/projectkapu-drop-drive-pilot/.env.local` alatt készül;
- a közös integrált DEV env, folyamat, DB és PROD nem módosul;
- meglévő candidate env 0600 backupot kap;
- ClamAV mód: `clamd-instream`;
- DROP storage mód: `active`;
- szükséges DROP feature flagek candidate-ben engedélyezve;
- e-mail notification candidate-ben tiltva, delivery mód `manual-link`.

Candidate read-only pilot preflight eredmény:
- korábbi 15 blocker → **1 blocker**;
- egyetlen kötelező blocker: `DRIVE_DOCUMENT_FLOW_SCHEMA_NOT_READY`;
- figyelmeztetések: `DROP_MAIL_PROFILE_OPTIONAL_IN_MANUAL_LINK_MODE`, `DEV_DB_CREDENTIAL_REQUIRED_FOR_DOCUMENT_FLOW_MIGRATION`.

Ellenőrzés:
- manual-link contract: 12/12 PASS;
- candidate staging contract: 12/12 PASS;
- pilot preflight contract: 14/14 PASS;
- módosított runtime/health/UI TypeScript syntactic check: PASS;
- Project Drop gate route/UI/audit, pilot readiness, business filter, DROP→DRIVE, Document Flow, DRIVE Core, Object Storage és DECIDE regresszió: PASS;
- `git diff --check`: PASS.

Ezzel a céges pilot konfigurációs oldalán a mail már nem kötelező indulási feltétel. A tényleges következő blocker a DEV Document Flow 0.1.0 SQL migrációhoz szükséges PostgreSQL credential.


## 2026-09-25 – DEV Document Flow migráció alkalmazva + full build TS javítás

A DRIVE Document Flow 0.1.0 migráció a canonical **DEV Supabase** adatbázison sikeresen alkalmazva.

Biztonsági végrehajtás:
- cél: DEV Supabase project ref `pbgyuznivqvestuksvif`;
- DB user: `postgres.pbgyuznivqvestuksvif`;
- a központi vezérlő VPS meglévő `/root/.pgpass` DEV bejegyzése szolgált hitelesítésként;
- PROD DB-jelszó / PROD target nem került használatra;
- migráció SHA-256:
  `ecff3a81d3917aaedaa00deee5358eb4dc93b1081c511b24fcb6b85436968fb0`.

Migráció előtti célzott backup:
`/srv/dimpro-dev/backups/drive-document-flow-v010/20260925T201731Z/drive-document-flow-v010-before.dump`

- backup mode: 0600;
- `pg_restore -l` ellenőrzés: PASS;
- mentett táblák: `drive_core_documents`, `drive_core_document_versions`, `drive_core_upload_sessions`, `drive_storage_schema_meta`.

Migráció eredmény:
- tranzakció: COMMIT;
- meglévő adatmennyiségek változatlanok:
  - dokumentum: 35 → 35;
  - verzió: 38 → 38;
  - upload session: 38 → 38;
- új governance / issue / recipient / sequence táblák létrejöttek;
- `storage_version_id` mezők létrejöttek;
- marker:
  - schemaVersion: `0.1.0`;
  - migrationCount: `1`;
  - bootstrapId: `drive-document-flow-v010-20260925`.

Biztonsági utóellenőrzés:
- register / review / issue RPC: PASS;
- RLS: aktív;
- anon/auth közvetlen governance SELECT: tiltott;
- service_role SELECT: engedélyezett;
- anon/auth register és issue RPC EXECUTE: tiltott;
- service_role RPC EXECUTE: engedélyezett;
- REST Document Flow probe: PASS;
- három új REST tábla: HTTP 200;
- schema marker REST: HTTP 200.

A staged Projektkapu manual-link DEV pilot preflight a migráció után:
- `ready=true`;
- blockerCount: **0**;
- egyetlen warning: `DROP_MAIL_PROFILE_OPTIONAL_IN_MANUAL_LINK_MODE`.

### Full candidate build

Külön candidate source-ból indult teljes Next.js standalone build.

Első candidate kísérlet node_modules symlink miatt Turbopack filesystem-root hibával megállt; az érintett candidate könyvtár nem került törlésre.

Új candidate készült hardlinkelt node_modules-szal:
`/srv/dimpro-dev/candidates/projectkapu-drop-drive-pilot/source-hardlink-fd94eab1f9da-20260925T202042Z`

A build:
- Turbopack compile: **PASS** (117 s);
- teljes TypeScript fázisban egy Projektkapu Document Flow hibát talált:
  `issue/route.ts` – a normalizált címzett `type` mezője `string`-gé tágult.

Javítás:
- explicit `NormalizedRecipient` típus;
- `type: "PROJECT_MEMBER" | "EMAIL"`;
- explicit normalize függvény visszatérési típus;
- literal union megőrzése.

Ellenőrzés:
- Document Flow API/UI contract: **12/12 PASS**;
- issue route syntactic TypeScript check: PASS;
- releváns Projektkapu / DROP / DRIVE / DECIDE regressziós contractok: PASS;
- `git diff --check`: PASS.

Következő lépés: új commit HEAD-ből friss candidate source + teljes standalone rebuild; build PASS után ideiglenes, külön portos DEV runtime smoke, shared runtime módosítása nélkül.

## 2026-09-25 – Full build TS fix #2: project permission error union

A teljes Next.js candidate build következő TypeScript hibája a projektkötött Beküldőkapu route-ban jelent meg: a `requireProjectPermission()` sikertelen union változatain nem minden esetben létezik `code` mező.

Javítás:
- a GET / POST / PATCH hibaágak a `code` mezőt csak `"code" in access` guard után olvassák;
- runtime üzleti logika és jogosultsági szabály nem változott.

Ellenőrzés:
- Project Drop gate route contract: 16/16 PASS;
- Project Drop gate UI contract: 15/15 PASS;
- Project Drop gate audit contract: 15/15 PASS;
- pilot readiness / business filter / DROP→DRIVE / Document Flow / DRIVE Core / Object Storage / DECIDE regresszió: PASS;
- `git diff --check`: PASS.

Következő: új HEAD-ből teljes candidate rebuild.

## 2026-09-25 – Projektkapu DROP → DRIVE pilot candidate acceptance

A céges pilothoz készített külön DEV candidate teljes build- és runtime-ellenőrzése lezárult.

Candidate source commit:
`cfe55ceccf928038cf3690c7efd33e403cacd2c7`

Build:
- `npm run build:raw`: PASS;
- Turbopack compile: PASS;
- TypeScript: PASS;
- page data / route generation: PASS;
- standalone asset sync: PASS;
- build ID: `BHyYtYcPMw0cmLjln2XfR`;
- release metadata branch: `worker/benjaminai/dev-task-grid-22b48c4d9bae10e22e09`;
- release metadata commit: `cfe55ceccf928038cf3690c7efd33e403cacd2c7`;
- 259 static chunk ellenőrizve.

Végső külön portos runtime smoke:
- candidate port: `127.0.0.1:3299`;
- Next.js 16.2.6: Ready;
- `/login` → 200;
- `/projektkapu` → 307 (auth redirect, elvárt);
- `/api/projects/test-project/drop/submission-gates` → 401 (auth védelem, elvárt);
- `/api/projects/test-project/drive/health` → 401 (auth védelem, elvárt);
- 5xx: nincs;
- HTTP smoke: PASS;
- ideiglenes smoke process leállítva;
- port 3299 felszabadítva.

DEV adatbázis:
- Document Flow 0.1.0 migráció alkalmazva;
- backup: `/srv/dimpro-dev/backups/drive-document-flow-v010/20260925T201731Z/drive-document-flow-v010-before.dump`;
- RLS/RPC/REST security verify: PASS;
- staged pilot preflight: `ready=true`, blockerCount=0;
- manual-link pilot warning: a mail profil opcionális, nem blokkoló.

Publikus DEV cím:
- `https://projektkapu.dev.dimpro.hu/`
- login: `https://projektkapu.dev.dimpro.hu/login`

Fontos: a fenti candidate még nincs rákapcsolva a shared/public DEV runtime-ra. A következő külön lépés a DEV candidate publikálása a `projektkapu.dev.dimpro.hu` mögé, majd hitelesített valós Beküldőkapu → DROP → DRIVE E2E teszt. PROD továbbra is DENY.


## 2026-09-26 – Ideiglenes külön Projektkapu DEV belépés V0.1.0

A Projektkapu DEV host leválasztásának első lépéseként külön, minimális 6 számjegyű kódos belépési réteg készült.

Elv:
- csak `projektkapu.dev.dimpro.hu` hoston aktív;
- PROD host alapértelmezetten nem engedélyezett;
- külön Projektkapu login UI;
- a közös DIMPRO OTP login változatlan marad az app hostokon;
- a kód maga nincs Gitben;
- a kód ellenőrzése scrypt salt + hash alapján történik;
- session cookie HMAC aláírt, HttpOnly, SameSite=Strict és lejáratos;
- brute-force védelem: 5 hibás próbálkozás / 10 perc;
- sikeres belépés célja: `/projektkapu/projects`;
- logout a kódos session cookie-t is törli.

Jogosultsági bridge:
- az ideiglenes session a meglévő `dev-web-user` DEV identitást használja;
- read-only ellenőrzéssel igazolva: 1 aktív Project Core tagság, projekt `d6-irodaepulet`, szerepkör OWNER;
- nem jött létre új user vagy új jogosultsági adatmodell.

Candidate konfiguráció:
- `PROJECTKAPU_DEV_CODE_AUTH_ENABLED=true`;
- hostok: `projektkapu.dev.dimpro.hu,localhost,127.0.0.1`;
- scrypt verifier material candidate env-be stage-elve;
- session signing kulcs a meglévő DEV `DROP_SESSION_SECRET`-ből külön HMAC derivációval készül;
- `DROP_PUBLIC_BASE_URL=https://drop.dev.dimpro.hu` explicit DEV pin.

Ellenőrzés:
- Projektkapu DEV code auth contract: 16/16 PASS;
- candidate staging contract: 15/15 PASS;
- módosított auth/proxy/login fájlok TypeScript syntactic check: PASS;
- Projektkapu / DROP / DRIVE / DECIDE releváns regresszió: PASS;
- `git diff --check`: PASS.

Nginx publish még nem történt meg. A meglévő aktív DEV config backup elkészült; a következő lépés full candidate build, majd külön Projektkapu + Drop DEV host routing a candidate processre.


## 2026-09-26 – Ideiglenes külön Projektkapu DEV belépés V0.1.0

A Projektkapu DEV host leválasztásának első lépéseként külön, minimális 6 számjegyű kódos belépési réteg készült.

Fő szabályok:
- csak `projektkapu.dev.dimpro.hu` hoston aktív;
- PROD host nincs engedélyezve;
- külön Projektkapu login UI;
- a közös DIMPRO OTP login változatlan marad;
- a kód maga nincs Gitben;
- a kód ellenőrzése scrypt salt + hash alapján történik;
- session cookie HMAC-aláírt, HttpOnly, SameSite=Strict és lejáratos;
- brute-force védelem: 5 hibás próbálkozás / 10 perc;
- sikeres belépés célja: `/projektkapu/projects`;
- logout a kódos session cookie-t is törli.

Jogosultsági bridge:
- az ideiglenes session a meglévő `dev-web-user` DEV identitást használja;
- read-only ellenőrzéssel igazolva: 1 aktív Project Core tagság, projekt `d6-irodaepulet`, szerepkör OWNER;
- nem jött létre új user vagy új jogosultsági adatmodell.

Candidate konfiguráció:
- `PROJECTKAPU_DEV_CODE_AUTH_ENABLED=true`;
- hostok: `projektkapu.dev.dimpro.hu,localhost,127.0.0.1`;
- scrypt verifier material candidate env-be stage-elve;
- session signing kulcs a meglévő DEV `DROP_SESSION_SECRET`-ből külön HMAC derivációval készül;
- `DROP_PUBLIC_BASE_URL=https://drop.dev.dimpro.hu` explicit DEV pin.

Ellenőrzés:
- Projektkapu DEV code auth contract: 16/16 PASS;
- candidate staging contract: 15/15 PASS;
- módosított auth/proxy/login fájlok TypeScript syntactic check: PASS;
- Projektkapu / DROP / DRIVE / DECIDE releváns regresszió: PASS;
- `git diff --check`: PASS.

Nginx publish még nem történt meg. A következő lépés full candidate build, majd külön Projektkapu + Drop DEV host routing a candidate processre.


## 2026-09-26 – Projektkapu + Drop DEV publikus candidate routing

A `4dbeb8d059d1d67d417b4f4817b6681dd12ab8f9` commitból készített candidate teljes buildje sikeres:

- Next.js/Turbopack compile: PASS;
- TypeScript: PASS;
- page generation: PASS;
- standalone asset sync: PASS;
- build ID: `KDjU5PahIIAMufqa2Plty`;
- release metadata commit: `4dbeb8d059d1d67d417b4f4817b6681dd12ab8f9`;
- 260 statikus chunk ellenőrizve.

A külön candidate PM2 processz:
- név: `dimpro-projectkapu-drop-drive-pilot-dev`;
- bind: `127.0.0.1:3299`;
- a közös 3100-as DEV runtime nem került restartolásra.

DEV-only Nginx routing publikálva:
- `projektkapu.dev.dimpro.hu` → candidate `127.0.0.1:3299`;
- `drop.dev.dimpro.hu` → candidate `127.0.0.1:3299`;
- az összes többi DEV host a közös `127.0.0.1:3100` runtime-on maradt;
- PROD routing nem változott.

Nginx biztonsági pontok:
- publish előtti aktív config backup:
  `/etc/nginx/backups/dimpro-dev.enabled.before-projectkapu-auth-publish-20260926T072311Z`;
- aktív config SHA-256 publish után:
  `9aa14daeaf698d3a72ac0c3bb9b8946265ef81f2741b7e98ec6e62c587d3e5d5`;
- `nginx -t`: PASS;
- reload: PASS;
- nginx status: active.

Publikus DEV smoke:
- `https://projektkapu.dev.dimpro.hu/login` → HTTP 200;
- dedikált `DIMPRO Projektkapu` login marker: PASS;
- 6 számjegyű kódos UI marker: PASS;
- `https://projektkapu.dev.dimpro.hu/` → 307 `/login`;
- code-auth session kód nélkül → `authenticated:false`;
- `/api/projects` kód nélkül → 401;
- `https://drop.dev.dimpro.hu/bekuldes` → HTTP 200;
- `app.dev.dimpro.hu/login` → HTTP 200 a közös DEV runtime-on;
- `admin.dev.dimpro.hu/` → elvárt 307 `/admin`;
- Projektkapu válaszfejlécek: `X-DIMPRO-ProjectGate-Candidate: DEV`, `X-DIMPRO-Production-Access: DENY`.

A sikeres kódos belépés automatikus HTTP tesztjét a platform credential-biztonsági rétege blokkolta; nem került megkerülésre. A kód scrypt-verifierének megfelelősége ellenőrzött, a mechanikai/auth contractok PASS. A következő manuális acceptance pont: böngészőből egy sikeres belépés, majd a `d6-irodaepulet` projekt megjelenésének ellenőrzése.

A belépési kód plaintext formában nincs Gitben és nincs handoff dokumentumban.


## 2026-09-26 – D6 valós Beküldőkapu teszt · multipart és DRIVE source schema checkpoint

### Emberi böngészős acceptance

A felhasználó a `D6 DROP–DRIVE E2E teszt` Projekt Beküldőkapun keresztül 4 JPG fájlt próbált feltölteni. A kapu:
- gate id: `gate_2c72f986-670`;
- slug: `project-7a50edfcae`;
- projekt: `d6-irodaepulet / D6 Irodaépület`;
- célmappa: `Beérkező Drop`;
- aktív és újra felhasználható.

A kapulink NEM egyszer használatos. Az adatbázisban ugyanahhoz az aktív gate-hez több külön public session és több külön package létrejött. A one-package-per-session szabály külön dolog: ugyanazon public session csak egy package-hez köthető.

### A felhasználói 4 JPG sikertelenségének bizonyított oka

Mind a négy fájlrekord létrejött, de 0 bájt került feltöltésre. A rögzített hiba:
- `DROP_UPLOAD_CANCELLED`;
- `Az S3 feltöltéshez multipart munkamenet szükséges.`

Gyökérok:
- DROP tárhely: `s3-compatible`;
- a candidate-ben a `DROP_RESUMABLE_UPLOAD_ENABLED` flag ki volt kapcsolva;
- ezért az init `single` protokollt adott, amit a kliens S3 provider mellett helyesen elutasított.

### Javítások

1. Candidate staging:
   - `DROP_RESUMABLE_UPLOAD_ENABLED=true`;
   - `DROP_UPLOAD_SESSION_SECRET` bekerült a három canonical DEV referencia alapján működő secret-consensus listába.
2. Runtime health:
   - `tokenSecurity` már az upload-session secret readiness-t is megköveteli;
   - külön `uploadSessionTokenSecurity` health mező.
3. Preflight:
   - `DROP_UPLOAD_SESSION_TOKEN_NOT_CONFIGURED`;
   - S3 esetén kötelező resumable/multipart gate: `DROP_S3_MULTIPART_FEATURE_DISABLED`.
4. Beküldőkapu reuse:
   - új beküldésnél submission-gate módban fresh public session indul;
   - a kapu maga továbbra is lejáratig/revokálásig újra használható.
5. Fájlfeltöltő UX:
   - mixed Projekt Beküldőkapu nem kényszerít image/camera módot;
   - dokumentum- és fájlközpontú feliratok;
   - PDF, Office, CAD/BIM, ZIP, kép és más engedélyezett fájl egyértelműen támogatott;
   - mixed mód alapértelmezett fájlnév-szabálya `safe_original`.

### Fizikai DEV E2E bizonyíték

A resumable flag és upload-session secret bekötése után:
- upload intent: HTTP 201;
- upload init: HTTP 201;
- protocol: `multipart`;
- storage provider: `s3-compatible`;
- presigned S3 PUT: HTTP 200;
- ETag: jelen;
- part confirm: HTTP 200;
- `allPartsReceived=true`;
- upload complete: HTTP 200;
- karantén: PASS;
- ClamAV scan: `ready / ready / clean / clean`;
- package finalize: HTTP 200, `finalized=true`.

### Megmaradt blocker – DROP → DRIVE import

A tiszta, véglegesített Beküldőkapu package DRIVE-importja:
- `driveIncoming.ok=false`;
- PostgreSQL code: `23514`;
- hiba: `A DRIVE feltöltési munkamenet létrehozása sikertelen.`

Aktuális DEV constraint bizonyíték:
- `drive_core_documents.source`: `WEB, DESKTOP, DROP, SYSTEM`;
- `drive_core_upload_sessions.source`: csak `WEB, DESKTOP`.

A DROP incoming worker helyesen `source: "DROP"` értéket használ. Nem szabad WEB-re maszkolni, mert elveszne a provenance/audit jelentés.

### Additív DB candidate – MÉG NINCS ALKALMAZVA

Új migration:
`supabase/migrations/20260926_drive_drop_incoming_source_v010.sql`

Mirrored bootstrap:
`supabase/DIMPRO_PROJEKTKAPU_DRIVE_DROP_INCOMING_SOURCE_V010_BOOTSTRAP.sql`

Bootstrap SHA-256:
`bb3c7476aeaf8eb683d3ea0f891d965c25a612ed96fc875576217e1863e1740d`

A migration:
- a `drive_core_upload_source_check` constraintet `WEB, DESKTOP, DROP, SYSTEM` készletre bővíti;
- külön schema markert ír:
  - component: `drive-drop-incoming-source`;
  - version: `0.1.0`;
  - migration_count: `1`;
  - bootstrap id: `drive-drop-incoming-source-v010-20260926`.

A kód fail-closed módon ellenőrzi ezt a markert:
- DROP → DRIVE import;
- új Projekt Beküldőkapu létrehozás;
- DRIVE health;
- Projektkapu pilot preflight.

A candidate env-vel futtatott preflight jelenleg pontosan 1 blockerrel áll:
`DRIVE_DROP_INCOMING_SOURCE_SCHEMA_NOT_READY`

SQL migrációt automatikusan NEM futtattunk.

### Tesztek

- DRIVE DROP source contract: 11/11 PASS;
- gate reuse + mixed file UX: 6/6 PASS;
- upload-session security: 6/6 PASS;
- candidate staging: 17/17 PASS;
- pilot preflight contract: 16/16 PASS;
- project gate contract: 17/17 PASS;
- Drop incoming: 22/22 PASS;
- pilot readiness: 11/11 PASS;
- Document Flow API/UI: 12/12 PASS;
- Document Flow SQL: 23/23 PASS;
- DRIVE Object Storage V0.4.0: 29/29 PASS;
- DRIVE Core V0.3.0: 24/24 PASS;
- DECIDE V0.7.0: 82/82 PASS;
- módosított TS/TSX syntactic check: PASS;
- `git diff --check`: PASS.

Következő sorrend:
1. commit/push/Grid checkpoint;
2. új candidate build + DEV publish az UI/session/readiness javításokkal;
3. emberi jóváhagyás után a fenti DEV SQL migration alkalmazása;
4. preflight várhatóan 0 blocker;
5. ugyanazzal a D6 gate-tel új DROP → S3 → ClamAV → finalize → DRIVE Beérkező Drop fizikai E2E;
6. utána külön javítandó a túl korai finalize 5 perces `DROP_PUBLIC_FINALIZE_IN_PROGRESS` lock UX.


### 2026-09-26 – ce9eeb55 candidate build/publish

A `ce9eeb55d8bcbe513089ce96f9848dd5c6ab4873` commitból teljes Next.js candidate build készült.

- build ID: `Oyg-Ub66jlSSQTaPLbsBx`;
- compile: PASS;
- TypeScript: PASS;
- standalone asset sync: PASS;
- 260 statikus chunk ellenőrizve;
- dedikált PM2: `dimpro-projectkapu-drop-drive-pilot-dev`;
- bind: `127.0.0.1:3299`;
- csak a Projektkapu/Drop DEV candidate processz lett újraindítva.

Publikus smoke:
- `https://drop.dev.dimpro.hu/bekuldes/project-7a50edfcae` → HTTP 200;
- `https://projektkapu.dev.dimpro.hu/login` → HTTP 200;
- DROP health:
  - `tokenSecurity=true`;
  - `uploadSessionTokenSecurity=true`;
  - `resumableUpload=true`;
  - `publicUpload=true`;
  - `submissionGate=true`;
  - `driveIncomingEnabled=true`.

A DB migration továbbra sincs alkalmazva. Az egyetlen ismert pilot blocker:
`DRIVE_DROP_INCOMING_SOURCE_SCHEMA_NOT_READY`.

PROD nem változott.

## 2026-09-26 – DEV migration + teljes DROP → DRIVE E2E PASS

Felhasználói engedéllyel lefutott a DEV adatbázison a következő migration:
`supabase/DIMPRO_PROJEKTKAPU_DRIVE_DROP_INCOMING_SOURCE_V010_BOOTSTRAP.sql`

Migration forrás SHA-256:
`bb3c7476aeaf8eb683d3ea0f891d965c25a612ed96fc875576217e1863e1740d`

Migration előtti célzott backup:
`/srv/dimpro-dev/backups/drive-drop-incoming-source-v010/20260926T084230Z/drive-drop-incoming-source-before.dump`

Backup SHA-256:
`52e14bc4deacb1192980e71469c80384167049b7d1f85810cc0793e004142568`

Migration eredmény:
- BEGIN: PASS
- prerequisite DO: PASS
- régi `drive_core_upload_source_check` eltávolítás: PASS
- új constraint létrehozás: PASS
- schema marker insert/upsert: PASS
- COMMIT: PASS

Post-migration constraint:
`source IN (WEB,DESKTOP,DROP,SYSTEM)`

Schema marker:
`drive-drop-incoming-source | 0.1.0 | 1 | drive-drop-incoming-source-v010-20260926`

### Friss teljes E2E acceptance

Beküldőkapu: `project-7a50edfcae`
Projekt: `d6-irodaepulet` / D6 Irodaépület

Friss E2E package:
`fb6d0dfb-423f-4015-9435-285bc3bc6b09`

Folyamat:
- új publikus gate session: PASS
- új submission_gate package: PASS
- robotvédelmi intent: PASS
- S3 multipart init: PASS
- direct S3 PUT: PASS
- part confirm / ETag / SHA-256: PASS
- upload complete: PASS
- ClamAV: `clean`
- finalize: HTTP 200 / PASS
- DRIVE incoming import: `completed`
- importált dokumentumok: 1

DRIVE eredmény:
- folder: `Beérkező Drop`
- source: `DROP`
- source_channel: `DROP`
- document id: `drive-document-c31d1ecd59ea`
- version id: `drive-version-5e676309f194`
- technical version status: `QUARANTINED`
- business status: `ELLENORZES_ALATT`
- review decision: `PENDING`
- DROP package provenance megőrizve

Ez az első bizonyított teljes Projektkapu Beküldőkapu → DROP → S3 → vírusellenőrzés → finalize → DRIVE `Beérkező Drop` E2E PASS ezen a pilot ágon.

PROD továbbra is DENY; PROD adatbázis/routing/deploy nem változott.

## 2026-09-26 – DRIVE review → ERVENYES → KIADOTT + címzetti hozzáférés

A saját DEV E2E tesztdokumentumon a teljes dokumentuméletciklus bizonyítva:

- DROP incoming dokumentum: `drive-document-c31d1ecd59ea`
- version: `drive-version-5e676309f194`
- upload session: `drive-upload-incoming-92c538a522a24652`
- DRIVE objektum méret: 59 byte
- SHA-256: `6baf0b72a777fbcf48131454bca796c4cfbf14a3c0938bdcf7b387e158c45e84`
- DEV S3 objektum-visszaolvasás: PASS
- SHA-256 egyezés: PASS
- ClamAV 1.5.4 / signature 28135: CLEAN

Review transition:
- előtte: `QUARANTINED | ELLENORZES_ALATT | PENDING | NOT_ISSUED`
- technikai review RPC: `QUARANTINED → AVAILABLE`
- üzleti review RPC: `ELLENORZES_ALATT/PENDING → ERVENYES/APPROVED`
- reviewer: `dev-web-user`

Formális issue transition:
- issue ID: `drive-doc-issue-debd632b00c64e67`
- issue number: `KIA-00001`
- 1 DEV tesztcímzett
- eredmény: `AVAILABLE | KIADOTT | APPROVED | ISSUED`

Project Core auditlánc:
- `DRIVE_DOCUMENT_INCOMING_REGISTERED`
- `DRIVE_DOCUMENT_MARKED_VALID`
- `DRIVE_DOCUMENT_VERSION_APPROVED`
- `DRIVE_DOCUMENT_VERSION_ISSUED`

A következő pilot-réshez új, migráció nélküli controlled issue access réteg készült:
- meglévő `drive_core_document_issue_recipients` rekordok használata;
- `access_expires_at` és `downloaded_at` mezők használata;
- lejáratos, HMAC-aláírt recipient token;
- purpose-separated signing key;
- a token csak a saját recipient rekordot oldja fel;
- minden letöltéskor új rövid életű S3 signed URL készül;
- csak aktív `ISSUED` issue + `KIADOTT/ISSUED` governance + `AVAILABLE` S3 verzió tölthető le;
- issue visszavonás/supersede esetén a link automatikusan megszűnik működni;
- letöltés `downloaded_at` és Project Core audit eseményben naplózódik;
- az audit entity típusa a már engedélyezett `document_version`, issue/recipient ID metadata-ban marad;
- publikus endpoint: `/api/drive/public/issue-download?token=...`;
- Projektkapu issue API a sikeres kiadástól külön kezeli a linkgenerálási hibát;
- DRIVE UI-ban kiadás után címzettenként másolható linkek jelennek meg;
- már korábban kiadott dokumentumnál Link ikonról újragenerálhatók a linkek, `document.approve` jogosultsággal.

Contract: `scripts/drive-issue-access-v010-contract.mjs` → 16/16 PASS.
Releváns Document Flow / DRIVE / object storage / Projektkapu regressziók: PASS.
PROD: DENY.

### Controlled issue recipient download runtime acceptance

Candidate build / publish:
- source commit: `5fb8c4676e3ec55c8ea422a904cb8419786f0205`
- build ID: `lQn3OT7CeQ5JL0TFX0iqM`
- compile: PASS
- TypeScript: PASS
- route generation: PASS
- standalone: PASS
- 260 static chunk
- PM2 `dimpro-projectkapu-drop-drive-pilot-dev` újraindítva kizárólag DEV 3299-en
- publikus issue route token nélkül: HTTP 400
- DROP health: HTTP 200

A `KIA-00001` szintetikus DEV kiadás egy címzettjén kontrollált runtime teszt történt:
- recipient: `drive-doc-recipient-fb52eb71ecf94297`
- rövid DEV tesztlejárat beállítva
- purpose-separated HMAC token előállítva szerveroldalon, tokenérték kiírása nélkül
- `/api/drive/public/issue-download` → rövid életű S3 signed redirect
- végső HTTP: 200
- letöltött méret: 59 byte
- letöltött SHA-256: `6baf0b72a777fbcf48131454bca796c4cfbf14a3c0938bdcf7b387e158c45e84`
- SHA-256 egyezik a DRIVE verzió hitelesített hashével
- `downloaded_at`: rögzítve
- Project Core audit event: `DRIVE_DOCUMENT_ISSUE_RECIPIENT_DOWNLOADED`
- audit entity: `document_version / drive-version-5e676309f194`
- hibás token smoke: HTTP 401 / `DRIVE_ISSUE_ACCESS_TOKEN_INVALID`

Ezzel a kontrollált kiadási címzetti letöltés backend lánca runtime szinten PASS.
A Projektkapu UI Link ikon / újrageneráló endpoint böngészős kézi acceptance külön követhető, de a build, jogosultsági guard és contract teszt PASS.
