# 199 — BENJADMIN Terminal Hub P0/P1 · DEV aktiválási checkpoint

Dátum: 2026-08-14
Környezet: DEV
Státusz: P0 FOUNDATION + P1 UI SHELL DEV-EN AKTÍV
Normatív forrás: `06_DIMPRO_BENJADMIN_TerminalHub_LiveWorkspace_reszletes_fejlesztoi_terv_2026-08-13.pdf`
Normatív checkpoint: `197_benjadmin_terminalhub_normative_checkpoint_20260814.md`
Implementációs checkpoint: `198_benjadmin_terminalhub_p0p1_20260814.md`

## 1. Aktivált forrásállapot

- funkcionális P0/P1 commit: `c342c7c`;
- 06-os tervhez feature/security forrásigazítás: `9ae7cab`;
- P0/P1 dokumentációs acceptance frissítés: `2c9ed08`;
- operator/integration aktiváláskori ref: `2c9ed08`;
- aktivált build: `Xnq7XHdFeuPr6F5dkSH7X`;
- PM2: `dimpro-benjadmin-operator-ui-v2-dev` online;
- PROD: nem módosult.

## 2. DEV feature flag állapot

Bekapcsolva:
- `BENJADMIN_TERMINAL_HUB_ENABLED=1`.

Kikapcsolva:
- `BENJADMIN_COMMAND_LIBRARY_ENABLED=0`;
- `BENJADMIN_LIVE_WORKSPACE_ENABLED=0`;
- `BENJADMIN_MULTI_PANEL_ENABLED=0`;
- `BENJADMIN_WINDOWS_BRIDGE_ENABLED=0`;
- `BENJADMIN_PROD_TERMINAL_ENABLED=0`;
- `BENJADMIN_SECRET_VAULT_ENABLED=0`;
- `BENJADMIN_TERMINAL_EXECUTION_ENABLED=0` — implementációs extra kill switch.

A korábbi ideiglenes `BENJADMIN_DESKTOP_BRIDGE_ENABLED` név eltávolításra került; a 06-os normatív terv szerinti `BENJADMIN_WINDOWS_BRIDGE_ENABLED` az elfogadott név.

## 3. P0 security foundation

Elkészült:
- TerminalKind / AI visibility / command risk / RAW-SANITIZED-AUDIT típusok;
- közös terminal event envelope security metaadattal;
- central lock read model;
- allowlist-first workspace root policy;
- `realpath()` + `path.relative()` symlink/path traversal védelem;
- sensitive path + node_modules / .next / backup / credential / secret deny policy;
- meglévő Külső AI Worker secret scanner újrahasznosítása;
- redaction result + finding contract alap;
- admin-only read-only Terminal Hub status API;
- PROD fail-closed: LOCKED, AI blocked, execution false.

## 4. P1 UI shell

DEV-en látható:
- jobb oldali Élő munka panel Terminal Hub kompakt kártyája;
- nagy lebegő/dokkolt Terminal Hub munkaterület;
- TERMINAL;
- TERMINÁL PARANCSTÁR;
- LIVE WORKSPACE;
- SESSIONS;
- AUDIT fülek;
- RAW / SANITIZED / AUDIT és PROD AI tiltás folyamatos biztonsági státusza;
- ESC bezárás;
- minimum 12 px Terminal Hub tipográfia;
- meglévő Világos / Sötét / Sunlight témaöröklés.

P1-ben nincs valódi shell vagy SSH futtatás.

## 5. Acceptance

- TypeScript: PASS;
- célzott ESLint: PASS;
- teljes lint: 0 error / 104 meglévő warning;
- P0/P1 security/source contract: **21/21 PASS**;
- `git diff --check`: PASS;
- central-lockos Next build: PASS;
- local `/admin/dev-console`: HTTP 200;
- publikus HTTPS `/admin/dev-console`: HTTP 200;
- `/api/dev/terminal-hub/status` jogosultság nélkül: HTTP 401;
- PM2 DEV operator: online;
- PM2 error log utolsó módosítása: 2026-08-14 01:00:13 +02:00, tehát az aktiváláskor nem keletkezett új error-log bejegyzés.

Az admin-secretet igénylő automata böngészős tesztet nem kerülte meg a fejlesztés. A vizuális P1 felület felhasználói ellenőrzése a következő manuális acceptance pont.

## 6. Backup / rollback

Fejlesztés előtti checkpointok:
- `/srv/dimpro-dev/backups/benjadmin-terminalhub-prep-20260814T082417`;
- `/srv/dimpro-dev/backups/benjadmin-terminalhub-p0p1-20260814T082601`.

Feature-flag állapotmentések:
- `/srv/dimpro-dev/backups/benjadmin-terminalhub-p0p1-flag-state-20260814T084559.txt`;
- `/srv/dimpro-dev/backups/benjadmin-terminalhub-source-flags-20260814T092013.txt`.

Git rollback pont P0/P1 előtt:
- `e3c7f1b` — normatív dokumentációs checkpoint.

Korábbi stabil UI baseline:
- `666a651`.

## 7. P2 előtti határ

Következő fázis a 06-os terv szerint:

`P2 — DEV Terminal Core`

Kötelező eredmény:
- DEV shell session;
- stream;
- resize;
- reconnect;
- session lifecycle;
- Managed Command integráció a meglévő central lockkal.

P2 előtt megmaradnak a következő stop-feltételek:
- PROD terminal flag OFF;
- Windows Bridge OFF;
- Live Workspace OFF;
- command library OFF;
- valódi terminal execution extra kill switch OFF, amíg a P2 candidate security acceptance el nem készül;
- raw secret nem kerülhet AI vagy audit csatornára.

A P2 fejlesztés külön worktree-ben és külön security/terminal-session checkpointtal induljon.
