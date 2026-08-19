# 289 — BENJADMIN Weekly Development Flow V1.2 · handoff / lead-time analitika

**Dátum:** 2026-08-19
**Környezet:** kizárólag DEV
**Állapot:** DEV AKTÍV · 2026-08-19 15:24:03 CEST · PROD DENY

## Cél

A Weekly Development Flow V1.1 bővítése olyan időalapú folyamatjelzésekkel, amelyek a BENJADMIN meglévő Worker Presence adataiból mérik a worker → worker átadási réseket, a build-lock várakozási ablakokat és a heti időbeli szűk keresztmetszetet.

A V1.2 nem állít teljes projekt- vagy task-átfutási időt. A felület megfigyelt presence-időbélyegekből származó átadási és várakozási időt mutat.

## Funkciók

- worker → worker átadási rés percben;
- heti átlagos, medián és maximális átadási rés;
- 0 perces / átfedő átadások számlálása;
- build-lock várakozási események száma;
- build-lock várakozási idő összesítése;
- leghosszabb handoff vagy build-lock ablak bottleneck jelzésként;
- leglassabb átadások worker-párral és munkarésszel;
- desktop és mobil responsive megjelenítés;
- meglévő weekly API újrahasználata;
- nincs új DB tábla és nincs migráció.

## Handoff mérés

Az átadás kezdőpontja a korábbi worker utolsó ismert lezárási/jelenléti időpontja:

1. `endedAt`, ha rendelkezésre áll;
2. különben `lastSeenAt`;
3. különben `detectedAt` / rekordidő.

A következő worker `detectedAt` időpontjához képest számított különbség adja a megfigyelt átadási rést. Negatív vagy átfedő időablak 0 percre normalizálódik.

## Build-lock időmérés

A Worker Presence bridge migráció nélkül, a meglévő metadata mezőben tartja fenn:

- `buildLockWaitStartedAt`;
- `buildLockWaitTotalMs`;
- `buildLockWaitObservationCount`;
- `buildLockWaitLastEndedAt`;
- `buildLockWaiting`.

A várakozás false → true átmenete új időablakot indít. A true → false átmenet hozzáadja az eltelt időt az összesített értékhez. Presence lezárásakor az aktív várakozási ablak automatikusan lezáródik és felhalmozódik.

Ez lehetővé teszi a már lezárt várakozások heti kimutatását is; a riport nem kizárólag pillanatnyi `buildLockWaiting=true` rekordokra támaszkodik. Régi presence rekordokhoz megmarad egy kompatibilitási fallback.

## UI

Új blokk a Heti fejlesztési folyamat panelen:

**Átadási idő / lead time**

A megjelenített értékek:

- Átlagos átadási rés;
- Medián átadási rés;
- Leghosszabb átadási rés;
- Build-lock várakozás;
- időbeli bottleneck;
- legnagyobb worker-átadási rések.

A felirat külön jelzi, hogy megfigyelt jelenléti ablakokról van szó.

## Source fájlok

- `app/lib/dev-center/developer-console.ts`;
- `components/admin/developer-console/types.ts`;
- `components/admin/developer-console/WeeklyDevelopmentSummary.tsx`;
- `components/admin/developer-console/DeveloperConsole.module.css`;
- `scripts/benjadmin-worker-presence-bridge.mjs`;
- `scripts/benjadmin-worker-presence-bridge-v1-contract.mjs`;
- `scripts/benjadmin-weekly-development-flow-v12-contract.mjs`;
- `scripts/benjadmin-weekly-development-flow-v12-runtime-browser-acceptance.mjs`;
- `scripts/benjadmin-weekly-development-flow-v12-timing-unit.mjs`.

## Release és validáció

- Feature / runtime source commit: **`b5d673522022b4e9285080647377ce6b90e6cbf4`** (`b5d6735`);
- canonical operator és `integration/benjadmin-dev` a runtime aktiváláskor: **`b5d6735`**;
- aktív DEV release: **`.next-benjadmin-weekly-flow-v12-release-b5d6735`**;
- BUILD_ID: **`6t8qQsOz3jTUOSkn2Tpy2`**;
- korábbi aktív release: `.next-terep-save-share-release-395e490`;
- DEV cutover: **2026-08-19 15:23:56–15:24:03 CEST**, exit 0;
- cutover backup: `/srv/dimpro-dev/backups/benjadmin-weekly-flow-v12-cutover-20260819T152355+0200`;
- artifact promotion backup: `/srv/dimpro-dev/backups/benjadmin-weekly-flow-v12-artifact-promotion-20260819T152144+0200`.

### Build megjegyzés

Az exact `b5d6735` source-ból az izolált V1.2 candidate build 2026-08-19 14:10:01–14:15:50 CEST között sikeresen elkészült, standalone ellenőrzéssel és 248 statikus chunk validációval. A canonical operator worktree-ben indított második release build 2026-08-19 14:22:33–14:49:43 CEST között `exit 143` értékkel megszakadt még `compile` fázisban, ezért a részleges artifact nem került használatba.

Mivel a sikeres candidate artifact **ugyanabból az exact `b5d6735` commitból** készült, és candidate + canonical-root runtime acceptance alatt is zöld volt, a hibás 1,1 MB-os partial release félretételre került, a validált candidate artifact pedig hardlink-alapú, tárhelytakarékos promotionnel kapta meg a canonical release nevet. A `.dimpro-release.json` canonical branch mezőre lett állítva, a build tartalma és BUILD_ID változatlan maradt.

### Source és statikus kapuk

- Flow V1 contract: **21/21 PASS**;
- Flow V1.1 contract: **19/19 PASS**;
- Flow V1.2 contract: **22/22 PASS**;
- Worker Presence bridge contract: **37/37 PASS**;
- build-lock timing unit: **12/12 PASS**;
- `npx tsc --noEmit`: **PASS**;
- célzott ESLint: **PASS**;
- teljes `npm run lint`: **0 error / 103 meglévő warning**;
- `git diff --check`: **PASS**.

### Runtime/browser acceptance

- exact candidate V1.2: **40/40 PASS**;
- promoted canonical release, temp runtime: **40/40 PASS**;
- aktív 3100-as DEV PM2 runtime post-cutover: **40/40 PASS**;
- kontrollált handoff fixture: **7 perc**;
- kontrollált lezárt build-lock fixture: **4 perc**;
- bottleneck fixture eredmény: **`HANDOFF_GAP`**;
- desktop overflow: **PASS**;
- mobil overflow: **PASS**.

### Élő regressziók

- Weekly Flow V1.1 runtime/browser: **34/34 PASS**;
- Weekly Summary V1 runtime/browser: **25/25 PASS**;
- Weekly Summary V1.1 runtime/browser: **35/35 PASS**;
- Common Chat V2 runtime/browser: **30/30 PASS**;
- Overnight Scheduler runtime: **30/30 PASS**;
- Overnight Scheduler browser: **14/14 PASS**.

### Post-cutover smoke

- PM2 `dimpro-benjadmin-operator-ui-v2-dev`: **online**;
- `NEXT_DIST_DIR`: `.next-benjadmin-weekly-flow-v12-release-b5d6735`;
- `/admin/dev-console`: **PASS**;
- `/terep`: **PASS**;
- `/api/field-capture/health`: **PASS**;
- `/api/dev/console/weekly-summary`: **PASS**;
- `productionAccess`: **DENY**.

## Biztonság

- csak DEV környezet módosult;
- PROD build/write/restart nem történt;
- `productionAccess: DENY` megmaradt;
- nincs új SQL migráció;
- a runtime acceptance izolált fixture adatokat használ és cleanupot futtat;
- a cutover rollback útvonala megőrzi a korábbi `.next-terep-save-share-release-395e490` release-t.
