# DIMPRO Felmérő v0.8.4.4.2 – PDF falak és nyílászárók átadása az energetikai modellbe

Dev Center verzió: `version_b792ecf5-73d`

## Cél

A kiadás célja, hogy a PDF tervlapból felismert és ember által jóváhagyott falszakaszok, nyílászárók, zónakapcsolatok és energetikai részletadatok ne csak a tervlapi javaslati rétegben maradjanak, hanem ellenőrzötten átadhatók legyenek a DIMPRO központi épület- és energetikai modelljének.

A folyamat továbbra is emberi jóváhagyásra épül. Automatikusan felismert, de nem jóváhagyott elem nem kerül át a számítási modellbe.

## Átadási előnézet és hibavédelem

A tervlap Adatok nézetében külön „Átadás a központi energetikai modellbe” panel készült. A panel megmutatja:

- a jóváhagyott falszakaszok számát;
- a jóváhagyott nyílászárók számát;
- az újként létrejövő és a meglévőként frissülő elemek számát;
- a külön létrejövő nyílászáró-élhőhidak számát;
- a blokkoló hibákat és a nem blokkoló figyelmeztetéseket.

Az átadás blokkolódik többek között akkor, ha:

- a falszakasz kapcsolt helyisége még nincs jóváhagyva;
- a határolási típus ismeretlen;
- a falszakasz hossza vagy magassága hibás;
- a határoló falszakaszhoz nincs energetikai rétegrend rendelve;
- a belső oldali energetikai zóna vagy fűtetlen tér nincs megadva;
- a nyílászáró típusa vagy geometriája hibás;
- a nyílászáró szélesebb a kapcsolt falnál;
- nincs pozitív Uw/U-érték;
- nincs rögzítve az U-érték adatforrása;
- a g-érték nem 0 és 1 közötti;
- a kiválasztott hőhíd-elszámoláshoz hiányzik a Ψ-érték vagy annak forrása;
- a nyílászárók összfelülete meghaladja a fal bruttó felületét.

## Idempotens átadási motor

Az átadás stabil tervlap- és javaslatazonosítókat használ. Ugyanazon tervlap ismételt átadása:

- nem hoz létre duplikált falat;
- nem hoz létre duplikált nyílászárót;
- a meglévő központi elemet frissíti;
- megőrzi a központi elem stabil azonosítóját;
- eltávolítja az adott tervlap korábban átadott, de már nem jóváhagyott elemeit;
- újraszámítja a kapcsolt helyiség nyílászáró-összesítését.

A tervlapról átadott külső határoló falak kiváltják az érintett helyiség automatikusan generált, azonos szerepű külső falszakaszait, így a központi energetikai modell nem számol kétszer ugyanazzal a határolással.

## PDF-geometria megőrzése

A központi falszakaszmodell új, opcionális tervátadási metaadatokat kapott:

- PDF-ből mért falhossz;
- PDF-ből rögzített falmagasság;
- tájolási fokérték;
- normalizált tervlapi kezdő- és végpont;
- belső és másik oldali zónakapcsolat;
- tervlap- és faljavaslat-azonosító;
- átadási adatforrás és frissítési időpont.

Az energetikai geometria-, zóna-, falterület- és validációs motor a tervlapról átadott falaknál ezt a mért geometriát használja. Ez azért szükséges, mert egy ferde, részleges vagy poligonális falszakasz hossza nem minden esetben vezethető le pontosan a helyiség befoglaló téglalapjának oldalából.

## Nyílászáró-katalógus

A tervlapi nyílászáró-szerkesztő első katalógussablonjai:

- egyedi / kézi adatok;
- PVC, háromrétegű üveg;
- fa, háromrétegű üveg;
- hőhídmegszakított alumínium;
- hőszigetelt homlokzati ajtó;
- hőszigetelt garázskapu.

A DIMPRO-sablonok nem gyártóspecifikus termékadatok. Kizárólag kitöltési és előkészítési sablonok. A felület és az átadási ellenőrzés figyelmeztet arra, hogy a végleges energetikai számításhoz az Uw-, g- és Ψ-értékeket gyártói teljesítménynyilatkozattal, termékadatlappal, csomóponti számítással vagy más dokumentált forrással kell igazolni.

A szerkeszthető nyílászáró-adatok:

- típus, név és kapcsolt falszakasz;
- szélesség, magasság, parapet és fal menti hely;
- keret és üvegezés;
- Uw/U-érték és adatforrás;
- napenergia-átbocsátási tényező, g;
- árnyékolás;
- energetikai zóna;
- katalógusprofil;
- beépítési hőhíd elszámolási mód;
- Ψ-érték és forrás.

## Hőhíd-kezelés

Három elszámolási mód választható:

1. nincs még megadva;
2. teljes beépítési kerület egyetlen Ψ-értékkel;
3. káva, parapet és szemöldök külön lineáris hőhídként.

A teljes kerületes mód a nyílászáró energetikai részletadatába kerül. A külön élhőhíd mód három kapcsolt központi hőhídtételt hoz létre:

- két oldalkáva;
- parapet;
- szemöldök.

A meglévő energetikai számítási motor továbbra is védi a felhasználót a teljes kerületes és külön élhidas elszámolás egyidejű, kettős beszámítása ellen.

## Érintett fő fájlok

- `components/property-survey/propertySurveyPlanEnergyTransfer.ts`
- `components/property-survey/propertySurveyOpeningCatalog.ts`
- `components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx`
- `components/property-survey/PropertySurveyPage.tsx`
- `components/property-survey/propertySurveyPlanDocumentTypes.ts`
- `components/property-survey/propertySurveyPlanOpenings.ts`
- `components/property-survey/propertySurveyBuildingModel.ts`
- `components/property-survey/propertySurveyEnergyCalculations.ts`
- `components/energy/domain/energyOpeningTypes.ts`
- `components/energy/calculations/geometry/calculateEnvelopeGeometry.ts`
- `components/energy/calculations/zones/calculateEnergyZones.ts`
- `components/energy/validation/validateGeometry.ts`
- `scripts/test-property-survey-plan-energy-transfer-v08442.cjs`
- `scripts/test-property-survey-plan-document-v0843.cjs`

## Adatkompatibilitás

- A `.dimpro` fő séma változatlanul `dimpro.property-survey.v0.8.4.3`.
- A tervdokumentációs workspace séma változatlanul `dimpro.property-survey.plan-document.v1`.
- Az új mezők opcionálisak és normalizált alapértéket kapnak.
- A régi projektek adatvesztés nélkül megnyithatók.
- A korábbi központi fal- és nyílászáró-elemek tervátadási metaadat nélkül továbbra is a korábbi logika szerint működnek.

## Automatikus ellenőrzések

- TypeScript: sikeres.
- Célzott ESLint: sikeres.
- Történeti domain- és integrációs tesztek, tervdokumentáció, geometria, nyílászárók és új átadási motor együtt: 505/505.
- Új PDF → energetikai modell domain teszt: 7/7.
- Leica DISTO regresszió: 6/6.
- Candidate PDF tervlap E2E: 24/24.
- Candidate történeti energetikai E2E: 40/40 és 42/42.
- Candidate responsive regresszió: 15/15.
- Candidate alap PDF/DXF export: sikeres.
- Candidate tablet álló 834×1194: sikeres.
- Candidate tablet fekvő 1194×834: sikeres.
- Candidate assetaudit: 15/15.
- Böngészőkonzol- és oldalhiba: 0.
- Candidate build: `G4LM6WpeVUtqe6wGFHGkF`.
- Forrásbackup: `backups/property_survey_v08442_energy_transfer_20260731_055934`.

## Következő fejlesztési irány

A következő külön fejlesztési körben kialakítható a több tervlapos átadási nyilvántartás, a tervlap és központi modell közötti változásjelzés, a kézzel tovább szerkesztett központi elemek konfliktusvédelme, az átadási auditnapló és az eltávolítás előtti megerősítés. A `v0.8.5` továbbra is a tényleges WinWatt-próbához fenntartott verzió.

## Élesítés

- Éles build: `G4LM6WpeVUtqe6wGFHGkF`.
- Rollback: `.next_before_property_survey_v08442_20260731_070947`.
- Helyi és HTTPS smoke: 200 / 200.
- PM2: online.
- Nginx konfiguráció: hibamentes.
- Éles PDF tervlap és energetikai átadási E2E: 24/24.
- Éles történeti energetikai E2E: 40/40 és 42/42.
- Éles responsive regresszió: 15/15.
- Éles alap PDF/DXF export: sikeres.
- Éles tablet álló és fekvő teszt: sikeres.
- Éles assetaudit: 15/15.
- Böngészőkonzol- és oldalhiba: 0.
- A PM2 hibanapló az élesítés és az éles regresszió alatt nem kapott új bejegyzést.
- Éles felület: `https://dimpro.hu/ingatlanfelmero`.
