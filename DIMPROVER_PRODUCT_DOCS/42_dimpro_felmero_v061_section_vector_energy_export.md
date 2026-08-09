# DIMPRO Felmérő v0.6.1 – közös metszet, vektoros épület-PDF és energetikai felületösszesítő

Dátum: 2026-07-28

## Fejlesztési cél

A v0.6.1 a DIMPRO Felmérő közös alaprajzi motorját teljes épület-felmérési és energetikai dokumentumkészítő irányba bővíti. A fejlesztés három fő problémát old meg:

1. a rajzlap és az exportok egyértelmű, DIMPRO arculatú északjelet kapnak;
2. a geometriai helyiségátfedések hibánként, összecsukva és javítás után automatikusan eltűnve jelennek meg;
3. minden felmérési munkamódban létrehozható alaprajzi metszetvonal és hozzá tartozó szerkeszthető épületmetszet.

A fejlesztési kör ezen felül elkészíti a többoldalas vektoros PDF-et, az energetikai határolófelületek számítását, a WinWatt-előkészítő adatcsomagot, valamint a verziózott `.dimpro` munkafájl és DIMPRO Drive-mentés alapját.

## Közös metszeti felmérés

A Metszet önálló felmérési lépésként minden munkamódban elérhető:

- Energetikai felmérés;
- Épület- és csarnokfelmérés;
- Térbeton- és burkolatfelmérés;
- Felújítási felmérés;
- Műszaki állapotfelmérés;
- Gyors alaprajz.

Az alaprajzon a felhasználó húzással helyezi el a metszetvonalat. A metszet két végén azonosító jelenik meg, például `A-A`, a vonal pedig külön lila metszeti rétegen látható.

A metszet adatmodellje tartalmazza:

- metszet azonosítója és neve;
- metszett szint;
- alaprajzi kezdő- és végpont;
- általános épület-, padlástéri, csarnok- vagy egyedi metszettípus;
- lapostető, nyeregtető, félnyeregtető vagy egyedi tetőforma;
- padlószint;
- belmagasság;
- eresz- vagy fal-felsősík magasság;
- gerincmagasság;
- felső sík magassága;
- bal és jobb térdfalmagasság;
- bal és jobb tetőhajlás;
- tetőablak darabszám, oldal, szélesség, magasság és alsó élmagasság;
- metszeti megjegyzés.

A metszeti előnézet SVG-alapú. Padlástéri felmérésnél megkülönbözteti a függőleges falat, térdfalat, ferde tetősíkot és tetőablakot. Csarnokmódban magasabb eresz-, gerinc- és felsősík alapértékeket ajánl fel.

A közös `SurveyFloorPlanEngine` motort nem másoltuk le. A metszeti vonal és rajzolási állapot ugyanabban az SVG-, koordináta-, zoom-, pan- és exportmotorban működik, mint az energetikai és ipari rajzi elemek.

A metszet törlése biztonsági művelet: a törlőgombot folyamatosan 2 másodpercig nyomva kell tartani. Rövid kattintás vagy megszakított nyomás nem törli a metszetet.

A metszetazonosítók automatikusan ABC-sorrendben növekednek: `A-A`, `B-B`, `C-C`, később `AA-AA`. A sorszámképzés a már meglévő metszetek legnagyobb betűjele alapján történik.

A metszetrajzolás három iránymóddal használható:

- `Szabad`: tetszőleges ferde metszetvonal;
- `Vízszintes`: a végpont Y-koordinátája automatikusan a kezdőponthoz zár;
- `Függőleges`: a végpont X-koordinátája automatikusan a kezdőponthoz zár.

A vízszintes és függőleges iránysegéd megakadályozza a véletlen, néhány fokos ferde metszetvonalat.

A metszeti modell padló- és födémvastagság mezőket kapott. A metszetvonal által keresztezett, alaprajzon `belső` falszakaszként rögzített falak a falszakasz geometriájából automatikusan kerülnek a metszeti előnézetbe és a vektoros PDF metszetoldalára. Az egymásra eső, két helyiség felől duplán leírt belső falmetszések összevonódnak.

## Rajzkeret és A4-alapú rajzadat-fejléc

Minden alaprajzi rajzlapon türkízzöld, az északjel külső hexagonvonalánál vékonyabb keret jelenik meg a papírszéltől 5 mm-re. A keret és a fejléc a vektoros PDF rajzoldalain is megmarad.

Az alsó kerethez igazított rajzadat-fejléc fizikai alapmérete az A4 álló laphoz készült: 200 × 34 mm. Ugyanez a fizikai fejlécméret kerül az A3 és A2 lapokra is, ezért a nagyobb lapokon nem nyúlik aránytalanul szét. A fejléc legfeljebb két sorba töri a hosszabb adatokat.

Rögzített adatok: projekt neve, felmérés neve, felmérés típusa, helyszín és helyrajzi szám, felmérés dátuma, készítő, lapméret és tájolás, valamint `M=1:...` lépték.

## DIMPRO északjel

A rajzlap jobb felső sarkában állandó DIMPRO északjel jelenik meg:

- külső, rögzített türkiz hexagon;
- belső, aszimmetrikus sötét irányjelző hexagon;
- a belső forma hegyes csúcsa mutatja az aktuális északi irányt;
- a belső középvonal felső végén mini nyílhegy erősíti meg az irányt, és a belső hexagonnal együtt fordul;
- diszkrét, kis `É` betű a jel közepén;
- külső piros nyíl nélkül;
- DIMPRO márkajelzés.

Az északjel nem csak kezelőfelületi overlay. A közös SVG rajz része, ezért megmarad a rajzi mentésben, és a vektoros PDF minden szintoldalán is megjelenik.

## Energetikai fotódokumentáció és WinWatt ZIP

A Fotók lépés elsődleges célja az energetikai felmérés dokumentálása. Az új fotópont alapértelmezetten `Energetikai fotódokumentáció`; a `Hibafotó / észrevétel` külön, másodlagos típus, és nem kerül automatikusan a tanúsítási csomagba.

A felmérés során a 12 darabos tanúsítási keretnél több fotó is készíthető és megőrizhető. A WinWatt/e-tanúsítás ZIP-be kizárólag azok a feltöltött dokumentációs képek kerülnek, amelyeket a felhasználó külön bepipál. Új fotó alapértelmezetten nincs kijelölve.

A WinWattban használt három képkategória:

- `Fénykép az épületről`;
- `Fénykép a hőtermelő rendszerről`;
- `Fénykép a hőleadó rendszerről`.

Az `Egyéb felmérési fotó` nem WinWatt-kategória, ezért ilyen besorolással a kép nem jelölhető ki a tanúsítási ZIP-be.

A tanúsítási fotókezelés szabályai:

- legfeljebb 12, tanúsításba kijelölt fénykép;
- a kijelölt képek együttes kemény korlátja 4 MB;
- 3,5 MB felett előzetes DIMPRO figyelmeztetés;
- automatikus JPG-konverzió;
- legfeljebb 1600 px hosszabbik oldal;
- célérték legfeljebb 280 KB/fotó;
- eredeti és optimalizált fájlméret, valamint pixelméret naplózása.

A DIMPRO ellenőrző csoportjai: `Épület / homlokzat`, `Szerkezet / nyílászáró`, `Gépészet / energetikai rendszer`; mindhárom csoportnál legalább egy kijelölt fotó javasolt. Az `Egyéb dokumentáció` kiegészítő kategória.

Két ZIP-kimenet készíthető:

1. `WinWatt fotócsomag ZIP`: csak a tanúsításba kijelölt dokumentációs fotók, szabványosított JPG fájlnevekkel, CSV fotójegyzékkel és README fájllal.
2. `Minden feltöltött kép ZIP`: dokumentációs és hibafotók együtt, külön átadáshoz vagy archiváláshoz.

Az alaprajzi fotómarker dokumentációs marker, nem hibahely. A hibák továbbra is a külön Hibák lépésben, `HJ` jelöléssel kezelendők.

## Geometriai hibakártyák

A helyiségátfedési hibák alapértelmezetten összecsukott `<details>` kártyaként jelennek meg.

A kártya összecsukott állapotban mutatja:

- hiba sorszámát;
- az érintett két helyiség nevét;
- az átfedő területet.

Megnyitás után jelenik meg:

- az átfedés szélessége és magassága;
- az érintett falmodell-elemek;
- falanként a helyiség, oldal, határolástípus és hossz;
- javítási javaslat;
- a két érintett helyiség közvetlen kijelölőgombja.

A hibalista a pillanatnyi geometriai modellből származik. Ha a felhasználó elmozgatja vagy átméretezi a helyiséget, és az átfedés megszűnik, az adott hibakártya automatikusan eltűnik. Nem szükséges külön „hiba javítva” állapotot beállítani.

## Többoldalas, valódi vektoros PDF

A korábbi aktív-szintű, raszterképes PDF helyett teljes épület-dokumentumcsomag készül.

A PDF felépítése:

1. A4 fedlap;
2. minden épületszint külön alaprajzi oldalon;
3. minden rögzített metszet külön A4 metszeti oldalon;
4. jelmagyarázat és mérnöki aláírási blokk.

A szintoldalak a választott A4/A3/A2 és álló/fekvő beállítást használják. Az alaprajz nem képként kerül a PDF-be: a helyiségek, falak, nyílászárók, hőhatár, metszetvonalak, hibapontok, fotópontok, csarnokkontúrok, pillérek és ipari jelölések PDF vektorprimitívekből készülnek.

A vektorosság ellenőrzésekor a teszt-PDF mind a négy oldalán `0` beágyazott képrajzolási művelet volt. A szöveg külön kereshető PDF szövegelemként maradt meg.

## PDF fedlap és aláírási blokk

Az Exportközpontban szerkeszthető:

- cég vagy szervezet neve;
- felelős mérnök neve;
- kamarai szám;
- aláírás helye;
- aláírás dátuma;
- fedlapi megjegyzés.

A fedlap tartalmazza a projekt-, ingatlan- és felmérési adatokat, a szintek és metszetek számát, az északjelet és az energetikai felületösszesítő fő értékeit.

Az utolsó PDF-oldalon külön jelmagyarázat, tájolásonkénti energetikai összesítő és aláírás/pecsét hely készül.

## Energetikai felületösszesítő

A v0.6.1 a falmodellből számítja:

- külső, fűtetlen, szomszédos és talajjal határos falak hosszát;
- falszakasz magasságát a helyiség hasznos belmagasságából;
- falszakasz bruttó felületét;
- az adott falszakaszhoz kötött nyílászárók felületét;
- nyílászáró-levonás utáni nettó falfelületet;
- szintenkénti padlófelületet;
- fűtött padlófelületet;
- födém-/mennyezetfelületet;
- tájolásonkénti bruttó fal-, nyílászáró- és nettó falfelületet.

A számítás részletes falszakasz-sorokat, szintösszesítőt, tájolási összesítőt és teljes épületösszesítőt állít elő.

## Rétegrendből számított U-érték

A rétegrend minden olyan rétegét figyelembe veszi, amelynél pozitív vastagság és hővezetési tényező (`lambda`) szerepel.

A számítás:

```text
Rréteg = vastagság [m] / lambda [W/mK]
U = 1 / (Rrétegek összege + felületi ellenállások)
```

A felületi ellenállás szerkezettípus szerint eltérő közelítő alapértéket használ. Hiányos lambda-adat esetén a rendszer nem talál ki U-értéket, hanem `hiányos λ-adat` állapotot mutat.

## WinWatt-kompatibilis előkészítő adatcsomag

Két export készül:

- strukturált JSON;
- pontosvesszővel tagolt, Excel-kompatibilis UTF-8 CSV.

A JSON séma:

```text
dimpro.winwatt-compatible.v0.6.1
```

Tartalma:

- projekt- és épületadatok;
- északi szög és tájolási forrás;
- szintenkénti felületek;
- határoló falszakaszok;
- tájolási összesítő;
- rétegrendek és számított U-értékek;
- nyílászáró-adatok;
- teljes épületösszesítő.

Fontos: ez WinWatt-kompatibilis előkészítő adatcsomag, nem natív WinWatt projektfájl. Import vagy kézi átvétel után szakmai ellenőrzés szükséges.

## `.dimpro` projektverziózás

Az új munkafájlséma:

```text
dimpro.property-survey.v0.6.1
```

Minden mentés automatikus projektverziót kap:

```text
_v001.dimpro
_v002.dimpro
_v003.dimpro
```

A munkafájl revíziós blokkja tartalmazza:

- revízióazonosító;
- revíziószám;
- előző revízió kapcsolata;
- verziómegjegyzés;
- helyi vagy DIMPRO Drive mentési állapot.

A helyi verzióelőzmény a böngészőben legfeljebb 100 rekordot tárol, és az Exportközpontban a legutóbbi verziók láthatók.

## DIMPRO Drive-mentés

Új végpont:

```text
POST /api/property-survey/drive-save
```

Biztonsági szabályok:

- Supabase/DIMPRO bejelentkezett felhasználó szükséges;
- kijelentkezett kérés `401` választ kap;
- a kliens nem kap admin- vagy fejlesztői tokent;
- a szerver ellenőrzi a `.dimpro` sémát és fájltípust;
- 25 MB-os MVP korlát;
- atomi ideiglenes fájl → végleges fájl átnevezés;
- a fájl `0600` jogosultsággal kerül mentésre.

MVP tárolási útvonal:

```text
.dimprover/drive/property-survey/<user>/<project>/<survey>/<version>.dimpro
```

A végpont a közös DIMPRO Drive workflow szerveroldali alapja. A későbbi Object Storage, jogosultsági projektmappa és teljes Drive fájllista ugyanennek a verziózott munkafájlnak a továbbfejlesztése.

## DXF-bővítés

Az általános és ipari DXF új rétege:

```text
DIMPRO_SECTIONS
```

A réteg tartalmazza a metszetvonalat és a metszet azonosító szövegét. Az ipari DXF korábbi ANSI31 HATCH kezelése változatlan maradt.

## Új és fő módosított fájlok

```text
components/property-survey/propertySurveySectionModel.ts
components/property-survey/PropertySurveySectionPanel.tsx
components/property-survey/propertySurveyEnergyCalculations.ts
components/property-survey/propertySurveyBuildingPdf.ts
components/property-survey/propertySurveyWorkspaceTypes.ts
components/property-survey/propertySurveyExport.ts
components/property-survey/propertySurveyIndustrialModel.ts
components/property-survey/PropertySurveyPage.tsx
components/viewers/SurveyFloorPlanEngine.tsx
app/api/property-survey/drive-save/route.ts
proxy.ts
next.config.ts
scripts/test-property-survey-v061.cjs
```

## Candidate teszteredmények

- célzott ESLint: 0 hiba, 0 figyelmeztetés;
- TypeScript: sikeres;
- külön production candidate build: sikeres;
- candidate build ID: `wmtCoDOhA8VjFbo7aXMjC`;
- standalone assetellenőrzés: 124 chunk;
- candidate HTML assetaudit: 13/13 asset HTTP 200;
- PDF worker: HTTP 200;
- energetikai mintafelmérés létrehozása: sikeres;
- DIMPRO hexagon északjel: sikeres;
- energetikai padlástéri A-A metszet: sikeres;
- csarnokmetszet: sikeres;
- csarnoki rajzi elemek feletti metszetrajzolási ütközés javítva;
- összecsukott geometriai hibakártyák: 2/2 zárva indult;
- egy hibakártya egyedileg megnyitható;
- geometria javítása után hibakártyák: 2 → 0;
- többoldalas PDF: 4 oldal;
- PDF oldalak: fedlap + alaprajz + A-A metszet + jelmagyarázat/aláírás;
- PDF beágyazott képműveletek: minden oldalon 0;
- WinWatt JSON séma és falszakaszlista: sikeres;
- WinWatt CSV fejléc és tartalom: sikeres;
- `.dimpro` v0.6.1 munkafájl metszettel: sikeres;
- ipari DXF `DIMPRO_SECTIONS` réteg: sikeres;
- ipari ANSI31 HATCH regresszió: sikeres;
- kijelentkezett Drive API: 401;
- desktop 1680 × 1050: sikeres;
- tablet fekvő 1024 × 768: nincs vízszintes overflow;
- tablet álló 768 × 1024: nincs vízszintes overflow;
- iPad Pro 834 × 1194: nincs vízszintes overflow;
- mobil 390 × 844: nincs vízszintes overflow;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.

## Ismert korlátok és következő fejlesztés

- A metszeti rajz jelenleg paraméterezett, szimmetrikus/egyszerűsített épületmetszet, nem szabad csomópontos CAD-metszetszerkesztő.
- A tetőablak a metszeti adatmodellben és előnézetben szerepel; külön energetikai ferde nyílászáró-hőveszteségi sor később készülhet.
- A padló- és födémfelület jelenleg a helyiségek alapterületéből készül; ferde tetősík tényleges felületének trigonometrikus, helyiségenkénti energetikai bontása külön fejlesztési szint.
- A WinWatt-kimenet előkészítő adatcsomag, nem hivatalos natív fájlformátum.
- A DIMPRO Drive-mentés jelenleg hitelesített, helyi szerveres projektfájl-tárolás; Object Storage és teljes Drive UI-integráció későbbi kör.
- A következő metszeti fejlesztés lehet szabad csomópontos profil, több tetősík, felépítmény, födémréteg, automatikus metszett helyiségek és metszeti méretvonalak.
