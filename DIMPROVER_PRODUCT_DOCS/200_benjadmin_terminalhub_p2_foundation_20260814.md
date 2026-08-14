# 200 — BENJADMIN Terminal Hub P2 · DEV Terminal Core foundation

Dátum: 2026-08-14
Környezet: DEV feature worktree
Kiinduló baseline: `d14404a`
Worktree: `/srv/dimpro-dev/worktrees/benjadmin-terminalhub-p2`
Állapot: P2 FOUNDATION KÓDOLVA · VALÓDI PTY MÉG NEM AKTÍV

## Cél

A 06-os Terminal Hub terv P2 DEV Terminal Core fázisának biztonságos előkészítése. A P2 célja a DEV shell session, stream, resize, reconnect és session lifecycle, de a tényleges shell-processz csak külön nem-root OS-identitás és explicit execution gate után aktiválható.

## Elkészült

- külön P2 worktree és rollback backup;
- `node-pty`, `@xterm/xterm`, `@xterm/addon-fit` függőségek rögzítve;
- dependency security összevetés: production audit baseline 13 high, P2 candidate 13 high; a három új dependency nem növelte a production vulnerability countot és nem jelent meg új direct vulnerable dependencyként;
- nem-root terminál OS-identitás konfigurációs gate:
  - `BENJADMIN_TERMINAL_UID`;
  - `BENJADMIN_TERMINAL_GID`;
  - opcionális label/home/shell;
  - root UID/GID fail-closed tiltás;
- Terminal Core readiness service;
- admin-only `/api/dev/terminal-hub/readiness` endpoint;
- session lifecycle TypeScript szerződés:
  - BLOCKED;
  - STARTING;
  - RUNNING;
  - DISCONNECTED;
  - EXITED;
  - CLOSED;
  - FAILED;
- create/resize/input protokolltípusok;
- Terminal Hub TERMINAL fül P2 candidate gate UI;
- blokkoló okok, execution flag, nem-root identitás, PROD/Live Workspace/Windows Bridge állapot megjelenítése;
- P2 foundation contract: **12/12 PASS**;
- TypeScript: PASS;
- célzott ESLint: PASS;
- `git diff --check`: PASS.

## Biztonsági döntés

A BENJADMIN Next/PM2 runtime jelenleg rootként fut. A P2 ezért nem örökölheti ezt az identitást interaktív terminálhoz.

Kötelező szabály:
- root PTY tilos;
- külön, explicit nem-root UID/GID szükséges;
- execution kill switch addig OFF;
- PROD terminal OFF;
- Live Workspace OFF;
- Windows Bridge OFF.

A jelenlegi MCP/tool security gate a közvetlen shell-processz indítását tartalmazó kódírást blokkolta. A védelmet nem kerültük meg. Emiatt a tényleges PTY session-manager és process adapter a következő P2 alblokk, külön biztonsági megoldással.

## Dependency audit

Stabil operator baseline production audit:
- total high: 13;
- direct érintett meglévő csomagok: next, pdfjs-dist, puppeteer, xlsx.

P2 candidate production audit:
- total high: 13;
- ugyanaz a direct lista.

Tehát a P2 három új terminál dependencyje a jelenlegi audit szerint nem növelte a production sebezhetőségi darabszámot. Ez nem jelenti a teljes dependency-fa általános security lezárását; a meglévő 13 high külön platform-hardening feladat.

## Következő P2 alblokk

1. dedikált nem-root terminal service identity/provisioning;
2. PTY adapter biztonsági boundary;
3. session registry;
4. create/list/close API;
5. SSE output stream + reconnect sequence;
6. input API + méretlimit;
7. resize API;
8. XTerm kliens + FitAddon;
9. idle timeout / max lifetime;
10. Managed Command central lock integráció;
11. P2 security acceptance + build + candidate smoke;
12. csak ezután DEV execution aktiválási döntés.

PROD nem módosult.
