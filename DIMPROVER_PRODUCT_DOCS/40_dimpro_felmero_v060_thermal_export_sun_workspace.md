# DIMPRO Felmérő v0.6.0 – hőhatár, exportközpont, SUN mód és dinamikus munkatér

Dátum: 2026-07-28

## Fejlesztési cél

A v0.6.0 célja az energetikai hőhatár szakmailag helyes, falszakasz-alapú megjelenítése, az A4/A3/A2 PDF- és általános DXF-export elkészítése, a saját `.dimpro` munkafájl bevezetése, valamint a teljes képernyős terepi munkatér továbbfejlesztése kültéri és tabletes használatra.

## Falszakasz-alapú energetikai hőhatár

Az automatikus hőhatár már nem a helyiségek köré rajzolt, előre rögzített befoglaló téglalap.

A hőhatár a falmodellből készül, és az alábbi határolásokat követi:

- külső levegővel határos falszakasz;
- fűtött és fűtetlen helyiség közötti falszakasz;
- szomszédos épület vagy rendeltetési egység felőli falszakasz;
- kézi módban külön beállított hőhatár.

Fűtött helyiségek közötti belső fal nem kap energetikai hőhatár-jelölést.

A hőhatár munkamód szerint jelenik meg:

- Energetikai felmérés: elérhető;
- Felújítási felmérés: opcionálisan elérhető;
- Gyors alaprajz: rejtett;
- Épület- és csarnokfelmérés: rejtett;
- Térbeton- és burkolatfelmérés: rejtett.

## Dinamikusan bővíthető alaprajzi munkatér

A korábbi fix modellhatár miatt a papíron még látható, de a régi modellkereten kívüli területen a helyiségrajzolás nullára korlátozódhatott. Ez kívülről úgy látszott, mintha a szaggatott hőhatár akadályozná az új helyiséget.

A v0.6.0-ban:

- az energetikai és általános alaprajzi mód nagy virtuális koordinátateret használ;
- új helyiség a jelenlegi hőhatáron kívül is létrehozható;
- az új helyiség után a lap tartalma automatikusan újraközpontosodik;
- az automatikus lépték újraszámolódik;
- a falszakaszmodell és a hőhatár újraépül;
- a helyiségek mozgatása sem szorul a régi fix keretbe.

A csarnokmód külön, kalibrált ipari koordinátarendszere változatlan maradt.

## Részletes helyiségátfedési hibajegyzék

Az általános „N helyiségátfedés ellenőrzendő” üzenet tételes hibakártyákra bővült.

Minden átfedésnél megjelenik:

- az érintett két helyiség neve;
- az átfedő terület m²-ben;
- az átfedés szélessége és magassága méterben;
- az automatikusan átminősített falszakaszok;
- falszakaszonként a helyiség, oldal, határolástípus és hossz;
- javaslat arra, melyik kisebb helyiséget érdemes mozgatni;
- közvetlen kijelölőgomb mindkét érintett helyiséghez.

A részletes lista az Alaprajz és az Ellenőrzés munkalapon is elérhető.

## DIMPRO munkafájl

A szerkeszthető felmérési munkafájl alapértelmezett kiterjesztése:

```text
.dimpro
```

A fájl MIME-típusa:

```text
application/vnd.dimpro.survey+json
```

A v0.6.0 séma:

```text
dimpro.property-survey.v0.6.0
```

A munkafájl tartalmazza:

- projekt- és felmérésazonosítást;
- teljes felmérési draftot;
- helyiségeket, falakat és nyílászárókat;
- hőhatárt és rétegrendeket;
- fotó- és hibapontokat;
- gépészeti elemeket;
- ipari kontúrokat, pilléreket és jelöléseket;
- számított összesítőket.

Az Exportközpontból `.dimpro` fájl menthető és visszanyitható. Betöltéskor a fájl lecseréli az aktuális felmérés adatait, ezért a rendszer megerősítést kér.

## PDF-export

A rajzi PDF közvetlenül a böngészőből készül a közös SVG alaprajzi motorból. Nem a böngésző nyomtatási párbeszédét használja.

Támogatott lapméretek:

- A4;
- A3;
- A2.

Támogatott tájolások:

- álló;
- fekvő.

Összesen hat közvetlen PDF-kimenet állítható elő. A PDF-lap fizikai pontmérete megfelel az ISO lapméretnek, és a rajzi papírkeret a teljes PDF-oldalt kitölti.

A jelenlegi export az aktív szintet menti. A PDF-ben megjelenik a rajzi állapot, a falak, nyílászárók, hőhatár, fotó- és hibajelölések, illetve az adott munkamód vektorrétegei. A böngészős SVG a PDF-be nagy felbontású raszterképként kerül beágyazásra.

## Általános DXF-export

A DXF-export már nemcsak a csarnokmódban, hanem az energetikai és általános alaprajzi felmérésekben is elérhető.

Fő rétegek:

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

A DXF milliméter egységű, szerkeszthető 2D geometriát tartalmaz AutoCAD- és Archicad-továbbrajzoláshoz.

A csarnokmód korábbi rétegezett DXF-exportja és ANSI31 HATCH-kezelése változatlanul megmaradt.

## Teljes képernyős rajzeszköz-paletta

A teljes képernyős fókuszmód alján érintésbarát, vízszintesen görgethető rajzeszköz-paletta készült.

Energetikai és általános alaprajzi módban:

- Kijelölés;
- Helyiség;
- Fal;
- Nyílászáró;
- Fotó;
- Hiba;
- Gépészet;
- Tájolás;
- Export.

Ipari módban:

- Kijelölés;
- Épületkontúr;
- Pillér;
- Repedés;
- Térbeton;
- Szabadkézi rajz;
- Háttérmozgatás;
- Export.

A tájolás alaphelyzetben rejtett, mert jellemzően egyszer szükséges beállítani. A teljes képernyős paletta Tájolás gombja lebegő részletes tájolási panelt nyit.

## Türkizzöld állapot- és folyamatjelző

A teljes képernyős munkatér alján vékony állapotsáv készült.

Megjeleníti:

- a készültségi százalékot;
- a teljesített lépések számát;
- az aktív rajzeszközt;
- a mentési állapotot;
- a folyamatban lévő exportot;
- exporthiba esetén eltérő hibaszínt.

Alapállapotban türkizzöld folyamatjelzőt használ.

## SUN kültéri téma

A téma háromállapotú:

1. Világos;
2. Sötét;
3. SUN.

A SUN mód erős napfényre optimalizált:

- teljesen fedett fehér panelek;
- sötét szöveg és erősebb keretek;
- nagyobb gombkontraszt;
- erősebb rajzi rács;
- csökkentett áttetszőség;
- kontrasztos aktív türkiz eszközjelölés.

A választott téma LocalStorage-ban megmarad.

## Érintett fő fájlok

```text
components/property-survey/PropertySurveyPage.tsx
components/property-survey/PropertySurveyStructuresPanel.tsx
components/property-survey/propertySurveyThermalBoundary.ts
components/property-survey/propertySurveyExport.ts
components/viewers/SurveyFloorPlanEngine.tsx
```

## Teszteredmények

- Célzott ESLint: 0 hiba, 0 figyelmeztetés.
- TypeScript: sikeres.
- Teljes `app/components` lint: 0 hiba; csak korábban meglévő figyelmeztetések.
- Production candidate build: sikeres.
- Standalone statikus chunk: 124.
- Candidate főoldali assetek: 13/13.
- Candidate Felmérő assetek: 12/12.
- PDF worker: 200, 1 245 448 bájt.
- Hőhatáron kívüli új helyiség: 7 → 8 helyiség.
- Hőhatár újraszámítása: 12 → 16 falszakasz.
- Részletes átfedési hiba: helyiségnevek, terület, 3 érintett falszakasz és kijelölőgombok ellenőrizve.
- SUN mód és LocalStorage-megőrzés: sikeres.
- Teljes képernyős alsó paletta: 9 eszköz, állapotsáv és tájolási panel ellenőrizve.
- `.dimpro` export: 31 771 bájt, 9 helyiséggel.
- `.dimpro` visszanyitás: sikeres, 9 helyiség visszaállt.
- PDF A4 álló/fekvő: sikeres, fizikai lapméret ellenőrizve.
- PDF A3 álló/fekvő: sikeres, fizikai lapméret ellenőrizve.
- PDF A2 álló/fekvő: sikeres, fizikai lapméret ellenőrizve.
- Általános DXF: 8 874 bájt, kötelező rétegek és hőhatárvonalak ellenőrizve.
- Ipari regresszió: sikeres, 3 oldalas PDF-háttér, pillérgenerátor, repedésadatok és 3 ANSI31 HATCH.
- Desktop, tablet fekvő, tablet álló és iPad érintéses fókuszmód: sikeres.
- Böngészőkonzol-, oldal- és hálózati hiba: 0.

## Jelenlegi korlátok

- A rajzi PDF az SVG nagy felbontású raszterképét tartalmazza, nem teljesen vektoros PDF-et.
- A PDF- és általános DXF-export jelenleg az aktív szintet menti, nem készít automatikus többoldalas teljes épületcsomagot.
- A `.dimpro` fájl helyi fájlalapú munkafájl; közvetlen DIMPRO Drive-verziókezelés még nincs.
- A kézi hőhatár téglalap alapú; az automatikus mód már falszakasz-alapú.
- A hőhatár padló- és födémfelületeinek teljes energetikai összesítője, nettó falfelület és U-érték számítása következő fejlesztési kör.

## Következő javasolt fejlesztési kör

Javasolt v0.6.1:

1. több szint egyetlen többoldalas PDF-csomagban;
2. valódi vektoros PDF rajzkimenet;
3. energetikai felületösszesítő: külső fal, nyílászáró, padló, födém;
4. bruttó és nettó határolófelület;
5. rétegrendből számított U-érték;
6. WinWatt-kompatibilis irányonkénti összesítő;
7. `.dimpro` automatikus projektverziózás és DIMPRO Drive-mentés;
8. PDF fedlap, jelmagyarázat, projektadatok és mérnöki aláírási blokk.

## Éles kiadási adatok

```text
Verzió: v0.6.0
Állapot: released
Éles útvonal: https://dimpro.hu/ingatlanfelmero
Aktív build: v_2g4qIuKgBH2HAa45XrQ
Rollback: /root/dimprover/.next_before_ingatlan_v060_20260728_160552
Dev Center verzió ID: version_617d6d4b-df5
Aktív fejlesztési idő: 150 perc
Push értesítés: 1 elküldve, 0 sikertelen
```

Forrásbackup:

```text
backups/ingatlanfelmero_v060_heat_export_toolbar_20260728_125432
```

Dokumentációbackup:

```text
backups/ingatlanfelmero_v060_docs_20260728_160219
```
