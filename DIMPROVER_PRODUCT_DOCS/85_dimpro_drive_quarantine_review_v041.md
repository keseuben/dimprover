# DIMPRO DRIVE Quarantine Review 0.4.1

## Cél

A karanténba került DRIVE dokumentumverziók auditálható jóváhagyása vagy elutasítása. Az elutasított objektum törlése tartós, újrapróbálható cleanup-feladaton keresztül történik.

## Jogosultság

Új Project Core jogosultság: `document.approve`.

- OWNER: engedélyezett;
- PROJECT_MANAGER: engedélyezett;
- REVIEWER: engedélyezett;
- CONTRIBUTOR: nem engedélyezett;
- VIEWER: nem engedélyezett.

A `document.write` önmagában nem elegendő karanténverzió jóváhagyásához.

## Döntések

### APPROVE

- csak `QUARANTINED` S3-verzióra;
- státusz `AVAILABLE`;
- projekt-audit és DRIVE change event;
- idempotens ismételt hívás.

### REJECT

- kötelező rövid indoklás;
- státusz `REJECTED`;
- tartós `drive_core_object_cleanup_tasks` feladat;
- projekt-audit és DRIVE change event;
- konfigurált tárhelynél azonnali objektumtörlési kísérlet;
- tárhelyhiba esetén `FAILED`, legfeljebb öt automatikus/operátori próbálkozás.

## API

- `POST /api/projects/[projectId]/drive/documents/[documentId]/versions/[versionId]/review`
- `POST /api/projects/[projectId]/drive/storage/cleanup`

## SQL

`/root/dimprover/supabase/DIMPRO_PROJEKTKAPU_DRIVE_QUARANTINE_REVIEW_V041_BOOTSTRAP.sql`

SHA-256:

`fa151bdd6e50d6c0ff0931dd7001858c17e348f6d24e61cbac2c3428bbc19841`

## Pre-SQL ellenőrzések

- szerződés: 29/29 PASS;
- ESLint: PASS;
- TypeScript: PASS;
- production build: PASS;
- candidate API: 8/8 PASS;
- DRIVE Core regresszió: 15/15 PASS;
- vizuális audit: 4/4 PASS;
- Projektkapu tipográfia: 21/21 PASS;
- minimum betűméret: 12 px;
- maradványadat: 0.

## Éles pre-SQL kiadás

- éles build: `_6_2LE4-r3SXAzNY9YOYm`;
- rollback: `.next_before_projectgate_drive_v041_errorcode_20260802_131506`;
- éles API: 10/10 PASS;
- éles DRIVE Core regresszió: 15/15 PASS;
- éles vizuális audit: 4/4 PASS;
- éles Projektkapu tipográfia: 21/21 PASS;
- minimum betűméret: 12 px;
- PM2: online;
- Nginx: PASS;
- D6 projekt: 10 mappa, 0 dokumentum;
- Drop forrásváltozás: 0;
- letölthető SQL SHA-256: ellenőrzötten egyezik a VPS eredetivel.

## Post-SQL integráció

- Quarantine Review séma: `0.4.1` aktív;
- izolált review/RPC/API integráció: 16/16 PASS;
- APPROVE döntés és idempotencia: PASS;
- REJECT kötelező indoklás és idempotencia: PASS;
- nem karanténos verzió átváltásának tiltása: PASS;
- tartós cleanup-feladat: PASS;
- sikertelen cleanup és újrapróbálás: PASS;
- sikeres cleanup idempotens lezárása: PASS;
- projekt-audit és DRIVE change event: PASS;
- cascade cleanup: 0 maradványrekord;
- D6 függő cleanup: 0;
- valós objektumtörlés a külön privát S3-konfigurációig biztonságosan zárt.

## Post-SQL candidate kiadás

- build: `Xus9bJYQ8LCGd_QTzYAQX`;
- rollback: `.next_before_projectgate_drive_v041_postsql_20260802_133641`;
- review-integráció: 16/16 PASS;
- candidate API: 8/8 PASS;
- DRIVE Core regresszió: 15/15 PASS;
- vizuális audit: 4/4 PASS;
- Projektkapu tipográfia: 21/21 PASS;
- minimum betűméret: 12 px;
- függő D6 cleanup: 0;
- tesztadat-maradvány: 0.

## Éles post-SQL kiadás

- éles build: `Xus9bJYQ8LCGd_QTzYAQX`;
- rollback: `.next_before_projectgate_drive_v041_postsql_20260802_133641`;
- éles API: 10/10 PASS;
- review-integráció: 16/16 PASS;
- éles DRIVE Core regresszió: 15/15 PASS;
- éles vizuális audit: 4/4 PASS;
- éles Projektkapu tipográfia: 21/21 PASS;
- minimum betűméret: 12 px;
- PM2: online;
- Nginx: PASS;
- D6 projekt: 10 mappa, 0 dokumentum, 0 feltöltési munkamenet, 0 cleanup-feladat;
- ideiglenes projekt- és felhasználó-maradvány: 0;
- Drop forrásváltozás: 0.
