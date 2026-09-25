# BENJADMIN Developer Grid v0.1.69 – Markerless Rollover ACK Tolerance

Date: 2026-09-25
Environment: DEV ONLY
Production access: DENY

## Trigger

A v0.1.68 fizikai rollover E2E során JázminAI a Central Core által előírt ACK JSON-t tartalmilag pontosan visszaadta, de a `BENJADMIN_CONVERSATION_ROLLOVER_ACK_V1` marker kimaradt. A korábbi Desktop ezt már a validator előtt figyelmen kívül hagyta, ezért a session nem jutott tovább READY állapotba.

## Döntés

A rendszer ne legyen indokolatlanul törékeny egy formázási marker hiányára, de az authoritative identity/provenance védelem maradjon szigorú.

Elfogadott marker nélküli fallback kizárólag akkor:
- a teljes assistant-válasz egyetlen JSON objektum; vagy
- a teljes assistant-válasz egyetlen `json` fenced blokk;
- minden kötelező mező pontosan egyezik: task, session, worker, previous conversation, Context Snapshot, revision, Handoff Pack, source HEAD, source proof;
- `productionAccess = DENY`, `sameTask = true`, `newTaskLaunch = false`;
- nincs extra JSON mező;
- nincs a JSON előtt vagy után magyarázó szöveg.

Bármely eltérés továbbra is fail-closed BLOCKED.

## Implementáció

- `conversation-rollover.cjs`: `STRICT_JSON_ONLY_FALLBACK` parser mód.
- A markerrel érkező eredeti protokoll változatlan és elsődleges.
- `main.cjs`: ACK_WAIT állapotban nincs marker előszűrés a validator előtt.
- Conversation monitor: a marker-alapú historical recovery megmarad; marker hiányában csak a legfrissebb assistant-válasz strict JSON-only formája vizsgálható, így régi tetszőleges JSON üzenet nem válhat ACK-ká.
- v0.1.68 execution-authority recovery contract bekerült a teljes Desktop regression láncba.
- Új `markerless-rollover-ack-v0169-contract.mjs` fizikai regressziós contract készült.

## Validáció

- Markerless Rollover ACK v0.1.69 contract: 10/10 PASS.
- v0.1.68 Execution Authority Recovery regression: 24/24 PASS.
- v0.1.67 Rollover Execution Bridge regression: 21/21 PASS.
- Full Desktop regression: PASS.
- TypeScript: PASS.
- Lint: 0 errors; az új v0.1.69 contract külön ESLint PASS, új warning nincs.

## Nem változik

- nincs új Grid task/session/worktree/TASK_LAUNCH rollover recovery miatt;
- source proof és HEAD ellenőrzés nem lazul;
- production access DENY marad;
- direct worker-side DEV source MCP/raw-shell továbbra is tiltott a rollover protokollban;
- Work first-party surface továbbra is fail-closed/planned; következő célverzió v0.1.70.
