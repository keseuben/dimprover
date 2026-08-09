# DIMPRO Felmérő v0.6.1.2 – rajzlap-fejléc, szintadat, jelmagyarázat és alapterület-összesítő

Dátum: 2026-07-28

## Fejlesztési cél

A v0.6.1.2 a DIMPRO Felmérő alaprajzi rajzlapjának mérnöki dokumentációs tartalmát rendezi át. A rajzlapon korábban több helyen ismétlődött a lapméret, a szint és a projekt/felmérés megnevezése. Az új elrendezés ezeket egységes rajzadat-fejlécbe szervezi, és minden szintlapra külön jelmagyarázatot és alapterület-összesítőt tesz.

## Eltávolított ismétlődő feliratok

Az SVG rajzlap bal felső sarkából kikerült a következő ismétlődő szöveg:

```text
A3 · 420 × 297 mm · 1:50
```

A vektoros PDF szintoldalain megszűnt a rajz fölötti külön felső cím- és alcímsor is, például:

```text
FSZ - Földszint
Projekt neve / Felmérés neve
```

A szint és a lépték most a rajzadat-fejlécben szerepel. A lapméret továbbra is az Exportközpontban és a lapbeállításoknál látható, ezért a rajzon nem ismétlődik.

## Rajzadat-fejléc

A fejléc fizikai alapmérete változatlanul 200 × 34 mm, két sorban. A4, A3 és A2 rajzlapon ugyanekkora fizikai méretet tart.

### Felső sor

- Projekt neve;
- Megrendelő;
- Felmérés neve;
- Rajzverzió.

### Alsó sor

- Szint, például Földszint, Emelet vagy Pince;
- Felmérés típusa;
- Helyszín és helyrajzi szám;
- Felmérés dátuma;
- Készítő;
- Lépték.

A megrendelő neve a felmérési projekt `clientName` mezőjéből származik. A rajzverzió a következő verziózott `.dimpro` munkafájl sorszámát követi, például `v001`, `v002`.

## Rajzlapi jelmagyarázat

A rajzadat-fejléc fölött 200 × 24 mm-es, külön rajzlapi információs blokk jelenik meg. A jelmagyarázat nyolc alapvető rajzi elemet mutat:

- külső fal;
- belső fal;
- fűtetlen térrel határos fal;
- nyílászáró;
- energetikai hőhatár;
- metszetvonal;
- fotópont;
- hibapont.

A jelmagyarázat az interaktív SVG rajzlapon és a valódi vektoros PDF szintoldalain is megjelenik.

## Szintenkénti alapterület-összesítő

A jelmagyarázat mellett minden helyiségeket tartalmazó szintlap külön összesítőt kap:

- fűtött alapterület;
- fűtetlen alapterület;
- összes alapterület;
- helyiségek darabszáma.

Az értékek mindig az adott szint aktuális helyiségmodelljéből számolódnak. A mintafelmérés ellenőrzött értékei:

```text
Fűtött: 77,5 m²
Fűtetlen: 7,1 m²
Összesen: 84,6 m²
Helyiségek: 7 db
```

## PDF-fedlap

A PDF fedlap projektadatai kiegészültek:

- megrendelő;
- rajzverzió.

A szintoldalon nincs külön felső címblokk; a rajzi terület így nagyobb marad, miközben a szint neve a fejlécben egyértelműen olvasható.

## Érintett fájlok

```text
components/viewers/SurveyFloorPlanEngine.tsx
components/property-survey/PropertySurveyPage.tsx
components/property-survey/propertySurveyBuildingPdf.ts
scripts/test-property-survey-v061.cjs
scripts/test-property-survey-v0612.cjs
DIMPROVER_PRODUCT_DOCS/02_modulok_es_funkciok.md
DIMPROVER_PRODUCT_DOCS/05_verziotortenet.md
```

## Tesztelés

Végleges éles build:

```text
C8wNPB74_gEqnaJ8lW3w2
```

Korábbi funkcionális candidate build:

```text
x2DPVeuVuWPAqAuBtY-Ro154
```

Ellenőrzött eredmények:

- célzott ESLint: 0 hiba;
- TypeScript: sikeres;
- elkülönített production release build: sikeres;
- candidate assetaudit: 13/13 HTTP 200;
- atomikus `.next` csere és PM2 restart: sikeres;
- éles oldal: HTTP 200;
- éles célzott E2E: sikeres;
- éles assetaudit: 13/13 HTTP 200;
- bal felső lapméret-felirat: nincs;
- PDF felső `FSZ - Földszint` cím: nincs;
- megrendelő a képernyős és PDF-fejlécben: sikeres;
- rajzverzió `v001`: sikeres;
- szintadat a fejlécben: sikeres;
- rajzlapi jelmagyarázat: 8/8 elem;
- alapterület-összesítő: 4/4 adat;
- fűtött/fűtetlen/összes terület: 77,5 / 7,1 / 84,6 m²;
- teljes v0.6.1 regresszió: sikeres;
- energetikai fotó ZIP: 3 kijelölt kép;
- minden fotó ZIP: 5 kép;
- metszet, hibatörlés, átfedésjavítás, DXF és HATCH regresszió: sikeres;
- tablet fekvő, tablet álló, iPad Pro és mobil: nincs vízszintes overflow;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.

## Backup

```text
backups/ingatlanfelmero_v0612_sheet_metadata_legend_20260728_212427
```

## Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: C8wNPB74_gEqnaJ8lW3w2
PM2 process: dimprover
Állapot: online
Rollback: .next_before_ingatlan_v0612_20260728_221149
```

A végleges build külön, szabványos `.next` könyvtárban készült. A standalone csomag szerveroldali Turbopack runtime fájljai ellenőrzésre kerültek, majd a build atomikus könyvtárcserével került élesítésre.
