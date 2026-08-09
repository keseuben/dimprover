# DIMPRO Felmérő v0.7.2 – Rétegrend- és U-érték motor

Dátum: 2026-07-29
Dev Center verzió ID: `version_777d47f8-6a5`
Alap build: `BD5ZcvrDec8Ujku949Qa5`
Production candidate build: `NCfDCt7I_Kpn5bfh6QkaN`

## Cél

A v0.7.2 a v0.7.1 geometriai energetikai összesítőre és a MAT-0.3 anyagverzió-pillanatképekre épülő, tiszta TypeScript rétegrend- és U-érték motort vezet be.

A kiadás kötelező megnevezése:

> Tervezői energetikai számítás – szakmai ellenőrzés szükséges

A v0.7.2 számít homogén rétegrendi U-értéket és szerkezeti követelményvizsgálatot, de még nem készít zónaszámítást, gépészeti rendszereredményt, primerenergiát, CO₂-t, referenciaépületet vagy hiteles energetikai tanúsítványt.

## Számítási sémák

```text
dimpro.energy-assembly.v0.7.2
dimpro.energy-assembly-set.v0.7.2
dimpro.property-survey.v0.7.2
```

Motorverzió:

```text
0.7.2
```

## Alapképletek

Homogén, szilárd réteg:

```text
Ri = di / λi
```

Teljes hővezetési ellenállás:

```text
Rtot = Rsi + ΣRi + Rse
```

Korrigálatlan U-érték:

```text
U0 = 1 / Rtot
```

Korrigált U-érték:

```text
U = U0 + alkalmazott ΔU
```

## Felületi ellenállások

A szabályadatok nem React-komponensben, hanem külön verziózott szabálycsomagban találhatók.

```text
Hőáram felfelé:    Rsi = 0,10 m²K/W
Hőáram vízszintes: Rsi = 0,13 m²K/W
Hőáram lefelé:     Rsi = 0,17 m²K/W
Külső felület:     Rse = 0,04 m²K/W
```

Fűtött és fűtetlen belső tér közötti szerkezetnél mindkét oldalon belső felületi ellenállás használatos. Egyedi Rsi/Rse csak explicit beállítással és auditált forrásjelöléssel alkalmazható.

## Rétegtípusok

### Szilárd anyagréteg

- vastagság;
- tervezési λ;
- `R=d/λ`;
- anyag- és anyagverzió-pillanatkép;
- λ-felülírás csak indoklással.

### Zárt légréteg

- 0–300 mm tartomány;
- hőáramirány szerinti hivatalos ellenállástábla;
- köztes vastagságnál lineáris interpoláció;
- nincs kitalált λ-érték.

### Szellőztetett légréteg

A v0.7.2 nem közelíti hallgatólagosan. A megfelelő nyílásfelület- és légáramlási módszer hiányában a szerkezet blokkolt.

### Dokumentált fix R-érték

Külön, dokumentált ellenállásérték adható meg olyan elemhez, amelynek ellenállása nem a jelenlegi anyagmodellből származik.

## Számítási módok

### Számított U

A rétegek, felületi ellenállások és korrekciók alapján készül.

### Deklarált U

Gyártói vagy más dokumentált teljesítményérték használható. Kötelező:

- pozitív U-érték;
- adatforrás megadása.

Hiányos rétegrend deklarált módban nem blokkolja a dokumentált U-értéket, de a számított összehasonlítás nem készül el, és figyelmeztetés jelenik meg.

## Szerkezeti követelményvizsgálat

A külön szabályadatfájl szerkezettípusonként tárolja a maximális U-értéket és a forráshivatkozást.

Kezelt típusok:

- homlokzati fal;
- lapostető;
- fűtött tetőteret határoló szerkezet;
- padlás és búvótér alatti födém;
- árkád és áthajtó feletti födém;
- alsó zárófödém fűtetlen tér felett;
- fűtött és fűtetlen terek közötti fal;
- szomszédos fűtött épületrészek közötti fal;
- lábazati fal;
- talajjal érintkező fal;
- talajon fekvő padló;
- egyedi összehasonlítás.

Lehetséges eredmények:

```text
compliant
notCompliant
notApplicable
notCalculated
groundCalculationRequired
```

Meglévő épület követelmény nélküli állapotértékelésénél a rendszer nem állít rendeleti megfelelőséget.

## Talajjal érintkező szerkezetek

A talajon fekvő padló és a talajjal érintkező fal követelményértéke a talajhatást is tartalmazó egyenértékű tényezőre vonatkozik.

A v0.7.2 ezért:

- kiszámítja a rétegrend saját ellenállását és U-értékét;
- nem minősíti ezt automatikusan rendeleti megfelelőségnek;
- `groundCalculationRequired` állapotot ad;
- a hőszigetelés-vastagság gyorskeresőt is letiltja az egyenértékű talajszámítás elkészültéig.

## Korrekciók

### Légüreg-korrekció

Kiválasztott hőszigetelő rétegre alkalmazható, két korrekciós szinttel. A képlet és minden bemeneti érték az auditnyomvonalban megmarad.

### Mechanikai rögzítő

Az egyszerűsített képlet csak pontszerű rögzítőnél használható. Kötelező bemenetek:

- rögzítő λ;
- darabszám négyzetméterenként;
- keresztmetszet;
- szigetelésvastagság;
- behatolási hossz;
- beágyazottság;
- érintett szigetelőréteg.

Nem pontszerű vagy összetett fémkapcsolatnál a motor részletes módszert kér és blokkol.

### Fordított tető

Dokumentált külső korrekció adható meg. Korrekcióforrás nélkül a számítás blokkolt.

### Háromszázalékos küszöb

Beállítható:

- minden korrekció alkalmazása;
- 3% alatti összes korrekció elhagyása.

A motor az arányt külön kiszámítja és nyomvonalazza.

## Inhomogén és változó vastagságú szerkezet

### Inhomogén

A homogén motor nem alkalmazható. Felső/alsó ellenállási határérték vagy numerikus modell szükséges, ezért az eredmény blokkolt.

### Változó vastagság

Átlagvastagságos közelítés megengedett figyelmeztetéssel. Nagy lejtésnél numerikus modellezés szükséges.

## Hőszigetelés-vastagság kereső

A kiválasztott szilárd réteg vastagságát iteratívan növeli.

Minden iterációban újraszámítja:

- rétegellenállást;
- Rtot értéket;
- U0 értéket;
- bekapcsolt korrekciókat;
- korrigált U-értéket.

Az eredmény:

- számított minimális többletvastagság;
- centiméterre felfelé kerekített gyakorlati javaslat;
- alkalmazható rétegmódosítás.

A kereső nem fut:

- talaj-egyenértékű szerkezeten;
- inhomogén szerkezeten;
- hibás vagy hiányos rétegrenden;
- nem szilárd rétegen.

## Számítási nyomvonal

Minden eredménysor tárolja:

- determinisztikus azonosító;
- szabályazonosító;
- képlet;
- bemenetek;
- kerekítetlen érték;
- megjelenített érték;
- mértékegység;
- érintett réteg.

Fő szabályazonosítók:

```text
U-LAYER-R-D-LAMBDA-4.1
U-LAYER-AIR-GAP-4.2
U-LAYER-FIXED-R
U-SURFACE-RSI-RSE-4.1
U-RTOT-SUM-4.1
U-BASE-INVERSE-RTOT-4.1
U-CORR-AIR-VOID-4.12
U-CORR-FASTENER-4.13
U-CORR-INVERTED-ROOF-4.11
U-CORR-TOTAL-4.10-4.11
U-CORR-THRESHOLD-3PCT
U-CORRECTED-4.10
```

## UI

Az Energetika munkatér öt lapból áll:

1. Beállítások;
2. Geometria;
3. U-érték;
4. Állapot;
5. Nyomvonal.

Az U-érték lapon:

- projektösszesítő;
- rétegrendválasztó;
- U-, Rtot- és ΔU-eredmények;
- követelmény és megfelelőség;
- rétegenkénti ellenállástábla;
- vastagságkereső;
- validációs üzenetek;
- lenyitható képletnyomvonal.

A Szerkezetek munkalap külön `PropertySurveyAssembliesEditor` komponenst használ. A falszakasz- és hőhatárkezelés nem duplikálódott.

## Exportok

### `.dimpro`

```text
schema: dimpro.property-survey.v0.7.2
calculated.energyGeometry: dimpro.energy-geometry.v0.7.1
calculated.energyAssemblies: dimpro.energy-assembly-set.v0.7.2
```

A régi v0.6.x és v0.7.x projektek automatikusan normalizálódnak.

### PDF

A többoldalas vektoros PDF külön „RÉTEGRENDI U-ÉRTÉK ÖSSZESÍTŐ” oldalt kapott. Tartalma:

- rétegrend neve;
- aktív U-érték;
- Rtot;
- alkalmazott ΔU;
- követelmény;
- megfelelőségi állapot;
- számítási mód;
- hőáramirány;
- rétegszám;
- hibaszám;
- motor- és forrásazonosító.

### WinWatt előkészítő

A korábbi kompatibilitási adapter már ugyanazt a v0.7.2 motort használja. A régi kategóriaalapú, beégetett felületi ellenállás-összegek megszűntek.

## Fő érintett fájlok

```text
components/energy/domain/energyAssemblyTypes.ts
components/energy/calculations/assemblies/calculateThermalResistance.ts
components/energy/calculations/assemblies/calculateAssemblyCorrections.ts
components/energy/calculations/assemblies/calculateUValue.ts
components/energy/calculations/assemblies/calculateAssemblySet.ts
components/energy/calculations/assemblies/calculateInsulationRequirement.ts
components/energy/validation/validateAssemblies.ts
components/energy/regulations/HU_EKM_2023_11_01/factors.ts
components/energy/regulations/HU_EKM_2023_11_01/requirements.ts
components/property-survey/PropertySurveyAssembliesEditor.tsx
components/property-survey/energy/EnergyAssemblySettingsPanel.tsx
components/property-survey/energy/EnergyAssembliesPanel.tsx
components/property-survey/energy/EnergyCompliancePanel.tsx
components/property-survey/energy/PropertySurveyEnergyWorkspace.tsx
components/property-survey/propertySurveyBuildingPdf.ts
components/property-survey/PropertySurveyPage.tsx
scripts/test-energy-assembly-v072.cjs
scripts/test-property-survey-energy-v072.cjs
```

## Tesztek

Domain teszt:

```text
28/28 sikeres
```

Fő tesztcsoportok:

- hivatalos felületi ellenállások;
- kézi homogén referenciaszámítás;
- három hőáramirány;
- belső fűtetlen határ;
- zárt légréteg és interpoláció;
- 300 mm feletti légréteg blokkolása;
- szellőztetett légréteg blokkolása;
- hiányzó λ;
- fix R;
- deklarált U;
- követelmény megfelel/nem felel meg;
- meglévő épület követelmény nélküli módja;
- talajvédelem;
- légüreg- és rögzítőkorrekció;
- 3%-os küszöb;
- inhomogén és változó vastagság;
- λ-felülírás;
- ellenőrizetlen anyag;
- vastagságkereső;
- eredményhalmaz összesítés;
- régi adapter eredményegyezése;
- régi födém- és padlómigráció.

Candidate E2E:

```text
19/19 sikeres
```

Igazolt működés:

- ötfüles energetikai munkatér;
- anyagkatalógus és saját anyag;
- magyar tizedesvessző;
- szilárd réteg és zárt légréteg;
- U=0,134 W/m²K;
- Rtot=7,488 m²K/W;
- megfelelőség;
- 8 U-auditsor;
- vastagságkereső;
- `.dimpro v0.7.2`;
- vektoros PDF U-oldal;
- hat responsive nézet;
- konzolhiba 0;
- oldalhiba 0.

További candidate regresszió:

- teljes v0.6.1 Felmérő-regresszió sikeres;
- PDF, DXF, WinWatt JSON/CSV, `.dimpro`, metszet és fotócsomag sikeres;
- v0.6.1.2 rajzlap/PDF regresszió sikeres, 4 PDF-oldallal;
- tablet álló és fekvő érintésteszt sikeres;
- candidate assetaudit 13/13 HTTP 200;
- candidate naplóhiba 0.

## Ismert korlátok

- a v0.7.2 nem készít talaj-egyenértékű számítást;
- a v0.7.2 nem készít inhomogén felső/alsó ellenállási határértéket;
- szellőztetett légréteghez még nincs nyílásfelület-alapú részletes motor;
- fordított tetőnél a dokumentált korrekciót a felhasználó adja meg;
- a szabályadatokat minden új jogszabályi vagy módszertani kiadásnál ismét ellenőrizni kell;
- az anyagkatalógus fejlesztési tesztadatai továbbra sem publikálhatók központi hiteles adatként.

## Következő kiadás

```text
v0.7.3 – zónásítás és kapcsolódó fűtetlen terek
```

## Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: NCfDCt7I_Kpn5bfh6QkaN
PM2 process: dimprover
Állapot: online
Rollback: .next_before_energy_v072_20260729_110235
```

Éles ellenőrzések:

- HTTP 200;
- v0.7.2 E2E: 19/19;
- domain teszt: 28/28;
- `.dimpro` séma: `dimpro.property-survey.v0.7.2`;
- U-érték séma: `dimpro.energy-assembly-set.v0.7.2`;
- U-eredmény: 0,134 W/m²K;
- Rtot: 7,488 m²K/W;
- rétegenkénti és képletnyomvonal: sikeres;
- vektoros PDF U-összesítő: sikeres;
- tablet álló és fekvő érintésteszt: sikeres;
- éles assetaudit: 13/13 HTTP 200;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.

A központi, teljes repository-szintű smoke eszköz időkorlátba futott és nem adott részletes eredményt. A kiadás összes érintett forrásfájljának célzott ESLint-ellenőrzése, a TypeScript, a production build, a domain tesztek, a candidate- és éles E2E, az assetaudit, a PM2/HTTP/nginx ellenőrzés sikeres.
