# 226 — BENJADMIN Windows Bridge P8.1 · Windows E2E package

Dátum: 2026-08-15
Baseline: `b5bab0b`
Állapot: packaging tooling kész; valódi Windows E2E még nem futott.

## Cél
A P8.1 agent és agent-manager reprodukálható, ellenőrizhető Windows tesztcsomagba szervezése anélkül, hogy terminal/PowerShell execution képességet nyitnánk.

## Builder
`scripts/benjadmin-windows-bridge-p81-package.mjs`

Kimenet:
`dist/benjadmin-windows-bridge-p81/`

A `dist/` csak generált artifact, nem forrás és nem kerül commitba.

## Csomagtartalom
- `benjadmin-windows-bridge-agent-p81.ps1`;
- `benjadmin-windows-bridge-agent-manager-p81.ps1`;
- `manifest.json`;
- `VERIFY-AND-INSTALL.ps1`;
- `SELF-CHECK.ps1`;
- `PAIR.ps1`;
- `HEARTBEAT-ONCE.ps1`;
- `UNINSTALL.ps1`;
- `README.txt`.

## Biztonság
A manifest explicit:
- protocolVersion = 1;
- executionEnabled = false;
- autoStart = false.

A `VERIFY-AND-INSTALL.ps1` telepítés előtt SHA-256-tal ellenőrzi a két core PowerShell scriptet. SHA eltérés, hiányzó fájl vagy `executionEnabled != false` esetén fail-closed.

A wrapper scriptek nem tartalmaznak:
- `Invoke-Expression`;
- `Start-Process`;
- automatikus indulást;
- command/execution channel implementációt.

A Pair wrapper explicit PairingId + PairingCode paramétert kér. A heartbeat teszt `Once` módban fut. Az uninstall a meglévő agent-manageren keresztül történik.

## Acceptance
- package contract: **13/13 PASS**;
- package builder célzott lint: PASS;
- npm dependency baseline változatlan: 15 finding;
- Linux DEV VPS-en PowerShell runtime nincs, ezért a tényleges Windows futtatás külön E2E gate.

## Következő Windows E2E
1. package generálás;
2. artifact SHA rögzítés;
3. Windows tesztgépen VERIFY-AND-INSTALL;
4. SELF-CHECK;
5. DB migration + pairing secret után Pair;
6. Konzolban device approval;
7. HEARTBEAT-ONCE;
8. revoke;
9. heartbeat elutasítás revoke után;
10. UNINSTALL.

A Windows E2E alatt is `BENJADMIN_WINDOWS_BRIDGE_EXECUTION_ENABLED=0` marad.
