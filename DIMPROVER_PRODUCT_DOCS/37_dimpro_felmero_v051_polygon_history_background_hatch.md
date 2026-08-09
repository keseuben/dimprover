# DIMPRO Felmérő v0.5.1 – poligonális ipari rajzszerkesztő

Dátum: 2026-07-28

## Fejlesztési cél

A v0.5.1 a v0.5.0 Épület- és csarnokfelmérés munkamódját bővíti valódi, utólag szerkeszthető ipari vektormunkatérré. Fő célok:

- szabálytalan, poligonális épületkontúr;
- épület-, repedés- és térbeton-csomópontok közvetlen mozgatása;
- ipari Undo/Redo előzménytár;
- PDF- és képfájl háttérként történő betöltése;
- kétpontos, ismert távolság alapú háttérkalibrálás;
- valódi DXF ANSI31 HATCH export.

## Új adatmodell

A `PropertySurveyDraft` új mezői:

- `industrialBackground` – optimalizált háttér-előnézet és kalibrációs adatok;
- `industrialBuildingContours` – szinthez kötött poligonális épületkontúrok.

A korábbi v0.5.0 mentések automatikusan migrálódnak: hiányzó háttér `null`, hiányzó épületkontúr-lista `[]`; a korábbi pillér- és hibajelölési adatok megmaradnak.

## Poligonális épületkontúr

Az új **Épületkontúr** eszköz zárt poligont készít. Az elem:

- `ÉP-001`, `ÉP-002` stb. sorszámot kap;
- szinthez kapcsolódik;
- automatikus m²-területszámítást kap;
- saját megnevezéssel és megjegyzéssel szerkeszthető;
- DXF-ben a `DIMPRO_BUILDING` rétegre kerül.

A rendszer eltávolítja a kezdőponttal azonos duplikált zárópontot, így nincs egymást fedő fogópont és tisztább a DXF geometria.

## Csomópontszerkesztés

Kijelölés módban az aktív épületkontúr, térbeton-poligon, repedés és szabadkézi vonal cián fogópontokat jelenít meg. A pontok külön húzhatók. Mozgatás közben a koordináta valós méterben frissül, a hossz vagy terület újraszámolódik, a teljes húzás egyetlen Undo-lépés.

A pillérmozgatás ugyanezt a tranzakciós előzménylogikát használja.

## Undo / Redo

Az ipari panel külön **Visszavonás** és **Ismétlés** gombot kapott. Az előzménytár kezeli:

- munkaterület és rács;
- háttér és kalibráció;
- épületkontúrok;
- pillérek;
- repedések;
- térbeton-poligonok;
- szabadkézi jelölések.

Legfeljebb 40 állapot marad meg.

## PDF- és képháttér

A háttérimport kliensoldali MVP:

- PDF és böngésző által olvasható kép;
- legfeljebb 24 MB forrásfájl;
- legfeljebb 2200 px optimalizált képméret;
- PDF-nél az első oldal raszteres előnézete;
- az eredeti fájl nem kerül szerverre;
- láthatóság, opacity és szürkeárnyalat állítható;
- csere és törlés támogatott.

A PDF.js worker `.mjs` statikus asset. A middleware matcher kiegészült az `.mjs` kivétellel, így ugyanúgy statikus fájl, mint a `.js` assetek.

## Kétpontos kalibrálás

1. Ismert távolság megadása méterben.
2. **Háttér kalibrálása** eszköz kiválasztása.
3. A szakasz két végpontjának kijelölése.
4. A rendszer kiszámítja a skálaszorzót.
5. A munkaterület szélessége és hossza arányosan frissül.

Mentett adat: távolság, skálaszorzó és kalibrálási időpont.

Jelenlegi korlát: egységes léptékszorzó. A háttér külön forgatása, eltolása és négypontos torzításkorrekció későbbi fejlesztés.

## Rétegprioritás

Rajzolási és kalibrálási módban a meglévő épületkontúr, hibapoligon, repedés és pillér nem nyeli el a pointereseményt. Saját kijelölési eseményt csak **Kijelölés** módban kezelnek. Új elem meglévő objektum fölött is felvehető.

## DXF HATCH

A hibás térbetonfelület két DXF entitást kap:

1. zárt `LWPOLYLINE`;
2. valódi `HATCH`, `ANSI31` mintával.

HATCH adatok:

- réteg: `DIMPRO_CONCRETE_REPAIR`;
- szög: 45°;
- mintatávolság: 250 mm;
- zárt poligonhatár.

Megmaradó rétegek:

- `DIMPRO_BUILDING`;
- `DIMPRO_COLUMNS`;
- `DIMPRO_CONCRETE_REPAIR`;
- `DIMPRO_CRACKS`;
- `DIMPRO_FREEHAND`;
- `DIMPRO_TEXT`.

A négyszög pillérek forgatása az exportált geometriában is érvényesül.

## Érintett fájlok

Új:

- `components/property-survey/propertySurveyIndustrialBackground.ts`

Módosított:

- `components/property-survey/propertySurveyIndustrialModel.ts`
- `components/property-survey/PropertySurveyIndustrialPanel.tsx`
- `components/property-survey/propertySurveyWorkspaceTypes.ts`
- `components/property-survey/PropertySurveyPage.tsx`
- `components/viewers/SurveyFloorPlanEngine.tsx`
- `proxy.ts`

## Candidate teszt

- célzott ESLint: 0 hiba, 0 figyelmeztetés;
- teljes futó forráslint: 0 hiba;
- TypeScript: sikeres;
- Next.js production build: sikeres;
- standalone chunk: 116;
- statikus asset + PDF worker: 13/13;
- poligon létrehozás és csomópontmozgatás: sikeres;
- térbeton-csomópont és Undo/Redo: sikeres;
- képimport és kétpontos kalibráció: sikeres;
- PDF első oldal import: sikeres;
- DXF HATCH: 3/3 sikeres;
- desktop/tablet/mobil overflow: nincs;
- konzol-, oldal- és hálózati hiba: nincs.

## Következő fejlesztési irány

- háttér forgatás és eltolás;
- négypontos torzításkorrekció;
- több PDF oldal;
- csomópont beszúrása és törlése;
- derékszög- és tengely-snap;
- automatikus pillérsor-generátor;
- részletes repedésadatlap;
- szerveres projektmentés nagy háttérfájlokhoz.

## Éles kiadás

- Aktív build: `2gZn7A8bpKwOWByUD1HVt`
- Production rollback: `/root/dimprover/.next_before_ingatlan_v051_20260728_094103`
- Éles főoldali assetaudit: sikeres
- Éles DIMPRO Felmérő assetaudit PDF workerrel: sikeres
- Éles teljes poligon / Undo-Redo / kép-PDF / kalibráció / DXF HATCH E2E: sikeres
- PM2 `dimprover`: online
