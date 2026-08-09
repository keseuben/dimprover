# DIMPRO DROP 0.9.0 – Mobil PWA és egységes kép-/fájlfeltöltő

**Kiadás dátuma:** 2026. augusztus 4.  
**Állapot:** éles private-pilot kiadás  
**Nyilvános felület:** `https://drop.dimpro.hu`  
**Production build:** `t7E8Qgp0eEc8siO48RQqy`  
**Release könyvtár:** `.next-v090-release-final`  
**Közvetlen rollback:** `.next-v080-release-final`

## Cél

A DROP 0.9.0 egyetlen közös feltöltőmotort biztosít asztali, tablet és mobil használatra. A felület eszközhöz alkalmazkodik, de nem hoz létre párhuzamos adatmodellt vagy külön mobil tárhelyet. A mobil PWA és az asztali Drop ugyanazt a Drop teret, csomagot, képcsoportot, jogosultságot, Hetzner Object Storage tárhelyet, ClamAV-vizsgálatot, PDF-riportot és Drive-archiválási folyamatot használja.

## Mobil PWA

- telepíthető PWA Androidon;
- iPhone/iPad telepítési útmutató: Megosztás → Főképernyőhöz adás;
- önálló, teljes képernyős alkalmazásmód;
- külön 192×192 és 512×512 ikon;
- manifest és service worker;
- a service worker kizárólag nyilvános statikus elemeket gyorsítótáraz;
- privát API-válasz, navigáció, feltöltés, letöltés és riport nem kerül cache-be;
- a PWA és a normál webes felület ugyanazt a munkamenetet és biztonsági kaput használja.

## Egységes kezelőfelület

### Mobil

1. Galéria vagy Kamera megnyitása.
2. Több kép kiválasztása.
3. Képcsoport kiválasztása vagy új csoport létrehozása.
4. Automatikus képoptimalizálás.
5. Előnézet és méretmegtakarítás ellenőrzése.
6. Feltöltés indítása a mobil alsó műveleti sávról.

### Asztali és tablet

- drag & drop feltöltőtér;
- fájltallózás;
- ugyanaz a képcsoport- és képoptimalizálási logika;
- tágas, kétpaneles elrendezés;
- a haladó fájlnév-, méret- és minőségbeállítások alapból összecsukva maradnak.

## Képcsoportok

A `drop_groups` meglévő adatmodellje került bekötésre, ezért nem kellett adatbázis-migráció.

- új csoport készíthető a feltöltőben;
- ékezetes magyar csoportnév támogatott;
- automatikus, biztonságos csoportkód készül;
- azonos nevű csoport ismételt létrehozása nem hoz létre duplikációt;
- a feltöltési munkamenet `groupId` alapján rendeli a fájlt a csoporthoz;
- a fogadott fájllista, a PDF-riport és a későbbi Drive-archívum megőrzi a csoportkapcsolatot;
- csoportlétrehozás külön audit eseményt kap.

## Képoptimalizálás

- alapértelmezett maximális hosszú oldal: 2560 px;
- alapértelmezett minőség: 82%;
- JPEG, PNG és WebP optimalizálás;
- böngésző által támogatott HEIC/HEIF fájlok konvertálási kísérlete;
- Safari/iOS natív képelem-fallback;
- EXIF- és GPS-metaadatok eltávolítása a vászonra történő újrarajzolással;
- GIF és SVG eredeti formában marad;
- sikertelen dekódolásnál nem áll le a feltöltési sor: az eredeti fájl tölthető fel;
- régebbi mobilböngészőkhöz biztonságos kliensazonosító-fallback készült.

## Eredeti és mentett méret

A meglévő kvóta-, multipart-, retention- és tárhelymezők jelentése nem változott. A mobil eredeti méret külön auditált forrásmetrikaként tárolódik:

- `sourceOriginalSizeBytes`;
- `uploadSizeBytes`;
- `savedBytes`;
- `savedPercent`;
- `optimized`.

Ez az adat megjelenik:

- a feltöltési sorban;
- a fogadott fájllistában;
- a fájlállapot API-ban;
- a végleges PDF-riport összesítésében;
- a PDF fájljegyzékében;
- a PDF képmellékletében.

## Biztonság

- Drop tér munkamenet és `file.upload` jogosultság szükséges;
- a képcsoport API jogosulatlanul 401/403 választ ad;
- privát S3 bucket és külön Drop hitelesítő kulcs;
- darabolt, folytatható feltöltés;
- szerveroldali méret- és integritásellenőrzés;
- ClamAV-vizsgálatig karantén;
- fertőzött fájl nem tölthető le és nem archiválható Drive-ba;
- a PWA nem tárol privát választ offline cache-ben;
- worker secret és S3 titok nem kerül API- vagy health-válaszba;
- a publikus worker útvonal továbbra is rejtett.

## CSP és böngészős Object Storage kapcsolat

Az éles böngészőteszt során feltárt CSP-eltérés javítva lett. A signed multipart URL virtuális bucket-hostot használ, ezért a rendszer a konfigurált endpointból, bucketnévből és path-style beállításból számítja ki a pontos böngészős upload-origint.

- csak a konkrét Drop bucket HTTPS originje kerül a `connect-src` listába;
- nincs wildcard;
- nincs általános `https:` engedély;
- hibás bucket- vagy endpoint-beállításnál a külső origin nem kerül engedélyezésre;
- az éles HTTPS böngészős S3 `PUT` teszt PASS.

## Ellenőrzések

- DROP 0.9.0 szerződés: **43/43 PASS**;
- célzott ESLint: **PASS**;
- teljes TypeScript: **PASS**;
- teljes projekt ESLint: **0 hiba**, 113 korábbi figyelmeztetés;
- production build: **PASS**;
- buildazonosító: `t7E8Qgp0eEc8siO48RQqy`;
- 89 oldal generálása: **PASS**;
- 67 standalone statikus chunk: **PASS**;
- candidate health és PWA manifest: **PASS**;
- desktop, tablet és mobil responsive teszt: **PASS**;
- vízszintes túlcsordulás: **0**;
- konzolhiba, oldalhiba, sikertelen kérés: **0 / 0 / 0**;
- képcsoport létrehozás és duplikációvédelem: **PASS**;
- böngészőoldali képoptimalizálás: **PASS**;
- valós Hetzner Object Storage feltöltés: **PASS**;
- valós minta: 3 525 106 bájt → 627 952 bájt, **82% megtakarítás**;
- ClamAV tiszta eredmény: **PASS**;
- eredeti/mentett méret audit és files API: **PASS**;
- automatikus végleges PDF: **PASS**;
- PDF: 5 oldal, 745 821 bájt;
- PDF képcsoport, mobil eredeti méret és 82%-os megtakarítás: **PASS**;
- teszt e-mail küldése: **tiltva, 0 küldés**;
- orphan audit: 1 korábbi objektum és 1 félbemaradt multipart eltávolítva;
- végső tesztadat-maradvány: **0**.

## Release és rollback

- forrásmentés: `/root/dimprover/backups/drop_v090_final_source_20260804_193037`;
- release backup: `/root/dimprover/backups/drop_v090_release_20260804_200459`;
- release manifest: `/root/dimprover/.dimprover/releases/drop-v090-release.json`;
- rollback script: `/root/dimprover/scripts/rollback-drop-v090-release.sh`;
- közvetlen rollback cél: `.next-v080-release-final`.
