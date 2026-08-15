# 232 — BENJADMIN Terminal Hub P9 · destruktív Managed Command approval candidate

Dátum: 2026-08-15
Branch: `feat/benjadmin-terminalhub-p9-command-approval`
Baseline: `2ebe954`
Állapot: candidate KÉSZ, DEV adatbázis-migráció alkalmazva, live operator kód még integráció előtt.

## Cél
A Terminal Hub Managed Commands DEV destruktív műveletei ne legyenek egyetlen kattintással vagy közvetlen API-hívással queue-zhatók.

## P9 szabály
DEV-en külön emberi approval kell:
- `migration` / `run_migration`;
- `restart` / `restart_service`;
- `deploy` / `deploy_release`.

Nem kér külön destruktív approvalt:
- read;
- monitor;
- build;
- test.

Build/test továbbra is READY BENJADMIN worker sessionhöz kötött.

## Approval életciklus
- TTL: 300 másodperc;
- pontos target: DEV;
- pontos operation;
- pontos commandName;
- pontos sessionId;
- metadata `singleUse=true`;
- approval típusok: `dev_restart`, `dev_migration`, `dev_deploy`;
- kétlépcsős UI:
  1. `Jóváhagyás kérése`;
  2. `JÓVÁHAGYOM ÉS QUEUE-ZOM`.

A backend explicit confirmation tokeneket követel:
- `APPROVE_DEV_RESTART`;
- `APPROVE_DEV_MIGRATION`;
- `APPROVE_DEV_DEPLOY`.

## Szerveroldali enforcement
A `/api/dev/engine/control-plane/commands` parser DEV restart/migration/deploy esetén approvalId nélkül HTTP 409 / `CONTROL_DEV_APPROVAL_REQUIRED` hibával áll le.

Az approval request/approve endpointok admin mutation auth mögött vannak és minden approval műveletnél újra validálják a BENJADMIN READY sessiont.

## Atomikus single-use queue
DEV DB migráció:
`supabase/migrations/20260815083000_benjadmin_terminalhub_p9_command_approval.sql`

Végleges SHA-256:
`b3305efea2ac76815659716286932c29844868acb4a5caf02a27b2f53f8e323d`

A migráció:
- kiterjeszti az approval_type constraintet a három DEV típusra;
- létrehozza a `dev_center_command_queue_approval_once_idx` unique partial indexet;
- létrehozza a `dev_center_queue_approved_command(...)` SECURITY DEFINER RPC-t;
- az approval sort `FOR UPDATE` lockkal olvassa;
- ellenőrzi approved státuszt, expiry-t, target/operation scope-ot és opcionális command/session metadata scope-ot;
- egy tranzakcióban beszúrja a commandot és `consumed` státuszra állítja az approvalt;
- public/anon/authenticated execute tiltott, csak service_role engedélyezett;
- schema marker: `benjadmin-terminal-security-approval / 0.1.0`.

Rollback:
`supabase/rollback/20260815083000_benjadmin_terminalhub_p9_command_approval_rollback.sql`

Rollback DEV approval sor jelenléte esetén fail-closed.

## DEV DB migráció előtti védelem
Tranzakciós teljes migrációs próba:
- tranzakción belül function/index/marker/DEV constraint: true;
- ROLLBACK után mind false / régi constraint visszaállt;
- approval_rows=0;
- command_rows=0.

Control Plane backup:
`/srv/dimpro-dev/backups/benjadmin-terminalhub-p9-command-approval-db/20260815T063209Z/control-plane-before-p9-approval.dump`

Backup SHA-256:
`e7914cec9b35ed7d64593b7805fb8a7fa465509242562aed39a3de2c8e00adc7`

`pg_restore --list`: 32 bejegyzés, PASS.

## DEV DB apply
Központi `migration` lock alatt PASS.

Post-migration acceptance:
- marker: `0.1.0 / migration_count=1`;
- constraint tartalmazza: dev_restart/dev_migration/dev_deploy;
- unique approval index: true;
- queue RPC: true;
- public execute: false;
- anon execute: false;
- authenticated execute: false;
- service_role execute: true;
- approval_rows: 0;
- command_rows: 0.

## Candidate build
- első build: `TZJcEyMZXfG5byvKH0AUS`;
- BENJADMIN session-ID javítás utáni build: `lGhBd4gRP0-A9SNfw3Imf`.

A javítás oka: a BENJADMIN worker session ID normatív formája `dev-session-...`, nem UUID. Az approval ID továbbra is UUID.

## Valódi READY acceptance session
Transient task/session a meglévő B3 motorral:
- task create;
- session open;
- BenAI assigned;
- worker bound;
- task claim;
- branch bound;
- worktree bound;
- scope/worktree lease;
- DB állapot: active / READY.

Acceptance:
- restart approval nélkül: 409 `CONTROL_DEV_APPROVAL_REQUIRED`;
- approval request: 201 / pending;
- approval request után command queue: 0;
- hibás confirmation: 409 `CONTROL_DEV_APPROVAL_CONFIRMATION_REQUIRED`;
- helyes confirmation: 200 / approved;
- DB scope: DEV / restart / dev_restart / exact command+session.

## Atomikus queue/replay acceptance — rollbackelt
Az approved approval ID-val a DB RPC külső tranzakcióban futott:
- első használat: queued command;
- `requires_approval=true`;
- exact sessionId;
- approval status: consumed;
- command_count: 1;
- ugyanazon approval replay: blokkolva;
- command_count replay után is 1;
- külső ROLLBACK után approval status: approved;
- command_count: 0.

Ezért a teszt során tényleges `restart_service` command nem maradt végrehajtható queue-ban.

## Headless UI acceptance
- `Jóváhagyás kérése · DEV restart` gomb aktív READY sessionnel;
- első kattintás után külön approval card;
- `A command még nincs queue-zva.` figyelmeztetés;
- `JÓVÁHAGYOM ÉS QUEUE-ZOM` második lépés;
- `Mégse` opció;
- console/page/network/external errors: **0/0/0/0**.

## Fixture cleanup
A transient task kontrollált `complete_task` művelettel lezárva:
- task: completed;
- session: closed;
- active scope locks: 0;
- active worktree leases: 0;
- command rows: 0.

A két teszt-approval scope alapján törölve. Végállapot:
- approval rows a test sessionhöz: 0;
- command rows: 0;
- active locks/worktrees: 0/0.

## Teljes gépi kapu
- P9 approval contract: **45/45 PASS**;
- teljes P2–P9 + runtime guard + approval regresszió: **540/540 PASS**;
- TypeScript: PASS;
- célzott lint: PASS;
- teljes lint: **0 error / 104 meglévő warning**.

## Biztonsági állapot
A fejlesztés nem hoz nyers shell végrehajtást. `rawCommand=false` megmarad. Terminal Execution, Windows Bridge Execution, Secret Vault storage és PROD Terminal továbbra is OFF.

PROD nem módosult.
