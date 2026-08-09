# DIMPRO DROP 0.8.0 – Tartós DIMPRO Drive archiválás

**Kiadás dátuma:** 2026. augusztus 4.  
**Állapot:** éles private-pilot kiadás  
**Nyilvános felület:** `https://drop.dimpro.hu`  
**Éles build:** `TAvdt6fCmIXa75CPiBxPT`  
**Aktív release:** `.next-v080-release-final`  
**Előző rollback release:** `.next-v070-release-final`

## Tárhelyarchitektúra

Igen, a fájlok a Hetzner Object Storage rendszerében tárolódnak. A DROP 0.8.0 két elkülönített tárhelyszintet használ:

1. **Drop ideiglenes bucket**
   - ide érkezik az eredeti feltöltés;
   - külön Drop hozzáférési kulcsot használ;
   - karantén, ClamAV-vizsgálat, ideiglenes megosztás és retention tartozik hozzá;
   - a megőrzési idő végén az objektum törölhető.

2. **DIMPRO Drive tartós bucket**
   - külön bucketet és külön Drive hozzáférési kulcsot használ;
   - ide csak a ClamAV által tisztának minősített fájlok kerülhetnek;
   - ide kerül a végleges A4-es PDF-riport is;
   - a Drive-példány nem törlődik a Drop retention folyamatával;
   - a tartós objektum a Projektkapu Drive dokumentum- és verziómodelljéhez kapcsolódik.

A két bucket ugyanazon Hetzner S3-kompatibilis végponton működhet, de a bucketnév és a hitelesítő kulcs eltérő. A rendszer nem nyilvános URL-lel másol: szerveroldali, titkosított adatfolyamon olvassa a Drop objektumot és írja a Drive objektumot.

## Automatikus archiválási folyamat

1. A Drop csomag projekthez kapcsolódik.
2. A Drop tér projektkapcsolatában az `archive_to_drive` beállítás aktív.
3. A feltöltés lezárul.
4. A worker elkészíti és lezárja a végleges PDF-riportot.
5. A worker összegyűjti a tiszta, letöltésre kész fájlokat.
6. A Drive-ban létrejön a `DIMPRO Drop archívum` gyökérmappa, ha még nem létezik.
7. Alatta létrejön a `<csomagkód> - <csomagnév>` csomagmappa.
8. A rendszer minden fájlt külön Drive objektumként, dokumentumként és dokumentumverzióként archivál.
9. A végleges PDF-riport külön Drive dokumentumként kerül mentésre.
10. Minden másolatnál megtörténik az objektumméret utólagos ellenőrzése.
11. A Drive dokumentum forrása `DROP`, a verzió állapota `AVAILABLE`.
12. A retention worker csak akkor törölheti a Drop ideiglenes példányait, ha minden kötelező Drive-objektum ellenőrzötten elkészült.

## Biztonsági szabályok

- fertőzött vagy még vizsgálat alatt álló fájl nem archiválható;
- csak `security_status=clean` és `virus_scan_status=clean` fájl kerülhet Drive-ba;
- friss, lezárt végleges PDF-riport kötelező;
- a Drop és Drive bucket, valamint a hozzáférési kulcs elkülönített;
- a Drive globális mód továbbra is `quarantine`;
- a normál WEB és DESKTOP Drive-feltöltések letöltési korlátozása változatlan;
- kizárólag a `source=DROP`, `status=AVAILABLE`, S3-tárhelyű archívum kap megbízható letöltési kivételt;
- a nyilvános worker API rejtett;
- az archívumállapot API Drop tér munkamenethez és csomagláthatósághoz kötött;
- hitelesítő kulcs vagy bucket-titok nem kerül health vagy API válaszba.

## Idempotencia és hibajavítás

Minden archivált elem stabil archiválási kulcsot kap:

- fájl: `drop:<packageId>:file:<fileId>`;
- riport: `drop:<packageId>:report:<reportId>`.

Ismételt workerfutáskor a rendszer nem hoz létre új dokumentumot. Ha a Drive dokumentumrekord már létezik, de az objektum hiányzik, és a Drop forrás még elérhető, a rendszer ugyanarra a Drive kulcsra visszaállítja a tartós másolatot. Már véglegesített Drive dokumentum után fellépő auditálási hiba esetén a Drive objektum nem törölhető vissza.

## Felhasználói felület

A kiválasztott Drop csomag alatt új **DIMPRO Drive archívum** állapotkártya jelenik meg. A kártya mutatja:

- szükséges-e a projektarchiválás;
- a kapcsolódó projekt nevét;
- archivált és elvárt elemek számát;
- a végleges riport állapotát;
- a tartós Drive-archívum elkészültét;
- a Projekt Drive közvetlen megnyitási lehetőségét;
- azt, hogy a Drop retention törlés már nem veszélyezteti a Drive-példányokat.

## Ellenőrzések

- DROP 0.8.0 szerződés: **43/43 PASS**;
- teljes TypeScript: **PASS**;
- teljes projekt ESLint: **0 hiba**, 113 korábbi figyelmeztetés;
- production build: **PASS**;
- éles buildazonosító: `TAvdt6fCmIXa75CPiBxPT`;
- külön Drop és Drive bucket: **PASS**;
- külön Drop és Drive hozzáférési kulcs: **PASS**;
- valós S3 képfeltöltés és ClamAV: **PASS**;
- automatikus PDF-riport: **PASS**;
- fájl és PDF Drive-archiválása: **PASS**;
- Drive dokumentumforrás `DROP`: **PASS**;
- Drive verzióállapot `AVAILABLE`: **PASS**;
- Drive globális mód `quarantine` maradt: **PASS**;
- megbízható Drop-archívum letöltése: **PASS**;
- byte-pontos letöltési egyezés: **PASS**;
- ismételt workerfutás duplikáció nélkül: **PASS**;
- Drive-példány működik a Drop-forrás törlése után: **PASS**;
- candidate és éles compiled worker E2E: **PASS**;
- desktop, tablet és mobil responsive teszt: **PASS**;
- konzol-, oldal- és hálózati hiba: **0**;
- tesztprojekt-, csomag-, fájl- vagy objektummaradvány: **0**.

## Release és rollback

- aktiválási mentés: `/root/dimprover/backups/drop_v080_release_20260804_165910`;
- release manifest: `/root/dimprover/.dimprover/releases/drop-v080-release.json`;
- rollback script: `/root/dimprover/scripts/rollback-drop-v080-release.sh`.
