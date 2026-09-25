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
