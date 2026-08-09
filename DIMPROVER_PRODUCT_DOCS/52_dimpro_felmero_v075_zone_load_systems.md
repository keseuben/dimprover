# DIMPRO Felmérő v0.7.5 – Zónánkénti méretezési fűtési terhelés és gépészeti rendszerkapcsolatok

Dátum: 2026-07-29
Dev Center verzió ID: `version_7d31f4d5-173`
Alap build: `422-sZjRR2dKS3mMJyqIz`
Production candidate build: `moaTVTkWWUrA2GmTR-9Nd`
Forrásbackup: `backups/energy_v075_20260729_151450`

## Cél

A v0.7.5 a v0.7.1–v0.7.4 közös energetikai motorjaira épülő zónaterhelési és rendszerkapcsolati réteget vezet be.

A számítás felhasználja:

- az ellenőrzött épületgeometriát;
- az energetikai zónákat és fűtetlen tereket;
- a rétegrendi U-értékeket;
- a falhoz kötött nyílászárók teljes Uw-értékét;
- a beépítési peremeket;
- a lineáris és pontszerű hőhidakat;
- a zónánként megadott légcserét vagy légmennyiséget;
- a dokumentált külső méretezési hőmérsékletet;
- a rögzített energetikai rendszereket és helyszíni gépészeti berendezéseket.

## Számítási határ

A v0.7.5 eredménye:

```text
zónánkénti méretezési fűtési terhelés-előkészítés
```

Nem eredménye:

```text
havi nettó fűtési energiaigény
havi nettó hűtési energiaigény
éves energiaigény
rendszerveszteségekkel korrigált szállított energia
primerenergia
CO₂-kibocsátás
referenciaépület-eredmény
hiteles energetikai tanúsítvány
```

A havi és éves energetikai eredményhez további számítási szintek szükségesek:

- havi meteorológiai adatok;
- szoláris nyereség;
- belső hőnyereség;
- hőtároló képesség;
- nyereségkihasználási tényező;
- szakaszos üzem;
- fűtési és hűtési rendszer veszteségei;
- segédenergia;
- HMV;
- megújuló energia;
- primerenergia- és CO₂-tényezők.

A felület és minden export kötelező korlátozása:

> Méretezési fűtési terhelés-előkészítés; nem havi vagy éves tanúsítási energiaigény.

## Adatsémák

```text
EnergyDemandWorkspace schemaVersion: 1
dimpro.energy-demand-set.v0.7.5
dimpro.property-survey.v0.7.5
dimpro.winwatt-compatible.v0.7.5
```

Projektállapot:

```text
draft.energyDemandWorkspace
```

Számított eredmény:

```text
calculated.energyDemand
```

## Visszamenőleges kompatibilitás

Régi projekt betöltésekor automatikusan létrejön:

```text
energyDemandWorkspace.schemaVersion = 1
energyDemandWorkspace.enabled = false
```

Kikapcsolt állapotban:

- a projekt nem blokkolódik;
- nem készül nulla energiaigény;
- a zónaterhelési eredményhalmaz `enabled: false` állapotot tartalmaz;
- a PDF külön jelzi, hogy a számítás nem volt bekapcsolva;
- a WinWatt-előkészítő is megőrzi a kikapcsolt állapotot.

A felhasználónak külön be kell kapcsolnia a zónaterhelési réteget.

## Bemeneti adatok

### Globális terhelési adatok

- külső méretezési hőmérséklet °C;
- külső hőmérséklet forráshivatkozása;
- levegő térfogati hőkapacitása Wh/m³K;
- térfogati hőkapacitás forráshivatkozása.

A rendszer nem ad automatikusan települési külső méretezési hőmérsékletet.

### Zónánkénti szellőzési adatok

Két számítási mód:

```text
légcsereszám n [1/h]
mért vagy tervezett légmennyiség qv [m³/h]
```

További adat:

```text
hővisszanyerési hatásfok ηHR [0–1]
forráshivatkozás
```

### Határfeltételek

Külön szerkeszthető:

- fűtetlen térrel határos fal;
- szomszédos fűtött térrel határos fal;
- `internalUnheated` határolási módú alsó szerkezet;
- `internalUnheated` határolási módú felső szerkezet.

Nem szerkeszthető külön hőmérsékleti tényezővel:

- külső levegővel határos szerkezet;
- talajhatást már tartalmazó deklarált egyenértékű U-érték.

### Fűtetlen tér

A v0.7.3 fűtetlen tér adatmodellje kiegészült:

```text
temperatureSourceReference
```

Kötelező a v0.7.5 számításhoz:

- méretezési hőmérséklet;
- forrástípus;
- konkrét forráshivatkozás.

### Hőhidak zónakapcsolata

A v0.7.4 hőhídmodell új mezője:

```text
EnergyThermalBridge.zoneId
```

A zóna meghatározási sorrendje:

1. explicit `zoneId`;
2. kapcsolt helyiség zónája;
3. kapcsolt falszakasz helyiségének zónája;
4. kapcsolt nyílászáró helyiségének zónája.

Egyik kapcsolat nélkül a hőhíd blokkoló hibát kap:

```text
THERMAL_BRIDGE_ZONE_UNASSIGNED
```

## Geometriai felületképzés

### Falak

A zónaterhelés a v0.7.1 geometriai motor tételes faladatait használja:

```text
nettó falterület = bruttó falszakasz-terület − nyílászárók
```

A belső falak nem kerülnek automatikusan a külső transzmisszióba.

### Alsó lehűlő határ

Helyiségenként:

```text
Aalsó = helyiség alapterülete × (1 − alsó fűtött szint vetületi átfedési aránya)
```

### Felső lehűlő határ

Helyiségenként:

```text
Afelső,vetület = helyiség alapterülete × (1 − felső fűtött szint vetületi átfedési aránya)
```

Magastetős/tetősíkos határnál:

```text
Afelső = Afelső,vetület × tetősík-faktor
```

Egylejtésű tetőnél:

```text
tetősík-faktor = 1 / cos(α)
```

Kétoldali nyeregtetőnél a két oldal tényezőjének átlaga használatos.

### Tetőablak

A metszeti tetőablak-geometria önmagában nem elegendő hőtechnikai számításhoz.

Ha tetőablak szerepel, de nincs hozzá külön energetikai nyílászáró és teljes Uw-adat:

```text
ROOF_OPENING_THERMAL_DATA_REQUIRED
```

A motor ismeretlen Uw mellett nem vonja le automatikusan a tetőablakot a tetőfelületből.

## Transzmissziós hőveszteségi tényezők

### Fal

```text
Htr,fal = A × U × b
```

### Alsó határ

```text
Htr,alsó = Aalsó × U × b
```

### Felső határ

```text
Htr,felső = Afelső × U × b
```

### Nyílászáró

```text
Htr,ny = Aw × Uw × b
```

### Beépítési perem

```text
HΨ,beép = l × Ψbeép × b
```

### Külön lineáris vagy pontszerű hőhíd

```text
HΨ/χ = dokumentált hőhíd-tényező × b
```

### Hőmérsékleti tényező

Külső levegőnél:

```text
b = 1
```

Fűtetlen vagy alacsonyabb hőmérsékletű térnél:

```text
b = (θint − θtarget) / (θint − θe)
```

Követelmények:

- `θint > θe`;
- `θe ≤ θtarget ≤ θint`;
- `θtarget` dokumentált forrásból származik.

### Zónaközi fal

A zónaközi hőáram csak a magasabb fűtési alapértékű zónánál jelenik meg:

```text
Htr,zónaköz = A × U × (θmelegebb − θhűvösebb) / (θmelegebb − θe)
```

Azonos fűtési alapértéknél:

```text
Htr,zónaköz = 0
```

Így a zónaközi hőáram nem kerül kétszer elszámolásra.

## Talajjal érintkező szerkezetek

A `groundEquivalentRequired` határolási módnál a motor csak dokumentált, deklarált egyenértékű U-értéket fogad el.

Nem elfogadott automatikus helyettesítés:

```text
U = 1 / Rrétegrend
```

Ennek oka, hogy az egyszerű rétegrendi ellenállás nem tartalmazza önmagában a talaj geometriai és hőtechnikai hatását.

Blokkoló kód:

```text
ROOM_BOUNDARY_ASSEMBLY_RESULT_INVALID
```

## Szellőzési hőveszteség

### Légcsereszám alapján

```text
qv = n × V
```

### Megadott méretezési légmennyiséggel

```text
qv = felhasználói / tervezői méretezési légmennyiség
```

### Hőveszteségi tényező

```text
Hve = cair × qv × (1 − ηHR)
```

ahol:

```text
cair = levegő térfogati hőkapacitása [Wh/m³K]
qv = légmennyiség [m³/h]
ηHR = hővisszanyerési hatásfok [0–1]
```

A `cair` érték forráshivatkozás nélkül blokkolt.

## Zónánkénti teljes eredmény

### Transzmissziós összeg

```text
Htr = Hfal + Halsó + Hfelső + Hnyílászáró + Hbeépítés + Hhőhíd
```

### Teljes hőveszteségi tényező

```text
Hösszes = Htr + Hve
```

### Méretezési hőmérséklet-különbség

```text
ΔT = θint − θe
```

### Méretezési fűtési teljesítmény

```text
ΦH,design = Hösszes × ΔT / 1000
```

Mértékegység:

```text
kW
```

### Fajlagos teljesítmény

```text
qH,design = ΦH,design × 1000 / Anettó
```

Mértékegység:

```text
W/m²
```

## Gépészeti rendszerkapcsolatok

### Energetikai rendszer

Mezők:

- megnevezés;
- szolgáltatás;
- rendszertípus;
- kiszolgált zónák;
- kapcsolt helyszíni gépészeti berendezések;
- névleges kapacitás kW;
- zónánkénti kapacitáskiosztás kW;
- kapacitás forráshivatkozása;
- megjegyzés.

### Szolgáltatások

```text
fűtés
hűtés
szellőzés
használati meleg víz
megújuló energia
```

### Rendszertípusok

```text
kazán
hőszivattyú
közvetlen villamos fűtés
távhő
helyiségenkénti hőtermelő
klíma / hűtő-fűtő berendezés
szellőzőgép
HMV-termelő / tároló
napkollektor
napelem
egyéb rendszer
```

### Helyszíni berendezéskapcsolat

Az energetikai rendszer a meglévő `SurveyMechanicalDevice` rekordokhoz kapcsolható.

Berendezés törlésekor az árva rendszerkapcsolat automatikusan eltávolításra kerül.

Zóna törlésekor:

- a rendszer `servedZoneIds` listája frissül;
- a zónakapacitás-kiosztás árva sora törlődik;
- a zónaterhelési beállítások normalizálódnak.

## Kapacitásállapotok

### Rendszer hiányzik

```text
missing
```

Nem blokkolja a hőveszteségi számítást.

### Kapacitás ismeretlen

```text
unknownCapacity
```

A rendszer kapcsolódik, de a zónára jutó kapacitás nem határozható meg.

### Kapacitás elégtelen

```text
insufficient
```

```text
Φkapcsolt < ΦH,design
```

### Kapacitás megfelelő

```text
sufficient
```

```text
Φkapcsolt ≥ ΦH,design
```

### Egyzónás rendszer automatikus kapacitása

Ha egy fűtési rendszer pontosan egy zónát szolgál ki és nincs külön kiosztás:

```text
zónakapacitás = rendszer névleges kapacitása
```

Többzónás rendszerhez külön zónakapacitás-kiosztás szükséges a zónánkénti ellenőrzéshez.

## Rendszervalidációk

Blokkoló többek között:

- hiányzó rendszernév;
- fűtési/hűtési/szellőzési rendszer zóna nélkül;
- nem létező zónakapcsolat;
- nem létező helyszíni berendezéskapcsolat;
- nem pozitív névleges kapacitás;
- kapacitás forráshivatkozás nélkül;
- hibás vagy nem kiszolgált zónára mutató kiosztás;
- a kiosztott kapacitások összege meghaladja a névleges kapacitást.

A hiányzó vagy elégtelen fűtési rendszer figyelmeztetés, nem módosítja a számított hőigényt.

## Felület

Az Energetika munkatér nyolc lapos:

1. Beállítások;
2. Geometria;
3. Zónák;
4. Nyílászárók;
5. Zónaterhelés;
6. U-érték;
7. Állapot;
8. Nyomvonal.

A Zónaterhelés lapon belül:

1. Alapadatok;
2. Légcsere;
3. Határok;
4. Rendszerek;
5. Eredmény;
6. Nyomvonal.

### Eredmény nézet

Megjelenik:

- zónák száma;
- Htranszmisszió;
- Hszellőzés;
- Hösszes;
- teljes fűtési teljesítményigény;
- kapcsolt kapacitás;
- zónánkénti W/m²;
- rendszerkapacitás állapota;
- részletes komponenslista.

Komponenslista mezői:

```text
elem
típus
terület
U-érték
hőmérsékleti tényező
hatásos H [W/K]
forrás
```

## Számítási nyomvonal

Fő szabályazonosítók:

```text
DEMAND-DESIGN-DELTA-T-001
DEMAND-WALL-TRANSMISSION-002
DEMAND-INTERZONE-WALL-002B
DEMAND-LOWER-BOUNDARY-003
DEMAND-UPPER-BOUNDARY-004
DEMAND-OPENING-TRANSMISSION-005
DEMAND-INSTALLATION-BRIDGE-006
DEMAND-THERMAL-BRIDGE-007
DEMAND-VENTILATION-008
DEMAND-VENTILATION-AIRFLOW-009
DEMAND-DESIGN-HEATING-POWER-010
```

Minden auditrekord tartalmazza:

- szabályazonosítót;
- képletet;
- bemeneti adatokat;
- kerekítetlen és kerekített értéket;
- mértékegységet;
- kapcsolt zóna- és szerkezetazonosítókat.

## Exportok

### `.dimpro`

```text
schema: dimpro.property-survey.v0.7.5
calculated.energyDemand: dimpro.energy-demand-set.v0.7.5
```

A szerkeszthető munkatér tartalmazza:

```text
externalDesignTemperatureC
externalTemperatureSourceReference
airHeatCapacityWhM3K
airHeatCapacitySourceReference
zoneSettings
wallBoundaryConditions
roomBoundaryConditions
systems
```

A számított eredmény tartalmazza:

```text
zones
systems
components
totals
validationMessages
trace
sourceReferenceIds
limitation
```

### WinWatt-előkészítő

```text
schema: dimpro.winwatt-compatible.v0.7.5
```

Új blokkok:

```text
demandWorkspace
zoneDesignLoads
demandComponents
energySystems
demandTotals
demandValidationMessages
demandTrace
demandSourceReferenceIds
```

Ez továbbra is DIMPRO előkészítő adatcsomag, nem natív WinWatt projektfájl.

### PDF

Új oldalak:

```text
ZÓNÁNKÉNTI MÉRETEZÉSI FŰTÉSI TERHELÉS
GÉPÉSZETI RENDSZERKAPCSOLATOK
```

A zónaterhelési oldal tartalmazza:

- globális H-összesítést;
- külső méretezési hőmérsékletet;
- zónánkénti területet és térfogatot;
- belső alapértéket és ΔT-t;
- fal-, alsó-, felső-, nyílászáró-, beépítési-, hőhíd- és szellőzési részösszegeket;
- zónánkénti kW és W/m² eredményt;
- rendszerkapacitás állapotát.

A rendszeroldal tartalmazza:

- szolgáltatást és rendszertípust;
- kiszolgált zónákat;
- zónánkénti kapacitáskiosztást;
- helyszíni berendezéskapcsolatokat;
- névleges kapacitást;
- összes kiosztott kapacitást;
- fennmaradó kapacitást;
- forráshivatkozást.

Kikapcsolt terhelési rétegnél külön PDF-oldal jelzi a kikapcsolt állapotot.

## Fő érintett fájlok

```text
components/energy/domain/energyDemandTypes.ts
components/energy/calculations/demand/calculateEnergyDemand.ts
components/energy/domain/energyFeatureFlags.ts
components/energy/domain/energyOpeningTypes.ts
components/energy/domain/energyZoneTypes.ts
components/energy/calculations/zones/calculateEnergyZones.ts
components/property-survey/propertySurveyWorkspaceTypes.ts
components/property-survey/energy/EnergyDemandPanel.tsx
components/property-survey/energy/EnergyOpeningsPanel.tsx
components/property-survey/energy/EnergyZonesPanel.tsx
components/property-survey/energy/EnergyCompliancePanel.tsx
components/property-survey/energy/PropertySurveyEnergyWorkspace.tsx
components/property-survey/propertySurveyEnergyCalculations.ts
components/property-survey/propertySurveyBuildingPdf.ts
components/property-survey/PropertySurveyPage.tsx
scripts/test-energy-demand-v075.cjs
scripts/test-property-survey-energy-v075.cjs
scripts/test-property-survey-v061.cjs
```

## Domain teszt

```text
Zónaterhelés: 36/36
Nyílászárók/hőhidak: 43/43
Zónák: 25/25
Rétegrendi U-motor: 28/28
```

Kézzel ellenőrizhető referencia:

```text
fal:             23,2 m² × 0,30 = 6,960 W/K
padló:           50,0 m² × 0,25 = 12,500 W/K
födém:           50,0 m² × 0,20 = 10,000 W/K
nyílászáró:      1,8 m² × 1,00 = 1,800 W/K
beépítési perem: 5,4 m × 0,03 = 0,162 W/K
hőhíd:           10 m × 0,05 = 0,500 W/K
szellőzés:       0,34 × 0,5 × 125 = 21,250 W/K
```

Összesen:

```text
Htranszmisszió = 31,922 W/K
Hszellőzés     = 21,250 W/K
Hösszes        = 53,172 W/K
ΔT             = 33 K
Φfűtés         = 1,7547 kW
```

## Candidate E2E

```text
42/42 sikeres
```

Candidate eredmény:

```text
zónák: 2
fűtött terület: 77,50 m²
fűtött térfogat: 208,35 m³
Htranszmisszió: 47,7983 W/K
Hszellőzés: 28,3356 W/K
Hösszes: 76,1339 W/K
méretezési fűtési igény: 2,5124 kW
kapcsolt kapacitás: 40,0000 kW
megfelelő kapacitású zóna: 2
terhelési auditrekord: 36
```

Egyes zónák:

```text
Fűtött zóna: 1,5576 kW · 31,7 W/m²
Nappali és étkező zóna: 0,9548 kW · 33,6 W/m²
```

Ellenőrzött folyamatok:

- terhelési réteg ki-/bekapcsolása;
- globális forrásadatok;
- két zóna légcseréje és hővisszanyerése;
- fűtetlen tér dokumentált hőmérséklete;
- hőhidak explicit zónakapcsolata;
- fal-, talajpadló- és padlásfödém-hozzárendelés;
- rendszer nélküli, de számítható terhelés;
- elégtelen rendszerkapacitás;
- megfelelő rendszerkapacitás;
- zónánkénti kapacitáskiosztás;
- részletes komponenslista;
- auditnyomvonal;
- `.dimpro v0.7.5`;
- WinWatt-előkészítő v0.7.5;
- PDF terhelési és rendszeroldal;
- régi projekt kikapcsolt v0.7.5 migrációja;
- hat responsive nézet;
- konzolhiba 0;
- oldalhiba 0.

## Teljes candidate regresszió

- PDF export: sikeres;
- WinWatt JSON és CSV: sikeres;
- `.dimpro`: sikeres;
- DXF: sikeres;
- metszetek: sikeres;
- fotó- és hibalista workflow: sikeres;
- rajzlap: sikeres;
- vektoros PDF: 8 oldal;
- tablet álló: sikeres;
- tablet fekvő: sikeres;
- pinch-zoom: 2,15;
- oldalelmozdulás érintés közben: 0;
- candidate assetaudit: 13/13;
- candidate naplóhiba: 0.

## Ismert korlátok

- nincs automatikus települési külső méretezési hőmérséklet;
- nincs időjárási adatbázis;
- nincs havi meteorológiai sor;
- nincs szoláris nyereség;
- nincs belső hőnyereség;
- nincs dinamikus hőtárolási számítás;
- nincs nyereségkihasználási tényező;
- nincs hűtési méretezési teljesítmény;
- nincs rendszerhatásfokból szállított energia;
- nincs HMV-energiaigény;
- nincs primerenergia vagy CO₂;
- nincs hiteles tanúsítvány-generálás.

## Következő számítási szint

```text
v0.7.6 – havi nettó fűtési és hűtési energiaigény
```

Tervezett fő elemek:

- verziózott havi meteorológiai adatcsomag;
- tájolás és üvegezett felület alapú szoláris nyereség;
- árnyékolási tényezők;
- belső nyereségek;
- hőtároló képesség;
- nyereségkihasználás;
- havi fűtési és hűtési egyenleg;
- auditált forrás- és képletlánc.

## Külön kezelt feladat

Az npm-függőségi audit és a függőségi figyelmeztetések ellenőrzése nem része a v0.7.5 fejlesztési körnek; külön csevegésben történik.

## Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: moaTVTkWWUrA2GmTR-9Nd
PM2 process: dimprover
Állapot: online
Rollback: .next_before_energy_v075_20260729_162732
Forrásbackup: backups/energy_v075_20260729_151450
```

Éles ellenőrzések:

- HTTP 200;
- zónaterhelési domain: 36/36;
- nyílászáró/hőhíd regresszió: 43/43;
- zónaregresszió: 25/25;
- rétegrendi U-motor regresszió: 28/28;
- v0.7.5 E2E: 42/42;
- `.dimpro`: `dimpro.property-survey.v0.7.5`;
- terhelési eredmény: `dimpro.energy-demand-set.v0.7.5`;
- WinWatt-előkészítő: `dimpro.winwatt-compatible.v0.7.5`;
- zónaterhelési auditrekord: 36;
- zónák: 2;
- méretezési fűtési igény: 2,5124 kW;
- tablet álló és fekvő érintésteszt: sikeres;
- éles assetaudit: 13/13 HTTP 200;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.

Az npm-függőségi audit nem része ennek a kiadásnak; külön csevegésben történik.
