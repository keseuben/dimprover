# 233 — BENJADMIN Terminal Hub P9 · destruktív Managed Command approval DEV aktiválási checkpoint

Dátum: 2026-08-15
Állapot: DEV AKTÍV · PROD nem módosult.

## Release azonosítók
- operator/integration release commit: `47ee27d`;
- P9 feature forráscommit: `d95494a`;
- exact release candidate build: `FXQYgCvsluEkyYQSUPq_A`;
- aktív operator build: `ITkECuMZrrOgi89fg8q_y`;
- rollback backup: `/srv/dimpro-dev/backups/benjadmin-p9-approval-preintegrate-20260815T110316`.

A release tartalmazza a párhuzamosan elkészült Drive Security V0.5 és Drive Security Backfill V0.5.1 változásokat is. A P9 fájlokkal tartalmi konfliktus nem volt.

## P9 destruktív approval szabály
DEV-en külön emberi approval szükséges:
- restart / `restart_service`;
- migration / `run_migration`;
- deploy / `deploy_release`.

A build/test műveletek továbbra is READY BENJADMIN sessionhöz kötöttek, de nem igényelnek külön destruktív approvalt.

Approval:
- 300 s TTL;
- exact DEV target + operation + commandName + sessionId scope;
- kétlépcsős UI;
- egyszer használható;
- atomikus command queue + approval consume PostgreSQL RPC-n keresztül;
- replay adatbázis-szinten blokkolt.

## DEV DB állapot
Schema marker:
`benjadmin-terminal-security-approval:0.1.0:1`

Aktiválás utáni ellenőrzés:
- DEV destruktív approval rows: 0;
- DEV restart/migration/deploy command rows: 0.

A migráció előtt célzott Control Plane backup készült, restore-list és SHA-256 ellenőrzéssel. A tranzakciós rollback-próba PASS volt.

## Release gate
Exact release commit `47ee27d`:
- teljes BENJADMIN P2–P9 + runtime guard + approval contract;
- Drive Security V0.5 contract;
- Drive Security Backfill V0.5.1 contract;
- összesen **621/621 PASS**;
- TypeScript: PASS;
- full lint: **0 error / 104 meglévő warning**;
- release build: `FXQYgCvsluEkyYQSUPq_A` PASS;
- operator build: `ITkECuMZrrOgi89fg8q_y` PASS.

## Live DEV acceptance
Runtime identity guard:
- process: `dimpro-benjadmin-operator-ui-v2-dev`;
- cwd: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`;
- port: 3100;
- host: 127.0.0.1;
- build marker egyezik;
- PM2 online;
- `/admin/dev-console`: 200;
- Secret Vault readiness auth nélkül: 401.

További auth-gate:
- destructive approval API auth nélkül: 401;
- AI visibility API auth nélkül: 401.

Error-log 10 másodperces stabilitásellenőrzés: változatlan.

## Feature flag állapot
ON:
- Terminal Hub;
- Terminál Parancstár;
- Live Workspace;
- Worker Activity;
- Monaco Live/Diff/History;
- Multi-panel P7.

OFF:
- Terminal Execution;
- Windows Bridge;
- Windows Bridge Pairing;
- Windows Bridge Execution;
- PROD Terminal;
- Secret Vault storage.

## Biztonsági következtetés
A P9 approval gate DEV-en aktív. A Terminal Hub UI megkerülésével sem lehet restart/migration/deploy commandot approval nélkül queue-zni. Az approval egyszer használható, session/command scope-hoz kötött és replay-biztos. A release továbbra sem nyit valódi raw shell vagy PowerShell executiont.

PROD nem módosult.
