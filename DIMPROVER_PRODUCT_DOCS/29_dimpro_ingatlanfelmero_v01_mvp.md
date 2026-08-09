# DIMPRO Ingatlanfelmérő v0.1 MVP

Dátum: 2026-07-27

## Terméknév

- Fő modulnév: **DIMPRO Ingatlanfelmérő**
- Alcím: **Energetikai és műszaki helyszíni felmérés**
- Első kiemelt munkamód: **Energetikai felmérés**
- Route: `/ingatlanfelmero`
- DIMPRO termékkód: `INGATLANFELMERO`
- Hozzáférési kód előkészítés: `PROPERTY_SURVEY`

## Cél

A modul tabletalapú, alaprajz-központú helyszíni adatfelvételt biztosít energetikai számításhoz, felújítási felméréshez, műszaki állapotfelméréshez és gyors alaprajz készítéséhez.

Alapelv:

> LiDAR-ral gyorsan felrajzoljuk, Bluetooth-lézerrel pontosítjuk, térképen tájoljuk, majd energetikai szerkezetekkel és gépészeti adatokkal egészítjük ki.

## Elkészült MVP funkciók

- mobil-, tablet- és desktop-reszponzív felület;
- világos és sötét téma;
- nyolclépéses felmérési workflow:
  1. Ingatlan;
  2. Alaprajz;
  3. Szerkezetek;
  4. Nyílászárók;
  5. Gépészet;
  6. Fotók;
  7. Ellenőrzés;
  8. Export;
- közös, újrahasznosítható SVG-alaprajzi motor;
- helyiségkijelölés az alaprajzon;
- zoom, pan, teljes rajz nézet;
- rács-, méret- és hőhatár réteg;
- helyiségek felvétele és törlése;
- helyiségenkénti alapterület, belmagasság, fűtött/fűtetlen állapot és tájolás;
- északi tájolási szög csúszkával és adatforrással;
- HRSZ, cím, ingatlantípus és felmérési alapadatok;
- határoló szerkezetek, adatforrás és bizonyossági szint;
- nyílászáró-alaptípus, üvegezés, keret, U-érték és árnyékolás;
- fűtési, HMV-, szellőzési, hűtési és megújulóenergia-adatok;
- mobil/tablet kamera fájlválasztó és fotókapcsolat;
- automatikus teljességellenőrzés;
- geometriai összesítő: alapterület, fűtött alapterület, térfogat, nyílászáró darabszám;
- localStorage alapú automatikus MVP mentés;
- strukturált `dimpro.property-survey.v0.1` JSON export;
- nyomtatás / PDF előkészítés;
- DIMPRO nyilvános kezdőlapi modul-kártya;
- DIMPRO központi modulregiszter bekötés.

## Közös viewer / engine elv

A modul nem készít párhuzamos másolatot a meglévő PDF/IFC tervnézőből. A meglévő `components/viewers` közös motorcsaládon belül új `SurveyFloorPlanEngine` komponens készült.

Átvett működési elvek:

- központi viewer komponens;
- zoom és teljes rajz nézet;
- koordináta-alapú overlay rétegek;
- külön munkatér és szerkesztőpanel;
- reszponzív használat;
- későbbi exportmotorhoz továbbadható normalizált geometria.

A meglévő PDF.js és IFC nézők működése nem módosult.

## Eszközintegráció állapota

Az MVP felület nem állít valótlan hardverkapcsolatot.

- LiDAR: a fogadó UI és adatmodell elkészült; a valódi iPad LiDAR felméréshez natív iOS RoomPlan bridge szükséges.
- Bluetooth-lézer: Bosch/Leica adapterhely megjelenik; valódi mérésfogadáshoz gyártói SDK vagy natív BLE adapter szükséges.
- Offline mód: jelenleg böngésző localStorage mentés; később IndexedDB offline queue és szerveres szinkron szükséges.

## Érintett fájlok

- `app/ingatlanfelmero/page.tsx`
- `components/property-survey/PropertySurveyPage.tsx`
- `components/viewers/SurveyFloorPlanEngine.tsx`
- `app/lib/dimpro/modules.ts`
- `components/aruter/DimproPublicLanding.tsx`
- `proxy.ts`

## Következő fejlesztési kör

1. Supabase/PostgreSQL projekt- és felmérés-adatmodell.
2. Szintek, épületszárnyak és több alaprajz kezelése.
3. Fal- és helyiségrajzolás, fogópontok, méretvonalak és geometriai szerkesztés.
4. PDF/DXF alaprajz import és méretarányos kalibrálás a közös viewer motorral.
5. Natív iOS RoomPlan / LiDAR bridge.
6. Bosch és Leica Bluetooth mérőadapter.
7. Fotófájlok valódi feltöltése, célmappa- és projektkapcsolat.
8. PDF/DXF/IFC export és energetikai számítóprogram-adatcsomag.
9. DIMPROVER projektmodulba beágyazott változat feature flaggel és jogosultságkezeléssel.

## Élesítési eredmény – 2026-07-27

- Aktív build: `7T7p5j2riAFBfqM0IgFY1`
- Nyilvános elérés: `https://dimpro.hu/ingatlanfelmero`
- Zárt app elérés: `https://app.dimpro.hu/ingatlanfelmero` – bejelentkezés szükséges
- Production build: sikeres, exit code 0
- TypeScript: sikeres
- Érintett fájlok ESLint ellenőrzése: 0 hiba, 0 figyelmeztetés
- Desktop/tablet/mobil Puppeteer smoke: sikeres
- Főoldali asset audit: 13/13 sikeres
- Ingatlanfelmérő asset audit: 12/12 sikeres
- PM2 `dimprover`: online

A valós LiDAR/RoomPlan és Bluetooth-lézer kapcsolat nem része a v0.1 webes MVP-nek. A felület a szükséges adapterpontokat és állapotjelzéseket előkészíti, de nem jelez valótlan hardverkapcsolatot.
