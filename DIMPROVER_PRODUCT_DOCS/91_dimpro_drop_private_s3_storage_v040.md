# DIMPRO DROP Private S3 Storage Core 0.4.0

**Dátum:** 2026. augusztus 2.  
**Állapot:** pre-SQL candidate elkészült  
**Cél:** a működő DROP 0.3.4 helyi privát tárhely megtartása mellett külön, privát S3-kompatibilis DROP tárhely bevezetése.

## Biztonsági alapelvek

- A DROP és a DRIVE külön bucketet és külön S3 credentialt használ.
- A runtime elutasítja, ha a DROP bucket vagy access key megegyezik a DRIVE értékével.
- A secret kizárólag a VPS `.env.local` fájljában tárolható.
- A böngésző csak rövid életű, egyetlen multipart részre szóló signed PUT URL-t kap.
- A nyilvános DROP host nem szolgál ki általános `/downloads` útvonalat.
- A fájlok vírusellenőrző hiányában karanténban maradnak és nem tölthetők le.
- Az Object Lock nem használható, mert lejáratkor, elutasításkor és csomagtörléskor az objektumokat törölni kell.

## Működési folyamat

1. DROP feltöltési munkamenet és kvótafoglalás.
2. S3 multipart feltöltés létrehozása.
3. Rövid életű part-URL kiadása.
4. Böngésző közvetlen PUT művelete a privát DROP bucketbe.
5. Böngészőoldali part SHA-256 számítás.
6. Szerveroldali `ListParts` méret- és ETag-ellenőrzés.
7. ETag és part SHA-256 atomikus rögzítése.
8. `CompleteMultipartUpload`.
9. S3 `HEAD` és teljes objektumméret ellenőrzése.
10. Rendezett partmanifest SHA-256 képzése.
11. Atomikus `PART_MANIFEST_SHA256` karantén-véglegesítés.
12. Víruskeresőig `scanner_required`, letöltés tiltva.
13. Megszakítás, lejárat vagy törlés esetén multipart abort vagy objektumtörlés.
14. Sikertelen tárhelytakarítás tartós cleanup-feladatként újrapróbálható.

A partmanifest SHA-256 nem kerül teljes fájl-SHA-ként feltüntetésre. A valódi teljes fájl-SHA későbbi stream-vizsgálat vagy vírusellenőrzés során rögzíthető.

## Új környezeti változók

```dotenv
DIMPRO_DROP_STORAGE_PROVIDER=s3-compatible
DIMPRO_DROP_STORAGE_MODE=disabled
DIMPRO_DROP_S3_ENDPOINT=https://fsn1.your-objectstorage.com
DIMPRO_DROP_S3_REGION=fsn1
DIMPRO_DROP_S3_BUCKET=<KÜLÖN PRIVÁT DROP BUCKET>
DIMPRO_DROP_S3_ACCESS_KEY_ID=<KÜLÖN DROP ACCESS KEY>
DIMPRO_DROP_S3_SECRET_ACCESS_KEY=<KÜLÖN DROP SECRET KEY>
DIMPRO_DROP_S3_FORCE_PATH_STYLE=false
DIMPRO_DROP_MAX_FILE_UPLOAD_MB=500
DIMPRO_DROP_UPLOAD_CHUNK_MB=64
DIMPRO_DROP_SIGNED_URL_TTL_SECONDS=600
```

## Aktiválási eszközök

- `scripts/configure-drop-s3-v040.sh`
- `scripts/rollback-drop-s3-v040.sh`
- `scripts/drop-object-storage-v040-readiness.mjs`
- `scripts/drop-object-storage-v040-preflight.mjs`
- `scripts/drop-object-storage-v040-cors.mjs`
- `scripts/drop-private-s3-v040-contract.mjs`

A CORS csak a `drop.dimpro.hu` és `www.drop.dimpro.hu` origin számára engedélyezi a GET/HEAD/PUT műveleteket, és kiteszi az `ETag` fejlécet a böngészős multipart megerősítéshez.

## SQL-migráció

VPS:

`/root/dimprover/supabase/DIMPRO_DROP_040_PRIVATE_S3_STORAGE_BOOTSTRAP.sql`

Migráció:

`/root/dimprover/supabase/migrations/20260802_drop_private_s3_storage_v040.sql`

SHA-256:

`100452924fbd8e2fd3c142cb09933f576e7b58e5be3dd53f7b6843817018a5be`

A migráció:

- integritástípust, manifest SHA-t, objektum ETag-et és HEAD-időpontot ad a fájlhoz és a sessionhöz;
- létrehozza a `drop_object_cleanup_tasks` tartós sort;
- létrehozza az S3-karantén-véglegesítő és cleanup RPC-ket;
- RLS-t aktivál, anon/auth hozzáférést visszavon, service-role jogosultságot ad;
- `DROP 0.4.0` sémajelzőt ír.

## Pre-SQL ellenőrzések

- statikus szerződés: 70/70 PASS;
- célzott ESLint: PASS;
- TypeScript: PASS;
- helyi 3 részes interrupted/resume multipart: PASS;
- helyi privát MIME/ZIP/biztonsági teszt: PASS;
- candidate health aktív 0.3.4 sémával: PASS;
- valós 65 MB-os helyi candidate feltöltés és folytatás: PASS;
- végső teljes fájl SHA-256: PASS;
- karantén és letöltéstiltás: PASS;
- böngészőhiba és konzolhiba: 0;
- host- és adminvédelem: PASS;
- candidate SQL SHA-egyezés: PASS;
- public download továbbra is tiltott.

## Aktiválási sorrend

1. pre-SQL build élesítése;
2. DROP 0.4.0 SQL futtatása;
3. post-SQL repository/RPC regresszió;
4. külön Hetzner `DIMPRO DROP Storage` projekt;
5. külön privát `fsn1` bucket és külön S3 credential;
6. interaktív konfiguráló `disabled` módban;
7. preflight és CORS;
8. `quarantine` mód;
9. valós signed multipart E2E;
10. lejárati és cleanup teszt;
11. a helyi adapter rollbackként megmarad;
12. `active` letöltés csak vírusellenőrző és biztonsági jóváhagyás után.

## Éles pre-SQL kiadás eredménye

**Build:** `W9UT1NFGUgoYT3lPtAj09`

- éles health: `DROP 0.4.0` alkalmazás / `DROP 0.3.4` aktív séma;
- helyi provider: `local-private`, mód: `quarantine`;
- storage core, quarantine és resumable feltöltés: aktív;
- public download: tiltott;
- valós 65 MB-os HTTPS/Nginx multipart regresszió: PASS;
- megszakítás/folytatás, végső SHA-256 és audit: PASS;
- éles tér- és capability-felület: PASS;
- böngészőhiba és konzolhiba: 0;
- Nginx: PASS;
- PM2: online;
- candidate port: zárt;
- tesztadat-maradvány: 0;
- publikus SQL SHA-256: egyezik.

## Post-SQL eredmény

A `DIMPRO_DROP_040_PRIVATE_S3_STORAGE_BOOTSTRAP.sql` migráció sikeresen lefutott.

Aktív séma:

- `schema_version`: `DROP 0.4.0`
- `migration_count`: `3`
- `bootstrap_id`: `drop-040-private-s3-storage-20260802`

Post-SQL ellenőrzések:

- új fájl- és session-integritási mezők: PASS;
- `drop_object_cleanup_tasks` tábla: PASS;
- S3 multipart session és partrekordok: PASS;
- part ETag + SHA-256 atomikus rögzítés: PASS;
- `PART_MANIFEST_SHA256` karantén-véglegesítés: PASS;
- teljes fájl-SHA hamis feltüntetésének tiltása: PASS;
- `upload.s3_quarantined` audit: PASS;
- cleanup-sor idempotencia: PASS;
- sikertelen cleanup újrapróbálása: PASS;
- DELETE_OBJECT és ABORT_MULTIPART: PASS;
- hibás művelet és ismételt finalizálás tiltása: PASS;
- anonim RLS és RPC tiltás: PASS;
- adatbázis-integráció: 12/12 PASS;
- statikus szerződés: 70/70 PASS;
- aktív 0.4.0 sémával valós 65 MB HTTPS/Nginx helyi regresszió: PASS;
- élő UI: PASS;
- böngésző- és konzolhiba: 0;
- tesztmaradvány: 0;
- Nginx: PASS;
- PM2: online.

A külön DROP S3 credential továbbra sincs beállítva. A rendszer ezért biztonságosan a helyi privát `quarantine` adaptert használja. Következő kézi lépés: külön Hetzner DROP projekt, privát bucket és a DRIVE-tól eltérő S3 credential létrehozása.

## Quarantine pilot aktiválás

A külön Hetzner DROP Object Storage sikeresen aktiválva.

- Projekt: `DIMPRO DROP Storage`
- Bucket: `dimpro-drop-temp-prod-20260802-kb`
- Régió: `fsn1`
- Provider: `s3-compatible`
- Mód: `quarantine`
- Credential-izoláció a DRIVE-tól: PASS
- Preflight írás–olvasás–checksum–törlés: PASS
- CORS: PASS
- Valós signed multipart E2E: PASS
- 65 MB / 2 part feltöltés: PASS
- Megszakítás utáni folytatás: PASS
- Part SHA-256 és ETag: PASS
- S3 HEAD és pontos méret: PASS
- `PART_MANIFEST_SHA256`: PASS
- Teljes fájl-SHA hamis feltüntetésének tiltása: PASS
- Karantén és letöltéstiltás: PASS
- Tartós DELETE_OBJECT cleanup: PASS
- Multipart abort és kvótafelszabadítás: PASS
- Bucket tesztobjektum-maradvány: 0
- Függő teszt multipart: 0
- Adatbázis-maradvány: 0
- Secret-kiszivárgás: 0
- PM2 és Nginx: PASS

A nyilvános letöltés továbbra is tiltott. `active` mód csak külön vírusellenőrző és biztonsági jóváhagyás után engedélyezhető.

Quarantine-aktiválás előtti `.env.local` mentés:

`/root/dimprover/backups/drop_s3_quarantine_activation_v040_20260802_224450/.env.local.before`
