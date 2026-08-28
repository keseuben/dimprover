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
