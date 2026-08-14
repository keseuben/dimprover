# 219 — BENJADMIN Windows Desktop Bridge P8 · foundation candidate

Dátum: 2026-08-14
Branch: `feat/benjadmin-windows-bridge-p8`
Baseline: `e2b372a`
Állapot: FOUNDATION CANDIDATE KÉSZ · live Windows Bridge flag továbbra is OFF.

## Cél
A P8 első biztonsági alaprétege készült el. Ez még NEM futtat PowerShellt és NEM párosít Windows gépet.

## Architektúra
- külön `BENJADMIN_WINDOWS_BRIDGE_ENABLED` főflag;
- külön implementation kill switch: `BENJADMIN_WINDOWS_BRIDGE_PAIRING_ENABLED`;
- külön implementation kill switch: `BENJADMIN_WINDOWS_BRIDGE_EXECUTION_ENABLED`;
- protocol v1;
- kizárólag outbound HTTPS helyi Windows agent;
- nincs bejövő Windows port;
- böngésző nem érheti el közvetlenül a PowerShell processzt;
- böngésző → localhost bridge tiltott;
- Bridge credential csak Windows Credential Manager / DPAPI irányban tárolható;
- egy későbbi one-time pairing kód max. 600 s élettartamú lehet;
- PROD execution P8 Bridge-ből tiltott.

## Adatbiztonság
- RAW: csak jogosult emberi UI;
- SANITIZED: AI számára szűrt;
- AUDIT: maszkolt metaadat;
- AgentHello / Heartbeat contract nem tartalmaz raw commandot vagy secret/token értéket.

## Jelenlegi API/UI
- admin-only GET: `/api/dev/terminal-hub/windows-bridge/readiness`;
- nincs pairing POST API;
- nincs command/execution API;
- Terminal Hub TERMINAL nézetben külön `WINDOWS DESKTOP BRIDGE · P8` readiness/security kártya;
- nincs Pair, Connect, Run PowerShell vagy Futtatás gomb.

## P2 fázis-kompatibilitás
A P2 Terminal Core readiness többé nem tekinti hibának, hogy a későbbi P4/P8 modulok léteznek. A valódi terminál továbbra is az execution kill switch + nem-root OS identity + PROD deny miatt zárt.

## Acceptance
- P8 security/architecture contract: **37/37 PASS**;
- teljes P2–P8 regresszió: **285/285 PASS**;
- TypeScript: PASS;
- célzott lint: PASS;
- teljes lint: **0 error / 104 meglévő warning**;
- candidate build: `KOmvZk0hgmH4AAeLbH6po` PASS.

### Candidate runtime
Bridge főflag: ON kizárólag tesztre.
Pairing: OFF.
Execution: OFF.
PROD: OFF.
Readiness state: `PAIRING_DISABLED`.

### Headless browser
- P8 panel: PASS;
- outbound-only transport: PASS;
- Windows Credential Manager/DPAPI policy: PASS;
- pairing/execution OFF: PASS;
- PROD false: PASS;
- nincs Pair/Connect/Run PowerShell: PASS;
- régi `KORAI FLAG ON` P2 üzenet eltávolítva: PASS;
- console/page/network/external errors: **0/0/0/0**.

Readiness API auth nélkül: **401 PASS**.

## Következő P8 al-fázis
A tényleges helyi Windows agent/pairing csak külön security design + acceptance után készülhet. A live DEV-en a Bridge, pairing és execution flagek mind OFF maradjanak addig.

PROD nem módosult.
