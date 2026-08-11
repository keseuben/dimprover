# BENJADMIN UI V3 – Release / Audit / Licenc-AI analitika

Dátum: 2026-08-11

## Normatív alap

Ez a fejlesztési kör a három BENJADMIN átadási anyag közös szabályrendszerére épül:

- B3 teljes fejlesztői és kódolási átadás;
- B3.1 Control Plane / realtime napló / monitoring kiegészítés;
- B3.2 Partner Development Plane / OutminAI / külső termékek kiegészítés.

A kötelező crosswalk:

`143_benjadmin_b3_b31_b32_normative_crosswalk_20260811.md`

PROD nem módosult.

## Release UI V3

A Release nézet megőrizte a részletes verziótáblát és a Release Központ hivatkozást.

Új, valós `devVersions` adatokból számolt analitika:

1. `Release státusz`
   - tervezett;
   - fejlesztés / teszt;
   - blokkolt;
   - kész / kiadva.

2. `Modul aktivitás`
   - a legaktívabb modulok verziószám alapján.

3. `Release aktivitás`
   - 7 napos sparkline a verziók `completedAt` / `updatedAt` időpontjaiból.

## Audit UI V3

A részletes munkamenet/audit tábla változatlanul megmaradt.

Új analitika:

1. `Idő kategóriánként`
   - aktív fejlesztés;
   - build / teszt;
   - várakozás / blokk;
   - dokumentáció / release.

2. `Munkamenet forrás`
   - ChatGPT;
   - automatic;
   - manual;
   - system.

3. `Munkaidő trend`
   - 7 napos sparkline;
   - valós `durationMinutes` összegzés.

## Licenc / AI UI V3

A központi licencek és AI-keretek részletes táblái, lapozása és módváltása megmaradtak.

Új source-of-truth analitika az `/api/dev/engine/entitlements` adataiból:

1. `Licenc health`
   - aktív / trial;
   - lejárt;
   - blokkolt / revoked;
   - egyéb.

2. `Send entitlement`
   - aktív Send jogosultság;
   - aktuális havi felhasználás;
   - havi keret.

3. `AI budget health`
   - 80% alatti;
   - 80–99%;
   - 100% vagy nagyobb;
   - AI kikapcsolva.

Nem került be becsült vagy demo licenc-/AI-adat.

## Tipográfia és responsive

- az entitlement munkafelület explicit minimum 12 px tipográfiai floor-t kapott;
- Release és Audit a közös UI V3 workspace-szabályt használja;
- desktopon a chartok + részletes táblázat egy 1440×900 viewportban maradnak;
- tablet és 390 px mobil nézeten nincs teljes oldali vízszintes overflow;
- mindhárom chart responsive nézeten is megmarad.

## Acceptance

Új teszt:

`scripts/benjadmin-ui-v3-release-audit-entitlement-acceptance.mjs`

Eredmény:

**28/28 PASS**

Ellenőrzött:

- Entitlements API elérhető;
- Release három chart + részletes tábla;
- Audit három chart + részletes tábla;
- Licenc / AI három chart + részletes tábla;
- desktop horizontal overflow nincs;
- desktop one viewport;
- workspace tipográfia >=12 px;
- tablet overflow nincs;
- mobil overflow nincs;
- chart set responsive nézeten is megmarad.

## Regresszió

- TypeScript: PASS;
- full lint: 0 error / 108 meglévő warning;
- Operator UI: 30/30 PASS;
- `git diff --check`: PASS.

## DEV build

Aktív DEV build:

`Zw9JwXhr3C_JhndeoOPpB`

PM2:

`dimpro-benjadmin-operator-ui-v2-dev` – online.

## UI V3 állapot

Az alábbi fő Operator menük már rendelkeznek táblázatos + grafikonos V3 réteggel:

- Áttekintés;
- Taskok;
- Csapat;
- Worker-ek;
- Környezetek;
- Control;
- Partner fejlesztések;
- Release;
- Audit;
- Licenc / AI.

A következő fő funkcionális lépés a B3.2 P4 Partner Release / Handoff workflow. Ennek UI-ja már közvetlenül a V3 komponensrendszerre építhető.
