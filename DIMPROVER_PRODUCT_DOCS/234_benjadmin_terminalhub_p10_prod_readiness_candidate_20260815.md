# 234 — BENJADMIN Terminal Hub P10 · PROD readiness foundation candidate

Dátum: 2026-08-15
Baseline: `0274103`
Branch: `feat/benjadmin-terminalhub-p10-prod-readiness`
Állapot: P10 FOUNDATION CANDIDATE KÉSZ · valódi PROD kapcsolat/execution NINCS.

## Cél
A Terminal Hub P10 előkészíti a PROD readiness modellt anélkül, hogy PROD shellt, SSH-t, deployt, restartot vagy migrációt nyitna.

## Feature flagek
Új readiness-only flagek:
- `BENJADMIN_PROD_READINESS_ENABLED`;
- `BENJADMIN_PROD_READONLY_CONNECTOR_ENABLED`.

Mindkettő default false. A connector flag csak a readiness flag mögött lehet effektív.

Ezek NEM execution flagek.

## P10 policy
- start mode: `PROD_START`;
- production default: `READ_ONLY`;
- AI visibility: `BLOCKED`;
- browser direct SSH: false;
- RAW PROD → AI: false;
- mutating commands default allowed: false;
- explicit approval required: true;
- release gate required: true;
- rollback point required: true;
- separate connector required: true;
- read-only smoke nem igényel terminal executiont.

## Fail-closed szabály
Read-only smoke csak akkor lehet `READ_ONLY_READY`, ha:
- P10 readiness flag ON;
- read-only connector flag ON;
- PROD terminal execution OFF;
- Terminal execution OFF;
- Windows Bridge execution OFF.

Ha bármely execution flag ON, P10 state = `BLOCKED`.

## API
Admin-only GET:
`/api/dev/terminal-hub/prod-readiness`

Nincs POST / PUT / PATCH / DELETE.
Az API nem indít processzt és nem ír adatbázisba.

## UI
Új `PROD READINESS · P10` panel a Terminal Hub TERMINAL nézetében:
- READ ONLY;
- AI BLOCKED;
- külön connector;
- PROD terminal / terminal execution / Windows execution állapot;
- approval kötelező;
- rollback kötelező.

Nincs Connect / SSH / Run / Deploy / Restart / Migration / Futtatás gomb.

## Contract és build
- P10 saját security contract: **40/40 PASS**;
- teljes P2–P10 + Drive Security/Backfill regresszió: **661/661 PASS**;
- TypeScript: PASS;
- célzott lint: PASS;
- teljes lint: **0 error / 104 meglévő warning**;
- candidate build: `NHyoN_VzDcY49Q20zEKiq` PASS.

## Candidate runtime acceptance
Csak a 3199-es izolált candidate-ben:
- `BENJADMIN_PROD_READINESS_ENABLED=1`;
- `BENJADMIN_PROD_READONLY_CONNECTOR_ENABLED=1`;
- `BENJADMIN_PROD_TERMINAL_ENABLED=0`;
- `BENJADMIN_TERMINAL_EXECUTION_ENABLED=0`;
- `BENJADMIN_WINDOWS_BRIDGE_EXECUTION_ENABLED=0`.

Readiness API:
- state: `READ_ONLY_READY`;
- readOnlySmokeAllowed: true;
- AI: BLOCKED;
- production default: READ_ONLY;
- minden execution flag: false;
- auth nélkül: 401.

Headless browser:
- P10 panel: PASS;
- approval/rollback policy: PASS;
- tiltott action gombok: 0;
- console/page/network/external errors: **0/0/0/0**.

A candidate teszt nem csatlakozott PROD hosthoz, nem használt PROD credentialt és nem futtatott PROD smoke parancsot.

## Következő lépés
P10.1 lehet a külön read-only PROD connector konkrét transport/security implementációja. Ennek továbbra is credential-reference alapúnak, AI-blockednak és írásképtelennek kell maradnia. Valódi PROD read-only smoke csak külön, dokumentált readiness és explicit felhasználói engedély után végezhető.

PROD nem módosult.
