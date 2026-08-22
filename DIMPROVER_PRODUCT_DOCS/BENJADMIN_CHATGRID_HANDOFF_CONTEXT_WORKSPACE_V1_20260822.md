# BENJADMIN ChatGrid v0.3.4 — Handoff & Context Workspace V1

Dátum: 2026-08-22
Termék: **BENJADMIN ChatGrid — AI Engineering Control Center**
Magyar megnevezés: **BENJADMIN ChatGrid — AI Fejlesztésirányítási Központ**
Környezet: DEV only
PROD: DENY

## Cél

A ChatGrid ne csak több ChatGPT-ablakot jelenítsen meg, hanem a fejlesztési munkaszakaszok kontextusát, átadását és workerhez rendelését is szabályozottan kezelje. A v0.3.4 V1 két összekapcsolt képességet vezet be:

1. **Handoff workflow** — teljes csevegési munkaszakasz strukturált átadása és szerveroldali `.md` megőrzése.
2. **Context Workspace** — Fejlesztési Tár, Átadások és workerenkénti Context Pack egy közös, dokkolható vagy külön monitorra kiemelhető munkatérben.

## Termékpozicionálás

A ChatGrid technikai kategóriája:

`AI Software Engineering Control Plane / Agent Orchestration Console`

A felületi terméknév rövidebb formában:

- angol: **AI Engineering Control Center**;
- magyar: **AI Fejlesztésirányítási Központ**.

A ChatGrid megmarad a BENJADMIN saját termékneveként; az új megnevezés a funkcionális kategóriát és alcímet adja meg.

## ÁTADÁS workflow

Mind a négy worker-cella külön **ÁTADÁS** gombot kap.

Első kattintás:
- a ChatGrid felismeri a worker kódját;
- best-effort módon felismeri az aktuális csevegés `YYMMDD_sorszám` azonosítóját és címét;
- a BENJADMIN live állapotból hozzákapcsolja a taskot, modult, branch-et és worktree-t;
- szabványos átadó promptot készít;
- a promptot a ChatGPT composerbe helyezi, de **nem küldi el automatikusan**;
- ha a composer nem írható biztonságosan, vágólapos fallback lép életbe;
- a helyi állapot `HANDOFF_REQUESTED` lesz.

Második kattintás / `ÁTADÓ MENTÉSE`:
- csak a legutóbbi assistant-választ olvassa vissza;
- minimum tartalmi hossz szükséges;
- kötelező a `MUNKA VISSZAADVA` és az `ÁTADÓ` lezárás;
- sikertelen validáció esetén fail-closed;
- siker esetén a BENJADMIN DEV API immutable `.md` átadót ment;
- a worker és modul `LATEST.md` frissül;
- a helyi állapot `SAVED` lesz.

Új worker task ChatGPT-indítása `HANDOFF_REQUESTED` állapotban blokkolt. A mentetlen átadót előbb be kell fejezni.

## Átadó szerveroldali adatmodell

Az átadó kötelezően tartalmazza vagy a szerver metaadatként rögzíti:

- handoff ID;
- worker;
- csevegés azonosító és cím;
- főprojekt, projekt, modul, kontextus modul;
- task ID és task cím;
- munkakezdés és visszaadás;
- szerver által számított időtartam percben;
- `COMPLETED / PARTIAL / BLOCKED / FAILED` státusz;
- branch és worktree;
- start/end commit;
- tesztösszefoglaló;
- build/release összefoglaló;
- tagek;
- summary;
- teljes Markdown törzs;
- SHA-256;
- `productionAccess: DENY`.

Történeti `.md` fájl felülírása tiltott. Ugyanaz a handoff ID másodszor nem menthető.

A handoff-index írása cross-process fájllockkal sorosított (`.handoff-write.lock`), ezért a négy worker közel egyidejű mentése nem írhatja felül egymás indexállapotát. A lock időkorlátos és stale lock helyreállítást is tartalmaz. A LATEST fájlok atomikus temp+rename írással frissülnek.

## LATEST struktúra

A mentés frissíti:

- `/srv/dimpro-dev/handoffs/<WORKER>_LATEST.md` — kompatibilitási worker LATEST;
- `/srv/dimpro-dev/handoffs/workers/<WORKER>_LATEST.md` — strukturált worker LATEST;
- `/srv/dimpro-dev/handoffs/modules/<module>/LATEST.md` — modul LATEST;
- `/srv/dimpro-dev/handoffs/history/YYYY/MM/DD/<WORKER>/...md` — immutable történet;
- `/srv/dimpro-dev/handoffs/handoff-index.json` — strukturált keresési index.

## Forrássorrend

A v0.3.4-től a worker promptokban rögzített szabály:

1. BenjAdmin aktuális utasítása / jóváhagyott task;
2. legfrissebb jóváhagyott modul-átadó;
3. kötelező Fejlesztési Tár segédanyagok;
4. egyéb referenciaanyagok.

Eltérés esetén a worker nem választ önállóan a konfliktusos források között, hanem:

`SOURCE_CONFLICT / BENJADMIN DECISION REQUIRED`

## Context Workspace

A fő ChatGrid fejléc új vezérlője:

`KONTEXTUS / FÁJLOK`

Normál 4-cellás módban a Context Workspace középre dokkolható. A bal és jobb oldali worker-párok megmaradnak láthatónak. A panel szélessége húzással állítható, alapértéke 500 px, biztonságos tartománya 380–760 px.

A panel külön natív Electron ablakba is kiemelhető. Az ablak:
- külön monitorra áthúzható;
- helye és mérete megmarad;
- maximalizált állapota megmarad;
- visszadokkolható.

Split2 vagy egy worker teljes nagyítása alatt a dokkolt Context Workspace automatikusan nem foglal középső helyet; a konfigurált láthatóság megmarad és normál gridre visszatérve ismét megjelenhet.

## Fejlesztési Tár V1 bővítés

Új kötelező dokumentum-metaadat:

- Modul;
- Cím;
- Verzió;
- Leírás;
- Címkék;
- Dokumentumtípus.

Dokumentumtípusok:
- `specification`;
- `concept`;
- `coding_guide`;
- `reference`;
- `handoff`;
- `other`.

A felhasználói feltöltési API-k metaadat nélkül fail-closed működnek. Az alacsony szintű storage motor megőrzi a korábbi fájltípus-, méret-, SHA-256- és traversal-validációt.

A Context Workspace segédanyag nézete támogatja:
- szöveges keresést;
- modul-szűrést;
- dokumentumtípus-szűrést;
- kötelező/opcionális szűrést;
- prioritásszűrést.

## Átadások nézet

A Context Workspace és a BENJADMIN Fejlesztési Tár támogatja:
- keresést csevegés, worker, projekt, modul, task és tagek alapján;
- worker- és státuszszűrést;
- csoportosítást modul, projekt, worker, csevegés, dátum vagy státusz szerint;
- időtartam, státusz, task és SHA megjelenítést.

## Context Pack

Segédanyag vagy átadó workerenként Context Packhez rendelhető:
- drag & drop a worker cellára dokkolt módban;
- gyors worker-gombbal a Context Workspace kártyáról;
- külön ablakból is gyors worker-gombbal.

A Context Pack helyi ChatGrid állapotban tárolódik. A következő Worker Task Launch prompt tartalmazza a hozzárendelt elemek ID-ját, címét és típusát, valamint a forrássorrendet.

A Context Pack workerenként külön üríthető a stale kontextus elkerülésére.

## Biztonság

- Context Workspace szerverhívás csak `https://admin.dev.dimpro.hu` hostra engedélyezett;
- hitelesítés a párosított ChatGrid device tokennel;
- device token Electron `safeStorage`-ban marad;
- Context Workspace preload csak explicit IPC műveleteket exportál;
- nincs automatikus ChatGPT submit;
- nincs PROD endpoint fallback;
- `PROD DENY` explicit minden handoffban;
- fájl upload változatlan allowlist, méret- és SHA-védelemmel működik.

## V1 quality gate

Kötelező ellenőrzés:
- backend TypeScript;
- célzott ESLint;
- meglévő Development Resource contract;
- Handoff/Context backend contract;
- ChatGrid acceptance;
- `git diff --check`;
- Windows portable build;
- DEV ZIP csomag;
- fizikai Windows UI smoke a kiadás után.

A v0.3.4 nem ad PROD deploy jogot és nem módosíthat PROD környezetet.
