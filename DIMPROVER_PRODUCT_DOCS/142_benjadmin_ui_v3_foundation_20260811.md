# BENJADMIN UI V3 – közös dashboard / grafikon alapréteg

Dátum: 2026-08-11

## Cél

A BENJADMIN teljes kezelőfelületének fokozatos átalakítása egységes, táblázatos és grafikonos enterprise Control Center felületté.

Ez a checkpoint nem az összes menü végleges redesignja, hanem a közös UI V3 komponensréteg első stabil alapja.

## Új közös komponens

`components/admin/BenjadminDashboardKit.tsx`

Első újrahasznosítható elemek:

- `BenjadminKpiCard`
- `BenjadminBarChart`
- `BenjadminSparklineCard`

A komponensek külső chart library nélkül működnek, ezért nincs új frontend dependency.

## Áttekintés V3

Az Operator `Áttekintés` nézet most három analitikai blokkot kapott:

1. Task állapot
   - fut / teszt
   - várakozik
   - blokkolt
   - kész

2. Worker terhelés
   - worker kód szerinti aktív task terhelés
   - handshake / worker státusz kiegészítés

3. Fejlesztési aktivitás
   - utolsó 7 nap fejlesztési percei
   - sparkline trend

A meglévő aktív task táblázat, worker panel, környezet panel és konfliktus panel megmaradt.

## Vizuális szabályok

- minimum 12 px törzsszöveg;
- közös admin surface/border változók;
- világos és sötét témával kompatibilis;
- szűk enterprise kártyák;
- chartok nem növelik túl a képernyőmagasságot;
- desktopon 3 oszlop;
- közepes szélességen 2 oszlop;
- mobilon 1 oszlop;
- nincs új vízszintes oldal-overflow.

## Acceptance

DEV build:

`dw5_TJjgbNtIxVx85-rOq`

Operator regression:

**30/30 PASS**

Külön V3 browser probe:

- chart card: 3
- task/worker bar chart komponensek megjelennek
- sparkline: 1
- címek: `Task állapot`, `Worker terhelés`, `Fejlesztési aktivitás`
- desktop horizontal overflow: nincs
- desktop vertical page overflow: nincs

TypeScript: PASS.

Lint: 0 error / 108 meglévő warning.

`git diff --check`: PASS.

## Következő UI V3 sorrend

A közös komponensrétegre építve sorban átépítendő nézetek:

1. Áttekintés – további KPI és trend finomítás;
2. Taskok – státusz- és prioritásanalitika + táblázatszűrés;
3. Worker-ek / Csapat – terhelés, session health és rendelkezésre állás;
4. Környezetek – DEV/STAGING/PROD health dashboard;
5. Partner fejlesztések – lifecycle/provisioning grafika + partner táblázat;
6. Release – build/release trendek és kiadási pipeline;
7. Audit – időráfordítás és aktivitási trendek;
8. Control – infrastruktúra/telemetria grafikonok;
9. Licenc / AI – jogosultsági és használati összkép.

A cél, hogy a P4/P5 új felületek már eleve erre a UI V3 design systemre épüljenek, ne később kelljen őket újrarajzolni.

PROD ebben a checkpointban nem módosult.
