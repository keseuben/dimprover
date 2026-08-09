# DIMPRO Felmérő v0.8.4.4.1 – Fal–szerkezet–nyílászáró–zóna kapcsolatok

Dátum: 2026-07-30

## Cél

A PDF tervlapból létrehozott külső falszakaszok ne önálló vonalak maradjanak, hanem kapcsolódjanak az energetikai épületmodellhez: falszerkezethez, fűtött vagy fűtetlen zónához és a falban lévő nyílászárókhoz. A rendszer automatikusan számítsa a bruttó falsíkot, a nyílászárók összes felületét és a nettó falfelületet.

## Elkészült funkciók

### Fal–szerkezettípus kapcsolat

- Minden falszakaszhoz választható fal kategóriájú energetikai rétegrend.
- A kapcsolat `assemblyId` mezőben mentődik.
- A felület jelzi, ha még nincs fal kategóriájú rétegrend létrehozva.
- A falszakasz szerkezeti kapcsolata a projekt mentése és újranyitása után is megmarad.

### Fal–energetikai zóna kapcsolat

- A falszakasz belső oldali fűtött zónához vagy fűtetlen térhez kapcsolható.
- Külön megadható a másik oldali zóna vagy fűtetlen tér.
- Külső levegővel határos falnál a másik oldal üresen hagyható.
- A jóváhagyott DIMPRO-helyiség és a zónabeosztás alapján az automatikus faljavaslat alapértelmezett zónát kaphat.
- A nyílászáró a fal zónakapcsolatát örökölheti.

### Automatikus nyílászáró-javaslat

- A rendszer a falszakaszok közelében található kis vektoros PDF-kontúrokat vizsgálja.
- A kontúrt a legközelebbi falszakaszra vetíti.
- Becsüli a fal menti pozíciót és a nyílásszélességet.
- A közeli felirat alapján ablak, ajtó, erkélyajtó vagy garázskapu típus javasolható.
- A javaslatok külön jóváhagyandó overlay-rétegen jelennek meg.
- Az automatikus felismerés nem írja felül a kézi vagy korábban jóváhagyott nyílászárókat.
- Raszeres PDF esetén a rendszer egyértelműen kézi nyílászáró-felvételt ajánl.

### Kézi nyílászáró-kezelés

- A kijelölt falszakaszhoz egy gombbal kézi nyílászáró hozható létre.
- A kézi elem adatforrása `manualDrawing`.
- Szerkeszthető adatok:
  - megnevezés;
  - típus;
  - kapcsolt falszakasz;
  - szélesség;
  - magasság;
  - parapetmagasság;
  - fal menti hely százalékban;
  - energetikai zóna vagy fűtetlen tér;
  - keret;
  - üvegezés vagy kitöltés;
  - U-érték.
- A nyílászáró jóváhagyható, kihagyható, visszaállítható vagy törölhető.
- A falhoz tartozó nyílászárók a rajzon külön kapcsolható overlay-rétegen jelennek meg.

### Bruttó és nettó falfelület

Minden falszakasznál automatikusan számítódik:

- bruttó falfelület = falhossz × falmagasság;
- nyílászáró-felület = az adott falhoz kapcsolt, nem kihagyott nyílászárók szélesség × magasság értékeinek összege;
- nettó falfelület = bruttó falfelület − nyílászáró-felület.

A számítás frissül:

- falszakasz végpontjának mozgatásakor;
- falmagasság módosításakor;
- nyílászáró méretének módosításakor;
- nyílászáró másik falhoz rendelésekor;
- nyílászáró hozzáadásakor, kihagyásakor vagy törlésekor.

### Adatbiztonság és migráció

- A meglévő projektek automatikusan megkapják az új üres fal- és nyílászárómezőket.
- A külső `.dimpro` séma változatlanul `dimpro.property-survey.v0.8.4.3`.
- A tervdokumentációs munkatér séma változatlanul `dimpro.property-survey.plan-document.v1`.
- Fal újrafelismerésekor csak a még létező falhoz kapcsolt kézi vagy jóváhagyott nyílászárók maradnak meg.
- Fal törlésekor a hozzá kapcsolt nyílászárók is törlődnek.
- Falgeometria módosításakor a nyílászárók fal menti pozíciója megmarad és új középpontjuk automatikusan számítódik.

## Adatmodell

Új típusok:

- `SurveyPlanOpeningKind`
- `SurveyPlanOpeningSuggestion`

A `SurveyPlanWallSuggestion` új mezői:

- `assemblyId`
- `zoneId`
- `adjacentZoneId`
- `grossAreaSquareMeters`
- `openingAreaSquareMeters`
- `netAreaSquareMeters`

A `SurveyPlanPage` új mezői:

- `openingRecognitionStatus`
- `openingRecognitionMessage`
- `openingSuggestions`

## Érintett fő fájlok

- `components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx`
- `components/property-survey/PropertySurveyPage.tsx`
- `components/property-survey/propertySurveyPlanDocumentTypes.ts`
- `components/property-survey/propertySurveyPlanGeometry.ts`
- `components/property-survey/propertySurveyPlanOpenings.ts`
- `scripts/test-property-survey-plan-document-v0843.cjs`
- `scripts/test-property-survey-plan-openings-v08441.cjs`

## Candidate ellenőrzés

- TypeScript: sikeres.
- Célzott ESLint: sikeres.
- Domain- és integrációs tesztek: 498/498.
- Új fal–nyílászáró domain teszt: 6/6.
- PDF tervlap E2E: 22/22.
- Történeti energetikai E2E: 40/40 és 42/42.
- Responsive regresszió: 15/15.
- Alap PDF/DXF export: sikeres.
- Tablet álló 834×1194: sikeres.
- Tablet fekvő 1194×834: sikeres.
- Candidate assetaudit: 15/15.
- Böngészőkonzol- és oldalhiba: 0.
- Candidate build: `E136JN8RSPqVPyDWRThJR`.
- Forrásbackup: `backups/property_survey_v08441_wall_opening_zone_20260730_205637`.

## Következő fejlesztési irány

A következő külön fejlesztési körben a jóváhagyott falszakaszok és nyílászárók tényleges átadása készülhet el a központi energetikai fal- és nyílászárómodellbe, majd a részletes nyílászáró-katalógus, U-érték ellenőrzés, árnyékolás és hőhíd-kapcsolatok következhetnek. A `v0.8.5` továbbra is a valós WinWatt-próbához fenntartott verzió.

## Élesítés

- Éles build: `E136JN8RSPqVPyDWRThJR`.
- Rollback: `.next_before_property_survey_v08441_20260730_214143`.
- Helyi és HTTPS smoke: 200 / 200.
- PM2: online.
- Nginx konfiguráció: hibamentes.
- Éles PDF tervlap E2E: 22/22.
- Éles történeti energetikai E2E: 40/40 és 42/42.
- Éles responsive regresszió: 15/15.
- Éles alap PDF/DXF export: sikeres.
- Éles tablet álló és fekvő teszt: sikeres.
- Éles assetaudit: 15/15.
- Böngészőkonzol- és oldalhiba: 0.
- A PM2 hibanapló az élesítés és az éles regresszió alatt nem kapott új bejegyzést.
- Éles felület: `https://dimpro.hu/ingatlanfelmero`.
