# DIMPRO Build Retention V1 – BUILD01 / BUILD02

Dátum: 2026-10-07  
Környezet: DEV ONLY · PROD DENY

## Cél

A BUILD01 és BUILD02 remote FULL BUILD node-ok tárhelyének kontrollált, fail-closed kezelése. A build node ephemeral runner: forráskódot, node_modules-t, .next build outputot és ideiglenes bundle-t nem őriz hosszú távon.

## Feltárt gyökérok

BUILD01 normál executorja cleanup trap-et használ, ezért a worktree-k eltűnnek, de a lokális artifact tarballok hónapokig gyűltek.

BUILD02-n a MANUAL_SAFE_FALLBACK_GATEWAY_403 manual build útvonal teljes source clone-t, node_modules-t és .next kimenetet hagyott maga után. Egy sikeres manual build kb. 2,4 GB. Az auditkor:
- manual-runs: kb. 55 GB;
- worktrees: kb. 14–16 GB;
- artifacts: kb. 6 GB;
- temp: kb. 0,9 GB.

## Retention szabályok

- PASS manual source: 2 óra után jelölt, de csak matching DEV scope, result/metadata, source HEAD, source commit és artifact SHA proof mellett.
- FAIL manual source: minimum 24 óra után jelölt.
- Detached build worktree: 2 óra után jelölt, ha matching artifact proof van, Git worktree regisztrált, HEAD egyezik, nincs process/current-run referencia.
- Temp bundle: 2 óra után jelölt, ha nem aktív run.
- Artifact tarball: 24 óra után csak DEV_COPY_VERIFIED markerrel és SHA egyezéssel; a legújabb 10 verified artifact runnerenként megmarad.
- Log: 14 nap.
- npm cache: 5 GiB felett figyelmeztetés; V1-ben nincs automatikus prune.
- Aktív FULL BUILD lock vagy current-run.json esetén az egész apply DENY.

## Storage Governor

- 0–35%: SAFE
- 35–45%: WATCH
- 45–55%: AUTO_CLEAN
- 55–65%: CACHE_PRUNE
- 65–75%: WAIT
- 75–85%: DENY
- 85% felett: CRITICAL

A health script a küszöböket a /srv/dimpro-build/config/retention-v1.json fájlból olvassa. Hiányzó vagy hibás config esetén a runner BLOCKED.

## Gateway artifact proof

A build gateway minden sikeres normál build után:
1. átmásolja az artifactot a DEV build-runs tárba;
2. újraszámolja a DEV oldali SHA-256 értéket;
3. csak exact egyezés esetén ír DEV_COPY_VERIFIED.json markert a build node artifact könyvtárába.

Artifact auto-retention csak e marker birtokában engedélyezett.

## Telepített állapot 2026-10-07

- retention executable telepítve BUILD01 és BUILD02 node-ra;
- retention config telepítve;
- health governor új szabályokra átállítva;
- gateway worker DEV-copy SHA marker támogatása telepítve;
- óránkénti dimproadmin crontab DRY_RUN report aktív;
- fizikai retention apply a chat MCP külső safety rétegén blokkolt, ezért automatikus delete nincs kerülőúton engedélyezve.

## Dry-run eredmény

BUILD01:
- nagy automatikus cleanup nincs;
- régi artifactok marker nélkül DENY;
- csak néhány MB régi log jelölt.

BUILD02:
- 23 PASS manual source;
- 6 orphan build worktree;
- 31 temp bundle;
- 5 régi log;
- összes tervezett reclaim: kb. 66,1 GiB;
- artifact tarball auto-delete: 0, marker hiány miatt.

A fizikai apply csak jóváhagyott, auditált maintenance executoron keresztül végezhető.

## Build dispatch origin rule

A remote FULL BUILD dispatch authoritative originja kizárólag a `dimpro-dev` host. A 2026-10-07 audit bizonyította, hogy a `mcp.dimprover.hu/build-gateway/v1` 403 válaszai a gateway host saját `213.160.68.24` publikus címéről érkeztek, miközben a DEV `213.160.68.32` kérései 200 OK választ kaptak. Ezért `GATEWAY 401/403` esetén automatikus manual build fallback tilos. A művelet fail-closed állapotba kerül, és a dispatchot a DEV authoritative hostról kell újraindítani.

A `remote-build-dispatch.mjs` ezt `BUILD_DISPATCH_WRONG_HOST` guarddal kényszeríti ki. A default expected host `dimpro-dev`; teszt/fixture célra külön környezeti override létezik (`DIMPRO_BUILD_DISPATCH_EXPECTED_HOST`).

## Lock behavior

A `DRY_RUN` csak rövid, nem blokkoló FULL BUILD lock-probe-ot végez induláskor és a scan végén; a többperces fájlvizsgálat alatt nem tartja fogva a build lockot. Ha közben aktív build jelenik meg vagy a lock foglalttá válik, a dry-run fail-closed eredménnyel megszakad. Az `APPLY` ezzel szemben a teljes osztályozás és törlési műveletsor alatt exkluzívan tartja a FULL BUILD lockot.

## Historical artifact backfill és végső dry-run

A 2026-10-07-i historical backfill kizárólag olyan runner artifactokra készült, ahol a következő három SHA-256 bizonyíték teljesen egyezett: a runner `metadata.json` deklarált SHA-ja, a runner `build-artifact.tar.gz` újraszámolt SHA-ja, valamint a DEV canonical `/srv/dimpro-dev/artifacts/build-runs/<runId>/build-artifact.tar.gz` újraszámolt SHA-ja. A fájlméretnek is egyeznie kellett. Ahol a DEV tarball már nem létezett, marker nem készült.

Eredmény:
- BUILD01: 71 exact historical artifact marker, 6 303 886 476 byte (5,871 GiB) igazolt készlet.
- BUILD02: 39 exact historical artifact marker, 3 551 739 854 byte (3,308 GiB) igazolt készlet.
- Összesen: 110 exact historical marker, kb. 9,18 GiB igazolt artifactkészlet.

A post-backfill retention DRY_RUN eredménye:
- BUILD01: 149 jelölt / 5 381 873 664 byte (5,012 GiB), ebből 61 artifact és 88 log.
- BUILD02: 89 jelölt / 73 165 258 752 byte (68,140 GiB), ebből 23 manual source, 6 worktree, 31 temp bundle, 24 artifact és 5 log.
- Együttes jelölt reclaim: 78 547 132 416 byte (73,152 GiB).

A DRY_RUN egyik node-on sem végzett törlést. A fizikai APPLY a chat MCP/OpenAI safety rétegében blokkolódik még szerveroldali indulás előtt; kerülőút nem engedélyezett. A final Central Core execution request:
`/srv/dimpro-dev/coordination/checkpoints/BENJADMIN_EXECUTION_REQUEST_BUILD_NODE_RETENTION_FINAL_20261007.json`
SHA-256: `d9149f8f2784886921d439122ec1c95e479b05a15b4d4f99898a26a1022e600d`.

## Emergency DEV storage build freeze

2026-10-07-én a DEV filesystem 99% közelébe került, ezért a BUILD01/BUILD02 runner executor alapszintjén emergency freeze került bevezetésre. Authoritative executor:
`ops/developer-grid/build-runner/dimpro-build-runner-executor-v1`

Executor source commit: `467e71930aaaced9b452f8b87c87dd0bf29071c1`.
Executor SHA-256: `8972ea44c2d87fe18da59cdf02570ed2132c285af407de3e7bf2219303bab451`.

A runner induláskor ellenőrzi a `/srv/dimpro-build/state/dev-storage-freeze.json` sentinelt. Aktív sentinel esetén minden új FULL BUILD a bundle feldolgozása előtt `DEV_STORAGE_ADMISSION_BLOCKED` eredménnyel leáll. A freeze csak akkor oldható fel, ha a DEV szabad tárhely igazoltan legalább 15 GiB, és külön feloldási művelet történt.

Contract proof 2026-10-07: BUILD01 és BUILD02 egyaránt `DEV_STORAGE_ADMISSION_BLOCKED`, `current-run` tiszta, destruktív művelet nincs.

## MCP guarded retention actions

Aktív MCP release: `v2.3.3-guarded-retention-apply-20261007`, server SHA-256 `37d2c692f82b1daa4a59a8e30d29ad5391d86525fbaf699db74519b9fcd6889c`.
Publikált toolok: `preview_build_retention`, `apply_build_retention`, `preview_dev_retention`, `apply_dev_retention`, `read_safe_delete_skill`.

A BUILD apply kizárólag exact R4 execution request + exact fresh candidate-set + approved preflight SHA mellett engedélyezett. A DEV apply kizárólag a canonical 65-ös offsite-backed build-tarball manifestet kezelheti. Mindkét apply `destructiveHint: true`, Safe Delete acknowledgementet igényel, és PROD DENY.

A jelenlegi ChatGPT csevegés connector tool-schema cache-e még a korábbi 8 toolt látja, ezért a két új apply action ebből a chatből nem hívható közvetlenül. A szerveroldali `tools/list` viszont mindkettőt publikálja. Közvetlen localhost/curl destruktív bypass nem használható.
