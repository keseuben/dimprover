# 274 — BENJADMIN Scheduler + Worker Presence V2 · DEV aktiválás

**Dátum:** 2026-08-18  
**Állapot:** DEV aktív · BLOKK 5 KÉSZ · BLOKK 6 regresszió KÉSZ · PROD változatlan

## Aktív DEV release

- runtime source / integration: `4c3244c3aac961a3e315e68eeef43401c508bbf7`
- build ID: `uy2P79yuSi_7fg8H65uVa`
- release: `.next-benjadmin-scheduler-presence-v2-4c3244c`
- rollback release: `.next-benjadmin-context-unified-v2-d13cbac`
- integration ref: `integration/benjadmin-dev -> 4c3244c`
- PM2 UI: online · unstable restart 0
- PM2 monitor: online · unstable restart 0
- PROD access: `DENY`

## Elkészült működés

A Development Scheduler valós `development_scheduler_run` decision-memory rekordjai közvetlen Worker Presence evidenciaforrások. A scheduler-run determinisztikus `schedule + slot + worker` presence-kulcsot kap, ezért retry vagy missed-wake nem hoz létre duplikált worker-kártyát.

A BENJADMIN worker-kártyán scheduler futás esetén megjelenik:

- Főmodul → Modul → Kontextus Modul / Almodul → Munkarész;
- 6/x munkafázis;
- scheduler run azonosító és slot;
- indulás és heartbeat;
- következő lépés;
- kizárólagos build/restart/migration/release lock miatti várakozás;
- automatikus worker jelenlét külön ChatGPT-kézi activity nélkül.

A session evidence továbbra is magasabb prioritású a scheduler evidence-nél. PROD hozzáférés minden scheduler/presence ágon tiltott.

## E2E-ben talált és javított hibák

### 1. Planning fázis hibás 6/2 értéke

A Worker Presence metadata objektumban a `workStageIndex` kétszer szerepelt, ezért a scheduler explicit 6/1 értékét a phase fallback felülírta. A `planning` fallback is 6/2 volt.

Javítás: `cede2ee` — `fix(benjadmin): preserve scheduler presence stage`

- analysis/planning/preparation → 6/1;
- test/testing → 6/3;
- review/fix → 6/4;
- build/commit/release → 6/5;
- close/closing/handoff → 6/6;
- explicit scheduler `workStageIndex` elsőbbséget kap.

### 2. Scheduler PresenceContext eltűnt assigned task mellett

A worker-kártya a normál task-contextet renderelte, amint a scheduler ÁrminAI/JázminAI workerhez rendelte a taskot. Emiatt a scheduler run, heartbeat és next-step mezők nem kerültek DOM-ba.

Javítás: `4c3244c` — `fix(benjadmin): show scheduler presence on assigned worker`

Aktív scheduler-run esetén a `PresenceContext` elsőbbséget kap a normál task-contexttel szemben.

## Candidate és runtime acceptance

### Exact candidate `4c3244c`

- Next compile: PASS
- standalone assets: **248/248 PASS**
- candidate build ID: `uy2P79yuSi_7fg8H65uVa`
- candidate dev-console: HTTP 200
- candidate dev-map: HTTP 200
- candidate live API: HTTP 200
- Scheduler runtime: **30/30 PASS**
- Scheduler browser: **14/14 PASS**
- Scheduler Presence célzott API + Chromium E2E: **16/16 PASS**

### Aktív 3100 DEV runtime

A monitor loopot újraindítás után külön, valós scheduler-run fixture-rel ellenőriztük. A fixture scheduler API-val és `/scheduler/tick` hívással készült; a presence bridge-et nem hívtuk kézzel.

- monitor automatikus scheduler-run felismerés: PASS
- felismerési idő az acceptance-ben: **21 másodperc**
- inferredBy: `scheduler-run`
- 6/1 planning: PASS
- next-step: PASS
- PROD DENY: PASS
- élő desktop Chromium: PASS
- élő 390 px mobil Chromium: PASS
- monitor/live E2E: **14/14 PASS**

## BLOKK 6 végső regresszió

- TypeScript `npx tsc --noEmit`: PASS
- teljes lint: **0 error**, 103 meglévő warning
- Worker Presence V1: **27/27 PASS**
- Common Chat V2: **28/28 PASS**
- Worker Activity + Archive: **27/27 PASS**
- Worker Context Cards V1: **20/20 PASS**
- Development Map V1 regresszió: **25/25 PASS**
- Map Theme + Worker Attribution: **16/16 PASS**
- Context Unified V2: **10/10 PASS**
- Overnight Scheduler V1: **32/32 PASS**
- Scheduler + Worker Presence V2: **17/17 PASS**
- `git diff --check`: PASS

## Végső DEV health

A build utáni swapmaradvány karbantartási lock alatt kiürítésre került.

- BENJADMIN DEV VPS: `ok`
- RAM használat: ~30%
- swap: **0%**
- disk: ~73%
- central development lock: FREE
- UI PM2: online
- monitor PM2: online
- unstable restarts: 0

## Biztonság

A fejlesztés, build, candidate, scheduler acceptance és cutover kizárólag DEV környezetben történt. PROD alkalmazásmódosítás nem történt. A scheduler és worker-presence metadata minden új útvonalán `productionAccess: DENY` maradt.
