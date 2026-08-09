# DIMPRO Felmérő v0.8.4.4 – Geometriajavítás és külső határolás MVP

Dátum: 2026-07-30

## Cél

A PDF tervlapból felismert vagy kézzel felvett helyiségek geometriája részletesen javítható legyen, majd az ellenőrzött helyiségpoligonokból a rendszer külső határoló falszakasz-javaslatokat készítsen. Az automatikus eredmény továbbra is jóváhagyandó javaslati réteg, nem írja felül ellenőrzés nélkül az energetikai épületmodellt.

## Elkészült funkciók

### Helyiséggeometria javítása

- A kijelölt helyiség poligonpontjai egyenként mozgathatók.
- Egy falszakasz felezőpontján új poligonpont szúrható be.
- A kijelölt pont törölhető, legalább három pont megtartásával.
- A poligon módosítása után a számított terület automatikusan újraszámolódik.
- A módosított geometria adatforrása `userCorrected`.
- A helyiség vágóvonallal két külön poligonra bontható.
- A kettévágási folyamat explicit módon megőrzi a kiválasztott helyiség azonosítóját, ezért nézetváltás vagy újrarenderelés után sem másik helyiséget bont fel.
- A közös falszakasszal rendelkező helyiségek összevonhatók.
- Összevonás és kettévágás után a falszakasz-felismerés érvénytelenített állapotba kerül, mert a külső határolást újra kell számítani.

### Külső határoló falak

- A rendszer a használható helyiségpoligonok peremszakaszait elemzi.
- Az egymással megegyező, két helyiség között közös szakaszok belső falnak minősülnek és nem kerülnek a külső javaslatok közé.
- A külső peremszakaszokból faljavaslat készül.
- Falanként tárolt adatok:
  - kezdő- és végpont;
  - kapcsolódó helyiség;
  - hossz;
  - tájolás és tájolási rövidítés;
  - magasság;
  - falvastagság;
  - határolási típus;
  - felismerési biztonság;
  - adatforrás és jóváhagyási állapot.
- Határolási típusok:
  - külső levegővel határos;
  - talajjal érintkező;
  - fűtetlen térrel határos;
  - szomszédos épülettel vagy rendeltetési egységgel határos;
  - belső fal;
  - még nem eldöntött.
- A falszakaszok külön overlay-rétegen kapcsolhatók ki és be.
- A kijelölt falszakasz kezdő- és végpontja kézzel javítható.
- A végpontok húzhatók, továbbá külön „Kezdőpont helye” és „Végpont helye” paranccsal egy következő rajzi kattintásra pontosan áthelyezhetők.
- A végpont módosítása után a hossz és a tájolás automatikusan újraszámolódik.
- Hiányzó falszakasz két kattintással kézzel felvehető.
- A kézzel létrehozott falszakasz adatforrása `manualDrawing` marad.
- A falszakasz jóváhagyható, kihagyható, visszaállítható vagy törölhető.

## Adatmodell

Új típusok:

- `SurveyPlanWallBoundaryType`
- `SurveyPlanWallSuggestion`

A `SurveyPlanPage` új mezői:

- `wallRecognitionStatus`
- `wallRecognitionMessage`
- `wallSuggestions`

A meglévő projektfájlok migrációja automatikus. A külső `.dimpro` séma változatlanul:

`dimpro.property-survey.v0.8.4.3`

A belső tervdokumentációs munkatér séma változatlanul:

`dimpro.property-survey.plan-document.v1`

## Érintett fő fájlok

- `components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx`
- `components/property-survey/propertySurveyPlanDocumentTypes.ts`
- `components/property-survey/propertySurveyPlanGeometry.ts`
- `scripts/test-property-survey-plan-document-v0843.cjs`
- `scripts/test-property-survey-plan-geometry-v0844.cjs`

## Candidate ellenőrzés

- TypeScript: sikeres.
- Célzott ESLint: sikeres.
- Domain- és integrációs tesztek: 492/492.
- Geometria- és fal domain teszt: 8/8.
- PDF tervlap E2E: 19/19.
- Történeti energetikai E2E: 40/40 és 42/42.
- Responsive regresszió: 15/15.
- Alap PDF/DXF export: sikeres.
- Tablet álló 834×1194: sikeres.
- Tablet fekvő 1194×834: sikeres.
- Candidate assetaudit: 15/15.
- Böngészőkonzol- és oldalhiba: 0.
- Candidate build: `j3RynkEny2gR-tbBYCdho`.
- Forrásbackup: `backups/property_survey_v0844_geometry_walls_20260730_195104`.

## Következő fejlesztési irány

A következő külön fejlesztési körben készülhet a falszakaszok szerkezettípushoz rendelése, a nyílászáró-javaslatok részletes kezelése, a bruttó és nettó határolófelület számítása, valamint a fal–nyílászáró–energetikai zóna kapcsolatok véglegesítése. A `v0.8.5` továbbra is a tényleges WinWatt-próbához fenntartott verzió.

## Élesítés

- Éles build: `j3RynkEny2gR-tbBYCdho`.
- Rollback: `.next_before_property_survey_v0844_20260730_204923`.
- HTTPS: 200.
- PM2: online.
- Nginx konfiguráció: hibamentes.
- Éles PDF tervlap E2E: 19/19.
- Éles történeti energetikai E2E: 40/40 és 42/42.
- Éles responsive regresszió: 15/15.
- Éles alap PDF/DXF export: sikeres.
- Éles tablet álló és fekvő teszt: sikeres.
- Éles assetaudit: 15/15.
- Böngészőkonzol- és oldalhiba: 0.
- A PM2 hibanapló az élesítés után nem kapott új bejegyzést.
