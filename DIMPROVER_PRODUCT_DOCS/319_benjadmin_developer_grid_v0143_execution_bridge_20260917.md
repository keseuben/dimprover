# BENJADMIN Developer Grid v0.1.43 – Central Core Execution Bridge V1

Dátum: 2026-09-17  
Környezet: **DEV ONLY · PROD DENY**

## Cél
A v0.1.41/v0.1.42 source-proof és launch-recovery lánc után a ChatGPT worker már hitelesen megkapja az authoritative task-worktree, branch, HEAD, READY Dev Center session, scope-lock és worktree lease állapotot. A fennmaradó fizikai blocker az volt, hogy a ChatGPT surface nem rendelkezett engedélyezett végrehajtási csatornával a task-worktree módosításához, ezért `EXECUTION_TOOL_UNAVAILABLE` állapotban megállt.

A v0.1.43 ezt egy **Central Core Execution Bridge V1** réteggel oldja meg. A worker nem kap nyers VPS shellt és nem kap közvetlen PROD-közeli MCP-hozzáférést. A ChatGPT válaszában strukturált request blokkot ad ki, a Developer Grid Desktop ezt a párosított DEV API felé továbbítja, a backend pedig kizárólag az authoritative task-worktree-n hajtja végre a megengedett műveletet.

## Protokoll
A worker kérésének gépi blokkja:

```text
BENJADMIN_EXECUTION_REQUEST_V1
{ ... schemaVersion=1 ... }
BENJADMIN_EXECUTION_REQUEST_END
```

Az eredmény ugyanabba a worker-csevegésbe automatikusan visszakerül:

```text
BENJADMIN_EXECUTION_RESULT_V1
{ ... status/code/summary/data ... }
BENJADMIN_EXECUTION_RESULT_END
```

Minden kéréshez kötelező és egyező: `requestId`, task ID, Grid session ID, worker code, Central Core source proof SHA-256.

## Engedélyezett V1 actionök
- `LIST_FILES`
- `READ_FILE`
- `SEARCH_FILES`
- `WRITE_FILE`
- `GIT_STATUS`
- `GIT_DIFF`
- `GIT_DIFF_CHECK`
- `RUN_DEV_COMMAND`, kizárólag `TSC`, `LINT` vagy task-scope-ba tartozó `CONTRACT` futtatással.

Nincs nyers shell-string vagy szabad argv/executable átadás. A teljes build továbbra is Central Core / BUILD01-BUILD02 kapu.

## Kötelező authorization lánc
A backend minden request előtt újraellenőrzi:
1. paired Developer Grid Windows device;
2. authoritative aktív Grid task és Grid session;
3. worker identity;
4. `BOOT ACK = VALIDATED` és `codingAllowed=true`;
5. Central Core `SourceExecutionProof` SHA-256 + `VERIFIED/CENTRAL_CORE` állapot;
6. Dev Center engine session ID egyezés;
7. READY engine session + érvényes session lease;
8. aktív scope-lock;
9. aktív worktree lease;
10. canonical `/srv/dimpro-dev/worktrees/*` task-worktree;
11. exact Git branch + HEAD egyezés.

Bármely eltérés fail-closed.

## Task-scope enforcement
A worktree-határ önmagában nem elegendő. A v0.1.43 release előtti security audit során ezért külön path-scope hardening került be.

Az Execution Bridge a meglévő `analyzeTechnicalScope()` motort az **authoritative task-worktree** ellen futtatja a task cím, eredeti source prompt és modulnév alapján. Az analyzer maximum releváns candidate-eket képez GREEN/YELLOW/RED kockázati döntéssel.

- Olvasás és keresés csak az analyzer által a taskhoz relevánsnak minősített, nem-DENIED candidate fájlokra engedett.
- Írás csak `AUTO_APPROVED` + `GREEN` task-candidate-re engedett.
- YELLOW/shared path automatikus írása tiltott: `EXECUTION_SCOPE_REVIEW_REQUIRED`.
- RED/sensitive path tiltott.
- Új fájl csak olyan könyvtárban hozható létre, ahol ugyanahhoz a taskhoz már van analyzer által igazolt AUTO_APPROVED write-candidate.
- Más modul egyébként GREEN fájlja sem írható, ha nem része a task analyzer scope-jának.
- `.git`, `.next`, `node_modules`, path traversal és symlink cél tiltott.

## Idempotencia és audit
A `requestId` taskon belül idempotens. Ugyanaz a request azonos tartalommal visszajátszható, eltérő tartalommal `EXECUTION_REQUEST_ID_CONFLICT`.

Minden request/result esemény append-only DEV auditba kerül 0600 jogosultsággal. A request auditban a tartalom helyett SHA-256 fingerprint kerül rögzítésre, ahol ez indokolt.

## Desktop agent-loop
A Desktop a meglévő BOOT ACK / stage-report mintát követi:
- validált BOOT ACK után automatikusan közli az Execution Bridge V1 request-szerződést;
- a Conversation Memory monitor felismeri a worker `BENJADMIN_EXECUTION_REQUEST_V1` blokkját;
- request identityt Desktop oldalon is ellenőrzi;
- paired-device API felé továbbítja;
- az eredményt automatikusan visszaküldi ugyanabba a worker ChatGPT beszélgetésbe;
- requestet task/session/request SHA alapján deduplikál.

## Tiltott műveletek
V1-ben kifejezetten tiltott:
- PROD hozzáférés vagy módosítás;
- deploy;
- restart;
- migration;
- release/cutover;
- nyers shell;
- tetszőleges executable/argv;
- más task vagy más worker scope;
- RED/sensitive path.

## Verzióirány
A v0.1.43 kizárólag a Central Core Execution Bridge release. A korábban erre a verzióra tervezett ChatGPT Work OpenAI first-party adapter **v0.1.44-re** tolódik és v0.1.43-ban továbbra is fail-closed.

## Acceptance
Kötelező contractok:
- Execution Bridge v0.1.43 contract: 33/33 PASS;
- Source Proof;
- Source Authority;
- Worker Surface;
- Central Core hotfix;
- Session heartbeat;
- BOOT ACK recovery;
- Launch recovery;
- Work-start;
- Materializer / state / Conversation Memory / routing;
- Codex Task Bridge.

A fizikai E2E cél: ugyanazon meglévő Projektkapu task `INDÍTÁS FOLYTATÁSA` recovery után a worker ne `EXECUTION_TOOL_UNAVAILABLE` állapotba térjen vissza, hanem az Execution Bridge-en keresztül legalább egy read/status requestet automatikusan végrehajtson és az eredményt ugyanabba a BenjáminAI cellába visszakapja.
