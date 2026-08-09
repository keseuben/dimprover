# DIMPRO Felmérő v0.5.2 – háttértranszformáció, többoldalas PDF, snap és pillérgenerátor

Dátum: 2026-07-28

## Fejlesztési cél

A v0.5.2 a v0.5.1 poligonális ipari rajzszerkesztőjét bővíti pontosabb háttérillesztéssel, többoldalas PDF-kezeléssel, szerkeszthető vektor-topológiával, illesztési szabályokkal, tömeges pillérfelvétellel és részletes repedésdokumentációval.

## Háttér mozgatása, forgatása és méretezése

A háttérréteg új transzformációs adatai:

- `offsetXMeters` – vízszintes eltolás méterben;
- `offsetYMeters` – függőleges eltolás méterben;
- `rotationDegrees` – forgatás fokban;
- `scalePercent` – háttérméret százalékban.

Az új **Háttér mozgatása** eszközzel a háttér közvetlenül húzható a rajztérben. A teljes húzás egyetlen Undo-művelet. A forgatás, eltolás és méret mezőből is pontosan megadható, majd egy gombbal alaphelyzetbe állítható.

A háttér továbbra is a vektoros épület-, pillér- és hibajelölési rétegek alatt marad, és nem kerül bele a DXF exportba.

## Többoldalas PDF háttér

Az új `SurveyIndustrialBackgroundPage` adattípus oldalanként tárolja:

- PDF oldalszám;
- optimalizált raszteres előnézet;
- képpontszélesség és -magasság.

A háttéradat új mezői:

- `pages`;
- `activePageIndex`;
- `pageCount`;
- `sourcePageCount`.

MVP korlátok:

- legfeljebb 24 MB forrásfájl;
- legfeljebb az első 6 PDF oldal tárolódik helyi előnézetként;
- PDF oldalanként legfeljebb 1500 px-es optimalizált előnézet készül;
- kép esetén legfeljebb 2200 px;
- az eredeti fájl továbbra sem kerül szerverre;
- az oldalváltás az aktív háttér-előnézetet cseréli, a vektorrétegeket nem módosítja.

## Csomópont beszúrása és törlése

Az aktív épületkontúr, térbeton-poligon, repedés és szabadkézi vonal csomópontjai kijelölhetők.

### Beszúrás

- kijelölt pont esetén a pont utáni él felezőpontjába kerül az új csomópont;
- kijelölés nélkül a leghosszabb él felezőpontja kerül beszúrásra;
- nyitott és zárt vonalak egyaránt támogatottak.

### Törlés

- zárt poligonnál legalább 3 pont marad;
- nyitott vonalnál legalább 2 pont marad;
- a művelet visszavonható és ismételhető.

## Legfelső fogópont-réteg

A kijelölt vektor csomópontjai külön, legfelső SVG-interakciós rétegre kerültek. Ez megakadályozza, hogy egy fölöttük elhelyezkedő pillér vagy más rajzi elem elfogja a kattintást. A nem kijelölt pillérek és elemek továbbra is saját rétegükön választhatók.

## Tengely- és derékszög-illesztés

Új beállítások:

- `snapToGrid` – illesztés a megadott X/Y tengelykiosztásra;
- `snapToRightAngle` – illesztés az előző vagy következő pont X/Y koordinátájára;
- `snapToleranceMeters` – illesztési tűrés méterben.

Az illesztés alkalmazható:

- új épületkontúr rajzolásakor;
- repedés, térbeton és szabadkézi jelölés rajzolásakor;
- csomópont mozgatásakor;
- pillér felvételekor és mozgatásakor.

A munkaterületen kívüli koordinátákat a rendszer a rajzhatárra korlátozza.

## Automatikus pillérsor-generátor

A generátor paraméterei:

- kezdő X/Y koordináta;
- oszlop- és sorszám;
- X/Y kiosztás méterben;
- kör vagy négyszög alak;
- szélesség, mélység vagy átmérő;
- forgatás.

Szabályok:

- egy művelettel legfeljebb 400 pillér hozható létre;
- a pillérek automatikus, folyamatos sorszámot kapnak;
- a teljes generálás egyetlen Undo/Redo művelet;
- a rajzhatáron túli koordináták a munkaterület szélére korlátozódnak.

## Részletes repedésadatlap

A `SurveyIndustrialMarkup` repedésjelölései új mezőket kaptak:

- `crackSeverity`: hajszálrepedés, kisebb, közepes vagy súlyos;
- `crackStatus`: rögzítve, megfigyelés alatt, javítás tervezve vagy javítva;
- `crackWidthMillimeters`;
- `crackDepthMillimeters`;
- `locationDescription`;
- `causeAssessment`;
- `repairMethod`;
- `requiresStructuralReview`;
- `recordedAt`.

A DXF `DIMPRO_TEXT` rétege a repedés hossza mellett tartalmazza a szélességet, súlyosságot, státuszt és a statikai felülvizsgálati jelölést is.

## Visszafelé kompatibilitás

A v0.5.1 mentések automatikusan migrálódnak:

- a korábbi egylapos háttérből egyoldalas `pages` lista készül;
- háttértranszformáció alapértéke: 0 m, 0°, 100%;
- snap alapérték: tengely-snap kikapcsolva, derékszög-snap bekapcsolva, 0,25 m tűrés;
- a korábbi repedések megkapják a részletes adatlap alapértékeit.

A korábbi épületkontúrok, pillérek, térbeton-zónák, repedések és DXF-rétegek megmaradnak.

## Érintett fájlok

Módosított:

- `components/property-survey/propertySurveyIndustrialModel.ts`
- `components/property-survey/propertySurveyIndustrialBackground.ts`
- `components/property-survey/PropertySurveyIndustrialPanel.tsx`
- `components/property-survey/propertySurveyWorkspaceTypes.ts`
- `components/property-survey/PropertySurveyPage.tsx`
- `components/viewers/SurveyFloorPlanEngine.tsx`

## Candidate ellenőrzés

- célzott ESLint: 0 hiba, 0 figyelmeztetés;
- teljes futó forráslint: 0 hiba;
- TypeScript: sikeres;
- Next.js production build: sikeres;
- standalone chunk: 116;
- statikus asset + PDF worker: 13/13;
- kontúrpont beszúrás: 4 → 5 pont;
- kontúrpont törlés: 5 → 4 pont;
- pontművelet Undo/Redo: sikeres;
- derékszög-snap: X = 1,300 m maradt, Y módosult;
- tengely-snap: új pillér 30,000 / 15,000 m koordinátán;
- pillérgenerátor: 24 új pillér, egy Undo/Redo művelet;
- háromoldalas PDF: 3/3 oldal feldolgozva, 2. oldal megjelenítve;
- háttérmozgatás: 12,501 / 8,063 m tesztelt eltolás;
- forgatás: 15°;
- méretezés: 120%;
- repedésadatlap: súlyos, megfigyelés alatt, 4,2 mm, 35 mm, statikai felülvizsgálat;
- DXF: 18 156 bájt, 3 HATCH, repedésmetaadatokkal;
- v0.5.1 migráció: sikeres;
- helyi mentés tesztmérete: kb. 154 kB;
- desktop/tablet/mobil overflow: nincs;
- konzol-, oldal- és hálózati hiba: nincs.

## Következő fejlesztési irány

- négypontos perspektíva- és torzításkorrekció;
- 6 oldal feletti PDF oldalak igény szerinti betöltése;
- szerveres háttér- és projektmentés;
- külön rétegkezelő panel zárolással és láthatósággal;
- él-, pont- és tengelyazonosítók;
- automatikus méretlánc és pillértengely-feliratozás;
- repedésfotó és időbeli változáskövetés;
- poligon kivágás, egyesítés és megosztás.

## Éles kiadás

- Aktív build: `OyNodtezrN6-Dw90NeGzm`
- Production rollback: `/root/dimprover/.next_before_ingatlan_v052_20260728_103204`
- Éles főoldali assetaudit: sikeres
- Éles DIMPRO Felmérő assetaudit PDF workerrel: sikeres
- Éles teljes csomópont / snap / pillérgenerátor / többoldalas PDF / háttértranszformáció / repedésadatlap / DXF E2E: sikeres
- PM2 `dimprover`: online
