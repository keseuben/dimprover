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
