# DIMPRO Felmérő v0.7.1 – Geometriai energetikai összesítő

Dátum: 2026-07-29
Dev Center verzió ID: version_c4a7753b-222

## Cél

A v0.7.1 a Felmérő meglévő, közös épületgeometriájából determinisztikus, visszakövethető energetikai geometriai összesítőt készít. Nem vezet be párhuzamos helyiség-, fal-, nyílászáró- vagy metszetadatot.

A kiadás továbbra is ezt a kötelező megnevezést használja:

> Tervezői energetikai számítás – szakmai ellenőrzés szükséges

A v0.7.1 még nem készít U-értéket, primerenergiát, CO₂-t, referenciaépületet vagy hiteles tanúsítványt.

## Új számítási motor

Fő függvény:

```text
calculateEnvelopeGeometry()
```

Séma:

```text
dimpro.energy-geometry.v0.7.1
```

Motorverzió:

```text
0.7.1
```

A motor tiszta TypeScript, Reacttől független, közvetlenül egységtesztelhető.

## Számított adatok

Épületszinten:

- összes alapterület;
- kondicionált/fűtött alapterület;
- kondicionált térfogat;
- bruttó energetikai falfelület;
- nyílászáró-felület;
- nettó falfelület;
- alsó határoló felület;
- felső határoló vízszintes vetülete;
- tetősíkkal korrigált felső határoló felület;
- tetőablak-felület;
- teljes lehűlő felület;
- A/V arány.

Szintenként:

- helyiségek és kondicionált helyiségek száma;
- fűtött alapterület;
- térfogat;
- fal-, nyílászáró-, alsó és felső határoló felületek;
- tetősík-szorzó;
- lehűlő felület.

Falszakaszonként:

- pontos helyiség- és falszakasznév;
- határolási típus;
- tájolás és azimut;
- hossz és belmagasság;
- bruttó, nyílászáró- és nettó felület;
- duplikált forrásrekordok.

Tájolásonként:

- falszakaszok száma;
- nyílászárók száma;
- bruttó, nyílászáró- és nettó falfelület.

## Fűtött–fűtött szintek kezelése

Az egymás felett elhelyezkedő fűtött helyiségek alaprajzi vetületét a motor összeveti.

```text
alsó határoló felület
= helyiség alapterülete × (1 − alsó fűtött átfedési arány)

felső határoló vetület
= helyiség alapterülete × (1 − felső fűtött átfedési arány)
```

Így a fűtött–fűtött födém nem kerül kétszer a lehűlő felületbe. Ha a szintek vetülete nem találkozik, a rendszer konkrét szintnevekkel figyelmeztet a közös koordinátarendszer ellenőrzésére.

## Tetősík és padlásfödém

Tetősík-korrekció csak akkor aktív, ha:

- a szint típusa tetőtér; vagy
- a helyiség felső határolása kifejezetten tetősík/magastető.

A „Padlásfödém” megnevezésű felső határolás vízszintes felület marad akkor is, ha a projekthez nyeregtetős metszet tartozik.

Nyeregtetőnél a két tetősík átlagos geometriai szorzója, félnyeregtetőnél az egyetlen tetősík szorzója használatos. Egyedi tetőformánál a rendszer vízszintes vetülettel számol és kötelező figyelmeztetést ad.

## Duplikált falak

A motor a falszakasz két végpontja, szintje és határolási típusa alapján kanonikus kulcsot képez. Azonos energetikai falszakasz esetén:

- figyelmeztetés készül;
- az érintett helyiség és falszakaszok megjelennek;
- a számítás csak az első rekordot veszi figyelembe;
- nincs kettős felületszámítás.

## Blokkoló validációk

- nincs kondicionált helyiség;
- nem pozitív helyiségméret vagy alapterület;
- nem pozitív hasznos belmagasság;
- helyiségátfedés;
- falszakaszhoz nem található helyiség;
- nem pozitív nyílászáró-méret;
- a nyílászáró szélesebb a falszakasznál;
- a nyílászárók összfelülete nagyobb a bruttó falnál.

A blokkoló üzenet mindig megnevezi az érintett helyiséget, falszakaszt, nyílászárót vagy szintet. Az eredmény a geometria javítása után automatikusan újraszámolódik.

## Nem blokkoló figyelmeztetések

- duplikált energetikai falszakasz;
- fűtött helyiség energetikai falszakasz nélkül;
- eltérő szintvetületek;
- egyedi tetőforma közelítő számítása.

## Számítási nyomvonal

Minden számított sor tárolja:

- determinisztikus nyomvonalazonosító;
- szabályazonosító;
- megnevezés;
- képlet;
- bemeneti változók;
- kerekítetlen eredmény;
- megjelenített eredmény;
- mértékegység;
- érintett helyiségek, falak, nyílászárók, szintek és metszetek.

Szabályazonosítók:

```text
GEOM-WALL-GROSS-001
GEOM-WALL-NET-002
GEOM-ROOM-VOLUME-003
GEOM-LOWER-BOUNDARY-004
GEOM-UPPER-PROJECTED-005
GEOM-UPPER-ADJUSTED-006
GEOM-LEVEL-ENVELOPE-007
GEOM-AV-RATIO-008
```

## UI

Az Energetika munkatér négy lapból áll:

1. Beállítások;
2. Geometria;
3. Állapot;
4. Nyomvonal.

A Geometria lapon:

- főmutató-kártyák;
- összesítő felületek;
- összecsukható hiba- és figyelmeztetéskártyák;
- szintenkénti táblázat;
- tájolási kártyák;
- összecsukható falszakaszlista.

A Nyomvonal lapon minden képlet külön lenyitható.

## `.dimpro` munkafájl

Új séma:

```text
dimpro.property-survey.v0.7.1
```

A `calculated.energyGeometry` blokk tartalmazza:

- teljes geometriai eredményt;
- validációs üzeneteket;
- tételes fal-, tájolás- és szintadatokat;
- teljes számítási nyomvonalat.

A régi `dimpro.property-survey.*` munkafájlok importja továbbra is támogatott.

## Érintett fájlok

```text
components/energy/domain/energyGeometryTypes.ts
components/energy/audit/createCalculationTrace.ts
components/energy/calculations/geometry/geometryRectangleMath.ts
components/energy/calculations/geometry/calculateEnvelopeGeometry.ts
components/energy/validation/validateGeometry.ts
components/property-survey/energy/EnergyGeometryPanel.tsx
components/property-survey/energy/EnergyAuditPanel.tsx
components/property-survey/energy/EnergyCompliancePanel.tsx
components/property-survey/energy/PropertySurveyEnergyWorkspace.tsx
components/property-survey/PropertySurveyPage.tsx
scripts/test-energy-geometry-v071.cjs
scripts/test-property-survey-energy-v071-mat03.cjs
```

## Automatikus domain teszt

A geometriai motor 17 tesztesetet tartalmaz:

- séma és motorverzió;
- kondicionált terület és térfogat;
- fal- és tájolási adatok;
- A/V képlet;
- nyomvonalszabályok;
- determinisztikus eredmény;
- duplikált fal deduplikálása;
- túl széles nyílászáró;
- falnál nagyobb nyílászáró-felület;
- helyiségátfedés;
- fűtött helyiség hiánya;
- hibás belmagasság;
- fűtött–fűtött szintátfedés;
- padlásfödém;
- tetőtéri tetősík;
- tetőablak;
- egyedi tetőforma;
- üres projekt blokkolása.

## Ismert korlátok

- a tetősíkfelület jelenleg szintenkénti reprezentatív metszetből származik;
- összetett, több különböző tetősíkot tartalmazó szinten még nincs helyiségenkénti tetősík-geometria;
- görbe vagy szabad kontúros helyiségek helyett a meglévő téglalap-alapú helyiségmodell használatos;
- talajjal érintkező szerkezet hőtechnikai korrekciója még nem része ennek a verziónak;
- a számítás geometriai, nem jogszabályi energetikai végeredmény.

## Következő verzió

```text
v0.7.2 – Rétegrend- és U-érték motor
```

A következő verzió csak szakmailag ellenőrzött felületi ellenállásokkal, anyagadatokkal és referenciaesetekkel élesíthető.

## Candidate eredmények

```text
Production candidate build: BD5ZcvrDec8Ujku949Qa5
Geometriamotor domain teszt: 17/17
Projektanyag-domain teszt: 10/10
Korábbi anyagdomain teszt: 16/16
Új összevont UI E2E: 15/15
Candidate assetaudit: 13/13 HTTP 200
```

Sikeres regressziók:

- geometriai főmutatók, szint-, fal- és tájolási lista;
- 45 soros mintaprojekt-auditnyomvonal;
- blokkoló és nem blokkoló geometriai validáció;
- `.dimpro v0.7.1` geometriai pillanatkép és nyomvonal;
- PDF, DXF, WinWatt JSON/CSV és fotócsomag;
- metszet, tetősík, rajzlap és jelmagyarázat;
- desktop, fekvő és álló tablet, iPad és mobil;
- tablet pinch-zoom és nagyítás utáni helyiségmozgatás;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.

A teljes repository-szintű `npm run lint` a nagyméretű, több modult és sok mentett fejlesztési állományt tartalmazó munkafán a 2 GB-os Node heaplimitet elérte. A jelen kiadás összes érintett forrásfájljának célzott ESLint-ellenőrzése, a TypeScript, a production build és minden funkcionális teszt sikeres.

## Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: BD5ZcvrDec8Ujku949Qa5
PM2 process: dimprover
Állapot: online
Rollback: .next_before_energy_v071_mat03_20260729_084055
```

Éles ellenőrzések:

- HTTP 200;
- összevont v0.7.1/MAT-0.3 E2E: 15/15;
- `.dimpro v0.7.1` és geometriai séma: sikeres;
- saját anyag magyar tizedesvesszővel: sikeres;
- anyagkatalógus 1194, 834 és 390 px szélességen: sikeres;
- v0.6.x migráció: sikeres;
- tablet álló és fekvő érintésteszt: sikeres;
- éles assetaudit: 13/13 HTTP 200;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.
