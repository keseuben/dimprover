# 188 — BENJADMIN Külső AI Worker V1.2 — provider-run coordinator fail-closed kapu

Dátum: 2026-08-13  
Környezet: DEV  
Kapcsolódó dokumentumok: 180–187  
Normatív forrás: `05_DIMPRO_BENJADMIN_Kulso_AI_Worker_V1_fejlesztoi_kiegeszites_v2_2026-08-12.pdf`

## Cél

A V1.2 futási readiness után létrejött a tényleges M.Forge indítási kérés első koordinátori kapuja.

A coordinator jelenlegi feladata nem a külső provider színlelt elindítása, hanem annak garantálása, hogy blokkolt readiness esetén **semmilyen fejlesztési side effect ne jöhessen létre**.

## Új API

`POST /api/dev/ai-worker/tasks/:id/run`

A végpont mutation jogosultságot igényel.

## Kötelező indítási sorrend

A koordinátor külön, tesztelt launch planben rögzíti a jövőbeli teljes sorrendet:

1. RUN_READINESS
2. SESSION_OPEN
3. BENAI_ASSIGNED
4. MFORGE_BOUND
5. TASK_CLAIM
6. BRANCH_BIND
7. WORKTREE_CREATE
8. WORKTREE_BIND
9. SCOPE_LEASE
10. WRITE_AUTHORIZATION
11. PROVIDER_START
12. USAGE_STREAM
13. OUTPUT_ARTIFACT
14. WORKER_DONE
15. SESSION_CLEANUP

Alapszabályok:

- worker: `worker_mforge`;
- környezet: `env_dev`;
- PROD access: `DENY`;
- workspace: just-in-time;
- cleanup: kötelező.

A provider nem kerülhet a write authorization elé.

## Blokkolt futás

A `/run` minden kérés előtt újra lefuttatja a V1.2 run readiness kaput.

Ha a readiness BLOCKED:

- HTTP 409;
- kód: `AI_WORKER_RUN_READINESS_BLOCKED`;
- workflow PREFLIGHT marad;
- worker assignment nem jön létre;
- session nem jön létre;
- branch nem jön létre;
- fizikai worktree nem jön létre;
- scope lock nem jön létre;
- worktree lease nem jön létre;
- provider run ID nem jön létre.

Task metadata:

`runCoordinator.state = BLOCKED`

és kötelezően:

`sideEffectsCreated = false`

## Valós audit és worklog

A blokkolt indítás nem hamis worker-aktivitás, hanem valós koordinátori eseményként bekerül a meglévő BENJADMIN naplóba.

Audit:

`AI_WORKER_RUN_BLOCKED`

Worklog:

- worker: `MFORGE`
- phase: `provider_gate`
- level: `warning`
- source: `external-ai-worker`
- record type: `EXTERNAL_AI_RUN_GATE`

Ez az esemény a Fejlesztői Konzol közös timeline-jában is megjelenik.

## UI

A task kártyán a `M.FORGE INDÍTÁS` gomb csak akkor jelenhet meg, ha a kliens előzőleg valós `run-readiness.ready = true` eredményt kapott.

BLOCKED tasknál az indítási gomb nincs jelen.

A jelen DEV állapotban a blocker továbbra is valós:

- nincs konfigurált külső provider + modell;
- provider execution global gate kikapcsolva;
- nincs implementált provider executor.

Ezért M.Forge nem jelenik meg dolgozóként.

## Második biztonsági kapu

A coordinator akkor is fail-closed maradna, ha a readiness később READY lenne, de a JIT provider-executor handoff még nem lenne aktiválva.

Kód:

`AI_WORKER_RUN_COORDINATOR_EXECUTOR_NOT_BOUND`

Ebben az állapotban sem nyílik session vagy worktree.

## Acceptance

Pure launch-plan contract:

- **6/6 PASS**.

Runtime/browser acceptance:

- task → analyze → YELLOW safe exclude → preflight → Context Pack → `/run`;
- `/run` 409 BLOCKED;
- DEV-only/JIT/cleanup launch plan PASS;
- sideEffectsCreated=false;
- workflow PREFLIGHT maradt;
- assignment/branch/worktree nincs;
- aktív session nincs;
- aktív scope lock nincs;
- aktív worktree lease nincs;
- audit esemény PASS;
- M.Forge provider-gate worklog PASS;
- Fejlesztői Konzol timeline megjelenítés PASS;
- BLOCKED UI-n nincs M.FORGE INDÍTÁS;
- 1366 px horizontal overflow nincs.

Runtime acceptance: **17/17 PASS**.

## Következő gate

A következő fejlesztési lépés a JIT workspace handoff és a provider executor közötti tranzakciós lifecycle lesz.

Ezt csak úgy szabad aktiválni, hogy:

1. a run readiness READY;
2. tényleges provider adapter implementált;
3. szerveroldali secret és modell explicit konfigurált;
4. global execution gate explicit bekapcsolt;
5. provider indítás előtt a B3 session/worktree/scope lease valóban READY;
6. provider hiba vagy budget hard stop esetén garantált cancel + cleanup történik.

A jelen checkpointban külső hálózati AI-hívás nincs.
