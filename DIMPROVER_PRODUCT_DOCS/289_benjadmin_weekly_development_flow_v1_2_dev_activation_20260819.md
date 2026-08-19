# 289 — BENJADMIN Weekly Development Flow V1.2 · handoff / lead-time analitika

**Dátum:** 2026-08-19
**Környezet:** kizárólag DEV
**Állapot:** release gate előtt · source validáció folyamatban · PROD DENY

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

## Jelenlegi source gate

- Flow V1 contract: **21/21 PASS**;
- Flow V1.1 contract: **19/19 PASS**;
- Flow V1.2 contract: **22/22 PASS**;
- Worker Presence bridge contract: **37/37 PASS**;
- build-lock timing unit: **12/12 PASS**;
- célzott ESLint: **PASS**;
- `git diff --check`: **PASS**;
- PROD access: **DENY**.

## Függő release gate

A következők csak a központi build-zár felszabadulása után futnak:

- `npx tsc --noEmit`;
- feature commit;
- exact candidate build;
- V1.2 runtime/browser acceptance;
- kapcsolódó regressziók;
- canonical integráció;
- combined release build és DEV cutover;
- teljes lint és végső smoke.

A jelen dokumentum a release gate sikeres lezárásakor frissítendő exact commit-, release- és build-azonosítókkal.

## Biztonság

- csak DEV környezet módosul;
- PROD build/write/restart nem engedélyezett;
- `productionAccess: DENY` megmarad;
- nincs új SQL migráció;
- a runtime acceptance izolált fixture adatokat használ és cleanupot futtat.
