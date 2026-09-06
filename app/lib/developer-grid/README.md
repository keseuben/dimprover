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

## v0.1.13 MCP Build Transport Gateway V1

A BUILD01/BUILD02 végrehajtási adatút a v0.1.13-ban külön MCP VPS transport gatewayen halad. A canonical DEV VPS nem SSH-zik közvetlenül a build node-okra. A DEV oldali `build-gateway-client.mjs` kizárólag a `https://mcp.dimprover.hu/build-gateway/v1` HTTPS végpontot használja; a health refresh és a FULL BUILD dispatch ugyanazon korlátozott gateway API-n történik.

A gateway csak négy műveletet ismer: service health, sanitizált node-health, exact Git-bundle dispatch és run-status. Nincs általános shell/terminal végpont. A feltöltött bundle branch/head egyezése külön bare Git verify repositoryban ellenőrzött, a kijelölt runner közvetlenül futás előtt újra READY/LIVE/FREE validációt kap. A tényleges SSH/SCP csak az MCP VPS gateway workerben létezik, és csak BUILD01/BUILD02 felé. Artifact PASS esetén a gateway BUILD_ID + metadata + SHA-256 ellenőrzés után visszaszinkronizál a canonical DEV artifact store-ba. A DEV alkalmazásszerver FULL BUILD fallbackje továbbra is tiltott; PROD DENY változatlan.

## v0.1.17 System Health – external storage and Supabase traffic

A részletes System Health a DEV VPS lokális lemezét már nem külön „DEV TÁRHELY” kártyaként ismétli; a lokális lemezkapacitás a DEV VPS szerverkártyában marad. A külön tárhely-kártyák valódi külső szolgáltatásokat mérnek: a DIMPRO Drive + Drop Hetzner Object Storage bucketek összesített, read-only S3 foglaltságát és objektumszámát, valamint a Hetzner BX11 Storage Box read-only SSH `df` kapacitását. A Hetzner Object Storage 1 TB értéke account-szintű báziskeretként jelenik meg, nem bucket hard limitként.

A System Health külön `SUPABASE FORGALOM` kártyát is támogat. A request-forgalom kizárólag a Supabase Management API read-only analytics végpontjairól olvasható, `analytics_usage_read` jogosultságú, külön `BENJADMIN_SUPABASE_ANALYTICS_TOKEN` secrettel. A meglévő Supabase service-role kulcsot a monitoring nem használja. Ha az analytics token hiányzik, a kártya explicit `NINCS TOKEN` állapotot mutat, nem talál ki forgalmi értéket. Origin/cached egress és kvóta csak hiteles usage snapshotból jelenhet meg; 85% felett WARNING, 95% felett CRITICAL health szintet ad.

A szerver/resource kártyák nagy kijelzős tipográfiát és függőleges elválasztó vonalakat kaptak. CPU-nál százalék + becsült használt/összes vCPU, RAM/Swap/lemez esetén használt/összes kapacitás + százalék jelenik meg.

## v0.1.18 System Health – csoportos táblázatos nézet

A System Health részletes panel a szervereket többé nem öt ismétlődő kártyaként jeleníti meg. A DEV VPS, BUILD01, BUILD02, PROD/ÉLŐ és DB VPS egy közös összehasonlító táblázatba kerül: az első oszlop egyszer tartalmazza a Host, CPU, RAM, Swap, Tárhely, Load 1m és Uptime mezőneveket, az öt további oszlop pedig az öt szerver értékeit és fejléc-státuszát. Ez megszünteti az ismétlődő címkéket és nagy kijelzőn gyorsabb összehasonlítást tesz lehetővé.

A Hetzner Object Storage és a BX11 Storage Box szintén egy közös kétoszlopos külső-tárhely táblázatban jelenik meg. A Supabase forgalom és az AI/kapcsolat külön, kompakt blokk marad. A v0.1.17 túl nagy metrika-tipográfiája vissza lett véve: a fő táblázat 9,5 px, a csoportcím 11,5 px, a státusz badge 8,5 px alapméretet használ; 1500 px alatti szélességnél 9 px-re csökken. A függőleges és vízszintes táblázati elválasztók megmaradnak.


## v0.1.19 System Health – kontraszt, védett szerver telemetria és Supabase analytics

Világos módban a System Health READY/INFO/WARNING/CRITICAL badge-ek külön sötét előtérszínt, erősebb keretet és elkülönülő háttérszínt kapnak. A PROD és DB oszlopok a read-only elérhetőségi RTT-t mindig megjelenítik; ha nincs friss (legfeljebb 5 perces) resource snapshot, a státusz kifejezetten `ONLINE · RÉSZLEGES`, és CPU/RAM/lemez adatot nem találunk ki. A resource snapshot normalizáló a camelCase és snake_case mezőket, valamint a `cpuPercent`, `uptimeSec` és RTT aliasokat is kezeli.

A Supabase Management API lekérés kizárólag read-only `analytics_usage_read` jogosultságú tokennel működik. A token átadható `BENJADMIN_SUPABASE_ANALYTICS_TOKEN` környezeti változóban vagy alapértelmezetten a `/root/.dimpro-secrets/supabase-dev/analytics-usage-read.token` szerveroldali secret fájlból; service-role kulcsra nincs fallback. A request analytics endpointok: `usage.api-counts` és `usage.api-requests-count`.

## v0.1.22 Supabase monitoring – biztonságos admin bekötés

A `NINCS TOKEN` Supabase állapot most közvetlen `BEKÖTÉS` műveletet ad a Windows System Health panelen. Ez a Developer Grid saját DEV runtime-ján kiszolgált, külön setup oldalt nyitja meg, ezért nem függ a fő BENJADMIN admin runtime verziójától. A setup oldal a meglévő BENJADMIN admin kulccsal hívja az admin-only `/api/dev/grid/supabase-monitoring` végpontot.

A beküldött token mentés előtt mindkét read-only usage végponton validálódik, és csak sikeres `analytics_usage_read` jogosultság esetén kerül 0600 jogosultságú DEV secret fájlba. A token értékét az API soha nem adja vissza; törléskor csak a helyi monitoring secret törlődik, a Supabase-fiókban létrehozott token nem kerül automatikusan visszavonásra. Mentés/törlés azonnal invalidálja a System Health Supabase cache-t.


## v0.1.22 Supabase monitoring – canonical admin + scoped-only gate

A Supabase monitoring setup a Developer Grid lokális admin-kulcsa mellett a canonical BENJADMIN admin runtime (`127.0.0.1:3100`, Host: `admin.dev.dimpro.hu`) által validált böngészős admin-hitelesítést is elfogadja. Így a fő BENJADMIN adminban már hitelesített böngészőből nem kell külön Developer Grid admin kulcsot kezelni.

A monitoring token gate fail-closed: kizárólag `sbp_fc…` kezdetű scoped/fine-grained PAT fogadható el. A két `analytics_usage_read` usage endpointnak sikeresnek kell lennie, miközben egy ettől független Project Settings Read endpointnak 403-mal tiltva kell maradnia. Classic vagy túl széles scoped token nem menthető. A setup felület a token típust már beillesztéskor jelzi és classic tokennél a Mentés gombot letiltja.


## v0.1.22 Protected read-only telemetry ingress

A PROD és DB VPS teljes CPU/RAM/Swap/tárhely/uptime adataihoz a Developer Grid külön write-only DEV ingress végpontot biztosít: `POST /api/dev/grid/protected-telemetry`. Csak dedikált protected-telemetry kulccsal, `prod-vps` vagy `db-vps` node-hoz, szigorú metrika-allowlisttel és időbélyeg-validációval fogad mintát. A DEV snapshot atomikusan, `PROD DENY` metaadattal tárolódik.

A `scripts/developer-grid/protected-telemetry-agent.py` kizárólag helyi Linux OS számlálókat olvas (`/proc`, `statvfs`) és HTTPS-en küld sanitizált mintát; nincs parancsfogadó csatornája és nincs SSH-végrehajtása. Amíg nincs külön engedéllyel telepítve a protected hostokra, a UI `ONLINE · RÉSZLEGES` állapotot és RTT-t mutat.


## v0.1.23 Windows device presence heartbeat

- A párosított Developer Grid Windows kliens feloldott állapotban 5 percenként sanitizált heartbeatet küld a meglévő Windows Bridge heartbeat végpontra.
- A heartbeat kizárólag a DPAPI/safeStorage-ban őrzött device tokent használja Bearer hitelesítésre; a token nem kerül renderer eseménybe vagy naplóba.
- Az agent/session azonosító a lokális device metadata-ból érkezik, a hálózati kérés 8 másodperces timeouttal fail-closed.
- Lock, kilépés vagy a live client leállítása megszünteti a heartbeat ütemezést.
- Cél: a `last_seen_at` valóban jelezze, hogy a Developer Grid Windows kliens aktív, és a későbbi fizikai Windows E2E bizonyíték ne csak a pairing időpontjára támaszkodjon.
- DEV ONLY · PROD DENY.
