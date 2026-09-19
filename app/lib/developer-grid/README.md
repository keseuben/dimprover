# BENJADMIN Developer Grid V1 foundation

A Developer Grid V1 külön rendszerstruktúra; a ChatGrid v0.3.x fallback/reference marad. A Central Core Task/Workflow, Worker Registry, Worker Session, Development Context, Source Provenance, Activity/Event, Handoff/Document, Build, Release/Runtime, Review és Telemetry contractokra épül. Authoritative context sorrend: active session → explicit task → verified task provenance → activity → git → presence → heuristic; presence nem authoritative.

A runtime state alapértelmezett helye `/srv/dimpro-dev/coordination/developer-grid`. A state atomikus JSON, az event log append-only JSONL; history cursoros/paginált, a realtime mód `DELTA_EVENT`, full-snapshot polling tiltott. Source mismatch: `SOURCE_BASELINE_MISMATCH`; release/runtime mismatch: `RELEASE_STATE_MISMATCH`.

A `build01.dimpro.hu` és `build02.dimpro.hu` remote FULL BUILD node. BUILD01 az elsődleges, BUILD02 a fallback. Ha egyik sem friss `READY + LIVE + FREE`, a FULL BUILD `QUEUED`; a DEV alkalmazásszerver nem használható rejtett FULL BUILD fallbackként. Nem hitelesített alternatív vagy párhuzamos build tilos.

A Developer Console bridge read-only módon olvassa a meglévő BENJADMIN task/session/worker állapotot, de a presence nem írhatja felül a Task + Session + Provenance kontextust.

## Task/session materializáció

A Developer Grid saját state store-ja a canonical Developer Console bridge-ből és az ellenőrzött source provenance-ből idempotensen materializálja az aktuális task/session állapotot. Ha ugyanahhoz a workerhez és taskhoz már van aktív session, azt újrahasználja; nem nyit párhuzamos sessiont. A state/event írás cross-process `mutation.lock` alatt sorosított, 5 másodperces fail-closed timeouttal. A 30 másodpercnél régebbi lock csak akkor oldható fel automatikusan, ha bizonyítottan nincs élő tulajdonosa; friss vagy élő PID-hez tartozó lock mindig védett marad.
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


## v0.1.24 Physical Windows E2E artifact identity

- A Windows heartbeat a párosított, feloldott és csomagolt Developer Grid kliens pontos artifact-azonosságát is jelenti: termék, appverzió, portable EXE SHA-256 és bájtméret.
- Az EXE hash egyszer, streamelve készül a tényleges portable forrásfájlról; a kliens ezt cache-eli, így az 5 perces heartbeat nem hash-eli újra a ~95 MB artifactot.
- A szerver szigorúan validálja a termék/verzió/SHA/méret mezőket, és kizárólag sanitizált kliensazonosságot tárol a device metadata mezőben szerveroldali `reportedAt` idővel.
- A Windows device listából így ellenőrizhető lesz, hogy a fizikai gépen ténylegesen az adott publikus EXE SHA futott-e; ez a physical Windows E2E lezárási bizonyíték egyik gépi forrása.
- A heartbeat nem tartalmaz kulcsot, tokent vagy más credentialt; PROD továbbra is DENY.


## v0.1.25 Physical Windows E2E gate

- A Central Core külön `PHYSICAL WINDOWS E2E` kaput jelenít meg.
- A gate a párosított Windows device sanitizált attesztációját a publikus DEV artifact manifesttel hasonlítja össze.
- Kötelező egyezések: current source HEAD, current BUILD_ID, DEV/PROD DENY manifest, kliensverzió, EXE SHA-256 és bájtméret.
- A Windows heartbeat legfeljebb 10 perces lehet, így régi vagy leállított kliens nem adhat zöld kaput.
- Sikeres device heartbeat automatikusan frissíti a Central Core panelt; kézi token, jelszó vagy raw credential nem kerül a UI-ba.
- A gate önmagában nem zár le taskot és nem enged PROD műveletet; a későbbi closure evidence egyik kötelező forrása lesz.


## v0.1.26 Central Core theme persistence + light contrast

- A dockolt Central Core / Context Workspace megnyitott állapota runtime-authoritative. Általános konfigurációmentés vagy sötét/világos téma váltás nem írhatja felül stale renderer `visible/detached` értékkel.
- A main process megőrzi a teljes aktuális Context Workspace runtime layoutot, majd config update után újra publikálja a `context:layout` állapotot.
- A shell renderer a layout eventből frissíti a saját config snapshotját is, így a következő beállításmentés már nem régi panelállapotból indul.
- Világos módban külön nagy kontrasztú szöveg- és felületértékek készültek a work-start, aktív munka, Diagnostic Evidence, gate-ek, V.Guard, Build Runner Pool és Context Pack másodlagos szövegeire.
- Acceptance: nyitott Central Core mellett dark→light→dark váltás után a panel maradjon nyitva és elöl; light módban a leíró/segédszövegek legyenek jól olvashatók.
- PROD továbbra is DENY.


## v0.1.27 Physical Windows artifact attestation fallback

- A v0.1.26 fizikai heartbeatje élő volt, de a szerver `client` attesztációja üres maradt, ezért a `PHYSICAL WINDOWS E2E` gate BLOCKED állapotban maradt.
- A Windows kliens most két byte-azonos release-forrást próbál: először az electron-builder `PORTABLE_EXECUTABLE_FILE` forrását, majd a startupkor készített stabil LocalAppData másolatot.
- Egy olvasási/lock hiba az első forráson nem némítja el az attesztációt; a második fizikai másolat SHA-256 + bájtméret alapján ugyanúgy bizonyíthatja a release artifactot.
- A renderer esemény csak `REPORTED` / `UNAVAILABLE` státuszt kap; fájlútvonal, token és SHA nem kerül ki a heartbeat eseménybe.
- A szerveroldali Physical Windows E2E gate továbbra is az immutable publikus manifest SHA-256 + bytes értékével hasonlít, és PROD DENY marad.


## v0.1.28 Standby cover automatic return

- A készenléti takaró aktív worker-task alatt továbbra sem látszik.
- Aktív task belépésekor a runtime törli a korábbi kézi készenléti feloldást, ezért az nem maradhat stale bypass a task lezárása után.
- Amikor a worker taskja `completed`, `closed`, `cancelled/canceled` vagy `failed` állapotba kerül, a következő DELTA/live snapshot újraértékeli a workert és automatikusan visszateszi a `MUNKATÉR KÉSZENLÉTBEN` takarót.
- Ha nincs aktív task és a felhasználó kézzel kattint az avatárra, a feloldás továbbra is az aktuális ChatGPT-tab session idejére megmarad.
- A Central Core továbbra is kivétel a standby overlay alól; PROD DENY változatlan.


## v0.1.29 Physical Windows E2E diagnosztika

- A fizikai heartbeat friss, de a szerveroldali `client` artifact identity továbbra is üres volt, ezért a v0.1.29 sanitizált attesztációs probe-ot vezet be.
- A Windows kliens a `PORTABLE_EXECUTABLE_FILE` mellett a `PORTABLE_EXECUTABLE_DIR` alapján is rekonstruálja a canonical portable wrapper fájlnevet, majd a stabil LocalAppData másolatot próbálja.
- A heartbeat csak biztonságos állapotot küld: packaged Windows, env-jelzők, candidate darabszám, stabil másolat léte és kötött failure-code lista. Fájlútvonal, token és SHA nem kerül a probe-ba.
- A szerver a probe-ot sanitizálva tárolja, és a Central Core PHYSICAL WINDOWS E2E blokkoló sora rövid failure-code-ot tud mutatni, ha az identity továbbra sem jelenthető.
- PROD DENY változatlan.

## v0.1.30 Protected PROD / DB resource telemetry enrollment

- A PROD és DB VPS read-only resource agentje nem igényel kézzel másolt közös ingest secretet.
- Az első agent-futás source-IP-hez kötött, 10 perces, egyszeri enrollmenttel kér node-specifikus kulcsot a DEV runtime-tól. PROD forrás: `213.160.68.24`, DB forrás: `213.160.68.33`.
- A kulcs az adott VPS-en `/etc/benjadmin/protected-telemetry.key` alatt 0600 módban tárolódik; a DEV oldalon node-specifikus secret fájl készül.
- Az enrollment ugyanazzal a nonce-szal csak rövid replay ablakban ismételhető hálózati hiba esetére; utána admin reset nélkül nem ad új kulcsot.
- A systemd agent one-shot, percenként timerből indul, nincs shell/command channel, nincs inbound port és nincs remote execution. Csak `/proc`, `statvfs` és uptime adatokat olvas, majd HTTPS-en sanitizált metrikát küld DEV-be.
- A System Health csak friss mintát tekint LIVE-nak; stale minta esetén automatikusan visszaáll PARTIAL állapotra. PROD alkalmazás- vagy DB-konfigurációt az agent nem módosít.

## v0.1.31 Supabase DEV / PROD monitoring

- A meglévő scoped `analytics_usage_read` token változatlanul a DEV secretfájlban marad. Az új projektbekötés nem kér új tokent, és nem módosít Supabase-adatot.
- A DEV projektazonosító a canonical DEV konfigurációból érkezik. A dimprover / PROD projektazonosító külön, admin által megerősített és analytics-only módon ellenőrzött konfigurációban tárolódik. A token nem jogosult projektbeállítások lekérésére, ezért a projekt neve nem igazolható automatikusan; az admin a Supabase Dashboard URL-jéből másolja az azonosítót.
- A `PUT /api/dev/grid/supabase-monitoring` kizárólag a PROD mappinget fogadja, megerősített `dimprover` névvel, DEV-től eltérő, érvényes ref-fel. Mentés előtt mindkét read-only usage végpontnak sikerülnie kell, a Project Settings Read pedig 403 marad. Az írás atomikus, 0600 jogosultságú.
- A System Health két külön resource node-ot és két külön DEV/PROD oszlopot közöl; egy projekt hibája nem írja felül a másik metrikáit. Hiányzó érték null/—, nem kitalált nulla. Az API alapértelmezett időszaka nem minősül teljes számlázási ciklusnak. A request-számokat nem összegezzük szervezeti billing-egressként, és egress-kvótát nem osztunk fel projektekre.
- A token érvényessége és a projektmapping egymástól külön kezelendő. A meglévő DEV token státusz kompatibilis marad; új token mentése már minden beállított projektet ellenőriz. A rendszer kizárólag DEV runtime-ban fut, PROD application/database write nincs.
- A v0.1.30 immutable release és a korábbi Central Core/Windows E2E működés változatlan. A v0.1.31 új Windows candidate ellenőrzés után adható ki.

## v0.1.32 Protected telemetry

Admin setup: /api/dev/grid/protected-telemetry/setup. Admin API: GET/POST /api/dev/grid/protected-telemetry/admin. Public enrollment requires the selected node source IP, a valid one-time admin code, and a client nonce. The code is returned only on explicit admin preparation and stored only as a digest. No automatic public self-enrollment and no shared ingest secret. Existing node keys are not overwritten. Failed or lost enrollment requires status review; no automatic reset. The host installer must be run from a verified source bundle on the actual authorized host. It performs a single interactive enrollment and first read-only sample before enabling its systemd timer. Periodic execution uses DynamicUser and LoadCredential. No application, database, or SSH configuration changes are part of telemetry collection. Legacy historical resource snapshots remain excluded from LIVE. Production access stays DENY.

## v0.1.33 Central Core Conversation Memory + 6-stage executable workflow

- A Central Core munkaindítás már nem csak Grid-feladatot materializál: a kijelölt kódmérnök részére valódi DevCenter engine sessiont indít. A rögzített ChatGPT-csevegés `HANDED_OFF`, a validált BOOT ACK `RUNNING` engine-állapotot eredményez. Explicit worker továbbra is kötelező; automatikus worker-fallback tiltott.
- A fejlesztési memória három külön réteg: `RAW_CHAT_TRANSCRIPT_V1` (Fekete doboz), `BENJADMIN_CONTEXT_SNAPSHOT_V1` (sanitizált folytatási kontextus) és `BENJADMIN_HANDOFF_PACK_V1` (lezárási/átadási csomag). A RAW réteg append-only delta formátumú, hash-láncolt és task/session/conversation azonosítóhoz kötött; nem kerül automatikusan vissza promptként.
- A Windows desktop a taskhoz authoritative módon rögzített `/c/...` ChatGPT-beszélgetést figyeli. Generálás közben nem ment, változatlan transcriptet deduplikál. A szerveroldali memory könyvtár 0700, a fájlok 0600 jogosultságúak.
- A következő, azonos projekt/modul/submodul task Launch Packetje a legfrissebb sanitizált Context Snapshotot és hiteles handoffot folytatási forrásként kapja. A nyers csevegés csak audit/feketedoboz forrás.
- A felső hatlépcsős sáv tényleges vezérlő: 1 ELEMZÉS → 2 FEJLESZTÉS → 3 TESZTELÉS → 4 ELLENŐRZÉS → 5 BUILD/KIADÁS → 6 LEZÁRÁS. Stage-visszalépés és -átugrás tiltott. 1→2, 2→3 és 3→4 worker stage reporttal történik; 3→4 current-HEAD TEST/PASS evidence-et igényel.
- A 4→5 átmenetet csak explicit Central Core V.Guard review PASS/PASS_WITH_NOTES nyithatja meg. Az 5→6 átmenetet csak a Central Core BUILD01/BUILD02 FULL BUILD PASS eredménye nyithatja meg. Worker oldali közvetlen FULL BUILD és DEV-host build fallback továbbra is tiltott.
- A 6/6 lezárási gomb csak VALIDATED BOOT ACK + current-HEAD PASS teszt + review + PASS build + COMPLETED automatikus handoff esetén zár. Ekkor a DevCenter task `completed`, a Grid task `COMPLETED`, a Grid session `endedAt` értéket kap.
- A Central Core az authoritative task/source állapotot reconciliálja. Source-eltérés vagy 72 óránál régebbi állapot `ELAVULT` jelzést kap; a régi task történet marad, de új fejlesztést új Central Core taskként kell indítani.
- DEV ONLY · PROD DENY.


### v0.1.33 canonical source baseline
A Developer Grid foundation alapértelmezett authoritative forrása a `feature/benjadmin-developer-grid-v013-outminai-20260905` branch és a `/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v013-outminai-20260905` worktree. A régi 2026-08-27 foundation worktree csak történeti forrás; új Central Core task nem indulhat róla. Környezeti override továbbra is lehetséges, de source provenance ellenőrzés fail-closed.

## BOOT ACK előtti Launch Recovery

`claimed + TASK_BOUND/HANDED_OFF` még `READY`; `RUNNING` csak validált BOOT ACK után. A várólistás task nem írhatja felül a tényleges aktív session taskját. Megszakadt Launch Packet ugyanahhoz a task/session/csevegéshez újraküldhető a Central Core resume útján, új task nélkül. DEV ONLY · PROD DENY.

## v0.1.37 · BOOT ACK recovery

- A BOOT ACK feldolgozás közös desktop pipeline-on fut a launch-monitor, a Conversation Memory monitor és az `INDÍTÁS FOLYTATÁSA` recovery számára.
- Ha a Launch Packet a ChatGPT mezőbe bekerült, de a felhasználó kézzel küldi el Enterrel, a folyamatos transcript monitor a már meglévő valid BOOT ACK-et utólag is felismeri és authoritatively rögzíti.
- Az `INDÍTÁS FOLYTATÁSA` előbb a legfrissebb assistant választ vizsgálja. Valid BOOT ACK esetén nem küld duplikált Launch Packetet; invalid ACK esetén fail-closed blokkol.
- A BOOT ACK feldolgozás task + session + response SHA alapján deduplikált, a continuation küldése idempotens, átmeneti persist hiba pedig újrapróbálható marad.


## v0.1.38 · DevCenter engine session heartbeat

- A Developer Grid desktop a VALIDATED BOOT ACK utáni aktív worker session DevCenter lease-ét azonnal, majd 5 percenként paired-device, DEV-only heartbeat útvonalon megújítja.
- A szerver kizárólag az authoritative Grid task/session `engineSessionId` értékét használhatja; kliens nem adhat tetszőleges DevCenter session azonosítót. A heartbeat VALIDATED BOOT ACK, aktív Grid task és aktuális source provenance nélkül fail-closed.
- Sikertelen heartbeat 60 másodperces retry ciklust kap; workspace lock/kilépés leállítja a heartbeatet. PROD DENY.
- A DevCenter `cancelled` task a Gridben is terminális `CANCELLED`; többé nem eshet vissza `RUNNING` állapotba, és aktív session hiányában nem kap hamis `ACTIVE_SESSION_MISSING` figyelmeztetést.

## v0.1.39 · Central Core launch/state + heartbeat ownership hotfix

- A DevCenter `bind_task` most az `assigned_worker_id` mellett az authoritative `claimed_by_session_id`, `claim_expires_at` és `last_claimed_at` mezőket is rögzíti. Ez megszünteti azt a v0.1.38 fizikai hibát, amelyben a paired-device session heartbeat a helyes Grid session ellenére 409 választ kapott.
- A heartbeat továbbra is fail-closed: csak a VALIDATED BOOT ACK-kal rendelkező authoritative Grid task/session, az aktuális source provenance és ugyanahhoz a workerhez/taskhoz kötött DevCenter engine session újítható meg.
- A ChatGPT Launch Packet és a `BOOT_ACK_ACCEPTED_V1` ugyanazt a megerősített auto-send útvonalat használja: aktuális send-button testid variánsok, azonos form submit gomb és `requestSubmit()` fallback támogatott. A küldést a desktop továbbra is megfigyeli; nem igazolt elküldés fail-closed.
- A Central Core normál work-start után azonnal visszaolvassa az authoritative active-work state-et, ezért a korábbi task kártyája nem maradhat stale kijelzésként a frissen indított munka fölött.
- A state materializer aktív DevCenter bridge task+session hiányában nem generál többé mesterséges `RUNNING` taskot vagy synthetic worker sessiont; ilyen esetben no-op állapotot ad vissza `NO_ACTIVE_BRIDGE_SESSION` okkal.
- A Windows autostart kapcsoló a Beállításokban explicit megnevezést kap: BE esetén Windows bejelentkezéskor automatikus indulás, KI esetén csak kézi indulás. A meglévő `launchAtLogin` konfiguráció és Electron `setLoginItemSettings()` lánc megmarad, regressziós contract védi.
- Célzott v0.1.39 regresszió: Central Core hotfix 19/19 PASS. DEV ONLY · PROD DENY.

## v0.1.40 · Terminal bridge materializer hotfix

- A v0.1.39 publikus artifact fizikai Windows rolloutja előtt kiderült, hogy a Developer Console bridge egy történelmi `blocked` task + `closed` session párt még visszaadhat kontextusként. A materializer ezt korábban pusztán az objektumok létezése miatt `RUNNING` Grid sessionné materializálta.
- v0.1.40-től Grid RUNNING materializáció csak akkor engedett, ha a bridge task státusza `claimed`, `in_progress` vagy `testing`, és a worker session státusza `open` vagy `active`.
- Minden terminális vagy inaktív pár no-op: `materialized=false`, `session=null`, `BRIDGE_TASK_SESSION_NOT_ACTIVE`, a sanitizált task/session státuszokkal. Synthetic vagy történelmi RUNNING session nem jöhet létre.
- A candidate smoke aktív bridge esetén VERIFIED sessiont vár, terminális/inaktív bridge esetén pedig kifejezetten no-op materializációt. DEV ONLY · PROD DENY.
- A v0.1.39 immutable artifact audit/rollback célra megmarad, de fizikai kliensre nem tekintendő aktuális kiadásnak; a v0.1.40 supersede-eli.

## v0.1.41 · Worker Surface Selector + Codex Task Bridge

- A worker-identitás és a munkafelület külön fogalom: ugyanaz az ÁrminAI, OutminAI, BenjáminAI vagy JázminAI worker `CHATGPT`, `CODEX` vagy később `WORK` surface-hez köthető. Surface-váltás nem hoz létre új worker-identitást, és nem bővít scope-ot vagy jogosultságot.
- A provider taxonomy külön kezeli a felületet és a végrehajtást. A ChatGPT, a Codex és a tervezett Work is `OPENAI_FIRST_PARTY`; a Codex nem `EXTERNAL_AI`. A Codex v0.1.41 végrehajtási módja `TASK_BRIDGE`, a ChatGPT meglévő embedded chat/BOOT ACK útja változatlan marad.
- A négy elsődleges worker cella fejlécében perzisztens surface-választó jelenik meg. Alapértelmezés és backward-compatible mód: `CHATGPT`. `CODEX` aktív. `WORK` az adatmodellben és adapterrétegben előkészített OpenAI first-party surface, de a UI-ban v0.1.45-ig fail-closed.
- Codex módban nincs ChatGPT DOM-fallback, nincs mesterséges `/codex` WebContents és nincs külön `worker_codex`. A Central Core izolált DEV Task Bridge-et készít: egy task = egy deterministic worker branch + egy worktree + explicit path-scope + atomikus claim/scope lease.
- A Task Bridge induló artefaktumai: `TASK.md`, `task.json`, `CODEX_BOOTSTRAP.txt`, `audit.jsonl`. A futási lánc további gépi artefaktumai: `result.json`, `REVIEW.md`, `review.json`, `build.json`, `ACCEPTANCE.md`, `acceptance.json`. A `.devgrid/tasks/` runtime terület Gitből kizárt.
- A `task.json` lifecycle-manifest; a `taskJsonInitialSha256` kizárólag a létrehozáskori snapshot hash-e. A státusz a Task Bridge authoritative metadata állapotával együtt frissül. A fő állapotlánc: `READY_FOR_WORKER → WORKER_RUNNING → WORKER_COMPLETED → REVIEW_PENDING → REVIEW_IN_PROGRESS → REVIEW_PASS | REVIEW_CHANGES_REQUESTED → BUILD_PENDING/BUILD_RUNNING → DEV_ACCEPTANCE_PENDING → DEV_ACCEPTANCE_PASS`. Hibás provenance vagy gate esetén fail-closed `ERROR`/blocked állapot érvényes.
- A Codex worker átadása sanitizált bootstrap prompttal történik. A `result.json` csak `provider=CODEX`, `status=WORKER_COMPLETED`, teljes Git SHA, exact changed-file lista és ugyanazon base commit mellett fogadható el. A worktree-nek tisztának kell lennie, a Git diffnek `diff --check` PASS állapotúnak, minden módosításnak az engedélyezett scope-ban kell maradnia. Sensitive/RED path és `supabase/migrations` Task Bridge V1-ben tiltott.
- Result import után külön BenAI review indul `REVIEW.md` alapján. A gépi `review.json` csak ugyanarra a base/result commitra, `reviewer=BENAI` mellett fogadható el. `CHANGES_REQUESTED` esetén a build zárva marad; a `JAVÍTÁS VISSZA CODEXHEZ` rework új sessiont és scope lease-t nyit, a korábbi result/review artefaktumokat history könyvtárba archiválja, és a review findingokat tartalmazó új Codex bootstrapot ad.
- FULL BUILD kizárólag `REVIEW_PASS` proof, clean reviewed commit és változatlan scope mellett kérhető. A Task Bridge nem kap külön build motort: a meglévő hardened BUILD01/BUILD02 scheduler használatos, BUILD01 elsődleges, BUILD02 fallback, különben `QUEUED`. DEV alkalmazásszerver build fallback nincs.
- PASS build nem zárja le automatikusan a taskot. `ACCEPTANCE.md` és `DEV_ACCEPTANCE_PENDING` következik; csak a build run/build ID/source commit provenance-hez kötött `acceptance.json` `DEV_ACCEPTANCE_PASS` eredménye zárhatja sikeresen a Dev Engine taskot.
- A Desktop és a Central Core ugyanazt a hat Task Bridge állapotjelzőt használja: `WORKER`, `GIT`, `SCOPE`, `REVIEW`, `BUILD`, `DEV`. A surface selector teljes nemterminális Task Bridge alatt zárolt.
- A ChatGPT conversation binding és Conversation Memory továbbra is a generikus `surfaceType`, `surfaceConversationId`, `surfaceConversationUrl`, `surfaceConversationTitle`, `surfaceConversationConfirmedAt` provenance mezőket használja; a korábbi `chatConversation*` mezők backward-compatibility célra megmaradnak. Codex Task Bridge artefaktum nem olvadhat össze ChatGPT RAW transcriptbe.
- DEV ONLY · PROD DENY minden Task Bridge lépésnél. Deploy, restart, migration, release és PROD végrehajtás nem része a Codex Task Bridge V1-nek.

### v0.1.41 review hardening
A hagyományos `/api/dev/grid/work-start` út Codex esetén fail-closed `CODEX_TASK_BRIDGE_REQUIRED`, mert a ChatGPT Launch Packet / BOOT ACK / DOM transcript protokoll nem használható Codex végrehajtásra. A Codex kizárólag a párosított DEV eszközzel védett Task Bridge API-n indítható. A Work surface v0.1.45-ig `WORK_SURFACE_PLANNED_V0145` állapotban marad. Ismeretlen explicit surface nem normalizálódhat csendben ChatGPT-re.

### v0.1.41 source-authority + Central Core execution proof hardening
A Launch Packet `WORKTREE / BRANCH / BASE HEAD` hármasa a `CENTRAL CORE SOURCE PREFLIGHT PROOF` blokkal együtt authoritative source provenance. A Central Core a ChatGPT Launch Packet előtt szerveroldalon létrehozza vagy validálja a determinisztikus `worker/<worker>/<task>` branchet és task-worktree-t, a Dev Center sessiont `READY` handshake állapotig viszi, atomi scope-lockot és worktree lease-t szerez, majd az exact Git provenance + `write` execution gate ellenőrzése után SHA-256-tal kötött `SourceExecutionProof` rekordot rögzít. Launch Packet proof nélkül fail-closed.

A ChatGPT worker nem használhat `/root/dimprover`, scratch repositoryt vagy default MCP cwd-t helyettesítő source-ként, de a saját ChatGPT sandboxból hiányzó közvetlen `/srv/...` mount önmagában már nem source-preflight blocker: a worker a Central Core proof SHA-256 értékét köteles a BOOT ACK `Source proof` mezőjében pontosan visszaadni. A backend az ACK pillanatában újraszámolja a proof hash-t, újra ellenőrzi az exact task-worktree provenance-t és az aktív scope-lock/worktree lease write-gate-et. Eltérés esetén a BOOT ACK BLOCKED marad. `SOURCE_BASELINE_MISMATCH` csak Central Core proof/provenance eltérésre használható; végrehajtó eszköz hiánya külön `EXECUTION_TOOL_UNAVAILABLE` állapot.

A korábbi v0.1.40/v0.1.41 eleji `TASK_BOUND` Launch Packetekhez az `INDÍTÁS FOLYTATÁSA` recovery ugyanazt a task/sessiont viszi READY állapotig, friss source proofot készít, a régi proof nélküli/blokkolt BOOT ACK-ot nem használja újra, és új task létrehozása nélkül friss Launch Packetet küld.

### v0.1.41 ChatGPT launch race hardening
Aktív ChatGPT-válaszgenerálás alatt a Grid nem szúrhat be és nem küldhet új Launch Packetet. Ha a task Launch Packetje már elküldött állapotú, a kliens `response-pending` recovery módba lép, ugyanazt a task/sessiont figyeli és nem duplikál promptot. Ha a generálás más okból aktív, `CHATGPT_GENERATION_ACTIVE` fail-closed állapot jelenik meg és a felhasználó a generálás befejezése/leállítása után az `INDÍTÁS FOLYTATÁSA` művelettel folytathatja ugyanazt a taskot. A 5 perces BOOT ACK monitor timeout `RESPONSE_TIMEOUT / BOOT_ACK_TIMEOUT` állapotot rögzít, új taskot nem hoz létre.


## v0.1.42 · Central Core renderer boot hotfix
- A v0.1.41 publikus artifact immutable marad; a renderer-javítás külön v0.1.42 patch release.
- A `context-workspace.js` első `render()` hívása előtt explicit `active` work-state készül, így a Central Core panel nem állhat le `ReferenceError` miatt.
- A Work OpenAI first-party adapter aktiválása az Execution Bridge v0.1.43 release miatt v0.1.45-re tolódik; a v0.1.43-ban továbbra is fail-closed.

## v0.1.43 · Central Core Execution Bridge V1
- ChatGPT surface worker közvetlen VPS/MCP mount nélkül, strukturált `BENJADMIN_EXECUTION_REQUEST_V1` kérésekkel dolgozik.
- A Desktop paired-device API-n közvetít; a backend minden kérésnél újraellenőrzi az authoritative task/session/source proof, READY engine session, scope-lock és worktree lease állapotot.
- V1 actionök: `LIST_FILES`, `READ_FILE`, `SEARCH_FILES`, `WRITE_FILE`, `GIT_STATUS`, `GIT_DIFF`, `GIT_DIFF_CHECK`, `RUN_DEV_COMMAND` (`TSC|LINT|CONTRACT`).
- Nincs nyers shell. RED/sensitive path, symlink, `.git`, `.next`, `node_modules`, PROD, deploy, restart, migration és release tiltott. A teljes build továbbra is Central Core/BUILD01-02 kapu.
- A requestId idempotens és append-only DEV auditot kap; az execution eredmény automatikusan visszakerül ugyanabba a worker ChatGPT beszélgetésbe.
- Work surface aktiválás v0.1.45.


## v0.1.44 · Stage-1 BOOT ACK recovery hotfix

- Ha a worker a kötelező BOOT ACK blokk helyett előbb egy strukturált Stage-1 PASS reportot ad, a Desktop csak szigorú exact identity/proof/source evidence egyezés esetén használhatja BOOT ACK recoveryként.
- Kötelező egyezés: worker, task, session, HEAD, CENTRAL_CORE proof SHA-256, READY handshake, legalább 1 scope lock + 1 worktree lease, PROD DENY, codingAllowed=true, exact branch/worktree és sourceConflict=false.
- FAIL/BLOCKED/ERROR evidence vagy bármely identity/proof eltérés fail-closed; free-form szöveg soha nem elegendő.
- A Work OpenAI first-party adapter aktiválása v0.1.45-re tolódik.


## v0.1.45 · Stage-1 transcript recovery hotfix

- A Desktop BOOT ACK recovery már nem csak a legutóbbi asszisztensüzenetet vizsgálja: a teljes rögzített ChatGPT transcriptből visszakeresi a legutóbbi strukturált `BOOT ACKNOWLEDGEMENT` vagy `BENJADMIN_STAGE_REPORT_V1` jelöltet.
- A Stage-1 report továbbra is csak a szigorú `validateStageReportAsBootAck()` kapun keresztül fogadható el: exact worker/task/session/HEAD/source-proof/branch/worktree, `CENTRAL_CORE`, `READY`, scope-lock, worktree lease, `PROD DENY`, `codingAllowed=true`, negatív evidence nélkül.
- A Conversation Memory ugyanezt a strukturált ACK-jelölt osztályt használja, ezért egy későbbi free-form asszisztensválasz nem takarhatja el a korábbi valid Stage-1 PASS reportot.
- Az `INDÍTÁS FOLYTATÁSA` ugyanebből a transcript-history jelöltből helyreállíthatja a BOOT ACK persist → heartbeat → `BOOT_ACK_ACCEPTED_V1` → Execution Bridge láncot, új Launch Packet küldése nélkül.
- Szabad szöveg továbbra sem válhat BOOT ACK-ká. PROD hozzáférés továbbra is DENY.
- A ChatGPT Work OpenAI first-party adapter aktiválása a hotfix miatt **v0.1.46-ra** tolódik.


## v0.1.46 · Live BOOT ACK monitor + pre-recovery ordering hotfix

- A live `monitorWorkerBootAck()` a transcript-aware `captureLatestBootAckCandidate()` helperrel dolgozik; a későbbi assistant turn nem takarhatja el a strukturált BOOT ACK / Stage-1 PASS jelöltet.
- Az `INDÍTÁS FOLYTATÁSA` a backend execution recovery előtt megpróbálja a meglévő strukturált ACK-jelöltet a jelenlegi authoritative task/session/source proof ellen validálni.
- Aktív ChatGPT-generálás alatt source proof nem rotálódhat: a Grid ugyanazon session BOOT ACK-jára vár.
- Csak execution-lifecycle jellegű mismatch (`engineExecutionGate`, `scopeLock`, `worktreeLease`, `sourceProofLocks`, `sourceProvenance`) léphet tovább kontrollált recoveryre. Task/session/worker/branch/HEAD/proof eltérés továbbra is fail-closed.
- A Work OpenAI first-party adapter a hotfix miatt **v0.1.47-re** tolódik.


## v0.1.47 · Execution proof propagation hotfix

- A validált BOOT ACK authoritative sourceProofSha256 értéke mostantól a Desktop task-launch rekordban is persistálódik.
- A BOOT_ACK_ACCEPTED_V1 control event és a CENTRAL_CORE_EXECUTION_BRIDGE_V1 request-sablon a persistált proofot használja akkor is, ha a lokális task snapshotból a sourceExecutionProof mező hiányzik.
- Az Execution Bridge helyi identity-check ugyanebből a persistált proof fallbackből dolgozik, így nem keletkezhet üres proof miatti EXECUTION_REQUEST_IDENTITY_INVALID vagy lokális mismatch.
- A Work OpenAI first-party adapter aktiválása a hotfix-sorozat miatt v0.1.50-re tolódik.


## v0.1.48 · Legacy execution request recovery hotfix

- A már meglévő, korábbi kliens által létrehozott proof nélküli execution request automatikusan helyreállítható új TASK_LAUNCH nélkül.
- Recovery csak validált BOOT ACK, exact task/session/worker identity és üres sourceProofSha256 esetén indulhat.
- Az automatikus recovery kizárólag read-only műveletekre engedélyezett: LIST_FILES, READ_FILE, SEARCH_FILES, GIT_STATUS, GIT_DIFF és GIT_DIFF_CHECK.
- WRITE_FILE és RUN_DEV_COMMAND legacy proof nélküli request esetén továbbra is fail-closed.
- A recovery új determinisztikus requestId-t és az authoritative source proofot használ, és ugyanarra a hibás requestre legfeljebb egyszer küldhető.
- A Work OpenAI first-party adapter aktiválása a hotfix miatt v0.1.49-re tolódik.


## v0.1.49 · Session-authority execution recovery

- A v0.1.48 fizikai E2E feltárta, hogy a legacy execution recovery a BOOT ACK és proof állapotot task top-level mezőkből próbálta olvasni, miközben az authoritative értékek az aktív worker session developmentContext objektumában élnek.
- A Desktop recovery most read-only fetchDeveloperGridActiveWork() fallbackkal exact task/session/worker egyezés mellett olvassa az authoritative session állapotot.
- Recovery csak bootAckState=VALIDATED, bootAckCodingAllowed=true, sourceExecutionProof.state=VERIFIED, authority=CENTRAL_CORE, handshakeStage=READY, legalább 1 scope lock és worktree lease, productionAccess=DENY, valamint VERIFIED source provenance mellett indul.
- A recovery továbbra is kizárólag read-only execution actionokra engedélyezett; WRITE_FILE és RUN_DEV_COMMAND proof nélküli legacy kérésből nem állítható helyre.
- Új TASK_LAUNCH nem keletkezik; a meglévő task/session folytatódik.
- A Work OpenAI first-party adapter tervezett aktiválása v0.1.50.


## v0.1.50 · Stale recovery retry

- A fizikai v0.1.49 E2E feltárta, hogy a lokális recovery dedupe tartós SENT állapota blokkolhatja az újrapróbálást akkor is, ha nem született tényleges req-recovery assistant-válasz és backend execution audit.
- Ugyanarra az invalid legacy requestre a Desktop 90 másodperces cooldown után újrapróbálhatja a recovery promptot.
- A retry legfeljebb 3 próbálkozásra korlátozott, ezért nem alakulhat ki végtelen prompt-loop.
- A recovery requestId továbbra is determinisztikus, így a backend execution audit idempotens marad.
- A retry kizárólag a korábban engedélyezett read-only legacy recovery actionokra érvényes; WRITE_FILE és RUN_DEV_COMMAND továbbra is fail-closed.
- Új TASK_LAUNCH továbbra sem keletkezik.
- A Work OpenAI first-party adapter tervezett aktiválása v0.1.51.


## v0.1.51 · Transcript-confirmed recovery send

- A fizikai v0.1.50 E2E megmutatta, hogy a composer kiürülése vagy a generálás elindulása önmagában nem bizonyítja a recovery prompt tényleges elküldését.
- A recovery csak akkor kap SENT_CONFIRMED állapotot, ha az EXECUTION_REQUEST_RECOVERY_V1 marker tényleges USER üzenetként megjelenik a ChatGPT transcriptben.
- A transcript-ellenőrzés messageId és capturedAt bizonyítékot is tárol.
- Nem bizonyított küldés SEND_PENDING marad és 20 másodperces cooldown mellett legfeljebb 3 alkalommal próbálkozhat újra.
- A v0.1.50-ből örökölt, nem transcript-igazolt retry állapot nem blokkolja a v0.1.51 első ellenőrzött próbálkozását.
- A recovery továbbra is kizárólag read-only legacy actionokra használható; WRITE_FILE és RUN_DEV_COMMAND fail-closed.
- Új TASK_LAUNCH továbbra sem keletkezik.
- A Work OpenAI first-party adapter tervezett aktiválása v0.1.54.


## v0.1.52 · Multi-session live snapshot

- A natív DELTA live snapshot több párhuzamos aktív worker session esetén már minden aktív sessionhez külön task-projekciót készít.
- A globális state.task részletes adatai továbbra is authoritative primary taskként maradnak meg.
- A nem-primary, de aktív sessionök saját taskId, worker, branch, worktree, source HEAD, modul és conversation binding adataikkal kerülnek a snapshot tasks[] listájába.
- A legacy chatConversationId és chatConversationUrl továbbra is felpromotálódik generikus surfaceConversationId / surfaceConversationUrl mezővé.
- Ez megszünteti azt a hibát, amikor egy másik worker globális current taskja miatt a BenjáminAI aktív taskja eltűnt a Desktop live contextből, és emiatt leállt a Conversation Memory / Execution Recovery ciklus.
- PROD továbbra is DENY.
- A Work OpenAI first-party adapter tervezett aktiválása v0.1.54.

### v0.1.52 · Task / Context / Checkpoint worker-cell actions

- **AKTUÁLIS TASK** már nem toast: task-specifikus Task Inspector nyílik authoritative task/session/source/proof/BOOT ACK/conversation/execution adatokkal.
- **KONTEXTUS** ugyanennek a worker tasknak a Conversation Memory Context Snapshotját, continuity/handoff és RAW transcript/evidence állapotát mutatja; nem nyitja meg a globális Context Workspace-t.
- **CHECKPOINT** exact worker/task/session + VERIFIED DEV provenance + CENTRAL_CORE proof + scope-lock + worktree lease + VALIDATED BOOT ACK + bound conversation guard után automatikusan küld.
- A checkpoint küldés csak tényleges USER transcript marker után válik igazolttá. Állapotai: PREPARING → SENT_CONFIRMED → WAITING_RESPONSE → PASS/BLOCKED.
- A BENJADMIN_STAGE_REPORT_V1 válasz HEAD/commit, summary és evidence adatai visszakerülnek a Checkpoint Inspectorba.
- Checkpointból FULL BUILD, release, restart, migration és PROD művelet nem indulhat. Új task és TASK_LAUNCH sem keletkezik.
- A korábbi `7973afb0` multi-session build nem release; az UI action fixszel együtt új regresszió és új BUILD01 szükséges.
- DEV ONLY · PROD DENY.


## v0.1.53 · Conversation rollover · betelt ChatGPT csevegés biztonságos folytatása

- A Conversation Memory a kötött ChatGPT transcript legutóbbi assistant üzenetében felismeri a ChatGPT magyar vagy angol maximális beszélgetéshossz jelzését. Általános „hosszú beszélgetés” szöveg nem trigger.
- A rollover **nem új fejlesztési task**: megmarad az exact `taskId`, `sessionId`, worker, stage, branch, worktree, source HEAD, Central Core source proof, scope-lock és worktree lease. `TASK_LAUNCH` nem készül.
- A régi csevegés utolsó állapota előbb RAW transcriptként mentődik, majd a hozzá tartozó Context Snapshot + Handoff Pack azonosító, revision, HEAD és source-proof befagyasztásra kerül.
- A Desktop csak ChatGPT Project `/g/g-p-.../c/...` kötésből indíthat automatikus rollover-t. A rendszer ugyanannak a Projectnek a gyökérnézetére navigál, új csevegést indít, és `CONVERSATION_ROLLOVER_V1` kontrollpromptot küld.
- A küldés csak akkor fogadható el, ha a marker tényleges USER üzenetként megjelenik az új transcriptben, és az új `/c/...` conversation ID eltér a régitől.
- A Central Core rebind csak exact previous-conversation + Context Snapshot + revision + Handoff Pack + HEAD + source-proof + VALIDATED BOOT ACK + PROD DENY egyezés mellett engedélyezett. A futó engine task `RUNNING` állapota megmarad.
- Az új kódmérnök `BENJADMIN_CONVERSATION_ROLLOVER_ACK_V1` blokkban visszaigazolja ugyanazt a task/session/source identity-t. Az Execution Bridge addig fail-closed `CONVERSATION_ROLLOVER_ACK_REQUIRED`.
- Rollover lifecycle: `HANDOFF_SAVED → NAVIGATING → CONTINUATION_SENT → ACK_WAIT → READY`; bármely identity/provenance/transcript eltérés `BLOCKED`.
- A Task Inspector külön mutatja a rollover állapotot, előző/új conversation ID-t, befagyasztott Context/Handoff azonosítókat, transcript proofot, ACK SHA-256 értéket és hibát.
- A **teljesen új témát** nem ez a rollover út indítja. Új témánál a Grid Központ valódi új work-startot, új task/session identity-t és valódi `TASK_LAUNCH` láncot készít; a korábbi Context/Handoff csak opcionális continuity-forrás lehet.
- DEV ONLY · PROD DENY.
