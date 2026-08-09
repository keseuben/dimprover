# DIMPRO Felmérő v0.8.2 – Meglévő és tervezett állapotok számított összehasonlítása

Dátum: 2026-07-29
Dev Center verzió: `version_cd81c564-40a`
Alapverzió: v0.8.1
Alap éles build: `uLQTREqrLyVG0zjJxTsS4`
Production candidate build: `OgI3v1C0l7Xsy6n2AVTIL`
Forrásbackup: `backups/energy_v082_scenario_compare_20260729_192821`

## 1. Cél

A v0.8.2 a felmért M0 meglévő állapot és a tervezett T-változatok összehasonlítását vezeti be.

A fejlesztés célja:

- terepen gyorsan áttekinthető eredmény;
- szakértői módban részletes összehasonlító tábla;
- több tervezett változat kezelése;
- csak igazolható hatások számszerűsítése;
- a nem számítható hatások egyértelmű jelölése;
- WinWatt-előkészítő export változatonként.

## 2. Biztonsági alapelv

A rendszer nem mutat automatikus éves energiamegtakarítást, költségmegtakarítást, megtérülést vagy tanúsítási besorolást.

A v0.8.2 eredménye:

```text
méretezési hőveszteség-összehasonlítás
méretezési fűtési teljesítmény-összehasonlítás
rendszerkapacitás-ellenőrzés
megújuló és villamos rendszerméret-összehasonlítás
```

Nem eredménye:

```text
éves nettó energiaigény
primerenergia
CO2
energetikai besorolás
energiaköltség
megtérülési idő
hiteles tanúsítvány
```

## 3. Virtuális változatszámítás

A tervezett változat nem írja át a felmérés eredeti rétegrendjeit, nyílászáróit vagy rendszereit.

Minden T-változat virtuális számításként készül az M0 alapállapotból.

Előnyök:

- az M0 változatlan marad;
- több T-változat párhuzamosan összehasonlítható;
- hibás célérték nem módosítja a felmérési adatot;
- a WinWatt-átadáshoz a jelenlegi és tervezett érték külön marad;
- az auditálhatóság megmarad.

## 4. Számítási képlet

Szerkezeti intézkedés:

```text
Hjelenlegi = A × Ujelenlegi × b
Htervezett = A × Ucél × b
ΔH = Hjelenlegi − Htervezett
```

Nyílászáró:

```text
Hjelenlegi = Aablak × Uwjelenlegi × b
Htervezett = Aablak × Uwcél × b
```

A beépítési perem és külön nyílászáró-hőhidak változatlanok maradnak, ha a változatban nincs hozzájuk külön célérték. Ilyenkor az intézkedés `Részben számítható`.

Zónánkénti méretezési teljesítmény:

```text
Φtervezett = (Htr,tervezett + Hve,jelenlegi) × ΔT / 1000
```

A szellőzési veszteség a v0.8.2-ben csak akkor változik, ha később külön validált szellőzési intézkedésmotor készül.

## 5. Számíthatósági státuszok

```text
Meglévő alapállapot
Számítható
Részben számítható
Még nem számítható
Javítandó adat
```

### Számítható

- rétegrend cél-U-értékkel és konkrét rétegrendkapcsolattal;
- nyílászáró cél-Uw-értékkel és konkrét nyílászárókapcsolattal;
- napelem kWp célértékkel és használható fajlagos hozammal;
- napkollektor m² célértékkel és használható fajlagos hozammal.

### Részben számítható

- nyílászárócsere, ha a beépítési csomópont célértéke nincs megadva;
- fűtési rendszer kW célértékkel: kapacitás ellenőrizhető, éves energiahatás nem;
- akkumulátor: kapacitás összehasonlítható, éves működés órás profil nélkül nem;
- autótöltő: teljesítmény és töltési energiaigény összehasonlítható, megtakarítás nem;
- napelem vagy napkollektor, ha a rendszerkapacitás megvan, de nincs hozamreferencia.

### Még nem számítható

- fűtési rendszer éves hatékonyságváltozása;
- hűtési rendszer éves energiahatása;
- szellőzési rendszer éves energiahatása;
- HMV-rendszer éves primerenergia-hatása;
- csak szöveges, célérték nélküli intézkedés.

## 6. Kettős elszámolás elleni védelem

Egy változaton belül ugyanaz a kategória és célazonosító csak egyszer szerepelhet.

Példa:

```text
externalWall:assembly-wall-01
```

Ha ugyanaz a cél kétszer beválasztott:

- a változat `Javítandó adat` státuszt kap;
- a második tétel nem számolódik;
- külön `MEASURE_DUPLICATE_TARGET` üzenet jelenik meg.

## 7. Terepi felület

Az aktív T-változat tetején megjelenik:

- M0 → T változatfejléc;
- számíthatósági státusz;
- beválasztott intézkedések száma;
- számított, részleges és még nem számítható tételek száma;
- Htranszmisszió M0 és tervezett érték;
- teljes H M0 és tervezett érték;
- méretezési fűtési igény M0 és tervezett érték;
- százalékos csökkenés;
- fűtési kapacitás megfelelősége;
- PV, napkollektor, akkumulátor és autótöltő tervezett mérete.

Adatjelölők:

```text
data-renovation-comparison
data-renovation-comparison-status
data-renovation-comparison-measure
```

## 8. Intézkedésszintű eredmény

Minden beválasztott intézkedésnél látható:

- számítási státusz;
- jelenlegi érték;
- célérték;
- jelenlegi H;
- tervezett H;
- H-csökkenés;
- méretezési teljesítménycsökkenés;
- tervezett kapacitás vagy éves előzetes hozam;
- számítási korlátozás.

## 9. Szakértői nézet

A Felújítás munkalapon külön, vízszintesen görgethető összehasonlító tábla jelenik meg.

Fő oszlopok:

- változat;
- számíthatóság;
- intézkedésszám;
- Htr M0 és terv;
- Htr változás;
- Φ M0 és terv;
- Φ változás;
- PV;
- napkollektor;
- akkumulátor;
- autótöltő.

## 10. Szakértői adattáblák

A szakértői táblák száma 14-ről 15-re nőtt.

Új tábla:

```text
Változat-összehasonlítás
```

A `Felújítási változatok` tábla továbbra is az intézkedések bemeneti adatait tartalmazza.

A `Változat-összehasonlítás` tábla a számított eredményeket tartalmazza.

## 11. Excel munkafüzet

Új séma:

```text
dimpro.winwatt-transfer.v0.8.2
```

A munkafüzet 16 lapos:

```text
00_Jegyzek
01_Altalanos
02_Anyagok
03_Szerkezetek
04_Retegek
05_Helyisegek
06_Epuletszintek
07_Zonak
08_Hatarolo_szerk
09_Nyilaszarok
10_Hohidak
11_Gepeszeti_rendsz
12_Felujitasi_valt
13_Valtozat_osszeh
14_Megujulo_vill
15_Forras_statusz
```

## 12. DIMPRO munkafájl

Új séma:

```text
dimpro.property-survey.v0.8.2
```

Új számított blokk:

```text
calculated.energyRenovationComparison
```

Sémája:

```text
dimpro.energy-renovation-comparison.v0.8.2
```

Régi v0.8.0 munkafájlok továbbra is importálhatók. Új szerkeszthető projektmező nem készült, ezért külön adatmodell-migráció nem szükséges.

## 13. WinWatt-előkészítő JSON

Új séma:

```text
dimpro.winwatt-compatible.v0.8.2
```

Új blokk:

```text
renovationComparison
```

A JSON változatonként tartalmazza:

- a számíthatósági státuszt;
- a H-eredményeket;
- a méretezési teljesítményt;
- a kapacitásállapotot;
- a megújuló rendszerparamétereket;
- az intézkedésszintű eredményeket;
- az ellenőrzési üzeneteket.

## 14. PDF

Új külön oldal:

```text
MEGLÉVŐ ÉS TERVEZETT ÁLLAPOT ÖSSZEHASONLÍTÁSA
```

Tartalma:

- változatok státusza;
- számítható és nem számítható tételek;
- Htr M0 → terv;
- Hösszes M0 → terv;
- fűtési igény M0 → terv;
- kapacitásállapot;
- PV és akkumulátor méret;
- kötelező korlátozás.

A teljes mintaprojekt PDF-je 11 oldalas.

## 15. Fő fájlok

```text
components/energy/domain/energyRenovationComparisonTypes.ts
components/energy/calculations/renovation/calculateRenovationComparison.ts
components/property-survey/energy/EnergyRenovationComparisonPanel.tsx
components/property-survey/energy/EnergyRenovationPanel.tsx
components/property-survey/PropertySurveyPage.tsx
components/property-survey/propertySurveyExpertTables.ts
components/property-survey/propertySurveyWinWattWorkbook.ts
components/property-survey/propertySurveyEnergyCalculations.ts
components/property-survey/propertySurveyBuildingPdf.ts
scripts/test-energy-renovation-comparison-v082.cjs
scripts/test-energy-expert-transfer-v080.cjs
scripts/test-property-survey-energy-v080.cjs
```

## 16. Candidate tesztek

```text
Változat-összehasonlító motor: 38/38
Megújuló/villamos motor:       44/44
Felújítási workflow:           39/39
Szakértői táblák és Excel:     43/43
Javaslatmotor:                 18/18
Zónaterhelés:                  36/36
Nyílászáró és hőhíd:           43/43
Zónák:                         25/25
Rétegrendi U-motor:            28/28
Összes domain/integráció:      314/314
v0.8.2 E2E:                    24/24
Történeti energetikai E2E:     42/42
Candidate assetaudit:          13/13
Konzolhiba:                    0
Oldalhiba:                     0
```

További regresszió:

```text
Alap Felmérő: sikeres
PDF/DXF/WinWatt/.dimpro: sikeres
PDF: 11 oldal
Tablet álló/fekvő: sikeres
Pinch-zoom: 2,15
Érintés közbeni oldalelmozdulás: 0
```

## 17. Következő fejlesztési irány

```text
v0.8.3 – WinWatt mezőtérkép finomítása valós adatátviteli próbákkal
```

A későbbi v0.9.0 havi energiamotor után a változat-összehasonlítás bővíthető:

- éves nettó energiaigény;
- primerenergia;
- CO2;
- besorolás;
- éves költség;
- beruházási és megtérülési elemzés.

## 18. Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: OgI3v1C0l7Xsy6n2AVTIL
PM2 process: dimprover
Rollback: .next_before_energy_v082_20260729_200150
Forrásbackup: backups/energy_v082_scenario_compare_20260729_192821
```

Éles ellenőrzések:

- HTTP 200;
- v0.8.2 E2E: 24/24;
- történeti energetikai E2E: 42/42;
- domain- és integrációs ellenőrzések: 314/314;
- alap Felmérő-, PDF-, DXF-, WinWatt-, `.dimpro`- és rajzlapregresszió: sikeres;
- PDF: 11 oldal;
- szakértői adattáblák: 15;
- Excel munkalapok: 16;
- tablet álló és fekvő érintésteszt: sikeres;
- pinch-zoom: 2,15;
- érintés közbeni oldalelmozdulás: 0;
- éles assetaudit: 13/13;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.

A fejlesztés új számított eredményt és exportverziót vezetett be, de új szerkeszthető projektmezőt nem, ezért külön projektmigráció nem szükséges.
