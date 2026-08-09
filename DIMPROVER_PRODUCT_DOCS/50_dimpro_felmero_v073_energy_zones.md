# DIMPRO Felmérő v0.7.3 – Energetikai zónák és kapcsolódó fűtetlen terek

Dátum: 2026-07-29
Dev Center verzió ID: `version_06a1b18d-35d`
Alap build: `NCfDCt7I_Kpn5bfh6QkaN`
Production candidate build: `6Jj8Kyj9lxKuDDIRcSr4P`

## Cél

A v0.7.3 a Felmérő meglévő helyiség-, szint-, fal-, nyílászáró-, geometriai és rétegrendi modelljére épülő energetikai zónakezelést vezet be. Nem hoz létre párhuzamos geometriát.

A zónahatár a tárgyi épület kondicionálási igényeihez igazodik. Egyszerű családi háznál alapértelmezés szerint egy fűtött zóna készül. Több zóna akkor indokolt, ha eltér a használati profil vagy a kondicionálási szolgáltatási szint. A zónák és a referenciaépület későbbi számításában ugyanazt a zónastruktúrát kell használni.

Kötelező figyelmeztetés:

> Tervezői energetikai számítás – szakmai ellenőrzés szükséges

A v0.7.3 még nem készít havi energiaigényt, gépészeti rendszereredményt, primerenergiát, CO₂-t, referenciaépületet vagy hiteles energetikai tanúsítványt.

## Adatséma

```text
EnergyZoneWorkspace schemaVersion: 1
dimpro.energy-zone-set.v0.7.3
dimpro.property-survey.v0.7.3
dimpro.winwatt-compatible.v0.7.3
```

Fő adatok:

- energetikai zónák;
- kapcsolódó fűtetlen terek;
- fűtött helyiségek zónahozzárendelése;
- fűtetlen helyiségek fűtetlen térhez rendelése;
- használati profil;
- kondicionálási szolgáltatási szint;
- fűtési és opcionális hűtési alapérték;
- opcionális légcsereszám;
- fűtetlen tér típusa, szellőzése és hőmérsékletforrása;
- teljes auditnyomvonal.

## Alapbeosztás és migráció

Új energetikai mintaprojektben:

- minden fűtött helyiség egy közös fűtött zónába kerül;
- minden fűtetlen helyiség egy közös kapcsolódó fűtetlen térbe kerül.

Régi v0.6–v0.7.2 projekt első megnyitásakor ugyanez az alapbeosztás készül adatvesztés nélkül.

Már zónásított projektben később létrehozott új helyiség nem kerül csendben zónába. A rendszer hiányzó hozzárendelésként jelzi, ezért a tervezőnek kell dönteni a besorolásról.

## Használati profilok

- lakóépület;
- iroda;
- oktatási;
- egészségügyi;
- kereskedelmi;
- szállás / vendéglátás;
- ipari;
- raktár;
- sport;
- egyéb.

## Szolgáltatási szintek

- fűtött, természetes szellőzéssel;
- fűtött, gépi szellőzéssel;
- fűtött és hűtött;
- légkondicionált.

## Fűtetlen terek

Kezelt típusok:

- fűtetlen padlás;
- fűtetlen pince;
- garázs;
- lépcsőház;
- tároló;
- közlekedő;
- egyéb fűtetlen tér.

Szellőzési állapot:

- nincs meghatározva;
- zárt;
- természetes;
- gépi.

A fűtetlen tér hőmérséklete lehet:

- még nem számított;
- kézzel megadott;
- későbbi részletes számításból származó.

Kézi hőmérsékletnél kötelező szakmai figyelmeztetés jelenik meg.

## Számítási motor

Fő függvény:

```text
calculateEnergyZones()
```

Motorverzió:

```text
0.7.3
```

Zónánként számított adatok:

- helyiségek és helyiségazonosítók;
- kondicionált alapterület;
- kondicionált térfogat;
- külső nettó falfelület;
- talajjal érintkező falfelület;
- szomszédos épületrészhez tartozó falfelület;
- fűtetlen térrel határos nettó falfelület;
- zónaközi nettó falfelület.

Fűtetlen térenként számított adatok:

- helyiségek;
- alapterület;
- térfogat;
- kapcsolódó zónák;
- kapcsolódó nettó határoló felület.

## Zónakapcsolatok

A motor a meglévő dinamikus falmodellből ismeri fel:

```text
zoneToZone
zoneToUnheatedSpace
```

A falszakaszoknál számítja:

- bruttó felület;
- nyílászáró-felület;
- nettó felület;
- forrás- és célhelyiséget;
- forrás- és célzónát vagy fűtetlen teret.

A két oldalról automatikusan létrejövő azonos falrekordokat kanonikus geometriai kulccsal deduplikálja.

## Validációk

Blokkoló hibák:

- nincs energetikai zóna;
- hiányzó zónanév;
- fűtött helyiség nincs zónához rendelve;
- fűtetlen helyiség fűtött zónához van rendelve;
- fűtött helyiség fűtetlen térhez van rendelve;
- ugyanaz a helyiség egyszerre zónához és fűtetlen térhez tartozik;
- nem létező célzóna vagy fűtetlen tér.

Nem blokkoló figyelmeztetések:

- üres zóna;
- üres fűtetlen tér;
- fűtetlen helyiség nincs fűtetlen térhez rendelve;
- fűtetlen határ célhelyisége nincs besorolva;
- kézzel megadott fűtetlen tér-hőmérséklet.

Információs üzenet:

- zónaközi határ felismerése.

## Számítási nyomvonal

Zónánként négy fő auditképlet készül:

```text
ZONE-FLOOR-AREA-001
ZONE-VOLUME-002
ZONE-EXTERNAL-WALL-003
ZONE-UNHEATED-BOUNDARY-004
```

Minden sor tartalmazza:

- szabályazonosítót;
- képletet;
- bemeneti adatokat;
- kerekítetlen és kerekített értéket;
- mértékegységet;
- zóna- és helyiséghivatkozásokat.

## UI

Az Energetika munkatér hat lapból áll:

1. Beállítások;
2. Geometria;
3. Zónák;
4. U-érték;
5. Állapot;
6. Nyomvonal.

A Zónák lapon belül:

- zónák;
- fűtetlen terek;
- kapcsolatok;
- zóna-nyomvonal.

Elérhető műveletek:

- automatikus alapbeosztás;
- zóna hozzáadása és törlése;
- zónaadatok szerkesztése;
- helyiség zónához rendelése;
- fűtetlen tér hozzáadása és törlése;
- fűtetlen helyiség hozzárendelése;
- fűtetlen tér hőmérséklet- és szellőzési adatainak szerkesztése.

Az Állapot lap külön zónamotor-kártyát mutat.

## Exportok

### `.dimpro`

```text
schema: dimpro.property-survey.v0.7.3
calculated.energyZones: dimpro.energy-zone-set.v0.7.3
```

A teljes zónamunkatér a `draft.energyZoneWorkspace` mezőben, az eredmény és audit a `calculated.energyZones` blokkban tárolódik.

### WinWatt-előkészítő

```text
schema: dimpro.winwatt-compatible.v0.7.3
```

Új blokkok:

- `zones`;
- `unheatedSpaces`;
- `zoneConnections`;
- `zoneTotals`.

Ez továbbra is DIMPRO előkészítő adatcsomag, nem natív WinWatt projektfájl.

### PDF

A többoldalas vektoros PDF új oldalai:

```text
ENERGETIKAI ZÓNAÖSSZESÍTŐ
FŰTETLEN TEREK ÉS ZÓNAKAPCSOLATOK
```

A zónaoldal tartalmazza:

- zónanevet;
- használati profilt;
- szolgáltatási szintet;
- helyiségszámot;
- alapterületet;
- térfogatot;
- külső, fűtetlen és zónaközi határokat;
- fűtési és hűtési alapértéket;
- motor- és forrásazonosítót.

## Fő érintett fájlok

```text
components/energy/domain/energyZoneTypes.ts
components/energy/calculations/zones/calculateEnergyZones.ts
components/energy/domain/energyFeatureFlags.ts
components/property-survey/propertySurveyWorkspaceTypes.ts
components/property-survey/energy/EnergyZonesPanel.tsx
components/property-survey/energy/PropertySurveyEnergyWorkspace.tsx
components/property-survey/energy/EnergyCompliancePanel.tsx
components/property-survey/propertySurveyEnergyCalculations.ts
components/property-survey/propertySurveyBuildingPdf.ts
components/property-survey/PropertySurveyPage.tsx
scripts/test-energy-zones-v073.cjs
scripts/test-property-survey-energy-v073.cjs
```

## Tesztek

Domain teszt:

```text
25/25 sikeres
```

Candidate E2E:

```text
26/26 sikeres
```

Mintaprojekt eredménye:

```text
1 zóna
77,50 m² kondicionált alapterület
208,35 m³ kondicionált térfogat
1 fűtetlen tér
17,307 m² fűtetlen térrel határos felület
```

Candidate ellenőrzések:

- kétzónás szerkesztés és helyiségáthelyezés;
- zónaközi és zóna–fűtetlen tér kapcsolatok;
- többzónás auditnyomvonal;
- `.dimpro v0.7.3`;
- WinWatt v0.7.3;
- PDF zóna-, fűtetlen tér- és U-érték oldalak;
- régi projekt migrációja;
- hat responsive nézet;
- teljes PDF/DXF/WinWatt/fotó/metszet regresszió;
- tablet álló és fekvő érintésteszt;
- candidate assetaudit 13/13;
- konzolhiba 0;
- oldalhiba 0.

## Ismert korlátok

- nincs havi zónaenergia-igény;
- nincs részletes fűtetlen tér-hőmérséklet számítás;
- nincs zónánkénti gépészeti rendszerkapcsolat;
- nincs primerenergia- vagy CO₂-számítás;
- nincs referenciaépület-számítás;
- nincs hiteles tanúsítvány-generálás;
- a zónahatárok és használati profilok emberi szakmai ellenőrzést igényelnek.

## Következő kiadás

```text
v0.7.4 – nyílászárók és hőhidak részletes számítása
```

## Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: 6Jj8Kyj9lxKuDDIRcSr4P
PM2 process: dimprover
Állapot: online
Rollback: .next_before_energy_v073_20260729_121520
```

Éles ellenőrzések:

- HTTP 200;
- zónadomain teszt: 25/25;
- U-motor regresszió: 28/28;
- v0.7.3 E2E: 26/26;
- `.dimpro` séma: `dimpro.property-survey.v0.7.3`;
- zónaséma: `dimpro.energy-zone-set.v0.7.3`;
- WinWatt-előkészítő: `dimpro.winwatt-compatible.v0.7.3`;
- PDF zóna-, fűtetlen tér- és U-érték oldalak: sikeres;
- tablet álló és fekvő érintésteszt: sikeres;
- éles assetaudit: 13/13 HTTP 200;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.

A központi teljes repository-szintű smoke wrapper időkorlátba futott és nem adott részletes eredményt. A kiadás érintett forrásainak célzott ESLint-ellenőrzése, TypeScript-ellenőrzése, production buildje, domain tesztjei, candidate- és éles E2E-je, assetauditja, PM2/HTTP/nginx ellenőrzése sikeres.
