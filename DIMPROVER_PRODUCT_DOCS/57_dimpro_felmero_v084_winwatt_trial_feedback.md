# DIMPRO Felmérő v0.8.4 – WinWatt próbaátadás és visszamérési jegyzőkönyv

Dátum: 2026-07-30
Dev Center verzió: `version_cb6bd511-0ce`
Alapverzió: v0.8.3
Alap éles build: `7qmr-kRdOGrnnEKMeqkJf`
Production candidate build: `_woQoQbPeuPesDJRHo7kl`
Forrásbackup: `backups/energy_v084_winwatt_trial_feedback_20260729_211323`

## 1. Fejlesztési cél

A v0.8.4 célja a DIMPRO és a WinWatt közötti tényleges kézi próbaátadás strukturált dokumentálása.

A verzió nem állítja, hogy natív WinWatt projektfájlt vagy automatikus WinWatt-importot készít.

A rendszer feladata:

- külön próbamunkamenet létrehozása;
- a használt WinWatt-verzió és munkaállomás rögzítése;
- mezőnként a pontos WinWatt célablak, célfül és célfelirat visszaigazolása;
- a kézi beviteli mód és idő rögzítése;
- sikeres, módosított, kézi, kihagyott vagy blokkolt mezők elkülönítése;
- DIMPRO–WinWatt eredményeltérések rögzítése;
- tűrésen belüli és tűrésen kívüli eredmények kimutatása;
- a próba teljes munkanaplójának projektbe és exportokba mentése;
- a későbbi központi mezőtérkép-pontosításhoz igazolt visszacsatolás előállítása.

## 2. Fontos működési korlátozás

A v0.8.4 próbanaplója a WinWattban végzett valós adatfelviteli próba dokumentálására szolgál.

A program:

- nem állítja automatikusan, hogy egy mező sikeresen átadásra került;
- nem tölti ki magától a WinWatt célablakot vagy pontos célfeliratot;
- nem írja át automatikusan a központi v0.8.3 mezőtérképet;
- nem minősít egy munkamenetet lezártnak, amíg vannak nem próbált vagy blokkolt mezők;
- nem ad validált éves energia-, primerenergia-, CO₂- vagy besorolási eredményt.

A központi mezőtérkép változatlan sémája:

```text
dimpro.winwatt-field-map.v0.8.3
```

A visszaigazolások külön projektadatként tárolódnak.

## 3. Új projektadat

A `PropertySurveyDraft` új eleme:

```text
energyWinWattTrialWorkspace
```

Sémaverzió:

```text
schemaVersion: 1
```

Fő részei:

```text
sessions
activeSessionId
createdAt
updatedAt
```

Régi v0.8.3 projekt megnyitásakor automatikusan létrejön:

```text
schemaVersion: 1
sessions: []
activeSessionId: null
```

Ez nem blokkolja a projektet és nem módosítja a korábbi számítási eredményeket.

## 4. Próba-munkamenet

Minden munkamenet külön tartalmazza:

- címet;
- állapotot;
- WinWatt-verziót;
- operátort;
- munkaállomást;
- kezdési és befejezési időt;
- általános megjegyzést;
- a létrehozáskori mezőpillanatképet;
- mezőnkénti próbaeredményeket;
- DIMPRO–WinWatt eredmény-összevetéseket.

A mezőpillanatkép biztosítja, hogy a projekt későbbi módosítása ne változtassa meg visszamenőleg a próba nevezőjét vagy készültségi százalékát.

## 5. Munkamenet-állapotok

```text
planned     – tervezett próba
inProgress  – folyamatban
completed   – lezárt próba
cancelled   – megszakított próba
```

A `completed` állapot csak akkor választható, ha:

- minden alkalmazandó mező kapott próbastátuszt;
- nincs blokkolt mező;
- nincs még nem próbált mező.

A felületen a lezáró gomb addig tiltott.

## 6. Mezőnkénti próbaadatok

Minden mezőeredmény tartalmazza:

- mezőtérkép-azonosítót;
- DIMPRO forrásadatcsoportot és forrásmezőt;
- DIMPRO célkulcsot;
- létrehozáskori forráskészültséget;
- WinWatt célablakot;
- WinWatt célfület;
- pontos WinWatt célfeliratot;
- pontos WinWatt mértékegységet;
- próbastátuszt;
- beviteli módot;
- beviteli sorrendet;
- beviteli időt másodpercben;
- WinWattban látott értéket;
- megjegyzést;
- visszaigazolási időpontot.

## 7. Mező-próbaállapotok

```text
notTested       – még nem próbált
matched         – célmező és tartalom egyezik
targetAdjusted  – célablak, célfül, felirat vagy egység pontosítva
manualOnly      – csak kézi felvitel lehetséges
skipped         – nem alkalmazandó vagy tudatosan kihagyott
blocked         – a próba nem hajtható végre
```

Visszaigazoltnak számít:

```text
matched
targetAdjusted
manualOnly
```

A `blocked` mező megakadályozza a munkamenet lezárását.

## 8. Beviteli módok

```text
manualTyping  – kézi begépelés
copyPaste     – másolás és beillesztés
excelImport   – támogatott Excel-bevitel
nativeImport  – későbbi natív import
notApplicable – nem alkalmazandó
```

A mód rögzítése segít meghatározni, mely adatcsoportoknál érdemes automatizált átadást fejleszteni.

## 9. Haladás és időmérés

Munkamenetenként számított adatok:

- teljes mezőszám;
- próbált mezők;
- még nem próbált mezők;
- egyező mezők;
- pontosított mezők;
- csak kézi mezők;
- kihagyott mezők;
- blokkolt mezők;
- visszaigazolt mezők;
- haladás százalékban;
- összes rögzített beviteli idő;
- lezárhatóság.

A tizedes mezők magyar tizedesvesszővel is kitölthetők.

Példa:

```text
18,5 másodperc
```

Az exportált numerikus CSV érték szabványosan:

```text
18.5
```

## 10. Eredmény-összevetés

A próbamunkamenet külön eredménytáblát tartalmaz.

Automatikusan DIMPRO-értéket kapnak a már validáltan számított mutatók:

- kondicionált alapterület;
- kondicionált térfogat;
- transzmissziós hőveszteségi tényező;
- teljes hőveszteségi tényező;
- méretezési fűtési teljesítmény.

A következő mutatók egyelőre csak WinWatt-visszamérési sorként szerepelnek:

- nettó éves fűtési energiaigény;
- összesített energetikai jellemző;
- CO₂-kibocsátás.

Ezek DIMPRO-oldali értéke üres marad a validált havi energetikai motor elkészültéig.

## 11. Eredmény-összevetési státuszok

```text
notCompared      – még nincs összevetve
withinTolerance  – tűrésen belül
outsideTolerance – tűrésen kívül
notComparable    – nem összehasonlítható
```

A motor kezeli:

- abszolút tűrést;
- relatív százalékos tűrést;
- abszolút eltérést;
- százalékos eltérést;
- nullához közeli referenciaértéket;
- hiányzó DIMPRO- vagy WinWatt-értéket.

## 12. Visszaigazolt mezőtérkép

A próbaösszesítő minden mezőhöz a legutóbbi visszaigazolt adatot választja:

- pontos célablak;
- pontos célfül;
- pontos célfelirat;
- pontos egység;
- státusz;
- munkamenet;
- visszaigazolási időpont.

Ez a lista még nem írja át automatikusan a központi mezőtérképet.

A központi szerződés módosítása külön, ellenőrzött fejlesztési lépés lesz.

## 13. Szakértői felület

Az Energetika / WinWatt átadás lap két nézetre tagolódik:

```text
Átadási készültség
Próbanapló
```

### Átadási készültség

Megőrzi a v0.8.3 funkcióit:

- mezőtérkép;
- adatcsoportkártyák;
- készültségi szűrés;
- keresés;
- hibajegyzék;
- Excel- és ZIP-export.

### Próbanapló

Fő elemei:

- új próba létrehozása;
- munkamenetek listája;
- állapot és haladás;
- következő még nem próbált mező;
- mezőkeresés;
- mező-próbaállapot szűrés;
- célablak, célfül, célfelirat és egység szerkesztése;
- beviteli mód, sorrend és idő;
- WinWattban látott érték;
- eredmény-összevetés;
- munkamenet lezárási védelem.

## 14. Új próbaösszesítő séma

```text
dimpro.winwatt-trial-feedback.v0.8.4
```

Fő részei:

```text
sessions
verifiedMappings
totals
disclaimer
```

## 15. DIMPRO munkafájl

Új séma:

```text
dimpro.property-survey.v0.8.4
```

A szerkeszthető `draft` blokk tartalmazza:

```text
energyWinWattTrialWorkspace
```

A `calculated` blokk tartalmazza:

```text
winWattFieldMap
winWattTrialFeedback
```

## 16. WinWatt-előkészítő JSON

Új séma:

```text
dimpro.winwatt-compatible.v0.8.4
```

Új blokkok:

```text
winWattTrialWorkspace
winWattTrialFeedback
```

Hivatkozott export-sémák:

```text
transferWorkbookSchema: dimpro.winwatt-transfer.v0.8.4
trialPackageSchema: dimpro.winwatt-trial-package.v0.8.4
```

## 17. Excel munkafüzet

Új séma:

```text
dimpro.winwatt-transfer.v0.8.4
```

A munkafüzet 20 lapos.

A v0.8.3 tizennyolc lapja megmarad, és két új lap készül:

```text
18_Probanaplo
19_Eredmeny_elteres
```

### 18_Probanaplo

Tartalma:

- munkamenet;
- munkamenet állapota;
- WinWatt-verzió;
- operátor és munkaállomás;
- forrásadatcsoport és mező;
- célkulcs;
- célablak és célfül;
- pontos célfelirat és egység;
- próbastátusz;
- beviteli mód;
- sorrend és idő;
- látott érték;
- megjegyzés;
- visszaigazolási időpont.

### 19_Eredmeny_elteres

Tartalma:

- munkamenet;
- WinWatt-verzió;
- mutatókulcs és megnevezés;
- DIMPRO-érték;
- WinWatt-érték;
- egység;
- abszolút és százalékos eltérés;
- abszolút és relatív tűrés;
- összevetési státusz;
- megjegyzés.

## 18. Próbaátadási és visszacsatolási ZIP

Új séma:

```text
dimpro.winwatt-trial-package.v0.8.4
```

A ZIP tíz fájlt tartalmaz:

```text
README.txt
manifest.json
*_winwatt_elokeszito_v084.xlsx
*_winwatt_adatcsomag_v084.json
*_winwatt_mezoterkep.csv
*_winwatt_atadasi_rekordok.csv
*_winwatt_atadasi_hibak.csv
*_winwatt_probavisszacsatolas_v084.json
*_winwatt_probanaplo.csv
*_winwatt_eredmeny_elteres.csv
```

## 19. ZIP manifest

A manifest új elemei:

```text
trialFeedbackSchema
trialTotals
```

A `trialTotals` tartalmazza:

- munkamenetek számát;
- lezárt munkamenetek számát;
- próbált mezőket;
- visszaigazolt mezőket;
- blokkolt mezőket;
- összevetett eredményeket;
- tűrésen kívüli eredményeket.

## 20. Diagnosztikai és próbaátadási mód

A mezőtérkép készültségi szabálya nem változott.

Blokkolt projekt esetén:

```text
Diagnosztikai ZIP
readyForTrialTransfer: false
```

Hibamentes projekt esetén:

```text
Próbaátadási ZIP
readyForTrialTransfer: true
```

Mindkét csomag tartalmazhat próbanaplót és visszacsatolási adatokat.

## 21. Érintett fő fájlok

```text
components/energy/domain/energyWinWattTrialTypes.ts
components/energy/transfers/winwatt/buildWinWattTrialFeedback.ts
components/property-survey/energy/EnergyWinWattTrialPanel.tsx
components/property-survey/energy/EnergyWinWattTransferPanel.tsx
components/property-survey/energy/PropertySurveyEnergyWorkspace.tsx
components/property-survey/propertySurveyWorkspaceTypes.ts
components/property-survey/propertySurveyWinWattWorkbook.ts
components/property-survey/propertySurveyWinWattTrialPackage.ts
components/property-survey/propertySurveyEnergyCalculations.ts
components/property-survey/PropertySurveyPage.tsx
scripts/test-energy-winwatt-trial-v084.cjs
scripts/test-energy-expert-transfer-v080.cjs
scripts/test-property-survey-energy-v080.cjs
```

## 22. Candidate tesztek

```text
WinWatt próbanapló domain:          45/45
Szakértői Excel és ZIP:             78/78
WinWatt mezőtérkép:                 21/21
Változat-összehasonlítás:           38/38
Megújuló/villamos motor:            44/44
Felújítási workflow:                39/39
Automatikus javaslatmotor:          18/18
Zónaterhelési motor:                36/36
Nyílászáró és hőhíd:                43/43
Zónamotor:                          25/25
Rétegrendi U-motor:                 28/28
Összes domain/integráció:          415/415
v0.8.4 E2E:                         35/35
Történeti energetikai E2E:          42/42
Alap Felmérő-regresszió:            sikeres
PDF-, DXF- és rajzlapregresszió:    sikeres
PDF:                                 11 oldal
Tablet álló/fekvő:                   sikeres
Pinch-zoom:                          2,15
Érintés közbeni oldalelmozdulás:     0
Candidate assetaudit:               15/15
Konzolhiba:                          0
Oldalhiba:                           0
```

## 23. Ellenőrzött candidate példa

```text
Munkamenet:        1
Állapot:           Folyamatban
WinWatt-verzió:    9.54
Operátor:          DIMPRO tesztelő
Célablak:          Épület
Célfül:            Általános adatok
Célfelirat:        Épület címe
Beviteli mód:      Másolás és beillesztés
Beviteli idő:      18,5 másodperc
Összevetett mutató: Kondicionált alapterület
Eredmény:          Tűrésen belül
```

## 24. Ismert korlátozások

- a tényleges WinWatt-asztali próba adatait a felhasználónak kell rögzítenie;
- nincs automatikus WinWatt felületvezérlés;
- nincs natív WinWatt projektfájl-import;
- a visszaigazolt mezők nem írják át automatikusan a központi mezőtérképet;
- nincs validált havi vagy éves DIMPRO tanúsítási motor;
- az éves energia-, primerenergia-, CO₂- és besorolási mutatók DIMPRO-oldali összevetése egyelőre nem lehetséges;
- a próbanapló szakértői munkafolyamat, terepi módban nem jelenik meg.

## 25. Következő fejlesztési irány

A következő lépés csak tényleges WinWatt-próba után indokolt:

```text
v0.8.5 – visszaigazolt mezők ellenőrzött központi mezőtérkép-frissítése
```

Szükséges bemenet:

- legalább egy valós WinWatt-próba;
- pontos WinWatt-verzió;
- mezőnként visszaigazolt célablak, célfül, célfelirat és egység;
- tűrésen kívüli eredmények szakmai elemzése;
- a támogatott Excel-beviteli lehetőségek pontosítása;
- a napelem-, napkollektor- és akkumulátor-adatútvonal valós ellenőrzése.

## 26. Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: _woQoQbPeuPesDJRHo7kl
PM2 process: dimprover
PM2 PID: 2309858
Rollback: .next_before_energy_v084_20260730_062404
Forrásbackup: backups/energy_v084_winwatt_trial_feedback_20260729_211323
Dev Center: version_cb6bd511-0ce
```

Éles ellenőrzések:

- HTTP 200;
- v0.8.4 E2E: 35/35;
- történeti energetikai E2E: 42/42;
- domain- és integrációs tesztek: 415/415;
- alap Felmérő-, PDF-, DXF-, WinWatt- és `.dimpro` regresszió: sikeres;
- rajzlap- és PDF-regresszió: sikeres;
- PDF: 11 oldal;
- Excel: 20 munkalap;
- ZIP: 10 fájl;
- `.dimpro`: `dimpro.property-survey.v0.8.4`;
- WinWatt-előkészítő JSON: `dimpro.winwatt-compatible.v0.8.4`;
- próba-feedback: `dimpro.winwatt-trial-feedback.v0.8.4`;
- Excel: `dimpro.winwatt-transfer.v0.8.4`;
- ZIP: `dimpro.winwatt-trial-package.v0.8.4`;
- tablet álló és fekvő érintésteszt: sikeres;
- pinch-zoom: 2,15;
- érintés közbeni oldalelmozdulás: 0;
- éles assetaudit: 15/15;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0;
- friss PM2 naplónövekmény: 0 hibabájt;
- nginx konfiguráció: hibamentes.

A függőségi audit és a korábban külön jelzett npm-függőségi figyelmeztetések nem részei ennek a kiadásnak.
