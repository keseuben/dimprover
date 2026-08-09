# DIMPRO Felmérő v0.8.0 – Terepi energetikai workflow, felújítási változatok és WinWatt-előkészítés

Dátum: 2026-07-29
Dev Center verzió: `version_9f5fd9c6-b69`
Alap éles build: `moaTVTkWWUrA2GmTR-9Nd`
Production candidate build: `TgWAG7ypFaOltQdfP_FvC`
Forrásbackup: `backups/energy_v080_field_workflow_20260729_170019`

## 1. Fejlesztési cél

A v0.8.0 elsődleges célja nem egy újabb számítási képlet hozzáadása, hanem a teljes energetikai felmérési folyamat használható és hosszú távon bővíthető megszervezése.

A Felmérőnek két külön munkakörnyezetet kell ugyanarra az adatmodellre biztosítania:

```text
Terepi mód
Szakértői mód
```

A terepi mód célja:

- tableten és telefonon követhető lépéssor;
- a helyszínen szükséges adatok gyors rögzítése;
- rajz, fotó, szerkezeti és gépészeti adatok összekapcsolása;
- helyszíni felújítási javaslatok;
- napelem, napkollektor, akkumulátor és elektromosautó-töltés előméretezése;
- hiányzó adatok és további szakági ellenőrzések látható jelzése.

A szakértői mód célja:

- a terepen felvett adatok táblázatos ellenőrzése;
- WinWatt-logikájú adatcsoportok;
- tömeges áttekintés és keresés;
- számítási motorok, források és státuszok ellenőrzése;
- Excel, JSON, PDF és `.dimpro` adatátadás.

A két mód nem használ külön adatbázist és nem duplikál adatot.

## 2. Alapelv

```text
A terepi felület adatot gyűjt és javaslatot készít.
A szakértői felület ellenőriz és átad.
A WinWatt véglegesít, amíg a DIMPRO teljes motorja nem validált.
```

A rendszer funkciónként külön státuszt használ:

```text
Helyszínen mért
Dokumentumból rögzített
Előzetesen becsült
Szakmai ellenőrzés szükséges
WinWattban véglegesítendő
Validált DIMPRO számítás
```

Egy előzetes eredmény nem kaphat automatikusan validált státuszt.

## 3. Új adatsémák

### Terepi munkafolyamat

```text
EnergyFieldWorkflowState
schemaVersion: 1
```

Fő mezők:

```text
mode: field | expert
activeScenarioId
completedStepIds
showOnlyIncomplete
updatedAt
```

### Felújítási változatok

```text
EnergyRenovationWorkspace
schemaVersion: 1
```

### Megújuló és villamos előméretezés

```text
EnergyRenewableWorkspace
schemaVersion: 1
```

### Számított előméretezési eredmény

```text
dimpro.energy-renewable-sizing.v0.8.0
```

### DIMPRO munkafájl

```text
dimpro.property-survey.v0.8.0
```

### WinWatt-előkészítő JSON

```text
dimpro.winwatt-compatible.v0.8.0
```

### WinWatt-előkészítő Excel

```text
dimpro.winwatt-transfer.v0.8.0
```

## 4. Terepi mód

A terepi mód egyszerűsített lépéssora:

1. Ingatlan
2. Alaprajz
3. Metszet
4. Szerkezetek
5. Nyílászárók
6. Gépészet
7. Megújuló
8. Fotók
9. Felújítás
10. Hibák
11. Ellenőrzés
12. Export

A részletes `Szakértői energetika` lépés terepi módban rejtett.

### Terepi használati elv

- nagy kezelőszervek;
- kevés kötelező mező egyszerre;
- pontot és magyar tizedesvesszőt is elfogadó mezők;
- értékek mentése fókuszvesztéskor;
- konkrét forrás- és ellenőrzési státusz;
- blokkoló és nem blokkoló üzenetek elkülönítése;
- minden előméretezés alatt kötelező szakmai korlátozás.

## 5. Szakértői mód

A Szakértői mód megjeleníti a teljes Energetika munkateret.

Az Energetika munkatér v0.8.0-ban kilenc lapos:

1. Beállítások
2. Geometria
3. Zónák
4. Nyílászárók
5. Zónaterhelés
6. U-érték
7. Szakértői táblák
8. Állapot
9. Nyomvonal

### Szakértői táblák

A rendszer 14 adattáblát készít:

```text
1. Általános adatok
2. Anyagok
3. Szerkezetek
4. Szerkezeti rétegek
5. Helyiségek
6. Épületszintek
7. Zónák és fűtetlen terek
8. Határoló szerkezetek
9. Nyílászárók
10. Hőhidak
11. Épülettechnikai rendszerek
12. Felújítási változatok
13. Megújuló és villamos rendszerek
14. Források és ellenőrzés
```

### Táblázatos felület

- adatcsoport-választó bal oldalon;
- rekordszám minden táblánál;
- teljes táblás keresés;
- rögzített fejléc;
- rögzített első oszlop;
- státuszszínezés;
- belső vízszintes görgetés;
- a teljes oldal nem lóg ki mobilon;
- az aktuális projektadatból automatikus újragenerálás.

Mobil ellenőrzési referencia:

```text
viewport: 390 px
táblapanel: 322 px
teljes tábla: 771 px
teljes oldal: 390 px
```

## 6. WinWatt-előkészítő Excel munkafüzet

A munkafüzet 15 lapból áll:

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
13_Megujulo_vill
14_Forras_statusz
```

Minden munkalap tartalmazza:

- a v0.8.0 átadási sémaazonosítót;
- projekt- és felmérésnevet;
- exportidőpontot;
- mértékegységeket az oszlopnevekben;
- forrást és státuszt, ahol értelmezhető;
- kötelező korlátozó szöveget.

Kötelező szöveg:

> Szakmai ellenőrzés és WinWattban történő véglegesítés szükséges. Nem natív WinWatt projektfájl.

A munkafüzet célja:

- gyors másolás és ellenőrzés;
- a WinWatt tábláinak megfelelő adatcsoportosítás;
- későbbi célzott importfejlesztés alapozása;
- hiányzó vagy bizonytalan adatok azonosítása.

## 7. Felújítási változatok

### Alapstruktúra

Minden projekt automatikusan két változattal indul:

```text
M0 – Meglévő állapot
T1 – Helyszíni javaslat
```

További változatok szabadon létrehozhatók:

```text
T2 – Alap felújítás
T3 – Komplex felújítás
T4 – Ügyfélváltozat
```

### Változat státuszai

```text
Vázlat
Szakmai ellenőrzés
WinWatt-átadásra előkészítve
Validált
```

### Intézkedéskategóriák

```text
Homlokzati fal
Lábazat
Padlásfödém
Tetősík / tetőfödém
Pincefal
Pincefödém
Talajon fekvő padló
Nyílászáró
Fűtési rendszer
Hűtési rendszer
Használati melegvíz
Szellőzés
Napelem
Napkollektor
Energiatároló
Elektromosautó-töltés
Egyéb intézkedés
```

### Intézkedés mezői

```text
kategória
megnevezés
kapcsolt szerkezet vagy rendszer
meglévő állapot leírása
tervezett beavatkozás
jelenlegi érték
célérték
mértékegység
várható hatásszint
adatstátusz
forráshivatkozás
beválasztott állapot
megjegyzés és kockázat
```

### Várható hatásszintek

```text
Kisebb hatás
Közepes hatás
Jelentős hatás
Kiemelt hatás
```

## 8. Automatikus felújítási javaslatmotor

A motor nem számol ki ellenőrizetlen megtakarítási százalékot.

A javaslatok forrásai:

- nem megfelelő vagy blokkolt rétegrend;
- nem megfelelő vagy blokkolt nyílászáró;
- hiányzó, ismeretlen vagy elégtelen fűtési rendszer;
- hiányzó részletes HMV-rendszer;
- hűtési és nyári hővédelmi ellenőrzési igény;
- bekapcsolt napelemrendszer;
- bekapcsolt napkollektor;
- bekapcsolt akkumulátoros tároló;
- bekapcsolt elektromosautó-töltés.

A generálás szabályai:

- ugyanazt a számított intézkedést nem duplikálja;
- újraszámításkor frissíti a jelenlegi és célértéket;
- megőrzi a felhasználó beválasztási döntését;
- megőrzi a felhasználó saját megjegyzését;
- a kézi egyedi intézkedéseket nem törli;
- automatikusan csak `Szakmai ellenőrzés szükséges` vagy `WinWattban véglegesítendő` státuszt ad.

## 9. Tetősíkok helyszíni felmérése

Minden tetősík külön rekord.

Mezők:

```text
megnevezés
szint és metszetkapcsolat
azimut [°]
dőlésszög [°]
bruttó felület [m²]
hasznos felület [m²]
árnyékolási szorzó [0–1]
tetőfedés
statikai / teherbírási státusz
adatstátusz
forráshivatkozás
megjegyzés
napelemhez kiválasztva
napkollektorhoz kiválasztva
```

Validációk:

- hasznos felület nem lehet nagyobb a bruttó felületnél;
- megújuló rendszerhez legalább egy kiválasztott tetősík szükséges;
- forrás nélküli tájolás és felület figyelmeztetést kap;
- statikai állapot nélkül teherbírási figyelmeztetés jelenik meg.

## 10. Napelemrendszer előméretezése

### Bemenetek

```text
kiválasztott tetősíkok
modulteljesítmény [Wp]
modul felülete [m²]
paneldarabszám
inverter AC teljesítmény [kW]
fajlagos éves hozam [kWh/kWp·év]
rendszerveszteség [%]
árnyékolási szorzó
hálózati / hibrid / szigetüzemi mód
forrás és adatstátusz
```

### Geometriai panelmaximum

```text
Nmax = floor(Ahasznos / Amodul)
```

### Beépített DC teljesítmény

```text
PDC = Npanel × Pmodul / 1000
```

Mértékegység:

```text
kWp
```

### Inverter DC/AC arány

```text
rDC/AC = PDC / PAC,inverter
```

### Becsült éves termelés

```text
EPV = PDC × Yfajlagos × (1 − Lrendszer) × fárnyék
```

A fajlagos hozam nem rejtett alapérték. Dokumentált forrás szükséges.

### Közvetlen sajátfogyasztás

```text
Enappali = (Eépület + EEV) × nappali fogyasztási arány
EPV,direct = min(EPV, Enappali)
EPV,surplus = max(0, EPV − EPV,direct)
```

Ez előzetes éves energiamérleg, nem órás szimuláció.

## 11. Napkollektoros HMV-rásegítés

### Bemenetek

```text
kiválasztott tetősík
kollektortípus
kollektorfelület [m²]
személyek száma
napi HMV liter/fő
hidegvíz hőmérséklete
HMV célhőmérséklete
fajlagos kollektorhozam [kWh/m²·év]
rendszerveszteség [%]
tároló liter/m²
forrás és adatstátusz
```

### Éves HMV-hőigény

```text
QHMV = nszemély × Vnap × 365 × 4,186 × (θHMV − θhideg) / 3600
```

### Kollektor éves hozama

```text
Qkol = Akol × Ykol × (1 − Lrendszer) × fárnyék
```

### Előzetes lefedettség

```text
fsol = min(100%; Qkol / QHMV)
```

### Javasolt tároló

```text
Vtároló = Akol × fajlagos tárolótérfogat
```

A végleges rendszerhez stagnációs, hidraulikai, fagyvédelmi, statikai és gyártói méretezés szükséges.

## 12. Akkumulátoros energiatárolás

### Célok

```text
Sajátfogyasztás növelése
Tartaléküzem
Kombinált
```

### Bemenetek

```text
névleges kapacitás [kWh]
használható kapacitás [kWh]
használható hányad
körfolyamati hatásfok
maximális töltési teljesítmény [kW]
maximális kisütési teljesítmény [kW]
tartalék [%]
kritikus fogyasztás [kW]
tartaléküzemi idő [óra]
forrás és adatstátusz
```

### Esti napi fogyasztási igény

```text
Eeste,nap = (Eépület + EEV) × (1 − nappali arány) / 365
```

### Napi PV-többlet

```text
EPV,többlet,nap = EPV,surplus / 365
```

### Tartaléküzemi használható kapacitás

```text
Ebackup = Pkritikus × tbackup / ηroundtrip
```

### Javasolt használható kapacitás

Sajátfogyasztási cél:

```text
Eusable = min(Eeste,nap; EPV,többlet,nap)
```

Tartaléküzemi cél:

```text
Eusable = Ebackup
```

Kombinált cél:

```text
Eusable = max(Esajátfogyasztás; Ebackup)
```

### Javasolt névleges kapacitás

```text
Enom = Eusable / fusable
```

A rendszer ellenőrzi:

- használható kapacitás nem nagyobb-e a névlegesnél;
- kritikus teljesítmény nem nagyobb-e a maximális kisütési teljesítménynél;
- termékforrás rendelkezésre áll-e.

## 13. Elektromosautó-töltés

### Bemenetek

```text
járművek száma
éves futásteljesítmény [km]
fogyasztás [kWh/100 km]
otthoni töltési részarány [%]
töltő névleges teljesítménye [kW]
egy- vagy háromfázisú csatlakozás
dinamikus terhelésmenedzsment
PV-többlet alapú intelligens töltés
forrás és adatstátusz
```

### Éves otthoni töltési energia

```text
EEV = futás × fogyasztás / 100 × otthoni részarány × járművek
```

### Átlagos napi töltési energia

```text
EEV,nap = EEV / 365
```

### Átlagos napi töltési idő

```text
ttöltés = EEV,nap / Ptöltő
```

### Egyfázisú töltőáram

```text
I = P × 1000 / U
```

### Háromfázisú töltőáram

```text
I = P × 1000 / (√3 × U)
```

### Hálózati tartalék

```text
Itartalék = Icsatlakozás − Iegyidejű alapteher
```

Ha a névleges töltőáram meghaladja a tartalékot:

- dinamikus terhelésmenedzsment nélkül blokkoló hiba;
- dinamikus terhelésmenedzsmenttel figyelmeztetés;
- szükség esetén hálózatbővítés vagy kisebb töltőteljesítmény.

## 14. Kötelező szakmai korlátozások

A megújuló és villamos eredmény minden felületen és exportban tartalmazza:

> Előzetes helyszíni méretezés. Nem helyettesít statikai, villamos, tűzvédelmi, hálózati csatlakozási, gyártói vagy kivitelezési tervet, illetve validált energetikai tanúsítási számítást.

A felújítási javaslat minden felületen és exportban tartalmazza:

> A helyszíni felújítási javaslat tájékoztató és tervezés-előkészítő dokumentum. Nem minősül kivitelezői ajánlatnak, részletes kiviteli tervnek vagy hiteles energetikai tanúsítványnak.

## 15. Exportok

### `.dimpro`

```text
schema: dimpro.property-survey.v0.8.0
```

Új szerkeszthető blokkok:

```text
energyFieldWorkflow
energyRenovationWorkspace
energyRenewableWorkspace
```

Új számított blokk:

```text
calculated.energyRenewables
```

### WinWatt-előkészítő JSON

```text
schema: dimpro.winwatt-compatible.v0.8.0
```

Új blokkok:

```text
fieldWorkflow
renovationScenarios
renewableWorkspace
renewableSizing
transferWorkbookSchema
```

### Excel

```text
schema: dimpro.winwatt-transfer.v0.8.0
```

### PDF

Új fejezetek:

```text
HELYSZÍNI FELÚJÍTÁSI JAVASLATOK
MEGÚJULÓ ÉS VILLAMOS ELŐMÉRETEZÉS
```

A teljes tesztprojekt PDF-je 10 oldalas.

## 16. Migráció

Régi v0.6–v0.7.5 projekt megnyitásakor automatikusan létrejön:

```text
energyFieldWorkflow.schemaVersion = 1
energyFieldWorkflow.mode = field
energyRenovationWorkspace.schemaVersion = 1
energyRenovationWorkspace.scenarios = [M0, T1]
energyRenewableWorkspace.schemaVersion = 1
energyRenewableWorkspace.enabled = false
```

A migráció következménye:

- a korábbi projekt eredménye nem változik meg;
- a megújuló számítás nem indul el automatikusan;
- a részletes Energetika lépés terepi módban rejtett;
- a korábbi zóna-, U-, nyílászáró-, hőhíd- és terhelési adatok megmaradnak;
- a felhasználó később Szakértői módba válthat.

## 17. Feature flagek

```text
canUseEnergyFieldWorkflow
canUseEnergyExpertTables
canUseEnergyRenewables
canUseEnergySolarThermal
canUseEnergyBattery
canUseEnergyEvCharging
canUseEnergyVariants
```

Mindegyik v0.8.0-ban bekapcsolt.

A teljes hiteles tanúsítvány-generálás továbbra sincs bekapcsolva:

```text
canUseEnergyCertificateWorkspace = false
```

## 18. Fő érintett fájlok

```text
components/energy/domain/energyFieldWorkflowTypes.ts
components/energy/domain/energyRenovationTypes.ts
components/energy/domain/energyRenewableTypes.ts
components/energy/domain/energyFeatureFlags.ts
components/energy/calculations/renewables/calculateRenewableSizing.ts
components/energy/calculations/renovation/buildRenovationSuggestions.ts
components/property-survey/propertySurveyWorkspaceTypes.ts
components/property-survey/propertySurveyExpertTables.ts
components/property-survey/propertySurveyWinWattWorkbook.ts
components/property-survey/propertySurveyEnergyCalculations.ts
components/property-survey/propertySurveyBuildingPdf.ts
components/property-survey/PropertySurveyPage.tsx
components/property-survey/energy/EnergyExpertTablesPanel.tsx
components/property-survey/energy/EnergyRenewablePanel.tsx
components/property-survey/energy/EnergyRenovationPanel.tsx
components/property-survey/energy/PropertySurveyEnergyWorkspace.tsx
```

## 19. Automatikus tesztek

### v0.8.0 domain és átadás

```text
Megújuló és villamos motor: 44/44
Workflow és változatok: 39/39
Szakértői táblák és Excel: 38/38
Automatikus javaslatmotor: 18/18
```

### Korábbi energetikai motorok

```text
Zónaterhelés: 36/36
Nyílászáró és hőhíd: 43/43
Zónák: 25/25
Rétegrendi U-motor: 28/28
```

Összes domain- és integrációs ellenőrzés:

```text
271 sikeres
```

### Új v0.8.0 E2E

```text
20/20 sikeres
```

Ellenőrzött folyamatok:

- Terepi mód;
- egyszerű lépéssor;
- tetősíkfelvétel;
- villamos fogyasztási és csatlakozási adatok;
- napelem;
- napkollektor;
- akkumulátor;
- elektromosautó-töltés;
- közös eredmény és validáció;
- projektmentés;
- automatikus felújítási javaslat;
- több felújítási változat;
- kézi intézkedés;
- Szakértői mód;
- 14 adattábla;
- 15 munkalapos Excel;
- `.dimpro v0.8.0`;
- WinWatt-előkészítő JSON v0.8.0;
- 10 oldalas PDF;
- régi projekt migráció;
- Megújuló/Felújítás/Szakértői tábla responsive működés;
- konzolhiba 0;
- oldalhiba 0.

### Történeti regresszió

```text
v0.7.5 teljes energetikai E2E: 42/42
alap Felmérő-regresszió: sikeres
rajzlap-regresszió: sikeres
PDF: sikeres, 10 oldal
DXF: sikeres
WinWatt JSON és CSV: sikeres
.dimpro: sikeres
metszet: sikeres
tablet álló: sikeres
tablet fekvő: sikeres
pinch-zoom: 2,15
érintés közbeni oldalelmozdulás: 0
```

### Candidate

```text
build: TgWAG7ypFaOltQdfP_FvC
HTTP: 200
assetaudit: 13/13
naplóhiba: 0
```

## 20. Ellenőrzött referenciaeredmény

A v0.8.0 tesztprojekt:

```text
Tető bruttó felület: 50 m²
Tető hasznos felület: 40 m²
Árnyékolási szorzó: 0,90
Modulteljesítmény: 450 Wp
Modul felülete: 2,00 m²
Elférő maximum: 20 db
Kiválasztott: 18 db
Napelem: 8,10 kWp
Inverter: 8,00 kW
DC/AC: 1,013
Becsült PV-termelés: 7 873,2 kWh/év
Épület + EV villamos igény: 8 160 kWh/év
Közvetlen PV-sajátfogyasztás: 3 264 kWh/év
PV-többlet: 4 609,2 kWh/év
PV becsült éves lefedettség: 96,5%
```

Napkollektor:

```text
Kollektorfelület: 4,0 m²
Személyek: 4
Éves HMV-hőigény: 2 970,9 kWh/év
Becsült kollektorhozam: 1 440 kWh/év
Becsült lefedettség: 48,5%
Javasolt tároló: 240 liter
```

Akkumulátor:

```text
Kiválasztott névleges kapacitás: 10,00 kWh
Kiválasztott használható kapacitás: 9,00 kWh
Esti napi igény: 13,41 kWh/nap
PV napi többlet: 12,63 kWh/nap
Tartaléküzemi használható igény: 4,44 kWh
Javasolt használható kapacitás: 12,63 kWh
Javasolt névleges kapacitás: 14,03 kWh
```

Elektromosautó-töltés:

```text
Éves futás: 15 000 km
Fogyasztás: 18 kWh/100 km
Otthoni töltés: 80%
Éves otthoni energia: 2 160 kWh/év
Napi átlag: 5,92 kWh/nap
11 kW-os töltő napi átlagos ideje: 0,54 óra
Háromfázisú töltőáram: 15,88 A/fázis
```

## 21. Ismert korlátok

- nincs órás villamos terhelési és PV-termelési szimuláció;
- nincs automatikus meteorológiai vagy sugárzási adatbázis;
- nincs automatikus árnyékgeometriai 3D szimuláció;
- nincs inverter gyártói munkapont- és stringméretezés;
- nincs villámvédelem-, tűzvédelem- vagy statikai méretezés;
- nincs hálózati engedélyezési folyamat;
- nincs akkumulátor degradációs és tarifális optimalizálás;
- nincs V2H/V2G számítás;
- nincs napkollektor stagnációs vagy részletes dinamikus méretezés;
- nincs kivitelezői költségajánlat;
- nincs automatikus hiteles energetikai tanúsítvány;
- az Excel és JSON nem natív WinWatt projektfájl.

## 22. Következő fejlesztési sorrend

A v0.8.0 után nem célszerű azonnal minden tanúsítási képletet egyetlen kiadásban megépíteni.

Javasolt következő lépések:

```text
v0.8.1 – helyszíni gyorsfelvétel és javaslatkártyák további egyszerűsítése
v0.8.2 – meglévő és tervezett változatok számított összehasonlító táblája
v0.8.3 – WinWatt mezőtérkép finomítása valós adatátviteli próbákkal
v0.8.4 – PV/akkumulátor/EV napi vagy órás profil előkészítése
v0.8.5 – napkollektor és HMV részletesebb rendszerkapcsolata
v0.9.0 – validált havi nettó fűtési és hűtési energiamotor
```

A függőségi audit nem része a v0.8.0 fejlesztési körnek; külön csevegésben kezelendő.

## 23. Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: TgWAG7ypFaOltQdfP_FvC
PM2 process: dimprover
Rollback: .next_before_energy_v080_20260729_181853
Forrásbackup: backups/energy_v080_field_workflow_20260729_170019
```

Éles ellenőrzések:

- HTTP 200;
- v0.8.0 E2E: 20/20;
- történeti energetikai E2E: 42/42;
- alap Felmérő-regresszió: sikeres;
- `.dimpro`: `dimpro.property-survey.v0.8.0`;
- megújuló eredmény: `dimpro.energy-renewable-sizing.v0.8.0`;
- WinWatt-előkészítő JSON: `dimpro.winwatt-compatible.v0.8.0`;
- WinWatt-előkészítő Excel: `dimpro.winwatt-transfer.v0.8.0`;
- Excel: 15 munkalap;
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

A függőségi audit és a korábban jelzett npm-függőségi figyelmeztetések nem részei ennek a kiadásnak; külön csevegésben kezelendők.
