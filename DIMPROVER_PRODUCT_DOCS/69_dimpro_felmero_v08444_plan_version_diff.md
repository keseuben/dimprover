# DIMPRO Felmérő v0.8.4.4.4 – Tervverzió-párosítás és részleges változásátvétel

## Cél

A `v0.8.4.4.3` már tervlaponként nyilvántartotta a központi energetikai modellbe történt átadást és védte a kézi központi módosításokat. A `v0.8.4.4.4` a különböző PDF tervkiadások közötti változáskezelést vezeti be:

- dokumentum-revíziók összekapcsolása;
- korábbi és új tervlapok automatikus vagy kézi párosítása;
- helyiség-, fal- és nyílászáró-elemek párosítása;
- változatlan, módosított, új és törölt elemek elkülönítése;
- vizuális és táblázatos változás-diff;
- elemenkénti vagy oldalpáronkénti elfogadás és elutasítás;
- a döntések alkalmazása az új tervverzió jóváhagyási állapotára.

A fejlesztés nem módosítja a fő `.dimpro` sémát. A fő séma továbbra is:

`dimpro.property-survey.v0.8.4.3`

A tervdokumentációs workspace séma továbbra is:

`dimpro.property-survey.plan-document.v1`

## Dokumentum-revízió adatok

A `SurveyPlanDocument` új, visszafelé kompatibilis mezői:

- `versionGroupId` – az összetartozó tervkiadások közös csoportazonosítója;
- `revisionCode` – például `R00`, `R01`, `V2`;
- `revisionDate` – a kiadás dátuma;
- `supersedesDocumentId` – az előző dokumentumverzió azonosítója;
- `isCurrentVersion` – jelzi, melyik dokumentum az aktuális kiadás.

Összehasonlítás létrehozásakor:

1. az alap és a cél dokumentum közös `versionGroupId` értéket kap;
2. az új dokumentum `supersedesDocumentId` mezője az alapdokumentumra mutat;
3. az alapdokumentum `isCurrentVersion = false`;
4. az új dokumentum `isCurrentVersion = true`.

## Verzió-összehasonlítási adatmodell

A tervdokumentációs workspace új, opcionális rétege:

`SurveyPlanVersionComparisonWorkspace`

Fő elemei:

- `comparisons` – az összehasonlítások azonosító szerinti nyilvántartása;
- `activeComparisonId` – az aktív összehasonlítás;
- `version = "1"`;
- `updatedAt`.

Egy `SurveyPlanVersionComparison` tartalmazza:

- az alapdokumentum azonosítóját;
- a céldokumentum azonosítóját;
- `draft`, `review` vagy `applied` állapotot;
- oldal-párokat;
- létrehozási, módosítási és alkalmazási időpontot.

## Oldalpárosítás

### Automatikus párosítás

Az oldalillesztés súlyozottan vizsgálja:

- a kapcsolt épületszintet;
- a tervtípust;
- az oldal megnevezését;
- az oldalszámot;
- a PDF tartalmi típusát;
- a felismerési módot.

Biztonsági szabály:

- eltérő szintű és eltérő megnevezésű oldalak nem párosíthatók pusztán azonos oldalszám alapján;
- eltérő tervtípusú és eltérő megnevezésű oldalak szintén nem kapnak automatikus párt.

### Kézi párosítás

A felhasználó:

- módosíthatja az automatikus oldal-párt;
- egy új oldalt kézzel párosítatlannak jelölhet;
- később újra hozzárendelheti egy korábbi oldalhoz.

A kézi kapcsolat `method = "manual"` értékkel marad meg, és az automatikus újraszámítás nem írja felül.

### Új és megszűnt oldalak

A rendszer nem hagy elveszett oldalt:

- a csak az új dokumentumban szereplő oldal külön oldal-diffet kap; minden eleme `added`;
- a csak a korábbi dokumentumban szereplő oldal külön oldal-diffet kap; minden eleme `removed`.

## Elempárosítás

### Helyiségek

A párosítás figyelembe veszi:

- helyiségnév;
- funkció;
- poligon középpontja;
- számított alapterület.

Vizsgált változások:

- név;
- funkció;
- poligongeometria;
- terület;
- belmagasság;
- fűtöttség.

### Falak

A falpárosítás alapja:

- a már párosított helyiségkapcsolat;
- falszakasz-középpont;
- tájolás;
- hossz;
- határolástípus;
- épületszint.

A helyiségkapcsolat kötelező védelmi feltétel, ha mindkét falszakasz helyiséghez kötött. Ez megakadályozza, hogy két geometriailag hasonló, de más helyiséghez tartozó fal tévesen összekapcsolódjon.

Vizsgált változások:

- geometria;
- határolástípus;
- tájolás;
- hossz;
- magasság;
- vastagság;
- rétegrend;
- zóna és másik oldali zóna;
- helyiségkapcsolat.

### Nyílászárók

A nyílászáró csak akkor párosítható, ha a kapcsolt falszakaszok már egymás párjai.

További szempontok:

- típus;
- fal menti eltolás;
- szélesség és magasság;
- megnevezés.

Vizsgált változások:

- kapcsolt fal;
- név és típus;
- fal menti hely;
- szélesség, magasság, parapet;
- keret és üvegezés;
- Uw/U-érték és adatforrás;
- g-érték;
- árnyékolás;
- hőhídbeállítás;
- zónakapcsolat.

A jóváhagyási státusz nem minősül műszaki tervváltozásnak. Az új tervverzió elemei természetesen `review` állapotból indulhatnak; ezt a döntési workflow külön kezeli.

## Diffállapotok

Minden elemdiff egyik állapota:

- `unchanged` – tartalmilag változatlan;
- `modified` – párosított, de egy vagy több vizsgált mező megváltozott;
- `added` – csak az új verzióban szerepel;
- `removed` – csak a korábbi verzióban szerepel.

Minden változás döntési állapota:

- `pending` – még nincs döntés;
- `accepted` – elfogadva;
- `rejected` – elutasítva.

A változatlan elemek automatikusan elfogadottak.

## Döntésmegőrzés

Az elem- és oldal-párok determinisztikus stabil azonosítót kapnak.

Újraszámításkor:

- ha ugyanaz az elempár továbbra is fennáll, a korábbi döntés megmarad;
- ha az elempár megszűnik vagy más elemhez kerül, új diff és új döntési helyzet jön létre.

## Vizuális diff

A rajzi nézet kapcsolható összehasonlító overlayt kapott:

- piros szaggatott jelölés – a korábbi verzióból törölt elem;
- narancs jelölés – a korábbi verzió módosult geometriája;
- kék jelölés – az új verzió módosult eleme;
- zöld jelölés – az új verzióban létrejött elem.

A vizuális diff helyiségekre, falakra és nyílászárókra működik.

## Táblázatos döntési felület

A felület tartalmazza:

- alap- és céldokumentum választását;
- mentett összehasonlítások választását;
- revíziókódot és kiadási dátumot;
- oldal-párosítási listát és biztonsági százalékot;
- kézi oldal-párosítást;
- külön listát a megszűnt korábbi oldalakhoz;
- összesített módosított, új, törölt, elfogadott és elutasított elemszámot;
- elemtípus-, változás- és döntésszűrőt;
- elemenkénti elfogadás, elutasítás és függőben hagyás műveletet;
- oldalpáronkénti tömeges elfogadást és elutasítást;
- döntések alkalmazását az új tervverzióra.

## Döntések alkalmazása

Alkalmazáskor:

- az elfogadott új vagy módosított cél-elemek `approved` állapotot kapnak;
- az elutasított új vagy módosított cél-elemek `ignored` állapotot kapnak;
- a korábbi verzióból törölt elemek döntése a diffnyilvántartásban marad, mert nincs hozzájuk céloldali elem;
- ha marad `pending` változás, az összehasonlítás `review` állapotú;
- ha minden változás eldőlt, az összehasonlítás `applied` állapotba kerül és `appliedAt` időpontot kap.

## Dokumentumtörlés

Ha egy PDF-dokumentumot törölnek:

- a hozzá kapcsolódó verzió-összehasonlítások is törlődnek;
- az aktív összehasonlítás automatikusan a következő érvényes rekordra áll vagy üres lesz.

## Tesztek

- Teljes domain- és integrációs regresszió: 531/531.
- Új tervverzió-összehasonlítási domain teszt: 14/14.
- Leica DISTO regresszió: 6/6.
- Dedikált két háromoldalas tervverzió E2E: 12/12.
- Korábbi teljes PDF tervlap–energetikai átadás–konfliktus–eltávolítás E2E: 29/29.
- Történeti energetikai E2E: 40/40 és 42/42.
- Responsive munkatér: 15/15.
- PDF/DXF export: sikeres.
- Tablet álló és fekvő regresszió: sikeres.
- Candidate assetaudit: 15/15.
- Candidate build: `Ipc_3ccvsvLqiFnHWTzip`.

## Korlátok

- A párosítás determinisztikus geometriai és tartalmi heurisztika, nem AI-alapú tervértelmezés.
- Raszteres vagy OCR-ből származó bizonytalan geometriáknál emberi ellenőrzés szükséges.
- A döntések ebben a verzióban az új tervverzió jóváhagyási állapotára kerülnek alkalmazásra.
- A központi energetikai modell korábbi tervverzióról új tervverzióra történő automatikus átvezetése még nem része ennek a kiadásnak.
- A törölt korábbi elem elfogadása vagy elutasítása önmagában nem töröl központi energetikai modellelemet.
- Az összehasonlítás és a döntések jelenleg a `.dimpro` projektállomány részei, nem központi többfelhasználós szerveres workflow.

## Következő fejlesztési irány

`v0.8.4.4.5` – az elfogadott tervverzió-változások ellenőrzött átvezetése a központi energetikai modellbe: régi–új forrásazonosító-migráció, részleges fal- és nyílászáró-frissítés, törlési előnézet, stabil központi azonosítók, audit és visszaállítás.

A `v0.8.5` továbbra is a tényleges WinWatt-próbához fenntartott verzió.

## Élesítés

- Éles build: `Ipc_3ccvsvLqiFnHWTzip`.
- Rollback: `.next_before_property_survey_v08444_20260731_100817`.
- Helyi és HTTPS smoke: 200 / 200.
- PM2: online.
- Nginx konfiguráció: hibamentes.
- Éles tervverzió-összehasonlítás E2E: 12/12.
- Éles korábbi teljes PDF tervlap E2E: 29/29.
- Éles történeti energetikai E2E: 40/40 és 42/42.
- Éles responsive regresszió: 15/15.
- Éles PDF/DXF export: sikeres.
- Éles tablet álló és fekvő teszt: sikeres.
- Éles assetaudit: 15/15.
- Böngészőkonzol- és oldalhiba: 0.
- A PM2 hibanapló az élesítés és az éles regresszió alatt nem kapott új bejegyzést.
- Éles felület: `https://dimpro.hu/ingatlanfelmero`.
