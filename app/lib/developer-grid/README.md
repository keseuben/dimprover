# BENJADMIN Developer Grid V1 foundation

A Developer Grid V1 külön rendszerstruktúra; a ChatGrid v0.3.x fallback/reference marad. A Central Core Task/Workflow, Worker Registry, Worker Session, Development Context, Source Provenance, Activity/Event, Handoff/Document, Build, Release/Runtime, Review és Telemetry contractokra épül. Authoritative context sorrend: active session → explicit task → verified task provenance → activity → git → presence → heuristic; presence nem authoritative.

A runtime state alapértelmezett helye `/srv/dimpro-dev/coordination/developer-grid`. A state atomikus JSON, az event log append-only JSONL; history cursoros/paginált, a realtime mód `DELTA_EVENT`, full-snapshot polling tiltott. Source mismatch: `SOURCE_BASELINE_MISMATCH`; release/runtime mismatch: `RELEASE_STATE_MISMATCH`.

A `build01.dimpro.hu` és `build02.dimpro.hu` remote FULL BUILD node. BUILD01 az elsődleges, BUILD02 a fallback. Ha egyik sem friss `READY + LIVE + FREE`, a FULL BUILD `QUEUED`; a DEV alkalmazásszerver nem használható rejtett FULL BUILD fallbackként. Nem hitelesített alternatív vagy párhuzamos build tilos.

A Developer Console bridge read-only módon olvassa a meglévő BENJADMIN task/session/worker állapotot, de a presence nem írhatja felül a Task + Session + Provenance kontextust.

## Task/session materializáció

A Developer Grid saját state store-ja a canonical Developer Console bridge-ből és az ellenőrzött source provenance-ből idempotensen materializálja az aktuális task/session állapotot. Ha ugyanahhoz a workerhez és taskhoz már van aktív session, azt újrahasználja; nem nyit párhuzamos sessiont. A state/event írás cross-process `mutation.lock` alatt sorosított, 5 másodperces fail-closed timeouttal; stale lock automatikus feltörése nincs.
## Verziózás

A Developer Grid saját DEV verziósorozatot használ a ChatGrid v0.3.x fallbacktől elkülönítve. Az első felhasználói ellenőrzési pont: `v0.1.0 DEV`. A felület minden ellenőrizhető buildnél megjeleníti a Developer Grid verziót, a Next.js `BUILD_ID`-t, a release metadata Git commitját és branchét. Visszajelzésnél a verzió + BUILD_ID az elsődleges azonosító.

## Build node readiness

A `build01` és `build02` node státusza nem kézi READY flag. A Developer Grid a sanitizált MCP/SSH gateway snapshotot olvassa; READY csak friss LIVE snapshot, működő toolchain, SAFE/WATCH Storage Governor, legalább 4 GiB swap és szabad runner-local build lock mellett lehet. A DEV alkalmazásszerver nem FULL BUILD fallback: ha egyik runner sem READY + FREE, a build `QUEUED` marad.

A `v0.1.1 DEV` ellenőrzési pontban elkészült a dinamikus build01/build02 SSH readiness probe, a native delta desktop kapcsolat, a külön Windows EXE/DEV ZIP és a publikus DEV API staging. A következő `v0.1.2 DEV` stabilizációs kör fókusza a dependency/security hardening, dokumentációs konzisztencia és a v0.1.1 Windows kézi acceptance visszajelzéseinek javítása.

## v0.1.3 release/runtime hardening

Az immutable DEV release worktree-khez a foundation source-provenance elvárásai explicit runtime scope-ot kaphatnak a `DIMPRO_DEVELOPER_GRID_SOURCE_WORKTREE`, `DIMPRO_DEVELOPER_GRID_SOURCE_BRANCH` és `DIMPRO_DEVELOPER_GRID_SOURCE_REPOSITORY` változókkal. Ezek nem bypassok: a Git top-level, branch, HEAD és common repository továbbra is ténylegesen ellenőrzött, eltérésnél `SOURCE_BASELINE_MISMATCH` marad. A candidate smoke végső verziófelirata a tényleges foundation verziót használja.

## v0.1.4 Release Artifact Engine

A Developer Grid DEV kiadási artifactfolyam külön fail-closed release motorra kerül. A motor csak a canonical DEV host/worktree/branch tiszta forrásából dolgozhat, és megköveteli, hogy a `.next/BUILD_ID`, a `.next/.dimpro-release.json`, a Git HEAD és a branch egyezzen. Ellenőrzi a Windows EXE-t és a DEV ZIP-et, a ZIP-ben tiltja többek között a `.env`, `.git`, `.next`, `node_modules`, admin/reporter/device token és service-role jelöléseket. Az artifact tár immutable: azonos név eltérő tartalommal nem írható felül. Publikus staging csak központi `release` exclusive lock alatt engedélyezett, és a teljes EXE/ZIP visszatöltési SHA-256, valamint a `DEV` / `PROD DENY` HTTP fejlécek is kötelezően ellenőrzöttek.

## v0.1.5 Public artifact integrity hardening

- A publikus EXE és DEV ZIP teljes letöltési SHA-256 ellenőrzése mellett a `.sha256` sidecar fájl is kötelezően ellenőrzött.
- Az `ARTIFACT_MANIFEST_v<version>.json` teljes bájtszintű SHA-256 hash-e és saját sidecarja is fail-closed kapu.
- Hibás sidecar fájlnév, hash, manifest hash vagy DEV/PROD fejléc esetén a release ellenőrzés blokkol.
- DEV ONLY · PROD DENY.

## Remote Build Executor V1

A BUILD-01 és BUILD-02 node-ok FULL BUILD végrehajtása fail-closed remote executoron keresztül történik. A DEV gateway kizárólag sanitizált health snapshotot ír a `/srv/dimpro-dev/coordination/health-snapshots/build-nodes.json` fájlba; a scheduler csak friss `READY + LIVE + FREE`, `toolchainReady=true`, `SAFE/WATCH` storage és legalább 4 GiB swap mellett rendelhet run-t.

A runner helyi kizárólagos lockja a hardened node-konfigurációval egyezően `/srv/dimpro-build/state/full-build.lock`. A forrás teljes Git commit SHA + branch provenance alapján Git bundle-ben érkezik, a runner `npm ci` után kizárólag a canonical `npm run build:raw` műveletet futtatja. A build node-on deploy, migration, restart, cutover és candidate művelet tiltott. Az artifact csak DEV standalone buildből, `BUILD_ID`-ből és `.dimpro-release.json` provenance-ből készül; visszaadás után SHA-256 és runner/source metadata kötelezően ellenőrzött. PROD hozzáférés minden ponton `DENY`.

## v0.1.13 Control Plane – BUILD Runner Pool

A központi Fejlesztői Vezérlőpult FULL BUILD művelete csak explicit felhasználói build-kérésből, aktív authoritative task/session és `bootAckState=VALIDATED` mellett indulhat. A kérés külön `GridBuildRun` rekordot kap `runId`, `taskId`, `sessionId`, `workerCode`, teljes source commit SHA és branch azonosítóval.

A scheduler BUILD01-et választja elsőként, BUILD02-t fallbackként. A kiosztott node-azonosítót a remote dispatcher explicit `runner-id` formában kapja; ha a kijelölt runner az indítás pillanatában már nem READY/FREE, a végrehajtás fail-closed, és nem vált át rejtetten másik runnerre. Várólistás buildet a control plane később újraütemezhet, mert az eredeti build-kérés már authoritative módon rögzített.

A hosszú build nem a HTTP kérésben fut. Egy detached DEV build-job indítja a remote dispatchert, amely a build állapotáról külön evidence fájlt ír. A control plane a `QUEUED → ASSIGNED → RUNNING → PASS/FAIL/BLOCKED` állapotokat reconciliálja, és `BUILD_QUEUED`, `BUILD_ASSIGNED`, `BUILD_STARTED`, `BUILD_RESULT` eseményt ír. PASS esetén BUILD_ID, artifact SHA-256 és evidence hivatkozás kerül vissza a felületre; FAIL/BLOCKED esetén failure code, exit code és output SHA-256. PROD minden ponton DENY.

## v0.1.13 Diagnostic Evidence Engine / Review Gate

A Developer Grid külön append-only `evidence.jsonl` rétegben tárolja a fejlesztési bizonyítékokat. Az evidence kizárólag sanitizált technikai adatot őriz: task/session/worker azonosító, időpont, branch/worktree/current HEAD, FILE/TEST/ERROR/HANDOFF/BUILD/BOOT_ACK/REVIEW kategória, státusz, severity, technikai path/test/error/build/handoff/review azonosító és SHA-256 lenyomatok. Tetszőleges chat-válasz, provider-válasz, üzleti dokumentumtartalom, secret, token vagy `.env` érték nem kerülhet evidence-be. Érzékeny mintánál a tartalom redacted, érzékeny path esetén a path maszkolt.

A worker stage action a normál emberi összefoglaló mellett kötelező `BENJADMIN_STAGE_REPORT_V1` gépi blokkot kér. A desktop ezt automatikusan felismeri, a worker/task/session/current HEAD azonosságot ellenőrzi, majd a paired DEV evidence API-n FILE/TEST/ERROR evidence-ként rögzíti. A stage csak monoton haladhat 1/6 → 6/6 irányban. Ha checkpoint commit készült, a bejelentett current HEAD csak szerveroldali Git ellenőrzés után válhat authoritative head-dé: a branch/worktree/repository ténylegesen egyezzen, és az új HEAD a base/prior HEAD fast-forward leszármazottja legyen.

A Review Gate három célállapotot értékel: `REVIEW`, `BUILD`, `CLOSURE`. Minden kapu current-HEAD alapú, ezért egy régi commit hibája nem blokkolhat korlátlanul egy későbbi, igazolt HEAD-et. Kötelező az aktív session, VALIDATED BOOT ACK, verified source és current-HEAD PASS teszt evidence. Az 5/6 BUILD fázisban a FULL BUILD csak V.Guard PASS/PASS_WITH_NOTES után engedélyezett. A 6/6 CLOSURE ezen felül current-HEAD PASS BUILD és COMPLETED HANDOFF evidence-et igényel.

A V.Guard-AI indítása explicit felhasználói művelet. Automatikus provider-költség nincs. A review read-only: clean commitolt diffet vizsgál `baseHead → currentHead` tartományban; fájlírás, patch, deploy, restart, migration, cutover és PROD hozzáférés tiltott. Külső provider csak READY secret + model + HUF pricing + global execution gate és budget gate mellett futhat. Sensitive path vagy secret scanner találat fail-closed. A provider teljes nyers kimenete nem kerül Diagnostic Evidence-be; csak a strict parserrel elfogadott review státusz, technikai azonosítók és használati metrikák.

A BUILD vezérlés a current authoritative HEAD-et újraellenőrzi és clean worktree-t követel. A worker chatből FULL BUILD nem indítható; a Central Core Runner Pool az egyetlen FULL BUILD útvonal.
