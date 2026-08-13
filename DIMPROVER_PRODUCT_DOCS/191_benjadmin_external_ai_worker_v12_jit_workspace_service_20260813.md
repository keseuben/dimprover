# 191 — BENJADMIN Külső AI Worker V1.2 — M.Forge JIT workspace service

Dátum: 2026-08-13  
Környezet: DEV  
Kapcsolódó dokumentumok: 180–190

## Cél

A külső provider futás előtti fizikai DEV végrehajtási környezetet a meglévő B3 session/worktree/scope-lock motorra építve, just-in-time módon kell létrehozni. Nem készül külön párhuzamos workspace- vagy lock-rendszer.

## Új modulok

- `app/lib/dev-center/ai-worker/jit-workspace-plan.ts`
- `app/lib/dev-center/ai-worker/jit-workspace.ts`

## Kötelező M.Forge workspace policy

A JIT workspace csak az alábbi fix technikai kontextusban érvényes:

- worker: `worker_mforge` / `MFORGE`;
- environment: `env_dev`;
- repository: `repo_dimprover`;
- branch: `worker/mforge/<task>`;
- worktree root: `/srv/dimpro-dev/worktrees`;
- trusted baseline: 40 karakteres Git commit;
- scope: kizárólag relatív `path` GREEN scope;
- production access: `DENY`.

PROD environment, más repository, V.Guard worker, traversal path, migration/release/environment scope és üres scope fail-closed.

## B3 újrahasznosított lifecycle

A JIT service nem duplikálja a Development Center motorját. A meglévő szolgáltatásokat használja:

1. `openDevEngineSession`
2. `assign_benai`
3. `bind_worker`
4. `claimTaskAtomic`
5. `bind_branch`
6. meglévő `prepareExternalWorkspace`
7. `bind_worktree`
8. `acquireScopeBundleAtomic`
9. `assertDevEngineOperation(sessionId, "write")`

Az atomikus scope bundle egyszerre hozza létre a scope lockokat és a worktree lease-t, majd READY állapotba teszi a sessiont.

## Fizikai Git workspace

A worktree kizárólag a trusted baseline commitból készül. A meglévő `external-workspace.ts` ellenőrzi:

- branch még nem létezik;
- worktree path még nem létezik;
- baseline commit létezik;
- létrehozott branch pontos;
- létrehozott HEAD pontosan a baseline commit.

## Write authorization

A workspace csak akkor tekinthető készen állónak, ha a B3 engine `write` authorization is PASS.

M.Forge policy:

- write: engedett DEV READY sessionben;
- build: engedett;
- test: engedett;
- migration: tiltott;
- restart: tiltott;
- deploy: tiltott.

## Rollback

Bármely előkészítési hiba esetén:

1. session release/requeue;
2. aktív lock/lease release;
3. fizikai worktree eltávolítás;
4. worker branch eltávolítás;
5. task visszaállítása PREFLIGHT/ready állapotba;
6. eredeti GREEN scope visszaállítása;
7. M.Forge felszabadítása.

A rollback csak a determinisztikusan számított külső worker worktree-t érintheti.

## Aktiválási szabály

A service elkészült, de a `/run` coordinator a jelenlegi runtime konfigurációban még nem hívja meg, mert nincs READY külső provider. Ez szándékos: provider nélkül nem maradhat feleslegesen aktív session/lock/worktree.

A következő összekötési pont csak `runReadiness.ready === true` esetén aktiválható.

## Acceptance

Pure JIT plan policy: **8/8 PASS**.

A meglévő B3-alapú fizikai workspace handshake acceptance új trusted baseline-nal újrafuttatva: **19/19 PASS**.

A runtime acceptance bizonyította:

- task claim atomikus;
- fizikai worktree trusted baseline-ról létrejön;
- B3 worktree validation PASS;
- globális scope + worktree lease atomikus;
- session READY;
- DB lock/lease valós;
- M.Forge DEV write PASS;
- M.Forge deploy 403 / `EXTERNAL_AI_WORKER_OPERATION_DENIED`;
- release után nincs aktív lock/lease;
- worktree és branch törölve;
- M.Forge újra `ready`.

PROD nem módosult.
