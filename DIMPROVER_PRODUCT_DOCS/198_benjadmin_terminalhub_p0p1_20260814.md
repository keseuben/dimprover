# 198 — BENJADMIN Terminal Hub / Live Workspace · P0 + P1 checkpoint

Dátum: 2026-08-14
Környezet: DEV
Normatív előzmény: `197_benjadmin_terminalhub_normative_checkpoint_20260814.md`
Kiinduló commit: `e3c7f1b`
Feature build: `scJ2uL5sg-uFplMApOoht`
Állapot: P0 FOUNDATION + P1 UI SHELL KÓDOLVA, DEV AKTIVÁLÁS ELŐTTI CHECKPOINT

## 1. Megvalósított cél

A 06-os Terminal Hub / Live Workspace fejlesztési terv első két fázisa a meglévő BENJADMIN Fejlesztői Konzol fölé épült, új párhuzamos task/session/worktree vagy build motort nem hozott létre.

P0 cél:
- security és típuskontraktus;
- feature flag réteg;
- central lock read model;
- allowlist-first workspace policy;
- RAW / SANITIZED / AUDIT adatkezelési alap;
- admin-only státusz API;
- valódi terminál-végrehajtás nélkül.

P1 cél:
- kompakt Terminal Hub kártya a jobb oldali Élő munka panelben;
- nagy, lebegő/dokkolható Terminal Hub munkaterület;
- TERMINAL / TERMINÁL PARANCSTÁR / LIVE WORKSPACE / SESSIONS / AUDIT fülek;
- Világos / Sötét / Sunlight öröklött téma;
- ESC bezárás;
- meglévő BENJADMIN session és audit read model újrahasznosítása.

## 2. Új backend modulok

- `app/lib/dev-center/terminal-hub/types.ts`
  - TerminalKind;
  - AiVisibilityMode;
  - CommandRisk;
  - TerminalDataClass;
  - környezet-, endpoint-, feature- és status típusok.

- `app/lib/dev-center/terminal-hub/config.ts`
  - `BENJADMIN_TERMINAL_HUB_ENABLED`;
  - `BENJADMIN_LIVE_WORKSPACE_ENABLED`;
  - `BENJADMIN_TERMINAL_EXECUTION_ENABLED`;
  - `BENJADMIN_DESKTOP_BRIDGE_ENABLED`;
  - allowlistelt workspace rootok.

- `app/lib/dev-center/terminal-hub/status.ts`
  - BENJADMIN Managed / DEV / PROD / PowerShell / Git állapot read model;
  - central exclusive operation lock állapot;
  - P0/P1 security státusz;
  - PROD `LOCKED`, AI `blocked`, execution false.

- `app/lib/dev-center/terminal-hub/workspace-policy.ts`
  - abszolút path követelmény;
  - `realpath()` feloldás;
  - allowlist-root ellenőrzés `path.relative()` alapon;
  - symlink/path traversal escape fail-closed tiltás.

- `app/lib/dev-center/terminal-hub/data-policy.ts`
  - a meglévő Külső AI Worker `secret-scanner` újrahasznosítása;
  - érzékeny terminálszöveg SANITIZED/AUDIT nézetben maszkolt;
  - új, párhuzamos secret scanner nem készült.

- `app/api/dev/terminal-hub/status/route.ts`
  - kizárólag read-only GET;
  - BENJADMIN admin authorizáció kötelező;
  - nincs command execution endpoint.

## 3. Új frontend komponensek

- `TerminalHubCard.tsx`
  - jobb oldali kompakt státuszkártya;
  - 5 másodperces silent status refresh;
  - Managed / DEV / PROD / AI státusz;
  - feature flag nélkül megnyitás tiltott.

- `TerminalHubWorkspace.tsx`
  - nagy Terminal Hub réteg;
  - lebegő és dokkolt nagy nézet;
  - öt fő fül;
  - P1-ben minden végrehajtási felület explicit placeholder/readiness állapot;
  - Sessions és Audit a meglévő ConsoleLiveState adatot mutatja read-only.

Meglévő komponens integráció:
- `LiveWorkPanel.tsx` — Terminal Hub kártya;
- `DeveloperConsoleShell.tsx` — open/close state, ESC bezárás, nagy munkaterület;
- `DeveloperConsole.module.css` — önálló Terminal Hub stílusréteg, reszponzív működés, minimum 12 px Terminal Hub tipográfia.

## 4. Biztonsági állapot

P0/P1-ben NINCS:
- shell processzindítás;
- SSH végrehajtás;
- PowerShell processz;
- XTerm;
- Monaco;
- Chokidar watcher;
- Desktop Bridge;
- PROD write;
- command execution API.

Feature flag alapállapot a 06-os terv szerint:
- Terminal Hub UI: alapból OFF, DEV aktiváláskor külön bekapcsolható;
- Terminál Parancstár: OFF;
- Live Workspace: OFF;
- Multi-panel: OFF;
- Windows Bridge: OFF;
- PROD terminal: OFF;
- Secret Vault: OFF.

Implementációs extra kill switch:
- Terminal execution: OFF.

PROD:
- endpoint read model `LOCKED`;
- AI visibility `blocked`;
- execution `false`;
- nincs olyan P0/P1 kódút, amely PROD parancsot hajtana végre.

## 5. Terminál adatfolyam

P0 contract:

`RAW -> SANITIZED -> AUDIT`

- RAW: csak későbbi jogosult emberi UI / végrehajtási réteg számára;
- SANITIZED: AI számára csak szűrt adat;
- AUDIT: maszkolt, normalizált meta/parancsnézet;
- a P0/P1 UI jelenleg nem fogad és nem streamel valós terminál RAW adatot.

## 6. Terminál Parancstár névszabály

- `ChatGPT Parancstár`: a már meglévő prompt- és átadósablon tár.
- `Terminál Parancstár`: a P3-ban készülő deduplikált shell/Git/PowerShell parancstudástár.

A P1 felületen a Terminál Parancstár csak tervezett állapotot mutat, futtatási lehetőség nélkül.

## 7. Ellenőrzések

- TypeScript: PASS.
- célzott ESLint: PASS.
- teljes `npm run lint`: PASS, 0 error / 104 meglévő warning.
- `git diff --check`: PASS.
- P0/P1 contract: **19/19 PASS**.
- koordinált Next build central lockon keresztül: PASS.
- feature build ID: `scJ2uL5sg-uFplMApOoht`.
- izolált 3199 candidate `/admin/dev-console`: HTTP 200.
- izolált 3199 candidate `/api/dev/terminal-hub/status` jogosultság nélkül: HTTP 401, fail-closed.

A 19 pontos contract ellenőrzi többek között:
- öt TerminalKind típust;
- AI visibility módokat;
- RAW/SANITIZED/AUDIT osztályokat;
- négy feature flaget;
- execution/Desktop Bridge default OFF állapotot;
- PROD fail-closed állapotot;
- DEV státusz és execution szétválasztását;
- central lock követelményt;
- allowlist + realpath workspace policy-t;
- meglévő secret scanner újrahasznosítását;
- admin-only API-t;
- UI bekötést és ESC bezárást;
- öt fő fület;
- valós shell tiltását;
- minimum 12 px Terminal Hub UI tipográfiát;
- Monaco/XTerm/Chokidar korai dependency hiányát;
- shell-processz indítás hiányát;
- 197-es normatív checkpoint jelenlétét.

## 8. Aktiválási szabály

DEV aktiváláskor kizárólag:

`BENJADMIN_TERMINAL_HUB_ENABLED=1`

kapcsolható be.

A következők maradjanak OFF / hiányzó értéken:
- `BENJADMIN_COMMAND_LIBRARY_ENABLED`;
- `BENJADMIN_LIVE_WORKSPACE_ENABLED`;
- `BENJADMIN_MULTI_PANEL_ENABLED`;
- `BENJADMIN_WINDOWS_BRIDGE_ENABLED`;
- `BENJADMIN_PROD_TERMINAL_ENABLED`;
- `BENJADMIN_SECRET_VAULT_ENABLED`;
- `BENJADMIN_TERMINAL_EXECUTION_ENABLED` (implementációs extra kill switch).

A P1 aktiválás után a felhasználó már láthatja és megnyithatja a Terminal Hub felületet, de parancsot nem tud végrehajtani.

## 9. Következő fejlesztési fázis

P2 — DEV Managed Terminal.

P2 csak külön checkpoint után indulhat. Kötelezően:
- a meglévő central operation lockot használja;
- allowlistelt managed operation szerződésekből dolgozzon;
- raw shell ne legyen alapértelmezett út;
- redaction pipeline bővítése és tesztje előzze meg az AI-visible outputot;
- PROD továbbra is zárt maradjon.

P3 Terminál Parancstár és P4 Live Workspace csak P2 külön acceptance után következzen.

PROD ebben a checkpointban nem módosult.
