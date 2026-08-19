# 290 — BENJADMIN Weekly Development Flow V1.3 · részletes drill-down

**Dátum:** 2026-08-19
**Környezet:** kizárólag DEV
**Állapot:** DEV AKTÍV · 2026-08-19 16:11:13 CEST · PROD DENY

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

## Release és validáció

- Feature / runtime source commit: **`7ed6930240d0b75e3e21a2d6524053577e715548`** (`7ed6930`);
- canonical operator és `integration/benjadmin-dev` a runtime aktiváláskor: **`7ed6930`**;
- aktív DEV release: **`.next-benjadmin-weekly-flow-v13-release-7ed6930`**;
- BUILD_ID: **`TwDPrqnZZFAROJcAJ87f2`**;
- előző aktív release: `.next-benjadmin-weekly-flow-v12-release-b5d6735`;
- DEV cutover: **2026-08-19 16:11:05–16:11:13 CEST**, exit 0;
- cutover backup: `/srv/dimpro-dev/backups/benjadmin-weekly-flow-v13-cutover-20260819T161104+0200`;
- artifact promotion backup: `/srv/dimpro-dev/backups/benjadmin-weekly-flow-v13-artifact-promotion-20260819T160918+0200`.

### Build megjegyzés

Az első candidate build a `5769f1c` checkpointból CSS szintaktikai hiba miatt biztonságosan megállt: a responsive blokkban egy hibás selector `Unclosed block` PostCSS hibát okozott. A hiba még integráció előtt javításra került, a feature commit amend után új source hash lett: **`7ed6930`**.

Az exact `7ed6930` candidate build 2026-08-19 15:56:34–16:02:23 CEST között sikeresen elkészült, standalone ellenőrzéssel és 248 statikus chunk validációval. A már teljesen validált exact artifact hardlink-alapú, tárhelytakarékos promotionnel kapta meg a canonical release nevet; a build tartalma és BUILD_ID változatlan maradt.

### Source és statikus kapuk

- Flow V1 contract: **21/21 PASS**;
- Flow V1.1 contract: **19/19 PASS**;
- Flow V1.2 contract: **22/22 PASS**;
- Flow V1.3 contract: **20/20 PASS**;
- Worker Presence bridge contract: **37/37 PASS**;
- build-lock timing unit: **12/12 PASS**;
- `npx tsc --noEmit`: **PASS**;
- célzott ESLint: **PASS**;
- teljes `npm run lint`: **0 error / 103 meglévő warning**;
- `git diff --check`: **PASS**.

### Runtime/browser acceptance

- exact candidate V1.3: **50/50 PASS**;
- promoted canonical release, temp runtime: **50/50 PASS**;
- aktív 3100-as DEV PM2 runtime post-cutover: **50/50 PASS**;
- scheduler drill-down: **PASS**;
- handoff drill-down: **PASS**;
- waiting drill-down: **PASS**;
- failure drill-down: **PASS**;
- kiválasztott kártya ismételt kattintásos bezárása: **PASS**;
- desktop overflow: **PASS**;
- mobil drill-down + overflow: **PASS**.

### Élő regressziók

- Weekly Flow V1.2 runtime/browser: **40/40 PASS**;
- Weekly Flow V1.1 runtime/browser: **34/34 PASS**;
- Weekly Summary V1 runtime/browser: **25/25 PASS**;
- Weekly Summary V1.1 runtime/browser: **35/35 PASS**;
- Common Chat V2 runtime/browser: **30/30 PASS**;
- Overnight Scheduler runtime: **30/30 PASS**;
- Overnight Scheduler browser: **14/14 PASS**.

### Post-cutover smoke

- PM2 `dimpro-benjadmin-operator-ui-v2-dev`: **online**;
- `NEXT_DIST_DIR`: `.next-benjadmin-weekly-flow-v13-release-7ed6930`;
- `/admin/dev-console`: **PASS**;
- `/terep`: **PASS**;
- `/api/field-capture/health`: **PASS**;
- `/api/dev/console/weekly-summary`: **PASS**;
- `flowAnalytics.drillDown`: **elérhető**;
- `productionAccess`: **DENY**.

## Biztonság

- csak DEV környezet módosul;
- nincs új API route;
- nincs új DB tábla vagy migráció;
- PROD build/write/restart nem engedélyezett;
- `productionAccess: DENY` megmarad;
- acceptance fixture izolált adatokat hoz létre és cleanupot futtat.
