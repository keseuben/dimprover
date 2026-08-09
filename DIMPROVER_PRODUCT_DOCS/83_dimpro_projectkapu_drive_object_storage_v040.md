# DIMPRO Projektkapu 0.4.0 – DRIVE privát objektumtárhely

Dátum: 2026-08-02
Állapot: pre-SQL, fail-closed

## Cél

A stabil DRIVE Core 0.3.0 metaadat-, verzió-, audit- és szinkronmotor fölé külön privát fájlbájt-tárolási réteg készül. A 0.4.0 nem módosítja és nem tiltja le a meglévő dokumentumtárat, ha az új séma vagy az S3-kapcsolat még nincs aktiválva.

## Architektúra

```text
Projektkapu / Drive Desktop
        ↓ Project Core jogosultság
DRIVE Object Storage API 0.4.0
        ↓ server-side service role
Supabase upload-session + audit
        ↓ rövid életű signed URL
Privát S3-kompatibilis objektumtárhely
```

A böngésző és a Desktop kliens soha nem kapja meg az objektumtárhely hozzáférési vagy titkos kulcsát. A szerver csak rövid életű, egyetlen objektumra szóló feltöltési vagy letöltési URL-t ad ki.

## Új API-végpontok

- `POST /api/projects/[projectId]/drive/uploads/init`
- `POST /api/projects/[projectId]/drive/uploads/[uploadId]/complete`
- `POST /api/projects/[projectId]/drive/uploads/[uploadId]/abort`
- `POST /api/projects/[projectId]/drive/documents/[documentId]/download`

Minden végpont Project Core jogosultságot ellenőriz:

- feltöltés és megszakítás: `document.write`;
- letöltés: `document.read`.

## Feltöltési folyamat

1. A kliens elküldi a projektet, célmappát vagy dokumentumot, fájlnevet, MIME-típust és fájlméretet.
2. A szerver ellenőrzi a jogosultságot, a fájlméretet, a nevet, a séma- és tárhelyállapotot.
3. A Supabase-ben `INITIATED` feltöltési munkamenet jön létre.
4. A szerver rövid életű signed `PUT` URL-t ad vissza.
5. A kliens közvetlenül a privát objektumtárhelyre tölti a fájlt.
6. A kliens meghívja a `complete` végpontot.
7. A szerver `HEAD` kéréssel ellenőrzi az objektum meglétét és pontos méretét.
8. Egy atomikus PostgreSQL-függvény létrehozza a dokumentumot vagy új verziót, auditot és változáseseményt.
9. A munkamenet `FINALIZED` állapotba kerül.

Méreteltérés, lejárat vagy verzióütközés esetén a rendszer törli a félkész objektumot, megszakítja a munkamenetet, és nem hoz létre végleges dokumentumverziót.

## Letöltési folyamat

1. A kliens `document.read` jogosultsággal letöltési engedélyt kér.
2. Csak `AVAILABLE` státuszú, `S3` tárhelyen lévő verzió tölthető le.
3. A szerver rövid életű signed `GET` URL-t ad.
4. A link kiadása bekerül a Project Core auditnaplóba.

## Tárolási módok

- `disabled`: fájlírás és letöltés tiltva;
- `quarantine`: feltöltés engedélyezhető, a verzió `QUARANTINED`, letöltés tiltva;
- `active`: feltöltés és letöltés engedélyezett, a verzió `AVAILABLE`.

## Új adatbázis-objektumok

Táblák:

- `drive_storage_schema_meta`
- `drive_core_upload_sessions`

RPC-k:

- `drive_core_create_upload_session_atomic`
- `drive_core_finalize_upload_atomic`
- `drive_core_abort_upload_session`
- `drive_core_log_download`

A 0.3.0 stabil sémajelzője változatlan marad. A 0.4.0 saját, külön sémajelzőt használ.

## SQL

Fájlnév:

```text
DIMPRO_PROJEKTKAPU_DRIVE_OBJECT_STORAGE_V040_BOOTSTRAP.sql
```

VPS útvonal:

```text
/root/dimprover/supabase/DIMPRO_PROJEKTKAPU_DRIVE_OBJECT_STORAGE_V040_BOOTSTRAP.sql
```

SHA-256:

```text
42b1a2237335bf02715eedd63420f22a60bd0a54a9343b7c9de7da92aabb554d
```

A fájl közvetlenül `begin;` paranccsal kezdődik.

## Szerveroldali környezeti változók

- `DIMPRO_DRIVE_STORAGE_MODE`
- `DIMPRO_DRIVE_S3_ENDPOINT`
- `DIMPRO_DRIVE_S3_REGION`
- `DIMPRO_DRIVE_S3_BUCKET`
- `DIMPRO_DRIVE_S3_ACCESS_KEY_ID`
- `DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY`
- `DIMPRO_DRIVE_S3_FORCE_PATH_STYLE`
- `DIMPRO_DRIVE_MAX_UPLOAD_MB`
- `DIMPRO_DRIVE_SIGNED_URL_TTL_SECONDS`

A kulcsok csak a VPS titkos környezetében tárolhatók. Frontend-kódba, böngészőbe, adatbázisrekordba, naplóba vagy dokumentációba nem kerülhetnek.

A bucket CORS-beállításának engedélyeznie kell a Projektkapu eredetéről érkező `PUT` kérést és a `Content-Type` fejlécet. A bucket nem lehet nyilvános.

## Jelenlegi pre-SQL állapot

- DRIVE Core 0.3.0: aktív;
- projektmappák és metaadatok: működnek;
- Object Storage 0.4.0 adatbázisséma: nincs aktiválva;
- külön DRIVE S3-konfiguráció: nincs beállítva;
- valós feltöltés: tiltva;
- valós letöltés: tiltva;
- a felületen a feltöltőgomb látható, de letiltott;
- a Drop saját ideiglenes tárhelye nem került felhasználásra vagy módosításra.

## Pre-SQL ellenőrzések

- SQL/API biztonsági szerződés: 29/29 PASS;
- célzott ESLint: PASS;
- teljes TypeScript: PASS;
- production build: PASS;
- pre-SQL API: 8/8 PASS;
- stabil DRIVE Core CRUD/verzió/szinkron regresszió: 15/15 PASS;
- Projektkapu tipográfiai audit: 21/21 PASS;
- célzott Object Storage vizuális audit: 4/4 PASS;
- legkisebb megfigyelt betűméret: 12 px;
- tesztadat- és tesztfelhasználó-maradvány: 0;
- candidate build: `NLd9YjuDlnE-7mgzGLwbo`;
- rollback: `.next_before_projectgate_drive_v040_20260802_122014`.

## Aktiválási sorrend

1. 0.4.0 SQL futtatása a Supabase SQL Editorban.
2. Séma-health és atomikus RPC integrációs tesztek.
3. Külön privát S3 bucket létrehozása és biztonsági beállítása.
4. DRIVE szerveroldali környezeti változók titkos rögzítése.
5. Először `quarantine` próbaüzem.
6. Valós kisfájlos feltöltés, méretellenőrzés, audit és takarítás tesztje.
7. Letöltési teszt.
8. Siker után `active` mód és végleges kiadás.

## Éles pre-SQL kiadás

- éles build: `NLd9YjuDlnE-7mgzGLwbo`;
- éles fail-closed API: 10/10 PASS;
- éles stabil DRIVE Core regresszió: 15/15 PASS;
- éles Object Storage vizuális audit: 4/4 PASS;
- D6 projekt: 10 mappa, 0 dokumentum;
- tesztprojekt- és tesztfelhasználó-maradvány: 0;
- PM2: online;
- Nginx: PASS;
- Drop forrásváltozás: 0.

## Post-SQL eredmény

- Object Storage séma: 0.4.0 ready.
- Sémajelző és két tábla: PASS.
- Izolált adatbázis/RPC integráció: 20/20 PASS.
- Ellenőrzött folyamatok: új dokumentum, duplikált feltöltés tiltása, méreteltérés, idempotens véglegesítés, letöltési audit, új verzió, verzióütközés, megszakítás, karantén, lejárat és cascade cleanup.
- Tesztprojekt-maradvány: 0.
- Privát S3-konfiguráció: még hiányzik, ezért a fájlbájt-műveletek letiltva maradnak.
- Aktiválási leírás: `84_dimpro_drive_object_storage_v040_aktivacio.md`.

## Post-SQL candidate kiadás

- build: `iRuPjYutaXIPYKp3-80w2`;
- rollback: `.next_before_projectgate_drive_v040_postsql_20260802_124557`;
- API: 8/8 PASS;
- stabil DRIVE Core regresszió: 15/15 PASS;
- Object Storage vizuális audit: 4/4 PASS;
- Projektkapu tipográfiai audit: 21/21 PASS;
- minimum betűméret: 12 px;
- tesztadat-maradvány: 0.

## Éles post-SQL kiadás

- éles build: `iRuPjYutaXIPYKp3-80w2`;
- éles API: 10/10 PASS;
- éles stabil DRIVE Core regresszió: 15/15 PASS;
- éles Object Storage vizuális audit: 4/4 PASS;
- éles Projektkapu tipográfiai audit: 21/21 PASS;
- minimum megfigyelt betűméret: 12 px;
- PM2: online;
- Nginx: PASS;
- D6 projekt: 10 mappa, 0 dokumentum, 0 feltöltési munkamenet;
- ideiglenes projekt- és felhasználó-maradvány: 0;
- Drop forrásváltozás: 0;
- következő kézi lépés: külön privát S3-kompatibilis DRIVE bucket és korlátozott hozzáférési kulcs létrehozása.
