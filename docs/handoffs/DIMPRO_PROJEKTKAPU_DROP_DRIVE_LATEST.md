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
