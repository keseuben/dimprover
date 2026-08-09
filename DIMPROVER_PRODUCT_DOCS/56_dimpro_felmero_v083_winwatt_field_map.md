# DIMPRO Felmérő v0.8.3 – WinWatt mezőtérkép és próbaátadási csomag

Dátum: 2026-07-29
Dev Center verzió: `version_2a221f97-0b0`
Alapverzió: v0.8.2
Alap éles build: `OgI3v1C0l7Xsy6n2AVTIL`
Production candidate build: `7qmr-kRdOGrnnEKMeqkJf`
Forrás-checkpoint: `backups/energy_v083_winwatt_transfer_20260729_202925`

## 1. Fejlesztési cél

A v0.8.3 célja a DIMPRO Felmérő és a WinWatt közötti adatátadás mezőszintű előkészítése.

A fejlesztés nem állítja, hogy natív WinWatt projektfájlt készít, és nem használ nem dokumentált WinWatt belső mezőazonosítókat.

A rendszer feladata:

- a DIMPRO forrásmezők azonosítása;
- szakmai WinWatt céladatcsoport kijelölése;
- célfelirat és mértékegység rögzítése;
- kötelező, feltételes és opcionális mezők elkülönítése;
- közvetlen, kézi és referenciajellegű átadás megkülönböztetése;
- hiányzó vagy hibás adatok mezőszintű kimutatása;
- valós WinWatt-próbához egységes átadási csomag létrehozása.

## 2. Fontos elnevezési szabály

A mezőtérkép célkulcsai például:

```text
WW.building.cim
WW.materials.lambda
WW.rooms.area
WW.boundaries.uValue
```

Ezek DIMPRO által létrehozott, stabil átadási szerződéskulcsok.

Nem tekinthetők a WinWatt program belső adatbázis- vagy mezőazonosítóinak.

A pontos WinWatt felületi célmezőket és beviteli sorrendet valós próbaátadással kell ellenőrizni.

## 3. Új adatséma

```text
dimpro.winwatt-field-map.v0.8.3
```

Fő részei:

```text
fields
records
tables
validationMessages
totals
readyForTrialTransfer
```

## 4. Mezőszintű adatok

Minden leképezett mező tartalmazza:

- DIMPRO forrástábla azonosítóját és nevét;
- forrásoszlop kulcsát és feliratát;
- forrásútvonalat;
- forrás mértékegységét;
- céladatcsoportot;
- DIMPRO célkulcsot;
- WinWatt-logikájú célfeliratot;
- cél mértékegységet;
- kötelezőséget;
- átadási módot;
- célmező-ellenőrzési státuszt;
- adattípust;
- rekord-, kitöltött-, hiányzó- és hibásérték-számot;
- átadási készültséget;
- részletes ellenőrzési üzenetet.

## 5. Kötelezőségi szintek

```text
required     – kötelező
conditional  – feltételes
optional     – opcionális
```

Kötelező példa:

- felmérés neve;
- cím;
- rendeltetés;
- fűtött alapterület;
- kondicionált térfogat;
- szerkezet megnevezése és U-értéke;
- helyiség neve, szintje, területe és térfogata;
- határoló szerkezet nettó felülete és U-értéke.

Feltételes példa:

- helyrajzi szám;
- építés éve;
- zónahozzárendelés;
- nyílászáró g-érték;
- hőhíd Ψ vagy χ;
- rendszerkapacitás;
- megújuló rendszer éves energiája.

## 6. Átadási módok

```text
directCopy         – közvetlen másolásra előkészített
manualReview       – kézi WinWatt-ellenőrzés szükséges
referenceOnly      – dokumentációs vagy auditadat
futureNativeImport – későbbi natív import számára fenntartott
```

A közvetlen másolás sem jelent natív importot. Azt jelenti, hogy az érték és mértékegység egyértelműen átadható a megfelelő szakmai adatcsoportba.

## 7. Célmező-ellenőrzési szintek

```text
referenceAligned – WinWatt szakmai logikájához igazított
trialRequired    – valós WinWatt-próba szükséges
dimproExtension  – DIMPRO kiegészítő vagy auditadat
```

Valós próbát igényelnek különösen:

- hőhidak;
- épülettechnikai rendszerek;
- megújuló és villamos rendszerek;
- olyan feliratok, amelyek pontos WinWatt helyét a felület alapján kell igazolni.

## 8. Készültségi státuszok

```text
ready          – átadásra kész
reviewRequired – ellenőrzendő
blocked        – blokkolt
notApplicable  – nem alkalmazandó
```

A teljes próbaátadási készültség csak akkor igaz, ha nincs blokkolt mező.

## 9. Blokkolási szabályok

Blokkoló állapot keletkezik, ha:

- kötelező adatcsoportban nincs rekord;
- kötelező érték hiányzik;
- a mező adattípusa hibás;
- numerikus mező nem értelmezhető számként;
- a projekt alapadatai nem elegendők értelmes WinWatt-próbához.

Az üres opcionális adatcsoport nem blokkol.

Például hőhíd nélküli projektben az üres hőhídtábla `Nem alkalmazandó` állapotú.

## 10. Mintaprojekt diagnosztikája

A v0.8.3 teljes böngészőteszt mintaprojektje:

```text
Adatcsoport:              15
Leképezett mező:          188
Átadási rekord:           576
Átadásra kész mező:        39
Ellenőrzendő mező:         72
Blokkolt mező:              5
Referenciaillesztett:     109
DIMPRO kiegészítő:         47
Valós próbát igényel:      32
```

Az öt blokkolt mező:

```text
Általános adatok / Cím
Szerkezetek / Megnevezés
Szerkezetek / Típus
Szerkezetek / U eredő
Határoló szerkezetek / U
```

Ezek valóban szükségesek egy értelmes WinWatt-próbához, ezért a szabály nem lett lazítva.

## 11. Szakértői felület

Az Energetika munkatér új, tizedik lapja:

```text
WinWatt átadás
```

A lap csak Szakértői módban érhető el.

Fő elemei:

- próbaátadási készültség;
- adatcsoport-, mező- és rekordszám;
- kész, ellenőrzendő és blokkolt mezők;
- adatcsoportonkénti készültségi kártyák;
- mezőszintű táblázat;
- státuszszűrő;
- adatcsoportszűrő;
- teljes mezőtérképes keresés;
- átadás előtti hibajegyzék;
- Excel- és ZIP-export.

## 12. Fülsáv használhatósági javítása

A tíz energetikai fül korábban nagy képernyőn tíz oszlopba került akkor is, ha a munkatér keskeny oldalsávban jelent meg.

Ez gombtartalom-átfedést okozhatott.

A v0.8.3 konténerszélességhez igazodó elrendezést használ:

```css
grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
```

Eredmény:

- keskeny panelben több sorba törés;
- széles nézetben automatikus kitöltés;
- nincs egymást fedő fül;
- a Nyílászárók és Zónaterhelés gomb külön, biztos kattintási területet kap.

## 13. Excel munkafüzet

Új séma:

```text
dimpro.winwatt-transfer.v0.8.3
```

A munkafüzet 18 lapos:

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
16_Mezoterkep
17_Atadas_ellenorzes
```

### 16_Mezoterkep

Tartalmazza:

- forrásmezőt;
- forrásútvonalat;
- céladatcsoportot;
- célkulcsot és célfeliratot;
- mértékegységeket;
- kötelezőséget;
- átadási módot;
- célellenőrzést;
- adattípust;
- lefedettséget;
- készültséget és magyarázatot.

### 17_Atadas_ellenorzes

Tartalmazza:

- próbaátadási készültséget;
- összesített mező- és rekordszámokat;
- blokkoló és ellenőrzendő tételeket;
- hiányzó kötelező értékeket;
- hibás adattípusokat;
- részletes üzenetlistát.

## 14. WinWatt-előkészítő JSON

Új séma:

```text
dimpro.winwatt-compatible.v0.8.3
```

Új blokkok:

```text
winWattFieldMap
transferWorkbookSchema
trialPackageSchema
```

## 15. DIMPRO munkafájl

Új séma:

```text
dimpro.property-survey.v0.8.3
```

A `calculated` blokk új eleme:

```text
winWattFieldMap
```

A projekt szerkeszthető adatmodellje nem változott, ezért külön adatbázis-migráció nem szükséges.

## 16. Próbaátadási ZIP

Új séma:

```text
dimpro.winwatt-trial-package.v0.8.3
```

A csomag hét fájlt tartalmaz:

```text
README.txt
manifest.json
*_winwatt_elokeszito_v083.xlsx
*_winwatt_adatcsomag_v083.json
*_winwatt_mezoterkep.csv
*_winwatt_atadasi_rekordok.csv
*_winwatt_atadasi_hibak.csv
```

## 17. Diagnosztikai és próbaátadási mód

Ha nincs blokkolt mező:

```text
Próbaátadási ZIP
readyForTrialTransfer: true
```

Ha van blokkolt mező:

```text
Diagnosztikai ZIP
readyForTrialTransfer: false
```

A diagnosztikai ZIP is letölthető, mert a hiányok javításához szükséges teljes ellenőrzési listát tartalmazza.

## 18. Manifest

A `manifest.json` tartalmazza:

- csomagsémát;
- exportidőpontot;
- projektet és felmérést;
- próbaátadási készültséget;
- mezőtérkép-, Excel- és JSON-sémát;
- mezőösszesítést;
- csomagfájlok listáját.

## 19. README és javasolt próbasorrend

A ZIP README javasolt sorrendje:

1. általános adatok és épületgeometria;
2. anyagok, szerkezetek és rétegek;
3. helyiségek, szintek és zónák;
4. határoló szerkezetek és nyílászárók;
5. hőhidak és épülettechnikai rendszerek;
6. DIMPRO és WinWatt eredmények összevetése;
7. eltérő feliratok és egységek visszavezetése a mezőtérképbe.

## 20. Valós próba során rögzítendő eltérések

- WinWatt felületi célmező pontos neve;
- adatbeviteli ablak vagy lap;
- kötelező mező eltérése;
- mértékegység eltérése;
- tizedes- és dátumformátum;
- másolási sorrend;
- közvetlenül nem átadható adat;
- WinWatt által újraszámított eredmény;
- DIMPRO és WinWatt eredménykülönbség;
- szükséges DIMPRO mezőtérkép-módosítás.

## 21. Érintett fő fájlok

```text
components/energy/domain/energyWinWattTransferTypes.ts
components/energy/transfers/winwatt/buildWinWattFieldMap.ts
components/property-survey/energy/EnergyWinWattTransferPanel.tsx
components/property-survey/energy/PropertySurveyEnergyWorkspace.tsx
components/property-survey/propertySurveyWinWattWorkbook.ts
components/property-survey/propertySurveyWinWattTrialPackage.ts
components/property-survey/propertySurveyEnergyCalculations.ts
components/property-survey/PropertySurveyPage.tsx
scripts/test-energy-winwatt-field-map-v083.cjs
scripts/test-energy-expert-transfer-v080.cjs
scripts/test-property-survey-energy-v080.cjs
```

## 22. Candidate tesztek

```text
WinWatt mezőtérkép domain:       21/21
Szakértői átadás, Excel és ZIP:  66/66
Változat-összehasonlítás:        38/38
Megújuló/villamos motor:         44/44
Felújítási workflow:             39/39
Automatikus javaslatmotor:       18/18
Zónaterhelési motor:             36/36
Nyílászáró és hőhíd:             43/43
Zónamotor:                       25/25
Rétegrendi U-motor:              28/28
Összes domain/integráció:       358/358
v0.8.3 E2E:                      29/29
Történeti energetikai E2E:       42/42
Alap Felmérő-regresszió:         sikeres
PDF-, DXF- és rajzlapregresszió: sikeres
PDF:                              11 oldal
Tablet álló/fekvő:                sikeres
Pinch-zoom:                       2,15
Érintés közbeni oldalelmozdulás:  0
Candidate assetaudit:            15/15
Konzolhiba:                       0
Oldalhiba:                        0
```

Responsive WinWatt átadási lap:

```text
1194 × 834
834 × 1194
390 × 844
```

Mobil nézet:

```text
Viewport:                 390 px
Mezőtérkép panel:         322 px
Mezőtérkép belső szélesség: 1436 px
Teljes oldal:             390 px
```

A széles mezőtérkép a saját paneljén belül görgethető, a teljes oldal nem lóg ki.

## 23. Ismert korlátozások

- nincs natív WinWatt projektfájl-import;
- nincs igazolt WinWatt belső mezőazonosító;
- a célfeliratok egy része valós próbaátadással ellenőrzendő;
- a WinWatt kézi bevitelét vagy támogatott importját a felhasználónak kell véglegesítenie;
- a DIMPRO kiegészítő adatok nem minden esetben rendelkeznek külön WinWatt célmezővel;
- a havi és éves validált energiaeredmény továbbra sem része ennek a verziónak.

## 24. Következő fejlesztési irány

```text
v0.8.4 – első dokumentált valós WinWatt-próba eredményeinek visszavezetése
```

Szükséges bemenet:

- tényleges WinWatt-felviteli próba;
- mezőnként rögzített célablak és célfelirat;
- mértékegység- és formátumeltérések;
- DIMPRO–WinWatt eredmény-összehasonlítás;
- szükséges mezőtérkép-korrekciók.

## 25. Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: 7qmr-kRdOGrnnEKMeqkJf
PM2 process: dimprover
Rollback: .next_before_energy_v083_20260729_205928
Forrás-checkpoint: backups/energy_v083_winwatt_transfer_20260729_202925
```

Éles ellenőrzések:

- HTTP 200;
- v0.8.3 E2E: 29/29;
- történeti energetikai E2E: 42/42;
- alap Felmérő-regresszió: sikeres;
- PDF-, DXF- és rajzlapregresszió: sikeres;
- Excel: 18 munkalap;
- diagnosztikai/próbaátadási ZIP: 7 fájl;
- `.dimpro`: `dimpro.property-survey.v0.8.3`;
- WinWatt-előkészítő JSON: `dimpro.winwatt-compatible.v0.8.3`;
- mezőtérkép: `dimpro.winwatt-field-map.v0.8.3`;
- Excel: `dimpro.winwatt-transfer.v0.8.3`;
- ZIP: `dimpro.winwatt-trial-package.v0.8.3`;
- PDF: 11 oldal;
- WinWatt átadási lap responsive: 3 méret;
- mobil mezőtérkép-panel: 322 px, belső tábla: 1436 px, oldal: 390 px;
- tablet álló és fekvő érintésteszt: sikeres;
- pinch-zoom: 2,15;
- érintés közbeni oldalelmozdulás: 0;
- éles assetaudit: 15/15;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.

A függőségi audit és a korábban jelzett npm-függőségi figyelmeztetések nem részei ennek a kiadásnak.
