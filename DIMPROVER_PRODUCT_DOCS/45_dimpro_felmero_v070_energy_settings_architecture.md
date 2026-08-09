# DIMPRO Felmérő v0.7.0 – Energetikai projektbeállítások és munkatér

Dátum: 2026-07-29

## Cél

A v0.7.0 a meglévő DIMPRO Felmérő közös projekt-, helyiség-, fal-, nyílászáró-, rétegrend-, gépészeti és fotóadataira épülő energetikai munkatér első architekturális kiadása.

Ebben a verzióban **nem készül energetikai végeredmény**. A munkatér kizárólag a számítás célját, szabályállapotát, követelményszintjét és vizsgálati keretét rögzíti, továbbá előkészíti a későbbi determinisztikus számítási motort.

Kötelező felületi megnevezés:

> Tervezői energetikai számítás – szakmai ellenőrzés szükséges

## Kiinduló állapot

A v0.6.1.3 már tartalmazta:

- projekt- és felmérésstruktúrát;
- többszintes helyiségmodellt;
- falszakaszokat és nyílászárókat;
- fűtött és fűtetlen helyiségeket;
- energetikai hőhatárt;
- alap rétegrendmodellt;
- gépészeti és fotórekordokat;
- `.dimpro`, PDF, DXF és WinWatt-előkészítő exportot;
- tablet fókuszmódot és érintéses rajzkezelést.

Ezek az adatok változatlanul közösek maradnak. A v0.7.0 nem hoz létre párhuzamos helyiség-, falszakasz-, nyílászáró- vagy gépészeti adatbázist.

## Új domainmodell

Fő típus:

```ts
EnergyProjectSettings
```

Tárolt mezők:

1. energetikai munkatér aktív állapota;
2. számítás célja;
3. szabálycsomag azonosítója;
4. követelményszint;
5. tanúsítás tárgya;
6. épületszimbólum;
7. engedély vagy egyszerű bejelentés dátuma;
8. építés éve;
9. jelentős felújítás éve;
10. teljes épület adatainak rendelkezésre állása;
11. számítási módszer;
12. séma- és időbélyegadatok.

Az első szabálycsomag-azonosító:

```text
HU_EKM_2023_11_01
```

## Szabálycsomag állapota

A szabálycsomag a v0.7.0-ban kizárólag architektúraváz:

```text
reviewRequired
calculationAvailable = false
professionalReviewRequired = true
```

Nem tartalmaz:

- követelményértékeket;
- primerenergia-tényezőket;
- CO₂-tényezőket;
- számítási állandókat;
- tanúsítási végeredményt;
- rejtett WinWatt-értékeket.

A forráshivatkozások külön rekordként szerepelnek, és mind `reviewRequired` állapotúak. Számítási adat csak aktuális szakmai és jogi ellenőrzés után kerülhet a szabálycsomagba.

## Munkatér UI

Új Felmérő-lépés:

```text
Energetika
```

Csak ezekben a munkamódokban jelenik meg:

- Energetikai felmérés;
- Felújítási felmérés.

Ipari és térbeton munkamódban rejtett.

A munkatér két lapból áll:

1. **Beállítások** – a tíz projektmező szerkesztése;
2. **Állapot** – készültség, validáció, szabálycsomag és anyagmotor állapota.

A teljes képernyős rajzi dockban külön Energetika gomb nyitja meg a jobb oldali munkalapot.

## Validáció

Jelenlegi ellenőrzések:

- kötelező szabálycsomag;
- kötelező számítási cél;
- kötelező követelményszint;
- kötelező épületszimbólum;
- építési év technikai tartománya;
- jelentős felújítás évének figyelmeztetése;
- engedély/bejelentés dátumának figyelmeztetése;
- önálló rendeltetési egységnél a teljes épület adatainak hiánya;
- tanúsítvány-előkészítés korlátozásának figyelmeztetése.

A készültségjelző beállítási teljességet mutat, nem energetikai megfelelőséget.

## Migráció és kompatibilitás

A korábbi v0.6.x projektek `energyProjectSettings` mező nélkül is megnyílnak.

Migrációs szabály:

- energetikai vagy felújítási munkamódnál a munkatér aktív;
- családi ház ingatlantípusnál alapértelmezett épületszimbólum `familyHouse`;
- más ingatlantípusnál `otherBuilding`;
- a korábbi építési év átkerül az új energetikai beállításba;
- az eredeti projektadatok változatlanul megmaradnak.

## `.dimpro` munkafájl

Új séma:

```text
dimpro.property-survey.v0.7.0
```

A teljes `EnergyProjectSettings` rekord a `draft` részeként mentődik:

- helyi `.dimpro` exportban;
- DIMPRO Drive-mentésben;
- LocalStorage munkatérben;
- régi projekt migrációja után.

## Feature flag

A számítási motor közös marad, de a v0.7.0 csak ezt engedélyezi:

```text
canUseEnergySurvey = true
canUseEnergySettings = true
```

A geometria, U-érték, zóna, gépészet, változat és tanúsítói funkciók egyelőre `false` állapotúak.

## Érintett fájlok

Új:

```text
components/energy/domain/energyProjectTypes.ts
components/energy/domain/energyFeatureFlags.ts
components/energy/regulations/energyRuleSetTypes.ts
components/energy/regulations/registry.ts
components/energy/regulations/HU_EKM_2023_11_01/metadata.ts
components/energy/regulations/HU_EKM_2023_11_01/sourceReferences.ts
components/property-survey/energy/PropertySurveyEnergyWorkspace.tsx
components/property-survey/energy/EnergyProjectSettingsPanel.tsx
components/property-survey/energy/EnergyCompliancePanel.tsx
scripts/test-property-survey-energy-v070.cjs
```

Módosított:

```text
components/property-survey/propertySurveyWorkspaceTypes.ts
components/property-survey/propertySurveyEnergyModel.ts
components/property-survey/PropertySurveyPage.tsx
```

## Tesztterv

- TypeScript és célzott ESLint;
- alapbeállítások;
- minden mező szerkesztése;
- kontextusfüggő validáció;
- LocalStorage mentés;
- újratöltési visszaállítás;
- v0.6.x automatikus migráció;
- `.dimpro` v0.7.0 export;
- munkamód- és feature-flag szűrés;
- teljes képernyős integráció;
- desktop, fekvő tablet, álló tablet, iPad és mobil overflow;
- korábbi PDF, DXF, metszet, fotó, WinWatt és tablet regresszió.

## Ismert korlátok

- nincs U-érték-motor;
- nincs zónaszámítás;
- nincs nettó energiaigény;
- nincs gépészeti energetikai számítás;
- nincs primerenergia vagy CO₂;
- nincs referenciaépület vagy megfelelőségi eredmény;
- nincs hiteles tanúsítvány;
- nincs OÉNY- vagy QR-munkafolyamat;
- a szabálycsomag szakmai ellenőrzésre vár.

## Következő fejlesztési kör

```text
v0.7.1 – Geometriai energetikai összesítő
```

A következő körben a meglévő geometriából visszakövethető módon számítandó:

- bruttó és nettó külső falfelület;
- nyílászáró-levonás;
- padló-, födém- és tetőfelület;
- kondicionált térfogat;
- lehűlő felület;
- A/V arány;
- szintenkénti és tájolásonkénti összesítés.

## Candidate eredmények

```text
Production candidate build: tm7qdRVfJJNOhOs0mViBL
Új energetikai UI E2E: 16/16
Anyag- és beállítási domain teszt: 16/16
Candidate assetaudit: 13/13 HTTP 200
```

Sikeres regressziók:

- `.dimpro v0.7.0` mentés és visszatöltési állapot;
- v0.6.x projekt automatikus migrációja;
- PDF, DXF, WinWatt JSON/CSV és fotó-ZIP;
- metszet, tetősík, átfedési hibajavítás és rajzlap;
- desktop, fekvő és álló tablet, iPad és mobil;
- tablet pinch-zoom és nagyítás utáni helyiségmozgatás;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.

## Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: tm7qdRVfJJNOhOs0mViBL
PM2 process: dimprover
Dev Center verzió ID: version_f44cec3b-7fd
Állapot: online
Rollback: .next_before_energy_v070_mat02_20260729_071452
```

Éles ellenőrzések:

- HTTP 200;
- energetikai munkatér E2E: 16/16;
- `.dimpro` séma és mentés: sikeres;
- v0.6.x migráció: sikeres;
- tablet álló és fekvő érintésteszt: sikeres;
- éles assetaudit: 13/13 HTTP 200;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.
