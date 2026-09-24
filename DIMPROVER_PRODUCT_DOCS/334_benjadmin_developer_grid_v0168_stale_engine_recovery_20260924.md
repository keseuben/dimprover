# BENJADMIN Developer Grid v0.1.68 – Stale Engine Session Recovery

Dátum: 2026-09-24
Környezet: DEV ONLY · PROD DENY

## Fizikai kiindulás

A v0.1.67 conversation rollover fizikailag eljutott a READY állapotig ugyanazon JázminAI Grid task/session mellett. Az automatikus CONVERSATION_ROLLOVER_READY_V1 continuation után kiadott GIT_STATUS azonban kétszer ezt a Central Core hibát kapta:

- EXECUTION_BRIDGE_HTTP_FAILED
- A művelethez READY worker session szükséges.

A fizikai engine-state ellenőrzés megmutatta, hogy a Grid session továbbra is aktív és VERIFIED, viszont a hozzá tartozó belső Dev Center session:

dev-session-e54a154a-f41

status=closed állapotban volt, Lease expired; automatic recovery. okkal. A Dev Center task queued állapotba került, aktív scope lock és worktree lease nélkül.

## v0.1.68 recovery szabály

A javítás két külön session-domain közötti folytonosságot kezel:

- Developer Grid session: változatlan authoritative felhasználói/worker folytonosság.
- Dev Center engine session: belső execution lease/session, amely szükség esetén cserélhető.

Automatikus recovery kizárólag akkor indulhat, ha:
1. taskId + Grid sessionId + workerCode exact authoritative egyezés;
2. Grid session aktív;
3. BOOT ACK VALIDATED és codingAllowed=true;
4. conversation rollover, ha létezik, READY;
5. régi sourceExecutionProof exact, VERIFIED, CENTRAL_CORE, READY, PROD DENY;
6. source provenance fizikailag ellenőrizhető;
7. régi Dev Center engine session ténylegesen closed;
8. nincs versengő aktív session a taskhoz vagy workerhez.

## Recovery után kötelező

- ugyanaz a Developer Grid task;
- ugyanaz a Developer Grid session;
- ugyanaz a worker;
- ugyanaz a repository/worktree/branch/HEAD;
- friss Dev Center engine session;
- friss scope lock;
- friss worktree lease;
- friss CENTRAL_CORE sourceExecutionProof;
- friss proof SHA visszaadása az Execution Bridge resultban.

A Grid WorkerSession módosítása spread-update: a meglévő BOOT ACK, ChatGPT conversation binding, rollover state és continuity adatok megmaradnak.

## Execution Bridge

A szerver csak a következő engine-gate hibáknál próbál egyszeri recoveryt:

- DEV_CENTER_SESSION_NOT_READY
- DEV_CENTER_SESSION_LEASE_EXPIRED
- DEV_CENTER_SCOPE_LOCK_REQUIRED
- DEV_CENTER_WORKTREE_LEASE_REQUIRED

Minden más hiba változatlanul fail-closed.

Recovery után újra lefut az assertDevEngineOperation kapu. A GIT_STATUS vagy más action csak sikeres új authorization után hajtható végre.

## Source proof átadás

Az Execution Bridge eredmény data mezője tartalmazza:

- authoritativeSourceProofSha256
- recovery esetén executionSessionRecovery

A ChatGPT worker következő BENJADMIN_EXECUTION_REQUEST_V1 blokkjában az új authoritativeSourceProofSha256 értéket használja.

A Desktop rövid delta-race alatt elfogadja a közvetlenül szerver által kiadott új proofot, de a resolvedExecutionProofSha256 elsődleges prioritása továbbra is:

1. authoritative live task sourceProofSha256
2. authoritative sourceExecutionProof.sha256
3. régi task-launch fallback
4. legacy derived VERIFIED provenance proof

A server-issued recovery proof nem kerül a primary resolverbe.

## Tiltások

- új Developer Grid task: TILOS
- új Developer Grid session: TILOS
- TASK_LAUNCH: TILOS
- új worktree: TILOS
- conversation rebind/új rollover: TILOS
- PROD: DENY

Belső Dev Center engine session cseréje megengedett, mert ez execution lease erőforrás, nem új Developer Grid munkamenet.

## Acceptance

- v0.1.68 stale-engine recovery contract: 27/27 PASS
- Desktop Node syntax: PASS
- diff check: PASS
- Teljes Desktop regresszió: PASS
- TypeScript: PASS
- lint: 0 error / 103 örökölt warning

Következő külön termékcél: Work first-party surface aktiválás v0.1.69.
