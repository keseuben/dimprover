# DIMPRO BENJADMIN B3.1 – Command Queue / Approval safety checkpoint – 2026-08-11

## Állapot

A B3.1 Control Plane második checkpointja DEV-en aktiválva.

- Worktree: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`
- Branch: `feat/benjadmin-operator-ui-v2`
- Alap commit: `7417a17`
- DEV runtime: `dimpro-benjadmin-operator-ui-v2-dev`
- DEV port: `3100`
- PROD: nem módosult.

## Elkészült

Új szerveroldali command queue szerződés:

- `app/lib/dev-center/control-plane-commands.ts`
- `app/api/dev/engine/control-plane/commands/route.ts`

A Control Plane kizárólag allowlistelt `commandName` + `operation` párosokat fogad. Nyers `command`, `shell`, `script`, `argv` vagy `executable` payload tiltott.

Engedélyezett parancsnevek:

- `refresh_state`
- `collect_metrics`
- `run_build`
- `run_tests`
- `run_migration`
- `restart_service`
- `deploy_release`
- `create_release`
- `run_recovery`

A route jelenleg csak validál és a `dev_center_command_queue` táblába queue-zik. Nem tartalmaz általános shell executort és önmagában semmilyen parancsot nem hajt végre.

## Biztonsági kapuk

### PRODUCTION

Módosító PROD művelet explicit `approvalId` nélkül blokkolt:

`CONTROL_PROD_APPROVAL_REQUIRED`

Az approval rekordnak:
- `approved` státuszúnak kell lennie;
- `PRODUCTION` célhoz kell tartoznia;
- a kért operationnel egyeznie kell;
- nem lehet lejárt.

### DEV

DEV write/build/test/migration/restart/deploy művelethez READY worker session szükséges. Az engedélyezés a meglévő `assertDevEngineOperation()` védelmet használja, tehát a session/scope/worktree/lease ellenőrzés nincs párhuzamosan újraimplementálva.

### Fail closed

A B3.1 staged schema a source-of-truth Supabase adatbázison még nincs alkalmazva. A command queue ezért jelenleg kontrolláltan:

`409 CONTROL_SCHEMA_NOT_READY`

válasszal áll meg. Ez a kívánt fail-closed állapot.

## Control Plane read model bővítés

A Control nézet előkészítve a staged táblák opcionális olvasására:

- aktív START context;
- aktív command queue;
- függő approval;
- aktív decision memory;
- monitoring minták;
- storage telemetry minták.

Ha a staged tábla még nem létezik, a read model nem omlik össze, hanem readiness állapotot mutat.

A Control nézet új 6 elemű kompakt metrika sávot kapott. A desktop grid korrigálva lett 4 soros elrendezésre, így 1440×900 nézeten továbbra is egy viewportban marad.

## Tesztek

### Command queue safety acceptance

`scripts/benjadmin-b31-command-queue-acceptance.mjs`

6/6 PASS:
1. unauthenticated queue request blokkolt;
2. PROD deploy approval nélkül blokkolt;
3. DEV build READY session nélkül blokkolt;
4. raw shell payload blokkolt;
5. command/operation mismatch blokkolt;
6. valid CONTROL read queue kérés staged schema hiányában fail-closed `CONTROL_SCHEMA_NOT_READY`.

### Control UI acceptance

`scripts/benjadmin-b31-control-acceptance.mjs`

13/13 PASS, benne:
- START / DEV START / PROD START;
- PROD READ ONLY;
- CONTROL_VPS target;
- staged schema pending;
- live worklog;
- silent refresh;
- desktop 1440×900 one-viewport;
- desktop/tablet/telefon horizontal overflow védelem.

### Operator regresszió

`scripts/benjadmin-operator-ui-v2-acceptance.mjs`

30/30 PASS.

### Statikus ellenőrzések

- `git diff --check`: PASS
- célzott ESLint: PASS
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS
- build ID: `1Cr9L61XBwiW9jhMaHA6e`

A buildben megmaradt egy korábban is ismert Turbopack NFT tracing warning a `release-center.ts` dinamikus filesystem használata miatt; a build ettől PASS.

## Migrációs állapot

A `20260811005500_benjadmin_control_plane_v031.sql` továbbra is STAGED. A source-of-truth külső Supabase-en nem lett alkalmazva ebben a körben.

Ezért:
- nincs tényleges command queue írás;
- nincs approval executor;
- nincs PROD végrehajtás;
- nincs PROD migration/restart/deploy.

## Következő belépési pont

A B3.1 checkpoint lezárása után a B3.2 specifikáció szerinti P0 következik:

1. meglévő project/repository/environment/task/session/scope/lock schema audit;
2. OutminAI jelenlegi permission/MCP/Git/worktree hozzáférési audit;
3. EXTEND vs új partner-specifikus táblák döntése;
4. csak ezután konkrét Partner Development Plane migration/API/UI implementáció.

A B3.2 alatt a Control VPS továbbra is könnyű vezérlőtorony; partner build vagy partner runtime nem kerülhet rá.
