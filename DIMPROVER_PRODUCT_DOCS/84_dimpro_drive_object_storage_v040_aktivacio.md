# DIMPRO DRIVE Object Storage 0.4.0 – tárhelyaktiválás

## Jelenlegi állapot

- DRIVE Core 0.3.0 adatbázis: aktív.
- Object Storage 0.4.0 adatbázis: aktív.
- Privát S3-kompatibilis bucket: nincs beállítva.
- Fájlfeltöltés és letöltés: fail-closed, letiltva.
- Mappák, dokumentum-metaadatok, verziók, audit és Desktop kurzor: működik.

## Kötelező szerveroldali változók

```dotenv
DIMPRO_DRIVE_STORAGE_MODE=disabled
DIMPRO_DRIVE_S3_ENDPOINT=<S3 HTTPS ENDPOINT>
DIMPRO_DRIVE_S3_REGION=<S3 REGION>
DIMPRO_DRIVE_S3_BUCKET=<KÜLÖN PRIVÁT DRIVE BUCKET>
DIMPRO_DRIVE_S3_ACCESS_KEY_ID=<SZERVEROLDALI ACCESS KEY>
DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY=<SZERVEROLDALI SECRET KEY>
DIMPRO_DRIVE_S3_FORCE_PATH_STYLE=false
DIMPRO_DRIVE_MAX_UPLOAD_MB=500
DIMPRO_DRIVE_SIGNED_URL_TTL_SECONDS=600
```

A kulcsok csak a VPS `.env.local` fájljába kerülhetnek. Böngészőbe, Desktop kliensbe, Gitbe, dokumentációba vagy chatüzenetbe nem kerülhetnek.

## Aktiválási sorrend

1. Külön privát bucket létrehozása kizárólag a DIMPRO DRIVE számára.
2. Külön, korlátozott S3 hozzáférési kulcs létrehozása ehhez a buckethez.
3. A fenti környezeti változók beállítása `disabled` módban.
4. PM2 újraindítás `--update-env` használatával.
5. Szerveroldali preflight futtatása:

```bash
node -r ./scripts/load-next-env.cjs scripts/drive-object-storage-v040-preflight.mjs
```

6. Sikeres preflight után `DIMPRO_DRIVE_STORAGE_MODE=quarantine`.
7. Valós, automatikusan törölt tesztfájl feltöltése és adatbázis-/objektum-takarítás ellenőrzése.
8. Letöltés továbbra is tiltott karantén módban.
9. Vírusellenőrzési vagy jóváhagyási folyamat után kapcsolható `active` módba.

## Biztonsági szabályok

- Bucket nem lehet nyilvános.
- A kliens csak rövid életű signed PUT/GET URL-t kap.
- Signed URL alapérték: 600 másodperc, maximum 900 másodperc.
- A végleges adatbázisrekord csak szerveroldali `HEAD` és méretellenőrzés után jön létre.
- A letöltés csak `AVAILABLE` verzióhoz engedélyezett.
- `QUARANTINED` verzió nem tölthető le.
- A DROP és a DRIVE külön bucketet, külön prefixet és lehetőség szerint külön hozzáférési kulcsot használjon.
