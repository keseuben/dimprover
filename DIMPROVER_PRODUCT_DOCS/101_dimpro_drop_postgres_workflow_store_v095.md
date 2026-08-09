# DIMPRO DROP 0.9.5 – Központi PostgreSQL workflow-tár

**Fejlesztés dátuma:** 2026. augusztus 5.  
**Állapot:** éles PostgreSQL release  
**Előző éles kiadás:** DROP 0.9.4  
**Nyilvános rendszer:** `https://drop.dimpro.hu`

## 1. Fejlesztési cél

A DROP 0.9.4-ben a DIMPRO Send és a DIMPRO Beküldőkapu publikus jogosultsági konfigurációja egy szerveroldali, `0700/0600` jogosultságú, atomi JSON-fájltárban működik. Ez egyetlen alkalmazáspéldányon biztonságos és menthető, de több szerver vagy több Next.js példány között nem biztosít közös, tranzakciós állapotot.

A DROP 0.9.5 célja:

- központi PostgreSQL workflow-tár;
- több alkalmazáspéldányos működés előkészítése;
- atomi session–csomag kötés és kvótafoglalás;
- atomi kézbesítési/finalizálási zár;
- ellenőrzött fájltár→PostgreSQL import;
- séma előtti biztonságos fájltári működés;
- PostgreSQL-aktiválás után fail-closed működés;
- csendes, észrevétlen fájltári visszaesés tiltása.

## 2. Központi táblák

| Tábla | Feladat |
|---|---|
| `drop_public_send_codes` | Hatjegyű DIMPRO Send jogosultsági kódok sózott scrypt-hash-ei és kvótái |
| `drop_public_submission_gates` | Személyes, projekt- és szervezeti Beküldőkapuk |
| `drop_public_sessions` | Rövid életű, hash-elt publikus munkamenetek |
| `drop_public_package_workflows` | Csomag tárgya, üzenete, megjegyzése, célja és kézbesítési állapota |
| `drop_public_usage` | Napi Send-kód csomag- és adatkeret-foglalások |

A tényleges csomagok, fájlok, címzettek, megjegyzések, auditok és letöltések továbbra is a meglévő DROP PostgreSQL-táblákban maradnak.

## 3. Biztonsági modell

- RLS minden új táblán aktív.
- `public`, `anon` és `authenticated` szerepkör közvetlen táblajogosultsága visszavonva.
- Csak a szerveroldali `service_role` olvashat és írhat.
- A nyers hatjegyű Send-kód nem kerül adatbázisba.
- Csak egyedi sóval képzett scrypt-hash és `***-123` jellegű kódhint tárolódik.
- A kódellenőrzés időzítésbiztos.
- Az utolsó három számjegy csak szerveroldali jelöltszűkítésre szolgál; a jogosultságot továbbra is a teljes hash ellenőrzése igazolja.
- A nyers publikus sessiontoken nem tárolódik, csak SHA-256 lenyomata.
- A session workflow-típushoz és IP-lenyomathoz kötött.
- A PostgreSQL aktiválása után adatbázishiba esetén a rendszer nem ír a régi fájltárba.

## 4. Atomi adatbázis-műveletek

### `drop_public_bind_session_package_atomic`

Egyetlen tranzakcióban:

1. zárolja a publikus sessiont;
2. ellenőrzi a lejáratot és az egyszeri csomagkötést;
3. zárolja a Send-kódot;
4. ellenőrzi a napi csomag- és byte-kvótát;
5. idempotensen rögzíti a kvótafoglalást;
6. a sessiont a csomaghoz köti.

### `drop_public_claim_finalization_atomic`

- sorzárral foglalja a csomag kézbesítési folyamatát;
- megakadályozza a párhuzamos e-mailküldést;
- ötperces beragadt `pending` ablak után újrapróbálható;
- már lezárt csomagnál idempotensen `finalized` választ ad.

### `drop_public_import_file_state_atomic`

- advisory lockkal kizárja a párhuzamos importot;
- importálja a Send-kódokat, kapukat, sessionöket, workflow-kat és kvótákat;
- idempotens upsertet használ;
- aktiválja a PostgreSQL-store sémamarkerét;
- visszaadja az importált darabszámokat.

### `drop_public_cleanup`

- törli a lejárt publikus sessionöket;
- nyolc napnál régebbi kvótafoglalásokat eltávolít;
- lejárttá minősíti az aktív, de már lejárt Send-kódokat és kapukat.

## 5. Store-választási állapotok

### 5.1 PostgreSQL-séma még nincs telepítve

- aktív store: `file`;
- Send és Beküldőkapu tovább működik;
- fájltár jogosultság: könyvtár `0700`, állomány `0600`;
- health: `postgresSchemaReady=false`;
- nincs szolgáltatáskiesés.

### 5.2 A séma kész, de a fájltárban adat van

- aktív store továbbra is `file`;
- `migrationRequired=true`;
- a belső kezelőfelület felajánlja az importot;
- PostgreSQL-be addig nem történik publikus workflow-írás.

### 5.3 A séma kész és a fájltár üres

- `auto` módban a rendszer adatvesztés nélkül automatikusan aktiválja a PostgreSQL-store-t;
- helyi `0600` aktiválási marker készül;
- az adatbázis sémamarkere is `activeStore=postgresql` értéket kap.

### 5.4 PostgreSQL aktiválva

- minden publikus workflow-művelet PostgreSQL-en fut;
- többpéldányos működés kész;
- a fájltár csak migrációs/rollback biztonsági másolatként marad;
- adatbázishibánál HTTP 503 és fail-closed működés;
- csendes fájltári visszaesés nincs.

### 5.5 Kifejezett vészhelyzeti fájltár mód

A `DROP_PUBLIC_STORE_MODE=file` csak kézi, dokumentált rollback/vészhelyzeti beavatkozásra használható. Ez nem automatikus fallback.

## 6. Konfiguráció

```env
DROP_PUBLIC_STORE_MODE=auto
```

Választható értékek:

- `auto` – javasolt és alapértelmezett;
- `file` – kézi vészhelyzeti/rollback mód;
- `postgresql` – kézi, fail-closed PostgreSQL-kényszerítés.

Tesztkörnyezetben felülírható:

```env
DROP_PUBLIC_STATE_DATA_DIR=/egyedi/fajltar
DROP_PUBLIC_STORE_MARKER_DIR=/egyedi/marker
```

## 7. Egyszeri Supabase SQL-lépés

A VPS-en nincs adatbázis-jelszó, Supabase CLI hozzáférés vagy SQL-végrehajtó Management API token. A `service_role` kulcs biztonsági okból nem ad DDL-jogosultságot a PostgREST API-n keresztül.

Ezért egyszer szükséges:

1. belépés a DIMPRO Supabase projektbe;
2. SQL Editor megnyitása;
3. a következő fájl tartalmának futtatása:

`supabase/DIMPRO_DROP_095_PUBLIC_WORKFLOW_STORE_BOOTSTRAP.sql`

SHA-256:

`397eafc788b348aaff90a86b1aef24b6f77676a4abe42cd6afc7e59a78171f14`

A belső DIMPRO kezelőből az SQL adminfejléccel letölthető. A nyilvános Drop hoston az admin migrációs API nem érhető el.

## 8. Belső kezelőfelület

Útvonal:

`/drive/drop/public-workflows`

Új panel:

- aktív store kijelzése;
- PostgreSQL-séma állapota;
- fájltári és PostgreSQL darabszámok;
- többpéldányos készenlét;
- bootstrap SQL letöltése;
- SHA-256 megjelenítése;
- séma telepítése után „Import és aktiválás” gomb;
- fail-closed állapot egyértelmű jelzése.

Admin API:

- `GET /api/drop/admin/public/store-migration` – biztonságos állapot;
- `GET /api/drop/admin/public/store-migration?download=sql` – SQL letöltés;
- `POST /api/drop/admin/public/store-migration` `{ "action": "migrate" }` – import és aktiválás.

## 9. Readiness és health

Új mezők:

- `readiness.publicWorkflowPostgres`;
- `readiness.publicWorkflowMigrationRequired`;
- `publicWorkflows.activeStore`;
- `publicWorkflows.requestedStoreMode`;
- `publicWorkflows.postgresSchemaReady`;
- `publicWorkflows.migrationRequired`;
- `publicWorkflows.failClosed`;
- `publicWorkflows.multiInstanceReady`;
- `publicWorkflows.fileCounts`;
- `publicWorkflows.postgresCounts`;
- `publicWorkflows.storeReason`.

A health nem ad vissza jelszót, kulcsot, nyers kódot, sessiontokent vagy szerveroldali teljes fájlútvonalat.

## 10. Elkészült ellenőrzések

| Ellenőrzés | Eredmény |
|---|---:|
| PostgreSQL séma és adapter szerződés | 115/115 PASS |
| Séma előtti fájltári fallback | 12/12 PASS |
| DROP 0.9.4 publikus core regresszió | 39/39 PASS |
| Forrás-runtime séma nélkül | PASS |
| TypeScript | PASS |
| Célzott ESLint | 0 hiba |

Production candidate eredmények:

- build ID: `Azm5OHYOuDCOiSe1LWipJ`;
- 88 Next.js oldal;
- 70 standalone chunk;
- candidate health fájltári fallbackben: PASS;
- admin migrációs API: PASS;
- jogosulatlan admin API: 401;
- publikus hoston admin API: 404;
- SQL-letöltés és SHA-256: PASS;
- séma nélküli import szabályos 503: PASS;
- teljes Send/Beküldőkapu API E2E: PASS;
- multipart Object Storage, ClamAV és SMTP: PASS;
- PIN-proof és letöltési SHA-256: PASS;
- publikus desktop/tablet/mobil böngészőteszt: PASS;
- admin migrációs panel desktop/mobil: PASS;
- candidate tesztmaradvány: 0.

A bootstrap SQL sikeresen lefutott. Az öt központi tábla, az öt atomi RPC, az adatbázis- és helyi aktiválási marker elérhető. A DIMPRO Send és Beküldőkapu hivatalos állapota PostgreSQL-ben működik; a rendszer több alkalmazáspéldányra kész és adatbázishiba esetén fail-closed módú.

## 11. Mentés és rollback

Fejlesztés előtti mentés:

`/root/dimprover/backups/drop_v095_postgres_store_20260805_152007`

Aktiválási mentés:

`/root/dimprover/backups/drop_v095_release_20260805_163727`

Rollback:

`/root/dimprover/scripts/rollback-drop-v095-release.sh`

A mentések tartalmazzák a publikus workflow forrásokat, API-kat és komponenseket, a Supabase SQL/migrációs könyvtárat, a környezeti konfigurációt, a 0.9.4 fájltárállapotot, a Fejlesztési Központ állapotát, az Nginx-konfigurációt és az aktív release pointert.

## 12. Végleges éles release

- aktív build: `SP_JZkDQCPf4sjWDlcOXD`;
- aktív release: `.next-v095-release-final`;
- rollback: `.next-v094-release-final`;
- aktív store: PostgreSQL;
- PostgreSQL-séma: kész;
- adatbázis-aktiválási marker: kész;
- helyi aktiválási marker: `0600`;
- többpéldányos működés: kész;
- fail-closed: aktív;
- fájltári csendes visszaesés: tiltva.

### PostgreSQL-aktiválási eredmények

- bootstrap SQL: `Success. No rows returned`;
- központi táblák: 5/5 READY;
- atomi RPC-k: 5/5 READY;
- PostgreSQL-store aktiválás: PASS;
- fájltári import: 0 rekord, mert az éles fájltár üres volt;
- aktiválás módja: `empty-file-auto-activation`;
- multi-instance readiness: PASS.

### Párhuzamossági hotfix

A PostgreSQL aktiválása utáni célzott versenyteszt kimutatta, hogy a session atomi lefoglalása előtt létrehozott vesztes csomag árva rekordként maradhatott. A hotfix kompenzáló törlést vezetett be a session-kötés hibájára. A vesztes csomag, címzettek és capability-tokenek automatikusan törlődnek.

Ellenőrzések:

- candidate csomaglétrehozási race: 1×201, 1×409, árva csomag 0;
- éles csomaglétrehozási race: 1×201, 1×409, árva csomag 0;
- finalizálási race: 1 `claimed`, 1 `DROP_PUBLIC_FINALIZE_IN_PROGRESS`;
- izolált fail-closed: HTTP 503, fájltári visszaírás 0;
- teljes candidate PostgreSQL E2E: PASS;
- teljes éles PostgreSQL E2E: PASS;
- S3, ClamAV, SMTP, PIN-proof és SHA-256 letöltés: PASS;
- tesztmaradvány: 0.
- Fejlesztési Központ: `released`, 118 perc, nyitott időmérő 0.
