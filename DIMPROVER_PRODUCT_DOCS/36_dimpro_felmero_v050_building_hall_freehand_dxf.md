# DIMPRO Felmérő v0.5.0 – Épület- és csarnokfelmérés, szabadkézi jelölés és DXF

Dátum: 2026-07-28

## Kiadás

- Modul: **DIMPRO Felmérő**
- Munkamód: **Épület- és csarnokfelmérés**
- Kiegészítő munkamód: **Térbeton- és burkolatfelmérés**
- Verzió: **v0.5.0**
- Route: `/ingatlanfelmero`
- Nyilvános elérés: `https://dimpro.hu/ingatlanfelmero`

## Forrásként használt felmérési minta

A fejlesztési munkafolyamat alapja a felhasználó által készített, egyoldalas:

- Demjén tanya, NAGISZ broiler telep;
- 11. és 12. épület;
- 25,30 × 41,80 m épületméret;
- M=1:125;
- rendszeres pillérháló;
- szabálytalan, raszterezett térbetoncsere-területek;
- vonalas repedésjavítások;
- terület- és hosszösszesítések.

A webes minta nem a rajz pontos digitális másolata, hanem a rajzon alkalmazott helyszíni munkafolyamatot és jelölési logikát szemlélteti.

## Modulstruktúra

A korábbi „DIMPRO Ingatlanfelmérő” fejléc **DIMPRO Felmérő** névre változott.

A Projektközpontban és a felmérési munkatérben választható munkamódok:

- Energetikai felmérés;
- Épület- és csarnokfelmérés;
- Térbeton- és burkolatfelmérés;
- Felújítási felmérés;
- Műszaki állapotfelmérés;
- Gyors alaprajz.

Az ipari munkamódokban:

- a Csarnokrajz munkalap megjelenik;
- a Gépészet lépés nem jelenik meg;
- a hőhatár-réteg nem jelenik meg;
- az energetikai módba visszaváltva a Gépészet és a hőhatár ismét elérhető.

## Kalibrált ipari munkatér

A pillérek és rajzi jelölések valós méterkoordinátákat tárolnak.

Beállítható:

- teljes munkaterület szélessége méterben;
- teljes munkaterület hossza méterben;
- X irányú pillértengely-osztás;
- Y irányú pillértengely-osztás;
- tengelyrács megjelenítése.

A képernyős zoom, lapformátum vagy monitorfelbontás nem módosítja a számított hosszakat és területeket.

## Csarnokminta

Épület- és csarnokfelmérés + Mintafelmérés választásakor létrejön:

- két csarnokkontúr;
- csarnokonként 25,30 × 41,80 m névleges méret;
- 48 pilléres mintaháló;
- három raszterezett térbeton-javítási poligon;
- egy repedésvonal;
- 55 × 42 m kalibrált összesített rajzi munkaterület.

## Pillérek

Pillér eszközzel az alaprajzra koppintva új pillér helyezhető el.

Tulajdonságok:

- automatikus `P-001`, `P-002` stb. azonosító;
- négyszög vagy kör alak;
- szélesség és mélység;
- körpillér átmérő;
- X és Y méterkoordináta;
- elforgatási szög;
- megjegyzés.

Kijelölés módban a pillér közvetlenül húzható. A látható pillérméret változatlan marad, de külön 48 rajzi egység átmérőjű láthatatlan érintési zónát kapott a biztos tabletes megfogáshoz.

Törlés: piros, két másodperces hosszú nyomás.

## Repedésrajzolás

A Repedés eszköz használata:

1. eszköz kiválasztása;
2. ujj vagy egér lenyomása;
3. repedés vonalának végigrajzolása;
4. felengedéskor vektoros vonal létrehozása.

A rendszer:

- simított pontsort tárol;
- `R-001`, `R-002` stb. sorszámot ad;
- valós méterben számolja a vonal hosszát;
- megnevezést és javítási megjegyzést tárol;
- külön piros vektorrétegen jeleníti meg.

## Hibás térbetonfelület

A Hibás térbeton eszközzel szabálytalan terület rajzolható körbe.

A rendszer:

- zárt poligont készít;
- sötétbarna, átlós raszterrel jelöli;
- `TB-001`, `TB-002` stb. azonosítót ad;
- cipőfűző-formulával m² területet számít;
- összesíti az összes javítandó térbetonfelületet;
- megjegyzést és javítási módot tárol.

A webes raszter vizuálisan követi a forrásrajz sötét sraffozott területeinek logikáját.

## Szabadkézi rajz

Az Egyéb szabadkézi eszköz kék vektoros vonalat készít.

Használható például:

- helyszíni megjegyzéshez;
- mozgási útvonalhoz;
- ideiglenes szerkezeti jelöléshez;
- felmérési segédvonalhoz;
- további CAD-átrajzolás előkészítéséhez.

Az elemek `SZ-001`, `SZ-002` stb. azonosítót kapnak.

## Mennyiségösszesítő

A Csarnokrajz panel élőben mutatja:

- pillérek darabszámát;
- repedések összes hosszát folyóméterben;
- hibás térbetonfelületek összes területét négyzetméterben;
- szabadkézi jelölések darabszámát.

## DXF export

A DXF export:

- ASCII DXF AC1015 formátumú;
- milliméter egységű;
- valós méretű vektoros elemeket tartalmaz;
- AutoCAD és Archicad további szerkesztésére készült.

Rétegek:

- `DIMPRO_BUILDING` – épület- és helyiségkontúrok;
- `DIMPRO_COLUMNS` – pillérek;
- `DIMPRO_CONCRETE_REPAIR` – hibás térbeton zárt poligonok;
- `DIMPRO_CRACKS` – repedés polylines;
- `DIMPRO_FREEHAND` – szabadkézi vonalak;
- `DIMPRO_TEXT` – azonosítók, mennyiségek és fejlécszövegek.

DXF entitások:

- `LWPOLYLINE` – kontúrok, repedések, szabadkézi vonalak és javítási zónák;
- `CIRCLE` – körpillér;
- zárt `LWPOLYLINE` – négyszög pillér és javítandó terület;
- `TEXT` – feliratok.

Fontos jelenlegi korlát: a webes raszter a DXF-ben egyelőre zárt poligonként, külön rétegen jelenik meg; natív DXF `HATCH` entitás még nem készül.

## Hőhatár használhatósági javítás

Energetikai mód Alaprajz munkalapján külön Hőhatár mérete kártya készült:

- automatikus fűtött terek követése;
- automatikus minden helyiség követése;
- kézi hőhatár;
- `Hőhatár igazítása a helyiségekhez` gomb.

Ez megoldja azt az esetet, amikor új helyiség nem fér bele a korábban kézzel beállított hőhatárba.

## Adatmigráció

A korábbi v0.4.1 felmérések betöltésekor automatikusan létrejön:

- alapértelmezett ipari munkaterület;
- üres pillérlista;
- üres ipari jelöléslista.

A meglévő energetikai, helyiség-, fal-, nyílászáró-, fotó- és hibajegyadatok változatlanul megmaradnak.

## Érintett fájlok

Új fájlok:

- `components/property-survey/propertySurveyIndustrialModel.ts`
- `components/property-survey/PropertySurveyIndustrialPanel.tsx`

Módosított fájlok:

- `components/property-survey/propertySurveyWorkspaceTypes.ts`
- `components/property-survey/PropertySurveyProjectCenter.tsx`
- `components/property-survey/PropertySurveyPage.tsx`
- `components/viewers/SurveyFloorPlanEngine.tsx`

## Biztonsági mentés

- `backups/ingatlanfelmero_v050_building_hall_20260728_054706`

## Candidate tesztek

- érintett ESLint: 0 hiba, 0 figyelmeztetés;
- teljes `app` és `components` forráslint: 0 hiba;
- TypeScript: sikeres;
- candidate production build: sikeres;
- standalone statikus chunk: 119 ellenőrizve;
- candidate assetaudit: 12/12;
- 2 csarnokos minta: sikeres;
- 48 mintapillér megjelenítése: sikeres;
- új pillér felvétele és húzása: sikeres;
- új repedés és méterhossz-számítás: sikeres;
- új raszterezett térbetonpoligon és m²-számítás: sikeres;
- új szabadkézi vektoros vonal: sikeres;
- pillértengely-rács: sikeres;
- DXF tényleges letöltése és 6 réteg ellenőrzése: sikeres;
- energetikai ↔ csarnokmód váltás: sikeres;
- hőhatár gyorsvezérlés: sikeres;
- desktop, tablet és mobil: nincs vízszintes overflow;
- JavaScript-, oldal- vagy hálózati hiba: nincs.

A beépített globális smoke ellenőrzés `npm run lint` lépése a projektgyökérben található nagyszámú ZIP-, backup- és munkafájl miatt a Node 2 GB-os heapkorlátján állt le. A tényleges futó forráskészlet külön, kötegelve 0 hibával ellenőrizve lett.

## Jelenlegi korlátok

- az épületkontúr továbbra is téglalap alapú helyiség-/csarnokelemekből áll;
- nincs még tetszőleges poligonális épületkontúr-szerkesztés;
- a szabadkézi vonal csomópontjai utólag még nem szerkeszthetők;
- nincs visszavonás/újra művelet az ipari rajzi rétegen;
- a DXF javítási zónája még nem natív HATCH;
- nincs PDF háttérimport és kalibrálás;
- az adatok továbbra is a böngésző helyi tárában mentődnek.

## Következő fejlesztési javaslat

1. Poligonális épületkontúr és vonal-/csomópont-szerkesztő.
2. Ipari rajzi visszavonás/újra.
3. Natív DXF HATCH és DIMENSION entitások.
4. PDF vagy kép háttérimport kétpontos méretkalibrálással.
5. Pillérsor automatikus kiosztása tengelyek alapján.
6. Repedéstípus, repedésszélesség és javítási sablonok.
7. Fotó és hibajegy közvetlen kapcsolása repedéshez vagy térbetonzónához.
8. Szerveres projektmentés és DIMPRO Drive fájlkapcsolat.

## Éles kiadás

- Aktív build: `hfKwLJTjHNXEtmAnR8csD`
- Production rollback: `/root/dimprover/.next_before_ingatlan_v050_20260728_065342`
- Éles főoldali assetaudit: 13/13 sikeres
- Éles DIMPRO Felmérő assetaudit: 12/12 sikeres
- Éles teljes csarnok-E2E és DXF-letöltés: sikeres
- PM2 `dimprover`: online
