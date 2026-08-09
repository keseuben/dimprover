# DIMPRO Projektkapu – DRIVE Private S3 Activation 0.8.1

## Cél

A már elkészült DRIVE Object Storage 0.4.0 és Quarantine Review 0.4.1 valós, különálló privát S3-kompatibilis tárhellyel történő aktiválása. Az első éles mód `quarantine`; a letöltés addig tiltott, amíg a fájl jóváhagyása meg nem történik.

## Kiinduló állapot

- DRIVE Core 0.3.0: aktív;
- Object Storage 0.4.0 adatbázis: aktív;
- Quarantine Review 0.4.1: aktív;
- külön DRIVE bucket: még nincs;
- DRIVE S3 endpoint, régió, bucket és credential: nincs beállítva;
- valós fájlfeltöltés és letöltés: fail-closed;
- DROP tárhely és DROP-kulcs nem használható újra.

## Providerirány

Elsőként Hetzner Object Storage használata készül elő. Javasolt külön Hetzner Cloud projekt létrehozása `DIMPRO DRIVE Storage` néven, hogy a projektben generált S3-kulcsok ne férjenek hozzá más termékek bucketjeihez.

A VPS-ről 2026-08-02-án mért teljes TLS-kapcsolódási idők:

- `fsn1`: 0,0935 s;
- `nbg1`: 0,1116 s;
- `hel1`: 0,1362 s.

A konfiguráló alapértelmezett endpointja ezért:

`https://fsn1.your-objectstorage.com`

## Kötelező provideroldali lépések

1. Hetzner Console-ban külön projekt létrehozása, például `DIMPRO DRIVE Storage`.
2. A projektben Object Storage megnyitása.
3. Külön bucket létrehozása:
   - hely: Falkenstein / `fsn1`;
   - név: globálisan egyedi, kisbetűs, 3–63 karakteres;
   - láthatóság: `Private`;
   - javasolt névminta: `dimpro-drive-prod-<egyedi-azonosito>`.
4. Security → S3 Credentials → Generate credentials.
5. Leírás: `DIMPRO DRIVE production server`.
6. Az access key és secret key biztonságos ideiglenes mentése. A secret key később nem kérhető le újra.
7. A kulcsokat nem szabad chatbe, e-mailbe, dokumentációba vagy forráskódba másolni.

## Biztonságos VPS-konfiguráció

Kapcsolódás:

```bash
ssh root@213.160.68.24
```

Projektmappa:

```bash
cd /root/dimprover
```

Interaktív konfiguráló:

```bash
./scripts/configure-drive-s3-v081.sh
```

A program bekéri:

- HTTPS endpoint;
- régió;
- bucketnév;
- access key ID;
- rejtetten a secret access key;
- path-style címzés szükségessége.

Hetzner `fsn1` esetén az alapértékek:

- endpoint: `https://fsn1.your-objectstorage.com`;
- régió: `fsn1`;
- path-style: `false`.

A konfiguráló:

1. 600-as jogosultságú `.env.local` mentést készít;
2. a DRIVE változókat `disabled` módban menti;
3. nem ír ki titkos kulcsot;
4. lefuttatja a bucket HEAD/PUT/HEAD/GET/checksum/DELETE preflightot;
5. beállítja és visszaolvassa a Projektkapu CORS-szabályt;
6. lefuttatja a titokmentes readiness ellenőrzést;
7. nem kapcsolja be automatikusan a valós feltöltést.

## Beállított környezeti változók

```dotenv
DIMPRO_DRIVE_STORAGE_MODE=disabled
DIMPRO_DRIVE_STORAGE_PROVIDER=s3-compatible
DIMPRO_DRIVE_MAX_UPLOAD_MB=500
DIMPRO_DRIVE_SIGNED_URL_TTL_SECONDS=600
DIMPRO_DRIVE_UPLOAD_SESSION_TTL_MINUTES=30
DIMPRO_DRIVE_S3_ENDPOINT=https://fsn1.your-objectstorage.com
DIMPRO_DRIVE_S3_REGION=fsn1
DIMPRO_DRIVE_S3_BUCKET=<PRIVÁT DRIVE BUCKET>
DIMPRO_DRIVE_S3_ACCESS_KEY_ID=<ACCESS KEY>
DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY=<SECRET KEY>
DIMPRO_DRIVE_S3_FORCE_PATH_STYLE=false
```

A tényleges kulcsértékek csak `/root/dimprover/.env.local` fájlban tárolhatók, 600-as fájljogosultsággal.

## CORS

A konfiguráló az alábbi bucket CORS-szabályt alkalmazza:

- origin: `https://projektkapu.dimpro.hu`;
- metódusok: `PUT`, `GET`, `HEAD`;
- engedélyezett fejlécek: `*`;
- exponált fejlécek: `ETag`, `x-amz-request-id`, `x-amz-id-2`;
- cache: 600 másodperc.

## Következő automatikus ellenőrzés

A konfiguráló sikeres futása után a fejlesztési folyamat végzi:

1. konfiguráció- és bucket-preflight ismétlése;
2. `quarantine` mód beállítása;
3. PM2 restart `--update-env` opcióval;
4. DRIVE health ellenőrzés;
5. rövid életű signed PUT URL létrehozása;
6. valós tesztfájl feltöltése;
7. szerveroldali HEAD- és méretellenőrzés;
8. atomikus dokumentum-/verzió-véglegesítés;
9. QUARANTINED státusz ellenőrzése;
10. letöltés tiltásának ellenőrzése;
11. jóváhagyás és elutasítás;
12. objektum- és adatbázis-takarítás;
13. D6 projekt tiszta állapotának igazolása.

## Visszaállítás

A konfiguráló kiírja a létrehozott mentés pontos útvonalát. Visszaállítás:

```bash
cd /root/dimprover
./scripts/rollback-drive-s3-v081.sh /root/dimprover/backups/drive_s3_credentials_v081_ÉÉÉÉHHNN_ÓÓPPMM/.env.local.before
```

A visszaállító a jelenlegi `.env.local` fájlról újabb biztonsági mentést készít, visszaállítja a korábbi fájlt, majd `pm2 restart dimprover --update-env` parancsot futtat.

## Biztonsági szabályok

- A bucket mindig privát marad.
- A DROP és DRIVE külön projektet/bucketet/kulcsot használ.
- Titkos kulcs nem kerül böngészőbe, Desktop kliensbe, Gitbe, dokumentációba vagy chatbe.
- A böngésző csak rövid életű signed URL-t kap.
- Az első aktív mód `quarantine`; a letöltés tiltott.
- `active` mód csak a teljes feltöltés–review–letöltés teszt után kapcsolható.
- A konfigurációs és rollback scriptek csak root felhasználóval futnak.

## Elkészült szerveroldali eszközök

- `/root/dimprover/scripts/configure-drive-s3-v081.sh`;
- `/root/dimprover/scripts/rollback-drive-s3-v081.sh`;
- `/root/dimprover/scripts/drive-object-storage-v040-preflight.mjs`;
- `/root/dimprover/scripts/drive-object-storage-v081-cors.mjs`;
- `/root/dimprover/scripts/drive-object-storage-v081-readiness.mjs`.

## Jelenlegi blokkoló tényező

A Hetzner Console-ban még létre kell hozni a külön privát bucketet és az S3 credentialpárt. A szolgáltató nem biztosít olyan külön API-t, amellyel a credential a jelenlegi VPS-jogosultságból automatikusan előállítható lenne.
## Quarantine aktiválás és valós E2E eredmény – 2026. augusztus 2.

A külön Hetzner Object Storage bucket sikeresen konfigurálva:

- bucket: `dimpro-drive-prod-20260802-kb`;
- régió: `fsn1`;
- mód: `quarantine`;
- maximális feltöltés: 500 MB;
- signed URL TTL: 600 másodperc;
- böngészős origin: `https://projektkapu.dimpro.hu`;
- DROP credential és DROP tárhely nincs újrahasználva.

Valós éles végpontteszt eredménye: 31 ellenőrzés PASS.

Ellenőrzött folyamat:

1. elkülönített tesztprojekt létrehozása;
2. signed PUT URL kiadása;
3. két valós tesztobjektum feltöltése a Hetzner bucketbe;
4. szerveroldali HEAD és bytepontos méretellenőrzés;
5. atomikus dokumentum- és verzió-véglegesítés `QUARANTINED` állapotban;
6. globális letöltéstiltás ellenőrzése;
7. APPROVE döntés után `AVAILABLE` adatbázisállapot, de quarantine módban továbbra is tiltott letöltés;
8. REJECT döntés után `REJECTED` állapot és az objektum azonnali törlése;
9. cleanup-feladat `COMPLETED`, 1 próbálkozás, hiba nélkül;
10. jóváhagyott tesztobjektum kontrollált törlése;
11. projekt-prefix ürességének ellenőrzése;
12. tesztprojekt és minden adatbázisrekord teljes cascade takarítása;
13. D6 projekt változatlan tiszta állapota;
14. titkos kulcs nem került naplóba vagy jelentésbe.

E2E jelentés:

`/root/dimprover/.work_projectgate_drive_s3_v081_e2e_result.json`

A DRIVE 0.8.1 kiadási állapota: quarantine pilot kész. Az `active` letöltési mód csak vírusellenőrző vagy dokumentált biztonsági jóváhagyás után kapcsolható be.
