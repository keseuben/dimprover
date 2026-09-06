# BENJADMIN Developer Grid v0.1.13 – Control Plane Foundation

**Dátum:** 2026-09-05
**Worker:** OutminAI
**Környezet:** DEV ONLY · PROD DENY
**Kiinduló canonical HEAD:** `4a9c802d995f2206cb000962617a88f14b8116bf`
**Fejlesztési branch:** `feature/benjadmin-developer-grid-v013-outminai-20260905`

## Cél

A Developer Grid négy ChatGPT-cellás munkaterét és a középső BENJADMIN Fejlesztői Vezérlőpultot egyetlen valódi fejlesztésindítási control plane alapjává tenni a `Developer_G_Autom_Hand_Diagnostics_V1_260903` átadó szabályai szerint.

## Ebben a blokkban megvalósított alapok

1. A dockolt Fejlesztői Vezérlőpult induláskor zárt, ezért a négy ChatGPT `WebContentsView` teljes cellaszélességet kap. A korábbi `visible: true` default megszűnt.
2. A Developer Grid fejlécében külön ChatGPT felület-státusz jelenik meg: online állapot, utolsó frissítés, Grid UI verzió és kézi biztonságos Frissítés gomb.
3. A központi Vezérlőpult BUILD RUNNER POOL blokkban a meglévő sanitizált System Health / MCP gateway adatláncból megjeleníti BUILD01 és BUILD02 valós health állapotát, build-lock és Storage Governor jelekkel.
4. A work-start többé nem enged `AUTO` worker-választást. Explicit ÁrminAI / OutminAI / BenjáminAI / JázminAI választás kötelező. Hiányzó worker: `DEVELOPER_GRID_WORKER_REQUIRED`. Eltérő routed worker: `DEVELOPER_GRID_WORKER_ROUTE_MISMATCH`. Automatikus/rejtett fallback tiltott.
5. A continuity/handoff továbbra is kontextust adhat, de a BenjAdmin által választott workert nem írhatja felül.
6. Az új task kap legalább modul-szintű explicit scope-ot.
7. A worker Task Launch V3 Launch Packet tartalmazza a branch, worktree, base HEAD, sessionId, scope és acceptance adatokat.
8. A Task Launch V3 kötelező `BOOT ACKNOWLEDGEMENT` blokkot kér kódolás előtt. Source-baseline vagy scope eltérés esetén `Coding allowed: NO` és `SOURCE_BASELINE_MISMATCH / CLARIFICATION_REQUIRED`; fájlírás tiltva.

## BOOT ACK / valódi fejlesztésindítás – elkészült alap

- A központi `MUNKA INDÍTÁSA` meglévő, authoritative módon rögzített worker-csevegés esetén automatikusan elküldi a Task Launch V3 Launch Packetet.
- A desktop a worker legutóbbi assistant-válaszából csak a BOOT ACK struktúrát olvassa ki; a teljes választ nem írja authoritative adatként a szerverre.
- Az ACK branch/worktree/base HEAD/task/session/worker/PROD DENY/Coding allowed mezői fail-closed validációt kapnak.
- A válasz SHA-256 lenyomata és a strukturált ACK állapot paired DEV API-n kerül authoritative rögzítésre.
- VALIDATED ACK után a desktop automatikusan elküldi a `BOOT_ACK_ACCEPTED_V1` vezérlőeseményt, és csak ezután engedi a fejlesztési folytatást.
- Hibás, hiányos, eltérő vagy időtúllépett ACK `BLOCKED`; automatikus folytatás nincs.
- Új projektcsevegésnél a csevegés explicit rögzítése után ugyanaz a Launch Packet → BOOT ACK lánc indul.

## BUILD Runner Pool / remote executor – integrálva

- A korábbi BUILD Runner Pool és Remote Build Executor V1 fejlesztési ág bekerült a v0.1.13 control plane-be.
- BUILD01 priority 1, BUILD02 priority 2; egyik sem használható rejtett DEV-host FULL BUILD fallbackkel.
- A központi Vezérlőpult `FULL BUILD INDÍTÁSA` gombja csak aktív task/session + validált BOOT ACK után engedélyezett.
- A build authoritative `GridBuildRun` állapotot kap: `QUEUED → ASSIGNED → RUNNING → PASS/FAIL/BLOCKED`.
- A scheduler által kijelölt runner explicit azonosítóval kerül a remote dispatcherhez; runner-állapot változásnál fail-closed.
- A build detached jobként fut, BUILD_ID, artifact SHA-256, output SHA-256, evidenceRef és failure code visszacsatolással.
- A felület BUILD01/BUILD02 health mellett megjeleníti az aktív run-t, commitot és a legutóbbi build eredményét.
- Automatikus queue reconciliation csak már explicit módon kért buildet indíthat el.

## Diagnostic Evidence Engine / Review Gate – elkészült control-plane alap

- Új append-only, sanitizált `GridEvidence` réteg készült: FILE / TEST / ERROR / HANDOFF / BUILD / BOOT_ACK / REVIEW.
- A bizonyíték csak technikai mezőket és SHA-256 lenyomatokat tárol; arbitrary chat/provider/document body nincs. Secret és érzékeny path maszkolt.
- A stage-action prompt kötelező `BENJADMIN_STAGE_REPORT_V1` gépi blokkot kér; a desktop a worker válaszából ezt automatikusan felismeri és paired DEV API-n evidence-ként rögzíti.
- A stage 1–6 között monoton haladhat; visszalépés fail-closed.
- Javítva lett egy kritikus provenance-rés: az induló Launch HEAD külön `baseHead`, a fejlesztés aktuális commitja külön authoritative `head`. Új HEAD csak branch/worktree/repository ellenőrzés és fast-forward ancestry után fogadható el.
- FULL BUILD és V.Guard a current authoritative HEAD-et újraellenőrzi; buildhez clean worktree kötelező.
- Három kapu készült: REVIEW READINESS, BUILD GATE, CLOSURE / HANDOFF. A blokkerek current-HEAD alapon értékeltek.
- 5/6 BUILD fázisban a FULL BUILD V.Guard PASS/PASS_WITH_NOTES evidence nélkül blokkol.
- 6/6 LEZÁRÁS current-HEAD PASS BUILD + COMPLETED HANDOFF evidence-et igényel.
- V.Guard explicit gombos, review-only futás: sensitive diff/path fail-closed, külső provider csak READY execution/pricing/secret/model és budget gate mellett használható. Automatikus provider-költés nincs.
- A központi Vezérlőpulton megjelenik az evidence darabszám, current/base HEAD, stage, a három gate és a V.Guard provider readiness.

## Következő fejlesztési blokk

- A Diagnostic Evidence panel vizuális/native Windows E2E ellenőrzése;
- v0.1.13 Windows candidate csomag elkészítése;
- valós BUILD01 candidate build és artifact evidence visszaellenőrzés; szükség esetén BUILD02 fallback acceptance;
- csak külön konfiguráció/jóváhagyás mellett külső V.Guard provider live próba.

## Biztonsági invariantok

- DEV ONLY · PROD DENY.
- Worker explicit, fallback DENY.
- Source/worktree/HEAD fail-closed.
- Handoff/context nem írhatja felül az authoritative task-routolást.
- Build végrehajtás csak központi gate és READY runner mellett.
- A BUILD01/BUILD02 health-adat read-only; a tényleges FULL BUILD executor kizárólag a központi Runner Pool gate-en keresztül indítható.

## Validáció – Diagnostic Evidence / Review Gate blokk

- repository-szintű `npx tsc --noEmit`: **PASS**;
- teljes `npm run lint`: **0 error**; a repository meglévő warningjai megmaradtak, a Diagnostic Evidence blokk saját új lint warningja nincs;
- Desktop acceptance: **76/76 PASS**;
- Workspace/chat regresszió: **37/37 PASS**;
- BOOT ACK: **8/8 PASS**;
- Work-start: **38/38 PASS**;
- Health Core V2: **41/41 PASS**;
- Build node gateway: **22/22 PASS**;
- Build Runner Pool: **33/33 PASS**;
- Remote Build Executor V1: **25/25 PASS**;
- Build Control Plane: **14/14 PASS**;
- Diagnostic Evidence contract: **22/22 PASS**;
- Foundation: **51 required files / 59 invariants PASS**;
- `git diff --check`: **PASS**.

A repository-szintű TypeScript futás előtt a canonical `package.json` / `package-lock.json` által már deklarált Monaco/XTerm csomagok hiányoztak a közösen használt DEV `node_modules` cache-ből. Ezek DEV dependency-hidratálása után a teljes TypeScript ellenőrzés zöld. Forrás dependency-verzió vagy lockfile emiatt nem módosult ebben a branchben.

A külső V.Guard provider live futás **nem történt meg**. A jelenlegi `dimprover-dev` runtime-ban nincs konfigurált OpenAI/Anthropic provider secret + model + HUF pricing + execution gate, ezért a V.Guard explicit indítása helyesen fail-closed marad. Ennek engedélyezése külön, tudatos DEV konfigurációs lépés.


## MCP Build Transport Gateway V1 – 2026-09-05

A BUILD01/BUILD02 infrastruktúra ellenőrzése során kiderült, hogy a canonical `dimpro-dev` VPS a build node-okat közvetlenül nem éri el, miközben az MCP VPS mindkettőhöz hitelesített és működő SSH útvonallal rendelkezik. A Developer Grid ezért nem kapott új közvetlen DEV→BUILD SSH kerülőutat. Helyette elkészült a külön, korlátozott **MCP Build Transport Gateway V1**.

Adatút:

`Developer Grid / canonical DEV → HTTPS mcp.dimprover.hu/build-gateway/v1 → MCP VPS gateway → BUILD01 vagy BUILD02 → MCP VPS → canonical DEV artifact store`

Fő szabályok:

- a Developer Grid kliens és a `refresh-build-gateway-snapshot.mjs` nem tartalmaz BUILD SSH/SCP végrehajtást;
- a canonical DEV csak domainalapú HTTPS kapcsolaton kommunikál a gatewayjel;
- a gateway process csak loopback címen figyel, az Nginx ingress csak a canonical DEV VPS-t engedi;
- a gateway API kizárólag node-health, exact bundle dispatch és run-status műveletekre korlátozott;
- általános command/terminal/deploy/migration/restart/cutover API nincs;
- az exact Git bundle külön bare verify repositoryban ellenőrzött, a branch ref HEAD = requested sourceCommit követelmény fail-closed;
- a runner a dispatch elfogadásakor és a worker indulásakor is újraellenőrzött;
- BUILD01 elsődleges, BUILD02 fallback a schedulerben, de a gateway a már kijelölt runner helyett nem választ rejtetten másikat;
- a gateway worker ellenőrzi a runner resultot, BUILD_ID-t, metadata provenance-t és artifact SHA-256-ot;
- PASS után az artifact + metadata + result atomikusan visszakerül a canonical DEV `/srv/dimpro-dev/artifacts/build-runs/<runId>` tárba;
- PROD hozzáférés és PROD művelet minden rétegben `DENY`.

A gateway szolgáltatás forrása verziózott az `ops/developer-grid/build-gateway/` könyvtárban. A telepített gateway service neve `dimpro-build-gateway.service`; a runtime port csak localhoston `8791`. A publikus alkalmazáskapcsolat továbbra is domainalapú, a konkrét DEV VPS IP csak az Nginx hálózati allowlist része.


## v0.1.13 release provenance hardening – 2026-09-05

Az MCP Build Transport Gateway első valós BUILD01 futása sikeresen lezárult az `d78a5c7d5a354cb510c736a48d3cc6f3c7409d9a` commiton. Run: `v013-mcp-build01-20260905-1734`; BUILD_ID: `gaugmFlD3HgzF9Mc7w0aw`; artifact SHA-256: `391fb4eed8028a4e32f1b8afe6c762a967a5d3e03302c6e4d388e602950422aa`. A futás a `DEV → HTTPS MCP gateway → BUILD01 → gateway → canonical DEV artifact store` útvonalon ment végig, PROD hozzáférés nélkül.

A Windows candidate és release wrapper-ek korábbi v0.1.12 / 2026-08-27 canonical worktree kötéseit a v0.1.13 canonical forrásra frissítettük. Az érintett kapuk továbbra is fail-closed módon ellenőrzik a `dimpro-dev` hostot, a `/srv/dimpro-dev/repositories/dimprover.git` közös repositoryt, az explicit v0.1.13 worktree-t és branch-et, a tiszta Git állapotot, a pontos HEAD-et, a `.next/BUILD_ID` + `.dimpro-release.json` provenance-t, valamint a `DEV ONLY · PROD DENY` szabályt. A DEV ZIP-be a Build Transport Gateway verziózott `ops/developer-grid` forrása is bekerül.

## System Health felület + nagy kijelzős olvashatóság – 2026-09-05

A Developer Grid alsó státuszsávja és a System Health réteg a Windows nagy kijelzős használathoz új vizuális geometriát kapott.

- A felső alkalmazásfejléc 44 px, a négy worker-cella fejléce 108 px, az állandó státuszléc 42 px. A fejléc-, cellafejléc- és lábléc-tipográfia 1500 px alatt visszafogottabban, 2200 px felett nagyobb mérettel skálázódik.
- A jobb alsó `B` System Health gomb hover állapotban teljes szélességű, 86 px magas `SYSTEM HEALTH · GYORSNÉZET` sávot nyit közvetlenül a lábléc felett. A gyorsnézet összefoglaló állapotot, aktív riasztást és DEV / BUILD01 / BUILD02 / PROD / DB rövid állapotot mutat.
- A `B` gombra kattintás fix, teljes szélességű System Health kártyát nyit közvetlenül a lábléc felett. A kártya DEV VPS, BUILD01, BUILD02, PROD, DB, tárhely és Kapcsolat/AI oszlopokat jelenít meg; külön overall állapot-pill, frissítési idő és kézi frissítés gomb tartozik hozzá.
- A dockolt Central Core / Fejlesztői Vezérlőpult és az opcionális központi panel System Health megnyitásakor automatikusan a gyorsnézet vagy a részletes kártya fölé húzódik. Így a Central Core többé nem takarhatja ki a System Health réteget.
- A natív ChatGPT `WebContentsView` bounds továbbra is ugyanekkora alsó területet tart fenn, ezért a natív nézetek sem fedik le a gyorsnézetet vagy a részletes kártyát.
- A System Health read plane kezelése javult: ha egy korábban mentett device token 401/403 választ kap, a read-only kliens megpróbálhatja a már konfigurált reporter credentialt. Írási jogosultság vagy write-fallback ebből nem keletkezik.
- Ha egyik olvasási credential sem érvényes, a felület nem marad néma `—` állapotban: `PÁROSÍTÁS` / `PÁROSÍTÁS SZÜKSÉGES` állapotot jelez és a gyorsnézetben rövid hibamagyarázat jelenik meg.

Új/érintett contract ellenőrzések:

- System Health / UI contract: **25/25 PASS**;
- Desktop live delta contract: **20/20 PASS**;
- Workspace/chat regresszió: **37/37 PASS**;
- Desktop acceptance: **76/76 PASS**;
- BOOT ACK: **8/8 PASS**;
- Work-start: **38/38 PASS**;
- Build Control Plane: **14/14 PASS**;
- Build node gateway: **22/22 PASS**;
- Build Runner Pool: **33/33 PASS**;
- Remote Build Executor V2 MCP transport: **28/28 PASS**;
- Health Core V2: **41/41 PASS**;
- Foundation: **54 required files / 63 invariants PASS**.

## v0.1.17 System Health – külső tárhely és Supabase forgalom – 2026-09-06

A Windows acceptance alapján a System Health nagy kijelzős olvashatósága tovább erősödött: a részletes kártyák címei, státuszai és metrikái nagyobb tipográfiát kaptak, az erőforrás-oszlopokat jól látható függőleges separator választja el. CPU-nál a terhelési százalék mellett a teljes vCPU-szám és becsült használt vCPU jelenik meg; RAM, Swap és szerverlemez esetén `használt / teljes · %` formátum az alap.

A korábbi külön `DEV TÁRHELY` kártya megszűnik mint duplikált lokális lemeznézet. A DEV VPS saját lemeze továbbra is a DEV VPS kártyában látszik. A külön infrastruktúra-kártyák helyette:

- **HETZNER OBJECT STORAGE** – a konfigurált DIMPRO Drive + Drop S3 bucketek read-only összesítése, használt/1 TB account-szintű báziskeret, szabad érték, százalék és objektumszám. Az 1 TB nem bucket hard limit.
- **HETZNER BX11 STORAGE BOX** – a fix `dimpro-backup-bx11` SSH alias read-only `df` méréséből kapacitás, használt, szabad és százalék. Tetszőleges shell/írás nincs.
- **SUPABASE FORGALOM** – Supabase Management API read-only analytics adapter. Request count metrikákhoz külön `analytics_usage_read` jogosultságú `BENJADMIN_SUPABASE_ANALYTICS_TOKEN` szükséges. A service-role key nem monitoring credential. Hiányzó tokennél explicit `NINCS TOKEN`, nem hamis nulla érték jelenik meg. Egress/cached egress csak hiteles usage snapshotból jelenhet meg; 85% felett WARNING, 95% felett CRITICAL.

Élő DEV ellenőrzésben a Hetzner Object Storage mindkét DIMPRO bucketje elérhető volt, összesen 88 objektummal; a BX11 read-only kapacitásmérés is működik. A Supabase project ref azonosítható, de külön Management API analytics token jelenleg nincs konfigurálva, ezért a live forgalmi kártya helyesen fail-closed `NINCS TOKEN` állapotú marad.
