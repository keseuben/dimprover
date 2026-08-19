# 294 — BENJADMIN Weekly Development Flow V2.1 · többhetes vezetői trend

**Dátum:** 2026-08-19
**Környezet:** kizárólag DEV
**Állapot:** DEV AKTÍV · 2026-08-19 18:42:03 CEST · PROD DENY

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

## Release és validáció

### Source és canonical állapot

- termékfunkció exact source commit: **`c92240a6d6cbd5ec62aba8b4a5f63da37c831977`** (`c92240a`);
- navigációs acceptance-bővítés: **`291623bfd664fb0bea984c6086b2ebb797e1b5db`** (`291623b`);
- canonical operator és `integration/benjadmin-dev` a cutoverkor: **`291623b`**;
- a `291623b` commit kizárólag runtime/browser acceptance tesztet bővít, ezért az aktív Next artifact exact termék-source commitja `c92240a` marad.

### Build és release artifact

- exact candidate build: **2026-08-19 18:22:08–18:27:57 CEST**, exit 0;
- BUILD_ID: **`vD_5lQneV9pW7XQbj6qoA`**;
- standalone ellenőrzés: **PASS**;
- 248 statikus chunk ellenőrizve;
- aktív DEV release: **`.next-benjadmin-weekly-flow-v21-trends-release-c92240a`**;
- előző rollback release: `.next-benjadmin-weekly-flow-v20-report-release-cecb103`;
- promotion hardlink-alapú, újrafordítás nélkül.

### Teljesítmény

A candidate runtime-on a `GET /api/dev/console/weekly-trend-history?weeks=8` mérés:

- HTTP 200;
- **1,349 s** teljes válaszidő;
- 8 megjelenített heti pont;
- 9 nyers heti snapshot, legfeljebb 3-as batch-ekben;
- `productionAccess: DENY`.

### DEV cutover

- cutover: **2026-08-19 18:41:54–18:42:03 CEST**;
- központi koordinátor: `restart · ARMINAI`;
- exit code: **0**;
- PM2 PID: `247362`;
- PM2 státusz: **online**;
- `NEXT_DIST_DIR`: `.next-benjadmin-weekly-flow-v21-trends-release-c92240a`;
- trend smoke: **8 hét / 8 pont / PROD DENY**;
- V2.0 report smoke: **BENJADMIN_WEEKLY_REPORT_V2_0 / PROD DENY**.

Backupok:

- integration: `/srv/dimpro-dev/backups/benjadmin-weekly-flow-v21-integration-20260819T183558+0200`;
- artifact promotion: `/srv/dimpro-dev/backups/benjadmin-weekly-flow-v21-artifact-promotion-20260819T184059+0200`;
- cutover: `/srv/dimpro-dev/backups/benjadmin-weekly-flow-v21-cutover-20260819T184154+0200`;
- docs closeout: `/srv/dimpro-dev/backups/benjadmin-weekly-flow-v21-doc-closeout-20260819T184700+0200`.

### Statikus kapuk

- V2.1 contract: **24/24 PASS**;
- V2.0 report contract: **23/23 PASS**;
- V1.4 contract: **34/34 PASS**;
- célzott ESLint: **PASS**;
- `npx tsc --noEmit`: **PASS**;
- teljes `npm run lint`: **0 error / 103 meglévő warning**;
- `git diff --check`: **PASS**;
- új DB migráció: **nincs**.

### Candidate runtime acceptance

Az exact `c92240a` artifacton:

- V2.1 multi-week trend: **19/19 PASS**;
- V2.0 report export: **21/21 PASS**;
- V1.4 Flow: **58/58 PASS**;
- Weekly Summary V1.1: **35/35 PASS**;
- Common Chat V2: **30/30 PASS**;
- Overnight Scheduler runtime: **30/30 PASS**;
- Overnight Scheduler browser: **14/14 PASS**.

A V2.1 acceptance külön igazolja, hogy:

- 8 heti pont érkezik időrendben;
- minden score 0–100 közé esik;
- az öt metrikaváltó működik;
- az aktuális hét jelölve van;
- korábbi hétre navigálva a trend anchor követi a kiválasztott hetet (`2026-08-10`), majd visszatér az aktuális hétre (`2026-08-17`);
- desktopon nincs oldal-overflow;
- mobilon a chart saját belső vízszintes scrollt használ.

### Élő post-cutover acceptance

Az aktív 3100-as DEV runtime-on:

- V2.1 multi-week trend: **19/19 PASS**;
- V2.0 report export: **21/21 PASS**;
- V1.4 Flow: **58/58 PASS**;
- Weekly Summary V1.1: **35/35 PASS**;
- Common Chat V2: **30/30 PASS**;
- Overnight Scheduler runtime: **30/30 PASS**;
- Overnight Scheduler browser: **14/14 PASS**;
- `productionAccess`: **DENY**.

A Common Chat V2 első post-cutover futása a 23. ellenőrzés után egyszeri Puppeteer 10 másodperces UI-wait timeouttal megszakadt. Ugyanazon, változatlan live runtime-on az azonnali újrafutás **30/30 PASS** eredményt adott, ezért nem reprodukálható browser-acceptance időzítési jelenségként lett rögzítve.

### Post-cutover operáció

- `/admin/dev-console`: **PASS**;
- `/terep`: **PASS**;
- `/api/field-capture/health`: **PASS**;
- trend-history endpoint: **PASS**;
- V2.0 report endpoint: **PASS**;
- PM2 error log utolsó módosítása: **2026-08-19 17:42:45 CEST**, tehát a V2.1 18:42-es cutover után nem keletkezett új PM2 error-log bejegyzés;
- DEV tárhely a closeout ellenőrzéskor: **89%**, kb. **13 GB** szabad;
- swap: **509 MiB / 509 MiB** használatban, ezért további nagy buildkör előtt erőforrás-karbantartás javasolt.

## Biztonság

- kizárólag DEV módosult;
- PROD write/build/restart nem történt;
- új adatbázis-migráció nincs;
- minden új API DEV-center auth mögött marad;
- a history response és a hozzá kapcsolódó release metadata `productionAccess: DENY` állapotú.
