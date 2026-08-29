# BENJADMIN Developer Grid V1 foundation

A Developer Grid V1 külön rendszerstruktúra; a ChatGrid v0.3.x fallback/reference marad. A Central Core Task/Workflow, Worker Registry, Worker Session, Development Context, Source Provenance, Activity/Event, Handoff/Document, Build, Release/Runtime, Review és Telemetry contractokra épül. Authoritative context sorrend: active session → explicit task → verified task provenance → activity → git → presence → heuristic; presence nem authoritative.

A runtime state alapértelmezett helye `/srv/dimpro-dev/coordination/developer-grid`. A state atomikus JSON, az event log append-only JSONL; history cursoros/paginált, a realtime mód `DELTA_EVENT`, full-snapshot polling tiltott. Source mismatch: `SOURCE_BASELINE_MISMATCH`; release/runtime mismatch: `RELEASE_STATE_MISMATCH`.

A `build01.dimpro.hu` és `build02.dimpro.hu` remote node. Amíg egyik sincs SSH-val hitelesítve és READY állapotban, a canonical DEV szerver a hivatalos build executor. Ehhez exclusive coordination lock, storage és memory preflight, valamint PROD DENY szükséges. Nem hitelesített alternatív vagy párhuzamos build tilos.

A Developer Console bridge read-only módon olvassa a meglévő BENJADMIN task/session/worker állapotot, de a presence nem írhatja felül a Task + Session + Provenance kontextust.

## Task/session materializáció

A Developer Grid saját state store-ja a canonical Developer Console bridge-ből és az ellenőrzött source provenance-ből idempotensen materializálja az aktuális task/session állapotot. Ha ugyanahhoz a workerhez és taskhoz már van aktív session, azt újrahasználja; nem nyit párhuzamos sessiont. A state/event írás cross-process `mutation.lock` alatt sorosított, 5 másodperces fail-closed timeouttal; stale lock automatikus feltörése nincs.
## Verziózás

A Developer Grid saját DEV verziósorozatot használ a ChatGrid v0.3.x fallbacktől elkülönítve. Az első felhasználói ellenőrzési pont: `v0.1.0 DEV`. A felület minden ellenőrizhető buildnél megjeleníti a Developer Grid verziót, a Next.js `BUILD_ID`-t, a release metadata Git commitját és branchét. Visszajelzésnél a verzió + BUILD_ID az elsődleges azonosító.

## Build node readiness

A `build01` és `build02` node státusza nem kézi READY flag: a foundation betöltésekor rövid, fail-closed SSH readiness probe fut a szerveren konfigurált `build01` / `build02` SSH aliasokra. Kötelező: batch mód, 3 másodperces connect timeout, egyetlen connection attempt és strict host-key ellenőrzés. READY csak az explicit `DIMPRO_BUILD_NODE_READY` marker pontos visszaadása után lehet. Minden más eredmény `NOT_CONNECTED`, ilyenkor a canonical DEV szerver marad a hivatalos executor az exclusive build gate alatt.

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
