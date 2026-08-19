# 290 — BENJADMIN Weekly Development Flow V1.3 · részletes drill-down

**Dátum:** 2026-08-19
**Környezet:** kizárólag DEV
**Állapot:** feature candidate · runtime release gate előtt · PROD DENY

## Cél

A Weekly Development Flow V1.2 négy fő folyamatmutatójának részletes, kattintható eseménynézettel való bővítése úgy, hogy a meglévő heti API és adatforrások újrahasznosuljanak.

A drill-down kategóriák:

- Scheduler futások;
- Worker átadások;
- Várakozások;
- Elakadások.

## Adatmodell

A `flowAnalytics.drillDown` négy listát tartalmaz:

- `scheduler`;
- `handoff`;
- `waiting`;
- `failure`.

Minden elem közös `WeeklyFlowDrillDownItem` szerkezetet használ:

- azonosító és kategória;
- eseménytípus;
- cím és részlet;
- időpont;
- worker / task / projekt kapcsolat;
- státusz;
- handoff forrás- és célworker;
- munkarész;
- scheduler próbálkozásszám.

Kategóriánként legfeljebb 12, legfrissebb vagy legrelevánsabb esemény jelenik meg.

## Adatforrások

### Scheduler

A meglévő heti scheduler-run adatokból épül. Megjelenik a státusz, trigger forrás, worker, task és próbálkozásszám.

### Handoff

A meglévő Worker Presence transition adatokból épül. Megőrzi a `TASK_HANDOFF` / `CONTEXT_HANDOFF` típust, a forrás- és célworkert és a munkarészt.

### Waiting

A meglévő blocker listából:

- `BUILD_LOCK_WAIT`;
- `WAITING_WORKER`.

### Failure

A meglévő blocker listából:

- `TASK_FAILED`;
- `SCHEDULER_FAILED`.

## UI

A négy felső Flow-metrika statikus kártya helyett valódi `button` elem:

- `aria-pressed` állapot;
- kiválasztott vizuális állapot;
- `focus-visible` billentyűzetes fókusz;
- kattintásra ugyanazon panelen kategóriaváltás;
- ugyanarra a kiválasztott kártyára kattintva bezárás;
- külön bezáró gomb.

A részletpanel:

- `data-testid="benjadmin-weekly-flow-drilldown"`;
- kategóriaazonosító;
- stabil eseménytípus metadata;
- desktopon kétoszlopos, mobilon egyoszlopos;
- üres kategóriához explicit üres állapot.

## Source fájlok

- `app/lib/dev-center/developer-console.ts`;
- `components/admin/developer-console/types.ts`;
- `components/admin/developer-console/WeeklyDevelopmentSummary.tsx`;
- `components/admin/developer-console/DeveloperConsole.module.css`;
- `scripts/benjadmin-weekly-development-flow-v13-contract.mjs`;
- `scripts/benjadmin-weekly-development-flow-v13-runtime-browser-acceptance.mjs`.

## Jelenlegi source gate

- Flow V1 contract: **21/21 PASS**;
- Flow V1.1 contract: **19/19 PASS**;
- Flow V1.2 contract: **22/22 PASS**;
- Flow V1.3 contract: **20/20 PASS**;
- Worker Presence bridge contract: **37/37 PASS**;
- build-lock timing unit: **12/12 PASS**;
- `npx tsc --noEmit`: **PASS**;
- célzott ESLint: **PASS**;
- `git diff --check`: **PASS**;
- PROD access: **DENY**.

## Függő release gate

A feature commit után még kötelező:

- exact candidate build;
- V1.3 API + browser runtime acceptance;
- V1/V1.1/V1.2 és kapcsolódó regressziók;
- canonical állapot újraellenőrzése;
- integráció;
- DEV release artifact;
- PM2 cutover és smoke;
- teljes lint;
- dokumentációs closeout.

## Biztonság

- csak DEV környezet módosul;
- nincs új API route;
- nincs új DB tábla vagy migráció;
- PROD build/write/restart nem engedélyezett;
- `productionAccess: DENY` megmarad;
- acceptance fixture izolált adatokat hoz létre és cleanupot futtat.
