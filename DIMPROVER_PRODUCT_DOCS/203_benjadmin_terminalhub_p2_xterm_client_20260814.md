# 203 — BENJADMIN Terminal Hub P2.3/P2.4 · XTerm kliens és reconnect UI

Dátum: 2026-08-14
Környezet: DEV feature worktree
Baseline: `5e07113`
Állapot: XTERM KLIENS KÓDOLVA · PROCESS ADAPTER TOVÁBBRA IS FAIL-CLOSED

## Elkészült

- `@xterm/xterm` kliens a Terminal Hub TERMINAL fülön;
- `@xterm/addon-fit` automatikus illesztés;
- oldalspecifikus XTerm stylesheet;
- munkakönyvtár mező;
- session indítás / leállítás / visszacsatolás UI;
- admin-autholt fetch alapú SSE olvasás;
- sequence alapú reconnect;
- automatikus reconnect állapot;
- `ResizeObserver` + FitAddon + resize API;
- terminál billentyűinput továbbítása az input API-ra;
- unmount cleanup: stream abort, timer cleanup, XTerm dispose;
- blokkolt security gate felhasználói megjelenítése;
- minimum 12 px saját Terminal Core UI tipográfia.

## Miért fetch-alapú SSE?

A natív `EventSource` nem támogatja a BENJADMIN admin auth fejléc közvetlen átadását. A P2 ezért `fetch()` response streamet olvas és maga dolgozza fel az SSE `event:` / `data:` blokkokat. Így:
- az admin header megmarad;
- a stream nem válik publikus endpointtá;
- a reconnect `after=<sequence>` alapján folytatható.

## Security

A kliens önmagában nem tud terminált indítani, ha a Terminal Core readiness BLOCKED.

A process adapter a server registry-ben továbbra is `null`, ezért:
- nincs shell processz;
- nincs root PTY;
- nincs PROD terminál;
- nincs Windows Bridge;
- nincs Live Workspace watcher.

## Ellenőrzések

- TypeScript: PASS;
- célzott ESLint: PASS;
- XTerm client contract: **16/16 PASS**;
- central-lockos Next build: PASS;
- build ID: `ImhcVwZ0xyDXHWD3VU1qJ`;
- `git diff --check`: PASS.

## Következő lépés

P2 security boundary:
1. dedikált nem-root terminál service identity;
2. process adapter;
3. idle timeout / maximum lifetime;
4. sanitized/audit stream külön adatút;
5. Managed Command + central lock;
6. security acceptance;
7. csak teljes PASS után DEV execution aktiválási döntés.
