# 205 — BENJADMIN Terminal Hub P2 · Managed Commands / Control Plane integráció

Dátum: 2026-08-14
Környezet: DEV feature worktree
Baseline: `fb90e40`
Állapot: MANAGED COMMAND UI KÓDOLVA · NINCS SAJÁT BUILD/RESTART MOTOR

## Elkészült

A Terminal Hub TERMINAL nézetében külön `MANAGED MŰVELETEK` panel készült.

Engedélyezett fix műveletek:
- Állapot -> `refresh_state`;
- Metrika -> `collect_metrics`;
- Build -> `run_build`;
- Tesztek -> `run_tests`;
- DEV restart -> `restart_service`.

Minden művelet célkörnyezete fixen `DEV`.

## Biztonsági szabály

A Terminal Hub nem kap külön build/restart/migration processzmotort.

A panel a meglévő:
`POST /api/dev/engine/control-plane/commands`
útvonalat használja.

A meglévő Control Plane szerveroldali szabályai továbbra is érvényesek:
- nyers `command`, `shell`, `script`, `argv`, `executable` payload tiltott;
- DEV módosító művelethez READY engine worker session szükséges;
- session/scope/worktree authorization a meglévő engine-ben történik;
- a tényleges kizárólagos műveletek central operation lock alatt hajthatók végre;
- PROD ebből a panelből nem választható.

A Terminal Hub csak `rawCommand: false` eredet-metaadatot küld.

## UI

- READY session számláló;
- READY worker session választó;
- build/test/restart gomb READY session nélkül disabled;
- állapot/metrika read-only queue művelet session nélkül is elérhető;
- queue eredmény/státusz visszajelzés.

## Névstruktúra alkalmazása

A 202-es normatív névszabály alapján a fejléc felhasználói neve:
**FEJLESZTŐI KONZOL**

A korábbi `V1` utótag a felhasználói fejlécből kikerült. A ChatGPT Parancstár konzol-fejlesztési promptjában is a verziófüggetlen `BENJADMIN Fejlesztői Konzol` név szerepel.

## Ellenőrzés

- TypeScript: PASS;
- célzott ESLint: PASS;
- Managed Command contract: **10/10 PASS**;
- `git diff --check`: PASS.

## Következő lépés

- teljes P2 regressziós contract csomag;
- teljes lint;
- central-lockos build;
- candidate HTTP/API smoke;
- process adapter továbbra is külön blocker/gate;
- biztonságos P2 candidate DEV integráció végrehajtás nélkül.
