# 224 — BENJADMIN Windows Bridge P8.1 hardening candidate

Dátum: 2026-08-15
Branch: `feat/benjadmin-windows-bridge-p81-hardening`
Baseline: `6983e1b`
Állapot: hardening candidate kész; DB migration továbbra is pending; Bridge/Pairing/Execution OFF.

## Cél
A P8.1 secure pairing kódréteg további keményítése anélkül, hogy PowerShell execution vagy DB migration megnyílna.

## 1. Pairing cryptographic core
Új modul:
- `app/lib/dev-center/terminal-hub/windows-bridge-pairing-core.ts`

Tartalom:
- pairing kód normalizálás;
- 10 karakteres, félreérthető karakterektől mentes pairing kód;
- HMAC-SHA256 pairing hash;
- SHA-256 claim/device token hash;
- timing-safe hash összehasonlítás;
- 5 próbálkozásos limit konstans.

A tényleges pairing repository ezt a core modult használja, a kriptográfiai logika nincs duplikálva.

## 2. Pairing/device state machine
Új modul:
- `app/lib/dev-center/terminal-hub/windows-bridge-pairing-state.ts`

Explicit megengedett állapotátmenetek:
- pairing: pending -> claimed/expired/locked/cancelled; claimed -> completed/expired/cancelled;
- completed/expired/locked/cancelled terminális;
- device: pending -> approved/revoked/blocked; approved -> active/revoked/blocked; active -> revoked/blocked;
- revoked/blocked -> pending reparing megengedett.

## 3. Core runtime acceptance
Új script:
- `scripts/benjadmin-windows-bridge-p81-core-acceptance.mjs`

Node 22 built-in TypeScript strip-types módban fut, új dependency nélkül.

Eredmény: **25/25 PASS**.

Teszteli többek között:
- pairing kód formátum;
- félreérthető `0/1/I/L/O` karakterek hiánya;
- 500 elemű kis mintában uniqueness;
- token base64url formátum;
- HMAC pairing ID- és secret-kötés;
- tagolásfüggetlen pairing normalizálás;
- timing-safe hash compare;
- pairing/device state-machine alapátmenetek.

## 4. DB migration readiness API
Új modul/API:
- `app/lib/dev-center/terminal-hub/windows-bridge-migration-readiness.ts`
- `GET /api/dev/terminal-hub/windows-bridge/migration-readiness`

Admin-only és read-only.

Kizárólag boolean állapotokat ad vissza:
- DEV target configured;
- DB URL configured;
- DB password configured;
- PROD target configured;
- pairing secret configured;
- migration file/SHA állapot;
- Bridge/Pairing/Execution/TerminalExecution/PROD OFF safety.

Sem DB URL, sem DB password, sem pairing secret érték nem kerül a response-ba.

## 5. Terminal Hub migration readiness UI
A P8.1 Windows Bridge panel új `DB MIGRATION READINESS` blokkot kapott.

Jelenlegi DEV candidate állapot:
- DEV target: rendben;
- DB URL: hiányzik;
- DB jelszó: hiányzik;
- PROD target: hiányzik;
- pairing secret: nincs provisionálva;
- migration SHA: érvényes;
- DB preflight: nem indítható;
- Apply safety: minden kapcsoló OFF;
- teljes Apply Gate: BLOKKOLT.

Fontos: az `Apply safety` csak a runtime safety kapcsolókat mutatja; nem keveredik a credential-ready állapottal.

## 6. Windows agent manager
Új script:
- `scripts/benjadmin-windows-bridge-agent-manager-p81.ps1`

Módok:
- `Install`;
- `SelfCheck`;
- `Uninstall`.

Biztonsági szabályok:
- csak Windows;
- csak HTTPS server URL;
- user-local `%LOCALAPPDATA%\\DIMPRO\\BenjAdminBridge` telepítési hely;
- aktuális Windows userre szűkített ACL;
- nincs scheduled task;
- nincs auto-start;
- nincs `Start-Process` / `Invoke-Expression` / powershell.exe / pwsh.exe indítás;
- executionEnabled=false;
- uninstall törli a helyi DPAPI device tokent;
- szerveroldali revoke továbbra is külön BENJADMIN admin művelet.

A Large DEV Linux VPS-en `pwsh` nincs telepítve, ezért a PowerShell manager és agent tényleges Windows runtime tesztje a későbbi Windows E2E gate része.

## Acceptance
- P8 contract: **37/37 PASS**;
- P8.1 contract: **44/44 PASS**;
- migration-gate contract: **23/23 PASS**;
- pairing core acceptance: **25/25 PASS**;
- hardening contract: **30/30 PASS**;
- teljes P2–P8.1 hardening regresszió: **407/407 PASS**;
- TypeScript: PASS;
- célzott lint: PASS;
- teljes lint: **0 error / 104 meglévő warning**;
- candidate build: **`-xk17JxdeGm6D89CpcKCC` PASS**.

### Candidate runtime
Admin migration-readiness:
- `readyForPreflight=false`;
- `readyForApplyAttempt=false`;
- DEV target=true;
- DB URL=false;
- DB password=false;
- PROD target=false;
- pairing secret=false;
- migration SHA=true;
- safety all OFF=true;
- blockers=3.

### Headless browser
- `DB MIGRATION READINESS` panel: PASS;
- teljes Apply Gate: BLOKKOLT;
- migration SHA: érvényes;
- Apply safety: minden kapcsoló OFF;
- credential értékek/env-nevek nem jelennek meg;
- console/page/network/external errors: **0/0/0/0**;
- migration readiness auth nélkül: **401**.

## Továbbra is blokkolt
- P8.1 DB migration nincs alkalmazva;
- pairing secret nincs provisionálva;
- Windows Bridge OFF;
- Pairing OFF;
- Execution OFF;
- Terminal Execution OFF;
- PROD Terminal OFF.

Következő E2E gate továbbra is: hitelesen azonosított DEV PostgreSQL credential + külön PROD target -> backup -> migration -> secure pairing secret -> Windows gépes Pair/Approve/Heartbeat/Revoke teszt.

PROD nem módosult.
