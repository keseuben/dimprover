# 197 — BENJADMIN normatív checkpoint · Terminal Hub / Live Workspace indulás

Dátum: 2026-08-14
Környezet: DEV
Kiinduló commit: `666a651`
Kiinduló build: `WM0xJnq4PQVOxsjKrluRe`
Állapot: DOKUMENTÁCIÓS CHECKPOINT / 06-P0 ELŐKÉSZÍTVE

## 1. Cél

Ez a checkpoint a BENJADMIN 01–06 fejlesztési forrásait egyetlen aktuális normatív láncba rendezi, rögzíti a tényleges DEV implementációs állapotot, valamint kijelöli a Terminal Hub / Terminál Parancstár / Live Workspace következő fejlesztési blokk indulási feltételeit.

A 06-os fejlesztés NEM új BENJADMIN, NEM külön IDE és NEM párhuzamos task/session/worktree motor. A meglévő BENJADMIN Control Plane, Fejlesztői Konzol, B3 koordináció, worker/session/task modell, central lock, audit és security réteg fölé épül.

## 2. Normatív forráslánc

A további BENJADMIN fejlesztésnél a következő hat dokumentumot együtt kell kezelni:

1. `01_DIMPRO_BENJADMIN_B3_teljes_fejlesztoi_es_kodolasi_atadas_2026-08-09.pdf`
   - SHA-256: `1820111561b166d21747765e36a32e09a60831abb9fce0121536323f62984332`
   - szerep: B3 alaparchitektúra, DEV/PROD/STAG, Git/worktree/scope/lock, release és approval alap.
2. `02_DIMPRO_BENJADMIN_B3_1_kiegeszito_control_plane_realtime_naplo_monitoring_2026-08-10.pdf`
   - SHA-256: `6eb3b5fc95df659531a0b4193d7007da49442b1ab07dad1d937433cb3f9347bd`
   - szerep: Control Plane, tartós memória, munkanapló, realtime/silent refresh, monitoring.
3. `03_DIMPRO_BENJADMIN_B3_2_partner_development_plane_outminai_kulso_termekek_2026-08-11.pdf`
   - SHA-256: `6f2bf62b97f7c9077c1c342dab57030b8fc284cb662406402b3b8afc822969fa`
   - szerep: Partner Development Plane, OutminAI izoláció, partner lifecycle.
4. `04_DIMPRO_BENJADMIN_Fejlesztoi_Konzol_V1_reszletes_fejlesztesi_terv_2026-08-12.pdf`
   - SHA-256: `27529a52809e5ade4491bacc1ddc1992412e05101c282935e1a38778728e6b17`
   - szerep: napi ember–AI fejlesztői munkafelület, közös csevegés, élő munka, Parancstár, Fejlesztési Tár, témák, PWA.
5. `05_DIMPRO_BENJADMIN_Kulso_AI_Worker_V1_fejlesztoi_kiegeszites_v2_2026-08-12.pdf`
   - SHA-256: `7d60b8a9a2930aa4e41e239d2df878ed6b3a5445a1bd51d0eae13e4c63b9e149`
   - szerep: M.Forge-AI + V.Guard-AI külső worker réteg, scope/preflight/context pack/provider/review/gate/integráció/költség.
6. `06_DIMPRO_BENJADMIN_TerminalHub_LiveWorkspace_reszletes_fejlesztoi_terv_2026-08-13.pdf`
   - SHA-256: `253e606dc5b04f6b5864f8d3cdb70303dceea7bbf6de93ec8fe6a5cd63b814d1`
   - szerep: Terminal Hub, Terminál Parancstár, Live Workspace, Git/Diff/History, Monaco, 1/2/4 panel, többmonitor, RAW/SANITIZED/AUDIT security és későbbi Desktop Bridge.

## 3. Források közötti elsőbbségi szabály

- A B3 biztonsági, Git/worktree/scope/lock, backup, release, approval és PROD read-only szabályai minden későbbi kiegészítésre kötelezőek.
- A B3.1 Control Plane nem duplikálható: Terminal Hub managed műveleteknek a meglévő koordinációs/command réteget kell használniuk.
- A B3.2 INTERNAL/PARTNER izolációt a Live Workspace és Terminal Hub is örökli.
- A Fejlesztői Konzol V1 marad a napi felhasználói shell; Terminal Hub és Live Workspace ebbe integrálódik.
- A Külső AI Worker secret scanner/context pack és worker identity megoldásai újrahasznosítandók, ha kompatibilisek; új párhuzamos security motor nem készülhet indokolatlanul.
- A 06-os terv bővíti, de nem írja felül a korábbi biztonsági szerződéseket.

## 4. Tényleges DEV baseline 2026-08-14 08:xx

- Large DEV host: `admin.dev.dimpro.hu`
- BENJADMIN operator worktree: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`
- Git HEAD: `666a651`
- integration ref: `refs/heads/integration/benjadmin-dev = 666a651`
- aktív build: `WM0xJnq4PQVOxsjKrluRe`
- `/admin/dev-console`: HTTP 200
- operator worktree: tiszta
- central exclusive-operation lock: üres
- PROD: nem módosult

## 5. Jelenlegi implementációs állapot

### B3

- M0 DEV baseline: KÉSZ.
- M1 protected shell/login/navigation: KÉSZ.
- M2 PostgreSQL Development Center task/session/worker engine: KÉSZ.
- M3 párhuzamos worktree/scope-lock orchestration: KÉSZ.
- central lock és koordinált build/restart alap: KÉSZ.

### B3.1

- Control Plane read model: működik.
- START / DEV START / PROD START szerződés: implementált alap.
- élő munkanapló / silent refresh / monitoring: jelentős része működik.
- külön fizikai Control VPS: CÉLARCHITEKTÚRA, még nem végleges runtime-elhelyezés.

### B3.2

- P0–P5 Partner Development Plane DEV checkpoint: KÉSZ.
- Partner Registry, OutminAI izoláció, provisioning, release/handoff és final security acceptance: KÉSZ DEV szinten.

### Fejlesztői Konzol V1

- közös fejlesztői csevegés: KÉSZ / működő DEV.
- bal projekt/task rail, jobb élő munka panel, Outmin partner sáv: működik.
- ChatGPT Parancstár: működik.
- Fejlesztési Tár: működik.
- Világos / Sötét / Sunlight: működik.
- Ctrl+Alt+Space privacy cover: működik.
- Ctrl+Alt+9 AI csapat bemutató: működik.
- PWA alap: működik.

### Külső AI Worker V1

- V1.0 task/UI: elkészült.
- V1.1 scope/preflight/workspace: elkészült.
- V1.2 provider/runtime alap, safe context pack, JIT workspace: elkészült.
- V1.3 V.Guard független review: elkészült.
- V1.4 BENJADMIN Gate: következő nagy blokk.
- V1.5 kontrollált DEV integráció: nincs lezárva.
- V1.6 költség/idő/benchmark: nincs lezárva.
- Valós külső provider jelenleg nem READY; fail-closed állapot megőrzendő.

## 6. V1.6 UI korrekció a 196-os checkpoint után

A `196_benjadmin_ui_v15_avatar_showcase_20260813.md` a korábbi V1.5 állapotot írja. A tényleges `666a651` commit már további UI finomítást tartalmaz:

- az alsó BENJADMIN composer-avatar nem 280 px;
- a BENJADMIN avatar a közös csevegés task-avatarjával azonos `52×52 px` méretű;
- külön önálló avatárkártyában jelenik meg;
- a beviteli mező külön kártya, magassága nem az avatárhoz igazodik;
- normál AI chat-avatarok `58×58 px` méretre nőttek;
- a jelenlegi DEV build ezt a V1.6 állapotot tartalmazza.

Ez a checkpoint a további fejlesztésben ezt tekinti aktuális UI baseline-nak.

## 7. A 06-os Terminal Hub / Live Workspace jelenlegi implementációs státusza

A 06-os dokumentum 2026-08-14-ig nem volt a BENJADMIN aktív kódolási forráslánc része.

A jelenlegi source audit szerint még NINCS:

- Terminal Hub komponens/service/API;
- Terminál Parancstár execution-catalog implementáció;
- Live Workspace UI/service;
- Monaco Editor dependency vagy kódnézet;
- Chokidar workspace watcher;
- XTerm/@xterm terminál UI dependency;
- Desktop Bridge;
- `BENJADMIN_TERMINAL_HUB_ENABLED` feature flag;
- `BENJADMIN_LIVE_WORKSPACE_ENABLED` feature flag;
- teljes RAW / SANITIZED / AUDIT Terminal Hub adatfolyam.

A szükséges alapok viszont már megvannak: task/session/worker engine, worktree-k, central lock, audit, live/SSE alap, worker identity, secret scanner, scope policy és DEV/PROD szétválasztás.

## 8. Névütközés feloldása

A Fejlesztői Konzolban meglévő `ChatGPT Parancstár` NEM azonos a 06-os dokumentum shell/Git/PowerShell parancs-adatbázisával.

Végleges munkanév:

- `ChatGPT Parancstár` = promptok, átadó- és fejlesztési utasítássablonok.
- `Terminál Parancstár` = normalizált, maszkolt, deduplikált shell/PowerShell/Git parancstudástár.

A két funkció külön route/state/adatmodell maradjon.

## 9. Terminal Hub fejlesztési fázisok

Elfogadott sorrend:

- P0 — foundation / security contracts / feature flags / source registry.
- P1 — UI shell: Terminal Hub kártya + nagy munkaterület + fő fülek.
- P2 — DEV Managed Terminal; central lock és allowlistelt operations használata.
- P3 — Terminál Parancstár + execution audit + deduplikáció.
- P4 — read-only Live Workspace allowlist-first fájlfa.
- P5 — worker activity és file/git események.
- P6 — Monaco Live / Diff / History.
- P7 — 1/2/4 panel + többmonitoros/detached működés.
- P8 — Windows Desktop Bridge / PowerShell.
- P9 — security hardening, Secret Vault, private input.
- P10 — PROD readiness; PROD továbbra is default deny / AI blocked.

## 10. P0 kötelező szerződések

P0-ban nem indul valódi shell processz.

Kötelező típusok/policy-k:

- `TerminalKind = benjadmin-managed | powershell | ssh-dev | ssh-prod | git`
- `AiVisibilityMode = blocked | filtered | allowed`
- `CommandRisk = safe | controlled | destructive`
- `TerminalDataClass = raw | sanitized | audit`
- explicit environment: DEV / STAG / PROD
- PROD alap: `aiVisibility=blocked`, execution default deny.
- allowlist-first workspace root policy.
- no raw secret in browser audit / AI context.
- symlink/path traversal elleni fail-closed path resolution.
- central exclusive operation lock megkerülése tilos.

P0 feature flagek a 06-os normatív terv szerint:

- `BENJADMIN_TERMINAL_HUB_ENABLED`
- `BENJADMIN_COMMAND_LIBRARY_ENABLED`
- `BENJADMIN_LIVE_WORKSPACE_ENABLED`
- `BENJADMIN_MULTI_PANEL_ENABLED`
- `BENJADMIN_WINDOWS_BRIDGE_ENABLED`
- `BENJADMIN_PROD_TERMINAL_ENABLED`
- `BENJADMIN_SECRET_VAULT_ENABLED`

Implementációs extra fail-closed kill switch:

- `BENJADMIN_TERMINAL_EXECUTION_ENABLED`

Alapérték: a P0/P1 végén csak a Terminal Hub UI shell lehet bekapcsolható; Parancstár, Live Workspace, multi-panel, Windows Bridge, PROD terminal, Secret Vault és valódi terminal execution maradjon kikapcsolva.

## 11. P1 UI shell elfogadott szerkezete

A Fejlesztői Konzol jobb oldali `Élő munka` területén vagy annak bővítéseként kompakt Terminal Hub állapotkártya jelenjen meg.

Kompakt kártya mutatja:

- BENJADMIN Managed állapot;
- DEV VPS állapot;
- PROD VPS: ZÁRVA / READ ONLY;
- AI hozzáférés: SZŰRT / TILTVA / ENGEDÉLYEZVE;
- `Terminal Hub megnyitása` gomb.

Megnyitott nagy munkaterület fő fülei:

`TERMINAL | TERMINÁL PARANCSTÁR | LIVE WORKSPACE | SESSIONS | AUDIT`

P1-ben:

- TERMINAL csak shell placeholder + security státusz, nincs valódi parancsfuttatás;
- TERMINÁL PARANCSTÁR csak üres/coming-next állapot, nincs execution;
- LIVE WORKSPACE csak policy/readiness állapot, nincs fájlrendszer watcher;
- SESSIONS és AUDIT a meglévő read modelből kaphat biztonságos összefoglalót;
- a panel dokkolt/lebegő nagy nézetet támogasson;
- külön ablak API előkészíthető, de session-detach tényleges működés P7/P8 előtt nem kötelező.

## 12. P0/P1 biztonsági stop-feltételek

A fejlesztés azonnal megáll, ha:

- csak PROD fában lehetne megoldani;
- raw SSH key, token, `.env` vagy jelszó kerülne kliens payloadba;
- a böngésző közvetlen SSH/PowerShell fájl- vagy processzhozzáférést kapna;
- a Terminal Hub saját, B3 central lockot megkerülő build/restart motort hozna létre;
- a Live Workspace teljes szerverfájlrendszert listázna allowlist helyett;
- a Partner Plane és Internal Plane jogosultságok összemosódnának.

## 13. P0/P1 Definition of Done

- forráslánc és jelen checkpoint verziózott;
- P0 típusok, feature flagek, security policy és szerveroldali read model elkészül;
- P1 Terminal Hub kompakt kártya és nagy munkaterület elkészül;
- nincs valós terminal execution;
- nincs Windows Desktop Bridge;
- nincs PROD write;
- TypeScript PASS;
- lint 0 új error;
- célzott contract/acceptance teszt PASS;
- Next build PASS;
- DEV restart + HTTP smoke PASS;
- Világos / Sötét / Sunlight ellenőrzés;
- meglévő Fejlesztői Konzol és Ctrl+Alt shortcut regresszió nélkül működik;
- dokumentáció frissítve;
- külön Git commit + rollback pointer.

## 14. Következő fejlesztési lépés

A checkpoint lezárása után indulhat a `06 / P0 + P1` implementáció külön worktree-ben, a `666a651` utáni dokumentációs checkpoint commitból.

PROD továbbra is érintetlen.
