# DIMPRO Felmérő v0.7.4 – Nyílászárók és hőhidak részletes számítása

Dátum: 2026-07-29
Dev Center verzió ID: `version_65fddd29-e81`
Alap build: `6Jj8Kyj9lxKuDDIRcSr4P`
Production candidate build: `422-sZjRR2dKS3mMJyqIz`
Forrásbackup: `backups/energy_v074_20260729_133011`

## Cél

A v0.7.4 a meglévő falhoz kötött `SurveyWallOpening` rekordokra épülő, közös nyílászáró-hőtechnikai és hőhídmotort vezet be. A nyílászáró geometriája, típusa, keret- és üvegezési leírása nem duplikálódik.

A számítás két részből áll:

1. teljes nyílászáró Uw és felületi hőveszteségi tényező;
2. dokumentált beépítési, lineáris és pontszerű hőhidak.

Kötelező figyelmeztetés:

> Tervezői energetikai számítás – szakmai ellenőrzés szükséges

A rendszer ismeretlen Ψ- vagy χ-értéket nem becsül meg automatikusan.

## Adatsémák

```text
EnergyOpeningWorkspace schemaVersion: 1
dimpro.energy-opening-set.v0.7.4
dimpro.property-survey.v0.7.4
dimpro.winwatt-compatible.v0.7.4
```

A projektállapot fő blokkjai:

```text
draft.energyOpeningWorkspace.openingDetails
draft.energyOpeningWorkspace.thermalBridges
calculated.energyOpenings
```

## Nyílászáró-számítási módok

### Deklarált teljes Uw

A teljes nyílászáró U-értéke dokumentált forrásból kerül be:

```text
Uw = deklarált teljes nyílászáró U-érték
```

Kötelező:

- pozitív Uw;
- forrástípus;
- forráshivatkozás.

Forrástípus lehet:

- gyártói teljesítménynyilatkozat;
- számítás;
- katalógus;
- kézi szakértői adat;
- korábbi DIMPRO-adat migrációja.

### Részletes keret–üveg számítás

```text
Ag = (szélesség − 2 × keretszélesség) × (magasság − 2 × keretszélesség)
Af = Aw − Ag
lg = 2 × (üvegszélesség + üvegmagasság)
Uw = (Ag × Ug + Af × Uf + lg × Ψg) / Aw
```

Bemenetek:

- teljes nyílászáró szélessége és magassága;
- keretszélesség;
- üvegezés Ug;
- keret Uf;
- üvegszegély Ψg;
- Ψg forrása;
- opcionális napenergia-átbocsátási tényező `g`.

A `g` érték 0 és 1 közötti lehet. Ebben a verzióban tárolódik és exportálódik, de havi szoláris nyereséget még nem számít.

## Hőveszteségi tényezők

### Nyílászáró felületi tényező

```text
Htr,ny = Aw × Uw
```

### Beépítési perem

```text
HΨ,beép = kerület × Ψbeép
```

A beépítési perem opcionális, de megadásakor kötelező a Ψ forrása.

### Lineáris hőhíd

```text
HΨ = l × Ψ
```

Kötelező:

- pozitív hossz;
- nem negatív Ψ;
- forráshivatkozás.

### Pontszerű hőhíd

```text
Hχ = n × χ
```

Kötelező:

- pozitív darabszám;
- nem negatív χ;
- forráshivatkozás.

### Teljes eredmény

```text
Hösszes = Σ(Aw × Uw) + Σ(kerület × Ψbeép) + Σ(l × Ψ) + Σ(n × χ)
```

## Kettős elszámolás elleni védelem

Ugyanahhoz a nyílászáróhoz nem használható egyszerre:

- összesített beépítési perem Ψ;
- külön káva-, parapet- vagy szemöldökhőhíd.

Az `OPENING_INSTALLATION_DOUBLE_COUNT` blokkoló hiba mindaddig megmarad, amíg a felhasználó nem választ egyetlen elszámolási módot.

## Követelménytípusok

A v0.7.4 külön szabályadatfájlban kezeli:

```text
components/energy/regulations/HU_EKM_2023_11_01/openingRequirements.ts
```

Rögzített követelmények:

| Nyílászáró típusa | U maximum W/m²K |
|---|---:|
| Üvegezés | 1,0 |
| Különleges üvegezés | 1,2 |
| Fa/PVC keretszerkezetű homlokzati üvegezett nyílászáró 0,5 m² felett | 1,1 |
| Fém keretszerkezetű homlokzati üvegezett nyílászáró 0,5 m² felett | 1,4 |
| Függönyfal | 1,4 |
| Üvegtető | 1,5 |
| Felülvilágító és füstelvezető kupola 0,5 m² felett | 1,7 |
| Tetősík ablak 0,5 m² felett | 1,3 |
| Ipari és tűzgátló ajtó és kapu | 2,0 |
| Homlokzati vagy fűtött–fűtetlen ajtó | 1,4 |
| Homlokzati vagy fűtött–fűtetlen kapu | 1,8 |

Egyedi követelmény külön pozitív határértékkel adható meg.

A teljes Uw-t kell vizsgálni, amely a keret, az üvegezés és az üvegszegély hatását is tartalmazza. Az árnyékoló többlet-hőszigetelő hatása nem számítható bele az elemi követelmény ellenőrzésébe.

## Hőhídkategóriák

- külső falsarok;
- belső falsarok;
- fal–födém csatlakozás;
- fal–tető csatlakozás;
- lábazati csatlakozás;
- erkély / konzol;
- nyílászáró káva;
- nyílászáró parapet;
- nyílászáró szemöldök;
- szerkezeti áttörés;
- egyéb hőhíd.

A hőhíd opcionálisan szinthez, helyiséghez, falszakaszhoz vagy nyílászáróhoz kapcsolható.

## Validációk

Blokkoló hibák többek között:

- érvénytelen nyílászáró-geometria;
- hiányzó energetikai részletadat;
- hiányzó deklarált Uw vagy forrás;
- hibás keretszélesség;
- hiányzó Ug, Uf vagy Ψg;
- hiányzó Ψg-forrás;
- hibás g-érték;
- hiányzó beépítési Ψ-forrás;
- hiányzó egyedi követelmény;
- hiányzó hőhídnév, hossz, darabszám, Ψ, χ vagy forrás;
- nem létező nyílászáró-kapcsolat;
- beépítési perem és külön nyíláskörüli hőhíd kettős elszámolása.

Információs állapot:

- a követelménytáblázat 0,5 m²-es küszöbét nem meghaladó nyílászáró.

## Migráció

Régi v0.6–v0.7.3 projektnél:

- minden meglévő nyílászáró energetikai részletrekordot kap;
- a régi `uValue` mező pozitív értéke deklarált Uw-vé alakul;
- a magyar tizedesvessző támogatott;
- a forrás „Korábbi DIMPRO U-érték mező – forrás ellenőrizendő” jelölést kap;
- U-érték nélküli elem részletes, kitöltendő állapotban marad;
- törölt nyílászáró energetikai részlete és kapcsolt hőhídja törlődik.

## UI

Az Energetika munkatér hét lapból áll:

1. Beállítások;
2. Geometria;
3. Zónák;
4. Nyílászárók;
5. U-érték;
6. Állapot;
7. Nyomvonal.

A Nyílászárók lapon belül:

- nyílászárók;
- hőhidak;
- nyílászáró- és hőhídnyomvonal.

A normál terepi Nyílászárók munkalap is megjeleníti:

- számítási módot;
- Uw-t;
- alkalmazott követelményt;
- beépítési hőveszteségi tényezőt;
- megfelelőségi vagy blokkolt állapotot.

A részletes adatokat továbbra is az Energetika / Nyílászárók lapon kell szerkeszteni.

## Tizedes adatbevitel

A részletes hőtechnikai mezők:

- pontot és vesszőt is elfogadnak;
- szöveges draftot tartanak fókusz közben;
- fókuszvesztéskor normalizálnak;
- az üres értéket nem alakítják automatikusan nullává;
- a ténylegesen megadott `0` dokumentált nulla marad.

## Számítási nyomvonal

Fő szabályazonosítók:

```text
OPENING-UW-DECLARED-001
OPENING-GLAZING-AREA-002
OPENING-FRAME-AREA-003
OPENING-UW-DETAILED-004
OPENING-INSTALLATION-BRIDGE-005
OPENING-TRANSMISSION-006
THERMAL-BRIDGE-LINEAR-007
THERMAL-BRIDGE-POINT-008
```

Minden auditrekord tartalmazza:

- szabályazonosítót;
- képletet;
- bemeneti adatokat;
- kerekítetlen és kerekített eredményt;
- mértékegységet;
- kapcsolt nyílászáró- vagy hőhídazonosítót.

## Exportok

### `.dimpro`

```text
schema: dimpro.property-survey.v0.7.4
calculated.energyOpenings: dimpro.energy-opening-set.v0.7.4
```

A projektállapot tartalmazza a teljes szerkeszthető nyílászáró- és hőhídmunkateret, az eredményblokk pedig a számított értékeket és auditnyomvonalat.

### WinWatt-előkészítő

```text
schema: dimpro.winwatt-compatible.v0.7.4
```

Bővített blokkok:

```text
openings
thermalBridges
openingThermalTotals
```

A nyílászáró-rekord tartalmazza többek között:

- geometriát;
- számítási módot;
- követelménytípust;
- Uw-t;
- megfelelőséget;
- felületi, beépítési és teljes H értéket;
- üveg- és keretfelületet;
- üvegszegélyhosszt;
- g értéket;
- forráshivatkozást.

Ez továbbra is DIMPRO előkészítő adatcsomag, nem natív WinWatt projektfájl.

### PDF

Új vektoros oldalak:

```text
NYÍLÁSZÁRÓ HŐTECHNIKAI ÖSSZESÍTŐ
LINEÁRIS ÉS PONTSZERŰ HŐHIDAK
```

A nyílászáróoldal tartalmazza:

- méretet és felületet;
- Uw-t;
- követelményt;
- beépítési H értéket;
- megfelelőséget;
- számítási módot és forrást;
- teljes hőveszteségi összesítést.

A hőhídoldal tartalmazza:

- lineáris vagy pontszerű típust;
- kategóriát;
- eredmény W/K értékét;
- forrást és kapcsolódó elemet;
- külön hőhíd- és beépítési összesítést.

## Fő érintett fájlok

```text
components/energy/domain/energyOpeningTypes.ts
components/energy/calculations/openings/calculateEnergyOpenings.ts
components/energy/regulations/HU_EKM_2023_11_01/openingRequirements.ts
components/energy/domain/energyFeatureFlags.ts
components/property-survey/propertySurveyWorkspaceTypes.ts
components/property-survey/energy/EnergyOpeningsPanel.tsx
components/property-survey/energy/PropertySurveyEnergyWorkspace.tsx
components/property-survey/energy/EnergyCompliancePanel.tsx
components/property-survey/PropertySurveyOpeningPanel.tsx
components/property-survey/propertySurveyEnergyCalculations.ts
components/property-survey/propertySurveyBuildingPdf.ts
components/property-survey/PropertySurveyPage.tsx
scripts/test-energy-openings-v074.cjs
scripts/test-property-survey-energy-v074.cjs
```

## Tesztek

Domain tesztek:

```text
Nyílászáró és hőhíd: 43/43
Zónaregresszió: 25/25
Rétegrendi U-reteszt: 28/28
```

Referenciaeredmény:

```text
Uw: 0,8412 W/m²K
Nyílászáró H: 1,5142 W/K
Beépítési perem H: 0,1620 W/K
Külön lineáris hőhíd H: 0,8000 W/K
Teljes referencia H: 2,4762 W/K
```

Candidate böngészőteszt:

```text
33/33 sikeres
```

E2E eredmény két hőhíddal:

```text
Uw: 0,8412 W/m²K
Nyílászáró H: 1,5142 W/K
Beépítési H: 0,1620 W/K
Lineáris + pontszerű hőhíd H: 1,0000 W/K
Teljes H: 2,6762 W/K
```

További candidate ellenőrzések:

- `.dimpro v0.7.4`;
- WinWatt-előkészítő v0.7.4;
- nyílászáró- és hőhíd-PDF oldalak;
- régi projekt deklarált Uw-migrációja;
- teljes PDF/DXF/WinWatt/fotó/metszet regresszió;
- hétoldalas vektoros PDF;
- tablet álló és fekvő érintésteszt;
- hat responsive nézet;
- candidate assetaudit 13/13;
- konzolhiba 0;
- oldalhiba 0.

## Ismert korlátok

- nincs automatikus Ψ- vagy χ-katalógusérték;
- nincs 2D/3D csomóponti végeselemes számítás;
- nincs automatikus hőhídfelismerés a rajzból;
- a g érték még nem kapcsolódik havi szoláris nyereséghez;
- nincs zónánkénti havi hőigény;
- nincs gépészeti rendszereredmény;
- nincs primerenergia- vagy CO₂-számítás;
- nincs referenciaépület-számítás;
- nincs hiteles tanúsítvány-generálás.

## Következő kiadás

```text
v0.7.5 – zónánkénti energiaigény és gépészeti rendszerkapcsolatok
```

## Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: 422-sZjRR2dKS3mMJyqIz
PM2 process: dimprover
Állapot: online
Rollback: .next_before_energy_v074_20260729_141548
```

Éles ellenőrzések:

- HTTP 200;
- nyílászáró/hőhíd domain teszt: 43/43;
- zónaregresszió: 25/25;
- U-motor regresszió: 28/28;
- v0.7.4 E2E: 33/33;
- `.dimpro` séma: `dimpro.property-survey.v0.7.4`;
- nyílászáróséma: `dimpro.energy-opening-set.v0.7.4`;
- WinWatt-előkészítő: `dimpro.winwatt-compatible.v0.7.4`;
- PDF nyílászáró-, hőhíd-, zóna- és U-érték oldalak: sikeres;
- tablet álló és fekvő érintésteszt: sikeres;
- éles assetaudit: 13/13 HTTP 200;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.

A központi smoke ellenőrzés TypeScript-lépése sikeres volt. A teljes repository-szintű `npm run lint` a 2 GiB-os Node heaplimiten kifutott, ezért azt nem jelöltük sikeresnek. A kiadás érintett forrásainak célzott ESLint-ellenőrzése, production buildje, domain tesztjei, candidate- és éles E2E-je, assetauditja, PM2/HTTP/nginx ellenőrzése sikeres. A smoke 8 aktuális npm-függőségi figyelmeztetést is jelzett; ezek külön dependency-karbantartási feladatot képeznek.
