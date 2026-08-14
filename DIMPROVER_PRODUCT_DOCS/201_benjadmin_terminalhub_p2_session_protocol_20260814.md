# 201 — BENJADMIN Terminal Hub P2.2 · session / stream / reconnect protocol

Dátum: 2026-08-14
Környezet: DEV feature worktree
Baseline: `f98a1af`
Állapot: SESSION PROTOCOL KÓDOLVA · PROCESS ADAPTER FAIL-CLOSED

## Elkészült

- in-memory Terminal Session Registry;
- session lifecycle metadata;
- owner-alapú session elkülönítés;
- egyidejű session limit: 8;
- input limit: 16 KiB;
- terminálméret korlát: 20–300 oszlop, 8–120 sor;
- output ring buffer: 800 chunk;
- sequence alapú reconnect;
- create/list/get/close API szerződés;
- input API;
- resize API;
- SSE output stream `after=<sequence>` reconnect támogatással;
- heartbeat/session event;
- terminal-end event EXITED/CLOSED/FAILED állapotnál;
- minden endpoint BENJADMIN admin-only;
- create előtt Terminal Core readiness + allowlist workspace gate;
- process-adapter továbbra is explicit fail-closed `null`, így shell nem indulhat el.

## Security

RAW terminál output csak admin-autholt terminál stream útvonalon kerülhet a későbbi emberi UI felé. AI továbbra sem használja ezt az endpointot.

A process adapter külön aktiválási pont. Addig:
- session create readiness BLOCKED vagy adapter inactive hibát ad;
- root shell nem indul;
- PROD terminal OFF;
- Windows Bridge OFF;
- Live Workspace OFF.

## Ellenőrzés

- TypeScript: PASS;
- célzott ESLint: PASS;
- P2 session contract: **15/15 PASS**;
- `git diff --check`: PASS.

## Következő lépés

P2.3/P2.4:
- XTerm klienspanel;
- FitAddon resize;
- reconnect UI;
- session start/stop felület;
- process adapter security boundary külön checkpointban.
