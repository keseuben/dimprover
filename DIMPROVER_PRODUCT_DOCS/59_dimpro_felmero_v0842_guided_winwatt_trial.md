# DIMPRO Felmérő v0.8.4.2 – Vezetett WinWatt-próbaasszisztens

Dátum: 2026-07-30
Dev Center verzió: `version_d90c12ca-11f`
Alapverzió: v0.8.4.1
Alap éles build: `-SsugSS1etgbA6J_2f5hu`
Forrásbackup: `backups/energy_v0842_guided_winwatt_trial_20260730_085215`

## 1. Fejlesztési cél

A v0.8.4.2 a tényleges WinWatt-asztali próba végrehajtását gyorsítja és dokumentálja.

A kiadás nem módosítja automatikusan a központi WinWatt-mezőtérképet, és nem állítja, hogy a célmezők valós próbával visszaigazoltak.

A fejlesztés célja:

- a következő még nem próbált mező vezetett megnyitása;
- az aktív próbamező projektben történő megőrzése;
- a DIMPRO forrásérték egygombos vágólapmásolása;
- mezőnkénti automatikus időmérés;
- gyors próbaállapot-gombok;
- automatikus továbblépés;
- blokkolt mezők külön kezelése;
- oldalfrissítés és munkamenetváltás utáni folytathatóság;
- részletesebb Excel- és CSV-próbanapló.

## 2. Kötelező korlátozás

A v0.8.4.2 nem végzi el a WinWatt asztali program tényleges kezelését.

A rendszer:

- nem kattint a WinWatt felületén;
- nem olvassa automatikusan a WinWatt mezőfeliratait;
- nem állít elő natív WinWatt projektfájlt;
- nem minősít mezőt igazoltnak felhasználói státusz nélkül;
- nem írja át automatikusan a központi mezőtérképet;
- nem hoz létre kitalált WinWatt eredményt;
- nem készít validált havi vagy éves tanúsítási eredményt.

A következő fejlesztési szint továbbra is csak tényleges WinWatt-próba után indítható:

```text
v0.8.5 – visszaigazolt mezők ellenőrzött központi mezőtérkép-frissítése
```

## 3. Változatlan központi sémák

A kiadás nem változtatja meg a számítási és központi átadási szerződéseket:

```text
dimpro.winwatt-field-map.v0.8.3
dimpro.winwatt-compatible.v0.8.4
dimpro.winwatt-transfer.v0.8.4
dimpro.winwatt-trial-package.v0.8.4
dimpro.winwatt-trial-feedback.v0.8.4
```

Ennek oka, hogy a v0.8.4.2 a próba munkafolyamatát fejleszti, nem a WinWatt célmezők szakmai visszaigazolását.

## 4. DIMPRO munkafájl-séma

Új munkafájl-séma:

```text
dimpro.property-survey.v0.8.4.2
```

A szerkeszthető projektállapot megőrzi:

- az aktív WinWatt-próbamunkamenetet;
- az aktív próbamezőt;
- a mezőpróba futó vagy lezárt időadatait;
- a célablakot, célfület és célfeliratot;
- a gyors státuszt;
- a beviteli módot;
- a blokkolt mezők megjegyzéseit;
- az eredmény-összevetéseket.

## 5. Adatmodell-bővítés

### WinWattTrialSession

Új mező:

```text
activeFieldMapId?: string
```

Feladata:

- megőrzi az aktuálisan vizsgált mezőt;
- oldalfrissítés után ugyanott folytatható a próba;
- munkamenetváltáskor az adott munkamenet saját aktív mezője jelenik meg;
- érvénytelen azonosító esetén az első alkalmazandó mezőre áll vissza.

### WinWattTrialFieldResult

Új mezők:

```text
entryStartedAt?: string
entryCompletedAt?: string
```

A meglévő mező továbbra is használatos:

```text
durationSeconds?: number
```

## 6. Mezőidőmérési szabályok

### Indítás

A mezőpróba indításakor:

```text
entryStartedAt = aktuális időpont
entryCompletedAt = undefined
```

Ha a mezőidőmérés már fut, az újabb indítás nem írja felül a kezdési időpontot.

### Szüneteltetés

Szüneteltetéskor:

```text
durationSeconds = korábbi rögzített idő + aktuális futó idő
entryStartedAt = undefined
```

A mező később folytatható.

### Folytatás

Folytatáskor új futó szakasz indul, a korábbi `durationSeconds` megmarad.

### Lezárás

Gyors státusz kiválasztásakor:

```text
durationSeconds = korábbi idő + lezárt futó szakasz
entryStartedAt = undefined
entryCompletedAt = lezárás időpontja
```

Visszaigazolt státusznál a `verifiedAt` is frissül.

### Kézi időkorrekció

A szakértő továbbra is megadhat vagy korrigálhat kézi másodpercértéket.

Ez szükséges lehet:

- korábbi, nem mért próba rögzítéséhez;
- megszakított külső művelet korrigálásához;
- több gépen végzett próba összesítéséhez.

## 7. Vezetett próbakártya

A WinWatt próbanapló új központi kártyája:

```text
Vezetett WinWatt-próba
```

Megjeleníti:

- forrásadatcsoportot;
- DIMPRO forrásmezőt;
- forrásútvonalat;
- tervezett WinWatt célablakot;
- tervezett célfület;
- célfeliratot;
- másolható DIMPRO forrásértéket;
- rekord- és különbözőérték-számot;
- aktuális mezőidőt;
- próbaállapotot.

## 8. DIMPRO forrásérték másolása

Új gomb:

```text
DIMPRO érték másolása
```

Működés:

1. összegyűjti a kiválasztott mező kitöltött átadási rekordjait;
2. kiszűri az ismétlődő értékeket;
3. sortöréssel összeállítja a vágólap tartalmát;
4. vágólapra másolja;
5. a beviteli módot `copyPaste` értékre állítja;
6. szükség esetén automatikusan elindítja a mezőidőmérést.

Ha nincs másolható forrásérték, a felület ezt külön jelzi, és nem állít valótlan sikeres másolási állapotot.

A vágólapkezelés:

- elsődlegesen a böngésző Clipboard API-t használja;
- támogatás hiányában kijelöléses fallbacket alkalmaz.

## 9. Gyors próbaállapotok

A vezetett kártyán hat gyorsgomb érhető el:

```text
Egyezik
Cél pontosítva
Egység pontosítva
Csak kézi
Kihagyott
Blokkolt
```

A tényleges belső státuszok:

```text
matched
targetAdjusted
unitAdjusted
manualOnly
skipped
blocked
```

### Egyezik

A mező célja és tartalma a WinWattban megfelelő.

### Cél pontosítva

A célablak, célfül vagy célfelirat eltér a tervezett mezőtérképtől.

### Egység pontosítva

A WinWattban használt egység eltér vagy pontosítást igényel.

### Csak kézi

A mező nem vihető át megbízhatóan másolással vagy táblázatos beillesztéssel.

### Kihagyott

A mező a konkrét projektben nem alkalmazandó vagy tudatosan kimarad.

### Blokkolt

A próba a mezőnél nem hajtható végre. A munkamenet nem zárható le, amíg blokkolt mező marad.

## 10. Automatikus továbblépés

Kapcsoló:

```text
Automatikus továbblépés
```

Bekapcsolva a gyors státusz után:

1. a rendszer lezárja az aktuális mezőidőt;
2. elmenti a próbastátuszt;
3. megkeresi a következő alkalmazandó, még nem próbált mezőt;
4. megnyitja a megfelelő adatcsoportot;
5. aktív mezőként projektbe menti.

A keresés körkörös, de már próbált mezőt nem választ újra automatikusan.

## 11. Blokkolt mezők listája

Ha legalább egy mező `blocked` státuszú, megjelenik:

```text
Blokkolt mezők (N)
```

A lista tartalmazza:

- adatcsoportot;
- forrásmezőt;
- blokkolási megjegyzést.

A blokkolt mező közvetlenül visszanyitható és javított státusszal lezárható.

A kézi mezőválasztást a rendszer nem írja felül automatikusan.

## 12. Munkamenetfolytatás

A próba folytatható:

- oldalfrissítés után;
- Szakértői táblák és WinWatt lapok közötti váltás után;
- másik felmérési munkalap megnyitása után;
- másik WinWatt-próbamunkamenet kiválasztása után.

A rendszer nem indít automatikusan időmérést pusztán a mező megjelenítésétől.

## 13. Excel-próbanapló

A `18_Probanaplo` munkalap két új oszlopa:

```text
Mezőpróba indítva
Mezőpróba befejezve
```

A meglévő oszlopok megmaradtak:

- munkamenet;
- WinWatt-verzió;
- operátor;
- munkaállomás;
- forrásmező;
- célmező;
- státusz;
- beviteli mód;
- sorrend;
- idő másodpercben;
- látott érték;
- megjegyzés;
- visszaigazolási idő.

Az Excel továbbra is 20 munkalapos.

## 14. ZIP-próbanapló CSV

A próbanapló CSV új oszlopai:

```text
Mezőpróba_indítva
Mezőpróba_befejezve
```

A ZIP tartalma továbbra is tíz dokumentált fájl.

A ZIP séma változatlan:

```text
dimpro.winwatt-trial-package.v0.8.4
```

## 15. Migráció

Régi v0.8.4 vagy v0.8.4.1 projekt megnyitásakor:

- a próbamunkamenetek megmaradnak;
- az első alkalmazandó mező lesz az aktív mező, ha nincs korábbi aktív azonosító;
- a korábbi kézi `durationSeconds` érték megmarad;
- `entryStartedAt` és `entryCompletedAt` üres marad;
- a korábbi visszaigazolási státuszok nem változnak;
- a központi mezőtérkép nem módosul.

## 16. Responsive működés

Ellenőrzött képernyőméretek:

```text
1920 × 1080 – asztali
1366 × 768  – laptop
1194 × 834  – tablet fekvő
834 × 1194  – tablet álló
390 × 844   – mobil
```

Minden méreten:

- nincs teljes oldali vízszintes overflow;
- a gyors státuszgombok száma hat;
- a gombok minimális magassága legalább 44 px;
- mobilon a tényleges gombmagasság 48 px;
- a vezetett kártya belsőleg rendeződik át;
- a részletes mezőszerkesztő továbbra is elérhető.

## 17. Érintett fő fájlok

```text
components/energy/domain/energyWinWattTrialTypes.ts
components/property-survey/energy/EnergyWinWattTrialPanel.tsx
components/property-survey/propertySurveyWinWattWorkbook.ts
components/property-survey/propertySurveyWinWattTrialPackage.ts
components/property-survey/PropertySurveyPage.tsx
scripts/test-energy-winwatt-trial-v084.cjs
scripts/test-energy-expert-transfer-v080.cjs
scripts/test-property-survey-energy-v080.cjs
scripts/test-property-survey-v061.cjs
scripts/test-property-survey-energy-v075.cjs
scripts/test-property-survey-responsive-workspace-v0841.cjs
```

## 18. Automatikus tesztek

### Domain és integráció

```text
Felmérési munkaidőmérő:             43/43
WinWatt próbanapló és mezőidő:      58/58
Szakértői Excel és ZIP:             82/82
WinWatt mezőtérkép:                 21/21
Változat-összehasonlítás:           38/38
Megújuló/villamos motor:            44/44
Felújítási workflow:                39/39
Automatikus javaslatmotor:          18/18
Zónaterhelési motor:                36/36
Nyílászáró és hőhíd:                43/43
Zónamotor:                          25/25
Rétegrendi U-motor:                 28/28
```

Összesen:

```text
475/475
```

### Candidate E2E

```text
Vezetett WinWatt-próba és teljes v0.8.4 folyamat: 40/40
Központi munkatér és munkaidőmérő:                15/15
Történeti energetikai E2E:                        42/42
```

További regresszió:

- alap Felmérő: sikeres;
- PDF: sikeres;
- PDF oldalszám: 11;
- DXF: sikeres;
- WinWatt JSON és CSV: sikeres;
- 20 munkalapos Excel: sikeres;
- 10 fájlos ZIP: sikeres;
- `.dimpro v0.8.4.2`: sikeres;
- rajzlap: sikeres;
- tablet álló: sikeres;
- tablet fekvő: sikeres;
- pinch-zoom: 2,15;
- érintés közbeni oldalelmozdulás: 0;
- candidate assetaudit: 15/15;
- konzolhiba: 0;
- oldalhiba: 0.

## 19. Ismert korlátok

- a WinWatt asztali próbát a felhasználónak kell elvégeznie;
- a böngésző nem vezérli automatikusan a WinWatt alkalmazást;
- a vágólap tartalmát a felhasználó illeszti be;
- a célablak és célfelirat csak felhasználói visszaigazolás után hiteles;
- a központi mezőtérkép nem frissül automatikusan;
- nincs natív WinWatt import;
- nincs validált havi vagy éves DIMPRO tanúsítási motor;
- az npm-függőségi audit nem része ennek a release-nek.

## 20. Következő fejlesztési lépés

A következő release csak tényleges WinWatt-próbaadatok alapján indítható:

```text
v0.8.5 – ellenőrzött központi mezőtérkép-frissítés
```

Szükséges bemenet:

- pontos WinWatt-verzió;
- legalább egy valós próbamenet;
- mezőnként célablak, célfül, célfelirat és egység;
- blokkolt mezők szakmai magyarázata;
- támogatott másolási vagy Excel-beviteli mód;
- DIMPRO–WinWatt eredményeltérések;
- napelem-, napkollektor- és akkumulátor-adatútvonal tényleges ellenőrzése.

## 21. Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: fKApbzYl5rTyx2QryGRJp
PM2 process: dimprover
PM2 PID: 2323197
Rollback: .next_before_energy_v0842_20260730_094724
Forrásbackup: backups/energy_v0842_guided_winwatt_trial_20260730_085215
Dev Center: version_d90c12ca-11f
```

Éles ellenőrzések:

- HTTP 200;
- vezetett WinWatt-próba és teljes v0.8.4 E2E: 40/40;
- központi munkatér és stopper vizuális E2E: 15/15;
- történeti energetikai E2E: 42/42;
- domain- és integrációs tesztek: 475/475;
- alap Felmérő-, PDF-, DXF-, WinWatt- és `.dimpro` regresszió: sikeres;
- `.dimpro`: `dimpro.property-survey.v0.8.4.2`;
- Excel: 20 munkalap;
- ZIP: 10 fájl;
- PDF: 11 oldal;
- tablet álló és fekvő érintésteszt: sikeres;
- pinch-zoom: 2,15;
- érintés közbeni oldalelmozdulás: 0;
- éles assetaudit: 15/15;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0;
- friss PM2 naplónövekmény: 0 hibabájt;
- nginx konfiguráció: hibamentes;
- hat candidate és hat éles vizuális referencia-képernyőkép archiválva a forrásbackupban.

A központi WinWatt-mezőtérkép nem változott. A v0.8.5 továbbra is valós WinWatt-próbaadatot igényel.
