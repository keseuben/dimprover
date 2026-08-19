# 294 — BENJADMIN Weekly Development Flow V2.1 · többhetes vezetői trend

**Dátum:** 2026-08-19
**Környezet:** kizárólag DEV
**Állapot:** source gate zöld · runtime release gate előtt · PROD DENY

## Cél

A V1.1 egyhetes összevetését többhetes vezetői idősorrá bővíteni úgy, hogy a V1.4 management score és állapot ugyanazzal a számítási logikával legyen összehasonlítható minden megjelenített héten.

## Alap működés

- alapértelmezett idősáv: **8 hét**;
- támogatott tartomány: **4–12 hét**;
- projekt-szűrés támogatott;
- korábbi hétre navigálva az idősor anchor hete is követi a kiválasztott hetet;
- új DB tábla vagy migráció nincs.

## Adatmodell

Új `DeveloperWeeklyTrendHistory` / `WeeklyTrendHistory` struktúra:

- `weekKey`;
- hét címkéje;
- aktuális hét jelző;
- 0–100 flow-score;
- `stable / watch / critical` állapot;
- aktivitás;
- lezárt task;
- worker átadás;
- várakozás;
- hiba;
- worker szám;
- teszt / build;
- max handoff gap.

## Score-konzisztencia

A korábbi egyhetes comparison logika közös `applyWeeklyComparison()` helperbe került.

A history 8 megjelenített héthez 9 nyers heti snapshotot kér le: az első megjelenített hét előtti hét biztosítja a szükséges comparison baseline-t. A heti snapshotok legfeljebb hármas batchben futnak, így az endpoint nem indít minden lekérést egyszerre.

## API

Új endpoint:

`GET /api/dev/console/weekly-trend-history`

Query:

- `projectId` opcionális;
- `week` opcionális;
- `weeks` opcionális, alapérték 8, szerveroldalon 4–12 közé korlátozva.

Biztonság:

- `isDevCenterAuthorized(..., true)`;
- `private, no-store`;
- `x-dimpro-production-access: DENY`;
- anonim olvasás tiltott.

## UI

Új `8 HETES VEZETŐI TREND` panel a vezetői heti összefoglaló alatt.

Választható trendek:

- Flow-score;
- Aktivitás;
- Lezárt;
- Várakozás;
- Hiba.

A panel SVG vonalgrafikont, heti pontokat és heti összefoglaló kártyákat mutat. A pontok jelzik a `stable / watch / critical` állapotot és külön az aktuális hetet.

Frissítés:

- automatikus history refresh 5 percenként;
- a heti összesítő kézi Refresh gombja a summary és history adatot is frissíti.

Responsive:

- desktopon teljes grafikon;
- kisebb képernyőn a grafikon saját belső vízszintes scrollt kap;
- az oldal maga nem kaphat horizontális overflow-t;
- mobilon a metrikaválasztó rácsos elrendezésű.

## Source fájlok

- `app/lib/dev-center/developer-console.ts`;
- `app/api/dev/console/weekly-trend-history/route.ts`;
- `components/admin/developer-console/types.ts`;
- `components/admin/developer-console/WeeklyDevelopmentSummary.tsx`;
- `components/admin/developer-console/DeveloperConsole.module.css`;
- `scripts/benjadmin-weekly-development-flow-v21-trend-contract.mjs`;
- `scripts/benjadmin-weekly-development-flow-v21-trend-runtime-browser-acceptance.mjs`.

## Jelenlegi kapuk

- V2.1 contract: **24/24 PASS**;
- célzott ESLint: **PASS**;
- `npx tsc --noEmit`: **PASS**;
- `git diff --check`: **PASS**;
- PROD access: **DENY**.

## Függő release gate

- feature commit;
- exact candidate build;
- trend API + browser runtime acceptance;
- V2.0 report regresszió;
- V1.4 Flow regresszió;
- Weekly Summary / Common Chat / Scheduler regresszió;
- canonical integráció;
- teljes lint;
- release artifact;
- DEV PM2 cutover + smoke;
- dokumentációs closeout.
