# DIMPRO Felmérő v0.8.1 – Helyszíni gyorsfelvétel és egyszerűsített terepi felület

Dátum: 2026-07-29
Dev Center verzió: `version_ba375937-b4e`
Alapverzió: v0.8.0
Alap éles build: `TgWAG7ypFaOltQdfP_FvC`
Production candidate build: `uLQTREqrLyVG0zjJxTsS4`
Forrásbackup: `backups/energy_v081_field_ux_20260729_184405`

## 1. Fejlesztési cél

A v0.8.1 kizárólag felhasználói felület- és munkafolyamat-fejlesztés.

Célja:

- egyértelműbb helyszíni sorrend;
- kevesebb egyszerre látható mező;
- nagyobb érintési felületek;
- kötelező és opcionális adatok megkülönböztetése;
- a szakértői paraméterek elkülönítése;
- rövidebb, könnyebben átnézhető felújítási kártyák;
- a következő hiányos feladat automatikus megmutatása.

A számítási motorok, adatmodellek és export-sémák nem változtak.

## 2. Terepi útmutató

A Terepi módban a főoldalon új útmutatókártya jelenik meg.

Megmutatja:

- az aktuális lépés nevét;
- az aktuális sorszámot a teljes folyamatban;
- a lépés rövid célját;
- hogy a lépés rendben van-e vagy még hiányos;
- a következő hiányos lépést;
- a teljes készültséget.

A `Következő hiányos` gomb közvetlenül a soron következő kitöltendő munkalapra visz.

Adatjelölők:

```text
data-energy-field-guide
data-energy-next-incomplete-step
```

## 3. Csak hiányos lépések

A felhasználó bekapcsolhatja:

```text
Csak a hiányos lépések
```

Bekapcsolva:

- az aktuális lépés mindig látható marad;
- a már elkészült lépések ideiglenesen elrejtődnek;
- a hiányos lépések eredeti sorszámozása nem változik;
- az állapot a projekt `energyFieldWorkflow.showOnlyIncomplete` mezőjében mentődik.

A kapcsoló elérhető:

- a fő terepi útmutatóban;
- a bal oldali lépéspanelben;
- a rajzi fókuszmód lépéspanelében.

## 4. Közös energetikai felületi komponensek

Új közös komponens:

```text
components/property-survey/energy/EnergyFieldUi.tsx
```

Tartalma:

```text
EnergyFieldIntro
EnergyFieldStatusBadge
EnergyAdvancedDetails
EnergyFieldHelp
EnergyRequiredLabel
```

A közös komponensek célja, hogy minden energetikai munkalap azonos szabályok szerint működjön.

## 5. Kötelező és opcionális mezők

A mezőcímek külön jelzik:

```text
szükséges
opcionális
```

Terepi módban elsőként csak a döntéshez és az előméretezéshez szükséges mezők jelennek meg.

Szakértői módban a részletes műszaki adatok automatikusan megnyílhatnak.

## 6. Megújuló munkalap új logikája

A hét munkalap három csoportba rendeződik:

```text
1. Alapadat
- Tetősíkok
- Villamos adatok

2. Rendszer
- Napelem
- Napkollektor
- Akkumulátor
- Autótöltés

3. Eredmény
- Ellenőrzés
```

Minden fül állapota külön látható:

```text
complete
incomplete
optional
```

Adatjelölő:

```text
data-renewable-readiness
```

## 7. Megújuló következő teendő

A munkalap tetején külön kártya jelenik meg:

```text
data-renewable-next-action
```

A kártya megmutatja:

- melyik alapadat hiányzik;
- szükséges-e még rendszert választani;
- mikor nyitható meg az ellenőrzés.

## 8. Tetősík gyorsfelvétele

Elsőként látható mezők:

- megnevezés;
- azimut;
- dőlésszög;
- bruttó felület;
- hasznos felület;
- adatforrás;
- napelemhez használható;
- napkollektorhoz használható.

Külön részletes szakaszba került:

- tetőfedés;
- árnyékolási szorzó;
- adatstátusz;
- teherbírás és statikai státusz;
- megjegyzés.

## 9. Villamos alapadatok

Elsőként látható:

- éves fogyasztás;
- fázisszám;
- csatlakozási áramerősség;
- adatforrás.

Részletes műszaki adatok:

- nappali fogyasztási arány;
- egyidejű alapteher;
- feszültség;
- adatstátusz.

## 10. Napelem

Gyors mezők:

- paneldarabszám;
- modulteljesítmény;
- inverter AC teljesítmény;
- forrás és hozamadat.

Részletes mezők:

- modul felülete;
- fajlagos éves hozam;
- rendszerveszteség;
- kapcsolati mód;
- adatstátusz;
- megjegyzés.

Új gyorsművelet:

```text
Maximum átvétele
```

A gomb a tetőfelületből számított maximális paneldarabszámot másolja a tervbe.

## 11. Napkollektor

Gyors mezők:

- kollektorfelület;
- személyek száma;
- adatforrás.

Részletes mezők:

- kollektortípus;
- napi HMV liter/fő;
- hidegvíz-hőmérséklet;
- HMV célhőmérséklet;
- fajlagos hozam;
- rendszerveszteség;
- tároló liter/m²;
- adatstátusz.

## 12. Akkumulátoros energiatárolás

Gyors mezők:

- méretezési cél;
- névleges kapacitás;
- kritikus fogyasztás;
- tartaléküzemi idő;
- adatforrás.

Részletes mezők:

- használható kapacitás;
- használható hányad;
- körfolyamati hatásfok;
- tartalékarány;
- maximális töltési teljesítmény;
- maximális kisütési teljesítmény;
- adatstátusz;
- megjegyzés.

Új gyorsművelet:

```text
Javaslat átvétele
```

A gomb a számított névleges kapacitást és az abból származó használható kapacitást írja a tervbe.

## 13. Elektromosautó-töltés

Gyors mezők:

- járművek száma;
- éves futásteljesítmény;
- fogyasztás;
- otthoni töltési arány;
- töltőteljesítmény;
- adatforrás.

Részletes mezők:

- fázisszám;
- dinamikus terhelésmenedzsment;
- PV-többlet alapú intelligens töltés;
- adatstátusz;
- megjegyzés.

## 14. Ellenőrzési üzenetek

Az eredménylap a technikai súlyosság helyett felhasználói megnevezést mutat:

```text
Javítandó
Ellenőrizendő
Tájékoztatás
```

A blokkoló hibák elsőként jelennek meg.

## 15. Felújítási kártyák

A felújítási intézkedések terepi módban alapból összecsukva jelennek meg.

A kártyafejléc mutatja:

- a kategóriát;
- a várható hatást;
- a beválasztási állapotot;
- a megnevezést;
- a tervezett beavatkozás első sorát;
- a hiányzó adatokat.

Lehetséges státuszok:

```text
Alapadat rendben
Hiányzik: megnevezés, beavatkozás vagy forrás
Nincs beválasztva
```

## 16. Felújítási gyorsadatok

Egy intézkedés megnyitásakor elsőként csak két kötelező mező látható:

- tervezett beavatkozás;
- adatforrás vagy ellenőrzési hivatkozás.

A további műszaki adatok külön nyithatók meg:

- kategória;
- megnevezés;
- várható hatás;
- adatstátusz;
- meglévő állapot;
- jelenlegi érték;
- célérték;
- mértékegység;
- megjegyzés és kockázat.

## 17. Felújítási szűrők

Három szűrő készült:

```text
Mind
Beválasztva
Hiányos
```

Adatjelölők:

```text
data-renovation-filter
data-renovation-measure-complete
```

Az `Első hiányos megnyitása` gomb automatikusan a következő kiegészítendő intézkedéshez görget.

## 18. Változatbeállítások

A változat kódja, neve, státusza, leírása és törlése külön összecsukható részbe került.

A fő nézetben csak az aktív változat összefoglalója és három mutató látható:

- összes intézkedés;
- beválasztott intézkedések;
- hiányos beválasztott intézkedések.

## 19. Eszközkapcsolatok

A korábbi három állandó kártya egyetlen összecsukható részbe került:

```text
Eszközkapcsolatok és offline működés
```

Tartalma változatlan:

- LiDAR / RoomPlan;
- Bluetooth-lézer;
- offline helyi mentés.

Ez csökkenti a fő munkaterület vizuális zsúfoltságát.

## 20. Változatlan adatsémák

A v0.8.1 nem igényel migrációt.

Változatlan sémák:

```text
DIMPRO munkafájl:
dimpro.property-survey.v0.8.0

Megújuló eredmény:
dimpro.energy-renewable-sizing.v0.8.0

WinWatt-előkészítő JSON:
dimpro.winwatt-compatible.v0.8.0

WinWatt-előkészítő Excel:
dimpro.winwatt-transfer.v0.8.0
```

## 21. Fő érintett fájlok

```text
components/property-survey/PropertySurveyPage.tsx
components/property-survey/energy/EnergyFieldUi.tsx
components/property-survey/energy/EnergyRenewablePanel.tsx
components/property-survey/energy/EnergyRenovationPanel.tsx
scripts/test-property-survey-energy-v080.cjs
```

## 22. Candidate tesztek

```text
v0.8.1 terepi és szakértői E2E: 23/23
v0.7.5 történeti energetikai E2E: 42/42
Megújuló motor: 44/44
Felújítási workflow: 39/39
Szakértői táblák és Excel: 38/38
Javaslatmotor: 18/18
Zónaterhelés: 36/36
Nyílászáró és hőhíd: 43/43
Zónák: 25/25
Rétegrendi U-motor: 28/28
Alap Felmérő-regresszió: sikeres
Rajzlap- és PDF-regresszió: sikeres
PDF: 10 oldal
Tablet álló/fekvő: sikeres
Pinch-zoom: 2,15
Érintés közbeni oldalelmozdulás: 0
Candidate assetaudit: 13/13
Konzolhiba: 0
Oldalhiba: 0
```

Responsive ellenőrzések:

```text
Megújuló munkatér: 6 méret
Felújítási munkatér: 3 méret
Szakértői táblák: 3 méret
Mobil viewport: 390 px
Mobil táblapanel: 322 px
Belső szakértői tábla: 771 px
Teljes oldal: 390 px
```

## 23. Következő fejlesztési irány

A következő logikus lépés:

```text
v0.8.2 – meglévő és tervezett változatok számított összehasonlítása
```

A fejlesztésnél továbbra is megőrzendő:

- a terepi felület egyszerűsége;
- a szakértői adatok külön kezelése;
- az átlátható változatkártyák;
- az egyértelmű státusz és következő teendő;
- a változatlan, közös számítási motor.

## 24. Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: uLQTREqrLyVG0zjJxTsS4
PM2 process: dimprover
Rollback: .next_before_energy_v081_20260729_191407
Forrásbackup: backups/energy_v081_field_ux_20260729_184405
```

Éles ellenőrzések:

- HTTP 200;
- v0.8.1 terepi és szakértői E2E: 23/23;
- történeti energetikai E2E: 42/42;
- alap Felmérő-regresszió: sikeres;
- rajzlap- és PDF-regresszió: sikeres;
- PDF: 10 oldal;
- Megújuló responsive nézet: 6 méret;
- Felújítás responsive nézet: 3 méret;
- szakértői táblák responsive nézet: 3 méret;
- mobil táblapanel: 322 px, belső tábla: 771 px, oldal: 390 px;
- tablet álló és fekvő érintésteszt: sikeres;
- pinch-zoom: 2,15;
- érintés közbeni oldalelmozdulás: 0;
- éles assetaudit: 13/13;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.

A v0.8.1 kizárólag felületi és munkafolyamat-fejlesztés, ezért nem történt adatséma-módosítás vagy projektmigráció.
