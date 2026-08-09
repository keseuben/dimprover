# DIMPRO Felmérő – új fejlesztőcsevegő átadási összefoglaló

Dátum: 2026-07-28

## Projekt és üzemeltetés

```text
Projekt: DIMPRO / DIMPROVER
Projektmappa: /root/dimprover
PM2 process: dimprover
Éles útvonal: https://dimpro.hu/ingatlanfelmero
Aktív verzió: v0.6.0
Aktív build: v_2g4qIuKgBH2HAa45XrQ
Rollback: /root/dimprover/.next_before_ingatlan_v060_20260728_160552
Dev Center verzió ID: version_617d6d4b-df5
Dev Center állapot: released
```

## Kötelező fejlesztési workflow

1. `get_server_status`.
2. Érintett fájlok beolvasása.
3. Forrás- és dokumentációs backup.
4. Fejlesztési verzió létrehozása a Dev Centerben és időmérés indítása.
5. Kódmódosítás kizárólag az érintett modulokban.
6. Dokumentációfrissítés.
7. Célzott ESLint.
8. `npx tsc --noEmit`.
9. Elkülönített production candidate build.
10. Candidate assetaudit és teljes böngésző E2E.
11. Ipari, desktop, tablet, mobil és iPad regresszió.
12. Atomikus `.next` csere rollbackmappával.
13. PM2 restart.
14. Éles teljes E2E és assetaudit.
15. Dev Center lezárás és push értesítés.

A globális gyökérszintű `npm run lint` a sok ZIP/backups miatt memóriaigényes lehet. A tényleges `app` és `components` forrásokat kötegelve kell lintelni.

## Termékstruktúra

A modul jelenlegi neve: **DIMPRO Felmérő**.

Munkamódok:

1. Energetikai felmérés.
2. Épület- és csarnokfelmérés.
3. Térbeton- és burkolatfelmérés.
4. Felújítási felmérés.
5. Műszaki állapotfelmérés.
6. Gyors alaprajz.

A közös rajzmotor:

```text
components/viewers/SurveyFloorPlanEngine.tsx
```

A munkamódok ugyanazt a motort, koordinátarendszert, zoom/pan rendszert, markerlogikát és exportelőkészítést használják.

## Elkészült fejlesztési szintek

### v0.1 – Energetikai MVP

- projekt nélküli kezdeti felmérési munkatér;
- helyiség-, szerkezet-, nyílászáró- és gépészeti adatok;
- közös SVG alaprajzi motor;
- alap tájolás és helyi mentés.

### v0.2–v0.2.2 – Projektközpont, hibák, tájolás és mérés

- projektközpont és projekten belüli felmérések;
- üres alaprajz és mintafelmérés;
- helyiségméretek külön hossz/kereszt/belmagasság mezőkkel;
- Bluetooth-lézer bridge előkészítés;
- hibapontok és fotók;
- részletes tájolás.

### v0.3–v0.3.1 – Többszint, falmodell és mágneses illesztés

- többszintes épületmodell;
- automatikus és kézi falszakaszok;
- külső/belső/fűtetlen falbesorolás;
- mozgatható és átméretezhető helyiségek;
- mágneses helyiségillesztés;
- falon mozgatható nyílászárók;
- 2 másodperces mentés/törlés/összevonás;
- külső falhossz és tájolás.

### v0.4–v0.4.1 – Energetikai adatmodell

- padló-, fal- és mennyezeti burkolatok;
- teljes és álmennyezettel csökkentett belmagasság;
- fal-, lábazat-, padló- és födémrétegrendek;
- arányos falvastagság;
- külön ajtó és ablak;
- helyiséghez kötött gépészeti berendezések;
- F-001, F-002 fotópontok;
- kisebb fotó- és hibamarkerek;
- irányítószám alapján offline településkitöltés;
- külön utca és házszám.

### v0.5.0 – Épület- és csarnokfelmérés

- kalibrált ipari rajztér;
- pillérek;
- szabadkézi repedés;
- raszterezett hibás térbeton-poligon;
- mennyiségösszesítő;
- rétegezett ipari DXF-export.

### v0.5.1–v0.5.2 – Ipari rajzszerkesztő

- poligonális épületkontúr;
- Undo/Redo;
- szerkeszthető vektorcsomópontok;
- kép- és PDF-háttér;
- több PDF-oldal;
- kétpontos kalibrálás;
- háttérmozgatás, forgatás és méretezés;
- csomópont beszúrás/törlés;
- derékszög- és tengelyillesztés;
- automatikus pillérsor-generátor;
- részletes repedésadatlap;
- valódi ANSI31 DXF HATCH.

### v0.5.3 – Tablet rajzi fókuszmód

- valódi teljes képernyős rajzi munkatér;
- bal Felmérési lépések perempanel;
- jobb Aktív munkalap perempanel;
- egérperem-nyitás és érintéses koppintás;
- panelrögzítés;
- lebegő felső gyorssáv;
- lap-/szintbeállítás külön lebegő panelen;
- iPad eseménykezelési javítások;
- mobil overflow-javítás.

### v0.6.0 – Hőhatár, exportközpont és SUN mód

- falszakasz-alapú automatikus hőhatár;
- külső, fűtetlen és szomszédos határoló szakaszok jelölése;
- fűtött–fűtött belső fal nem hőhatár;
- munkamód szerinti hőhatár-láthatóság;
- dinamikusan bővíthető virtuális alaprajzi munkatér;
- hőhatáron kívül is létrehozható új helyiség;
- automatikus lap-, lépték-, falmodell- és hőhatár-újraszámítás;
- gyors pointeres helyiségrajzolás stabilizálása;
- tételes helyiségátfedési hibajegyzék;
- `.dimpro` munkafájl export és import;
- A4/A3/A2 PDF-export álló és fekvő módban;
- általános rétegezett DXF-export;
- teljes képernyős alsó rajzeszköz-paletta;
- türkizzöld állapot- és folyamatjelző;
- tájolás alapértelmezett rejtése;
- lebegő részletes tájolási panel teljes képernyőben;
- Világos / Sötét / SUN kültéri téma.

## v0.6.0 fő érintett fájlok

```text
components/property-survey/PropertySurveyPage.tsx
components/property-survey/PropertySurveyStructuresPanel.tsx
components/property-survey/propertySurveyThermalBoundary.ts
components/property-survey/propertySurveyExport.ts
components/viewers/SurveyFloorPlanEngine.tsx
```

Kapcsolódó dokumentáció:

```text
DIMPROVER_PRODUCT_DOCS/29_dimpro_ingatlanfelmero_v01_mvp.md
DIMPROVER_PRODUCT_DOCS/30_dimpro_ingatlanfelmero_v02_hibafelvetel_tajolas.md
DIMPROVER_PRODUCT_DOCS/31_dimpro_ingatlanfelmero_v021_project_center_compact_orientation.md
DIMPROVER_PRODUCT_DOCS/32_dimpro_ingatlanfelmero_v022_room_dimensions_bluetooth.md
DIMPROVER_PRODUCT_DOCS/33_dimpro_ingatlanfelmero_v030_multilevel_wall_opening.md
DIMPROVER_PRODUCT_DOCS/34_dimpro_ingatlanfelmero_v031_dynamic_walls_magnetic_hold.md
DIMPROVER_PRODUCT_DOCS/35_dimpro_ingatlanfelmero_v040_energy_model_photos_mechanical.md
DIMPROVER_PRODUCT_DOCS/36_dimpro_felmero_v050_building_hall_freehand_dxf.md
DIMPROVER_PRODUCT_DOCS/37_dimpro_felmero_v051_polygon_history_background_hatch.md
DIMPROVER_PRODUCT_DOCS/38_dimpro_felmero_v052_background_transform_multipage_snap_pillars.md
DIMPROVER_PRODUCT_DOCS/39_dimpro_felmero_v053_tablet_focus_workspace.md
DIMPROVER_PRODUCT_DOCS/40_dimpro_felmero_v060_thermal_export_sun_workspace.md
```

## v0.6.0 exportok

### DIMPRO munkafájl

```text
Kiterjesztés: .dimpro
MIME: application/vnd.dimpro.survey+json
Séma: dimpro.property-survey.v0.6.0
```

Menthető és visszanyitható. Tartalmazza a teljes felmérési draftot, hibákat és számított összesítőket.

### PDF

- A4 álló;
- A4 fekvő;
- A3 álló;
- A3 fekvő;
- A2 álló;
- A2 fekvő.

Jelenleg az aktív szint készül el egyoldalas PDF-ben. A rajz nagy felbontású raszterként kerül a PDF-be.

### Általános DXF-rétegek

```text
DIMPRO_ROOMS
DIMPRO_WALL_EXTERNAL
DIMPRO_WALL_INTERNAL
DIMPRO_OPENINGS
DIMPRO_THERMAL
DIMPRO_PHOTOS
DIMPRO_ISSUES
DIMPRO_TEXT
```

Az ipari DXF külön réteglogikája és HATCH-kezelése változatlanul megmaradt.

## v0.6.0 ellenőrzött éles teszteredmények

- célzott ESLint: 0 hiba, 0 figyelmeztetés;
- TypeScript: sikeres;
- teljes `app/components` lint: 0 hiba;
- production build: sikeres;
- standalone chunk: 124;
- hőhatáron kívüli helyiség: 7 → 8;
- automatikus hőhatár: 12 → 16 falszakasz;
- részletes átfedési hiba: helyiségnevek, 1,50 m², 3 falmodell-elem és kijelölőgombok;
- SUN mód és LocalStorage-megőrzés: sikeres;
- teljes képernyős alsó paletta: 9 eszköz;
- türkizzöld állapotsáv: sikeres;
- részletes tájolás teljes képernyőben: sikeres;
- `.dimpro` export: 31 771 bájt, 9 helyiség;
- `.dimpro` éles visszanyitás: 9 helyiség;
- mind a hat PDF fizikai lapmérete ellenőrizve;
- általános DXF: 8 874 bájt, kötelező rétegek és hőhatárvonalak;
- ipari regresszió: sikeres, 3 ANSI31 HATCH;
- desktop 1680×1050: sikeres;
- tablet fekvő 1024×768: sikeres;
- tablet álló 768×1024: sikeres;
- iPad Pro érintéses 834×1194: sikeres;
- mobil 390 px: nincs vízszintes overflow;
- éles főoldali assetek: 13/13;
- éles Felmérő assetek: 12/12;
- PDF worker: 200, 1 245 448 bájt;
- konzol-, oldal- és hálózati hiba: 0;
- PM2 hibanapló-delta: 0 új sor;
- PM2 `dimprover`: online.

## Jelenlegi korlátok

- a PDF rajz nagy felbontású raszter, nem teljesen vektoros;
- a PDF és az általános DXF jelenleg csak az aktív szintet exportálja;
- nincs automatikus többoldalas teljes épület-PDF;
- a `.dimpro` munkafájl még nem kapcsolódik DIMPRO Drive verziókezeléshez;
- nincs rétegrendből automatikusan számított U-érték;
- nincs bruttó/nettó energetikai határolófelület-összesítő;
- nincs kész WinWatt export/adatlap;
- nincs PDF fedlap, jelmagyarázat és aláírási blokk.

## Következő javasolt fejlesztés – v0.6.1

Fejlesztési sorrend:

1. több szint egyetlen többoldalas PDF-ben;
2. PDF fedlap projekt- és ingatlanadatokkal;
3. jelmagyarázat és mérnöki aláírási blokk;
4. valódi vektoros PDF rajzkimenet;
5. külső fal bruttó felülete;
6. nyílászárók levonása és nettó falfelület;
7. padló- és födémfelület;
8. rétegrendből számított U-érték;
9. tájolásonkénti energetikai összesítő;
10. WinWatt-kompatibilis adatcsomag;
11. `.dimpro` projektverziózás és DIMPRO Drive-mentés.

## Fontos fejlesztési elvek

- A közös rajzmotor ne legyen modulonként lemásolva.
- Az energetikai és ipari munkamód csak feature flaggel és külön eszközpalettával váljon szét.
- A helyiség-, fal-, nyílászáró- és hőhatáradat egyetlen közös adatmodellben maradjon.
- Minden export ugyanabból az aktuális draftból készüljön.
- A PDF- és DXF-export előtt legyen kötelező geometriai ellenőrzés.
- A részletes hibák mindig nevezzék meg a konkrét érintett elemeket.
- Tablet és terepi használat elsődleges; minden új vezérlő legyen érintésbarát.
- Minden fejlesztés után frissíteni kell a kapcsolódó `DIMPROVER_PRODUCT_DOCS` fájlokat.
