# DIMPRO Drive V0.9.62 – Saját Drive feltöltés hibakezelési és integritásjavítás

Dátum: 2026.10.23. · SOURCE ONLY · PROD DENY.
Public DEV: továbbra is V0.9.52, nincs runtime váltás vagy DB migration.

## Cél

A V0.9.55 óta 500 fájlos, a V0.9.56 óta 100 MiB/fájl kapacitásra
felkészített Saját Drive feltöltési kliens és Content Core munkafolyamat
hibakezelési problémáinak csökkentése a valós hitelesített pilot előtt.

## Elkészült

1. **Kvóta összesítési fail-closed korrekció.**
   `personalQuotaPaging.ts` a tartalomobjektumokat most státusszal együtt
   kéri le; a jelenlegi SQL-hez azonosan csak `ACTIVE` objektumot számol,
   `DELETING`/`DELETED` esetén nem számol foglalást. A nem megtalált vagy
   megcsonkult batch nem számít 0 bájtnak: `PERSONAL_QUOTA_OBJECT_BATCH_INCOMPLETE`.
   A meglévő `getPersonalDriveStorageQuota` a hibát 503-ra normalizálja.
   `ACTIVE` és `REMOVED` USER referenciák továbbra is részei az összesítésnek;
   ugyanazon tartalomobjektum mérete egyszer szerepel.
2. **Egy feladat = egy request ID.**
   `PersonalDriveWorkspace.tsx` az átviteli feladat UUID azonosítóját
   küldi `x-dimpro-request-id`/FormData kérésben; korábbi második,
   külön UUID nem generálódik az átvitel kezdetén. Automatikus újrapróbálkozás
   továbbra sincs, és a task UUID a böngésző újranyitása után még nem tartós.
3. **Bizonytalan HTTP eredmény helyes besorolása.**
   `personalFormUpload.ts` bármely HTTP 5xx választ lehetséges szerveroldali
   rész-/véglegesítés után `uncertain=true` hibának minősít. Ezzel a UI
   `CONFIRMATION_UNKNOWN` státuszt mutat ahelyett, hogy biztos sikertelen
   feltöltést állítana. A 409, 413, 422 ellenőrzött elutasítás marad.
   Ismeretlen/hálózati válasz továbbra is bizonytalan.
4. **Felesleges nagy FormData elhagyása.**
   A 16 MiB-nál nagyobb fájl esetén az XHR a natív `File` objektumot
   közvetlen `application/octet-stream` adatfolyamban küldi.
   Csak a kisebb fájlokhoz készül `FormData`.
5. **Idempotens visszaigazolás S3 hash proof-fal.**
   A `/api/drive/personal/uploads` és
   `/api/drive/personal/uploads/stream` már létező USER ref esetén
   ismételten kiolvassa az immutable S3-objektum teljes SHA-256-át
   és méretét. Eltérésnél `PERSONAL_UPLOAD_PRIOR_OBJECT_INVALID` 409;
   az adatbázis CLEAN jelölése önmagában nem elegendő.
   A jelenlegi viselkedés nem próbál automatikusan új S3-fájlt készíteni.
6. **Valódi kliens-kódot futtató XHR unit teszt.**
   `scripts/tests/dimpro-drive-v0962-personal-xhr-contract.mjs` a tényleges
   TypeScript transzportot fordítja és izolált FakeXHR-rel futtatja:
   kis fájl FormData, 17 MiB stream, hitelesített cookie, ID/filename header,
   progress, 201, 409/413/422, 502/503, ismeretlen válasz, megszakítás.
7. **Forrás- és kvótatesztek.**
   `scripts/tests/dimpro-drive-v0962-personal-upload-integrity-contract.mjs`
   vizsgálja a két upload route idempotens S3 rehash ágát és release flagjeit.
   A V0.9.61 kvótateszt külön bizonyítja a hiányzó objektum fail-closed kezelését
   és a nem aktív objektumok SQL-lel egyező számlálását.

## QA eredmények

- `npx tsc --noEmit`: PASS.
- Célzott ESLint: PASS.
- V0.9.62 XHR runtime teszt: PASS.
- V0.9.62 integritás-szerződéses teszt: PASS.
- V0.9.61 + V0.9.50–59 regressziók, összesen **18** tesztfájl: PASS.
- A V0.9.60 öt SQL-migrációjának izolált PGlite tesztje: PASS.
- `git diff --check`: PASS.

## Valós E2E blokkolók (NEM TELJESÜLTEK)

- Nincs igazolt, hitelesített `Next.js → DEV S3 → DEV PostgreSQL`
  személyes fájlfeltöltés. A V0.9.61 valódi ClamAV INSTREAM teszt
  1/17/100 MiB-ban PASS, de ez nem a teljes alkalmazásfolyamat.
- Nincs browser-ellenőrzés 50/100/500 fényképpel és tényleges
  megszakítás/újratöltés viselkedéssel.
- A hosszú kérés teljes HTTP/Nginx proxy buffering/timeout tesztje nem futott.
- Az átviteli task UUID böngésző bezárása után nem visszaállítható;
  a jövőbeli tartós manifest/resume további munka.
- Az orphan S3 objektumok retention/reconciler flow-ja nem automatikus és
  még nincs auditált alkalmazásra engedélyezve.
- Az 5 GiB multipart `PERSONAL_MULTIPART_SERVER_RELEASED=false`
  állapotban marad, ClamAV 100 MiB pilot nem oldja fel.

**Következő fázis:** V0.9.63; izolált DEV teszt-identitás +
DEV S3 és DB területek pozitív környezeti bizonyítéka; scoped DB/S3
próbaműveletek, felhasználói browser E2E, majd külön jóváhagyott pilot release.
Nem indítottunk éles funkciót vagy adatbázis-migrációt.

## BUILD01 PASS és elkülönített DEV csomag – 2026.10.23.

- Source commit: `db76b827c5db525fe16bb75601b4afb5b1d8e444`.
- Build run: `benjadmin-drive-v0962-db76b827c-20261023-build01-b1`.
- BUILD01: **PASS**, Build ID: `1mnYT6gA4ee_SIogrnwUR`.
- Artifact SHA-256: `9b15239f4c68bff9111ea9d5fc78f8e73a89e2fc8196bd0b4f1ae84c947ba336`.
- BUILD01/gateway/DEV SHA-256: egyező, PASS.
- Izolált, nem futó DEV standalone: `/srv/dimpro-dev/candidates/drive-pilot/releases/db76b827c5db` (374 MiB).
- A két személyes upload endpoint a standalone csomagban ellenőrizve.
- Nincs PM2 indítás, nincs nginx cutover, nincs új S3-feltöltés, nincs adatbázis-migráció.
- A publikus DEV `1402cd6e5` (V0.9.52) maradt; PROD DENY változatlan.
- A BUILD PASS nem helyettesíti a hitelesített, valódi S3/DB/browser E2E-t.
