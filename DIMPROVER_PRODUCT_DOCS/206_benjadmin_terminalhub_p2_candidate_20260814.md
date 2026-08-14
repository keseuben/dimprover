# 206 — BENJADMIN Terminal Hub P2 · DEV candidate checkpoint

Dátum: 2026-08-14
Környezet: DEV feature worktree
Feature branch: `feat/benjadmin-terminalhub-p2`
Állapot: P2 CANDIDATE KÓDOLVA · PTY PROCESS ADAPTER MÉG FAIL-CLOSED

## P2 candidate tartalom

- nem-root UID/GID readiness gate;
- Terminal Core readiness API;
- session lifecycle szerződés;
- create/list/get/close API;
- input API;
- resize API;
- sequence-alapú SSE stream és reconnect;
- XTerm + FitAddon kliens;
- session start/stop/attach UI;
- 30 perc idle timeout;
- 4 óra max lifetime;
- RAW / SANITIZED / AUDIT output szétválasztás;
- SANITIZED secret-scanner újrahasznosítással;
- AUDIT raw szöveg nélkül;
- Managed Commands panel a meglévő B3.1 Control Plane queue-ra kötve;
- READY worker session gate build/test/restart előtt;
- felhasználói főnév: `BENJADMIN Fejlesztői Konzol`, V1 utótag nélkül.

## P2 security állapot

A process adapter továbbra is fail-closed:
- `getTerminalProcessAdapter()` -> `null`;
- nincs valódi shell processz;
- nincs root PTY;
- `BENJADMIN_TERMINAL_EXECUTION_ENABLED=0`;
- PROD terminal OFF;
- Live Workspace OFF;
- Windows Bridge OFF.

A DEV gépen létező `nobody` identitás UID/GID 65534 alkalmas lehet egy későbbi read-only PTY candidate alapjához, de a process-adapter még nincs aktiválva.

## Contract eredmények

- P2 foundation: 12/12 PASS;
- session protocol: 15/15 PASS;
- XTerm client: 16/16 PASS;
- output security: 11/11 PASS;
- Managed Commands: 10/10 PASS;
- összesen: **64/64 PASS**.

## Build / lint

- TypeScript: PASS;
- teljes lint: 0 error / 104 meglévő warning;
- central-lockos Next build: PASS;
- candidate build ID: `9AGrQilxJhSp8cbdNA9qe`;
- 3199 candidate `/admin/dev-console`: HTTP 200;
- 3199 candidate readiness API jogosultság nélkül: HTTP 401;
- 3199 candidate sessions API jogosultság nélkül: HTTP 401;
- candidate runtime leállítva.

## Aktiválási szabály

A P2 candidate UI és read-only/session protokoll DEV-re integrálható úgy, hogy a terminál execution továbbra is OFF marad. Ez lehetővé teszi a felület kézi vizuális ellenőrzését anélkül, hogy shell processz indulna.

Tényleges PTY aktiválás külön security checkpoint után történhet csak.

## Következő lépés

1. process-adapter security boundary;
2. nem-root read-only PTY candidate;
3. PTY security acceptance;
4. csak teljes PASS után execution gate döntés;
5. P3 Terminál Parancstár;
6. P4 Live Workspace read-only foundation.

PROD nem módosult.
