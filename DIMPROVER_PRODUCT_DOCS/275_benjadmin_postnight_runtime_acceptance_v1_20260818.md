# 275 — BENJADMIN éjszakai checkpointok runtime lezárása V1

**Dátum:** 2026-08-18  
**BLOKK:** 7 — post-night runtime acceptance  
**Állapot:** forrás + runtime/browser acceptance KÉSZ · DEV-only · PROD változatlan

## 1. Cél

A 2026-08-18-i éjszakai fejlesztésből két olyan checkpoint maradt, amelynek a forrása már benne volt az aktív BENJADMIN DEV runtime-ban, de a saját dokumentuma még runtime/browser acceptance-et jelölt hátralévő kapuként:

- `271_benjadmin_conversation_v2_checkpoint_20260818.md`;
- `272_benjadmin_development_map_v2_checkpoint_20260818.md`.

A BLOKK 7 nem új termékfunkciót épített. A cél a már aktív funkciók tartós, újrafuttatható runtime/browser acceptance-harnessének kialakítása és a korábbi checkpointok bizonyítható lezárása volt.

## 2. Baseline és izoláció

- aktív DEV alkalmazás source a blokk indulásakor: `4c3244c3aac961a3e315e68eeef43401c508bbf7`;
- aktív DEV build: `uy2P79yuSi_7fg8H65uVa`;
- aktív release: `.next-benjadmin-scheduler-presence-v2-4c3244c`;
- dokumentált baseline: `4da7aba36d3b42afea8b1c04e44731e4f05da6bf`;
- branch: `feature/armin-benjadmin-postnight-runtime-v1-20260818`;
- worktree: `/srv/dimpro-dev/worktrees/benjadmin-postnight-runtime-v1`;
- backup: `/srv/dimpro-dev/backups/benjadmin-postnight-runtime-v1-20260818T093834+0200`;
- PROD alkalmazásmódosítás: nincs;
- DB migráció: nincs.

A Conversation V2, Common Chat V2, Development Map V2 és Context Unified V2 source commitjai a blokk indulásakor már az aktív `4c3244c` ősei voltak, ezért alkalmazáskód újraintegrálására nem volt szükség.

## 3. Development Map V2 runtime-harness javítás

### Feltárt harness-hiba

A korábbi `benjadmin-development-map-v2-runtime-acceptance.mjs` közvetlenül importálta az `app/lib/dev-center/engine-repository.ts` fájlt. Node 22 strip-only TypeScript módban ez az alábbi futtatási hibához vezetett:

`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` — TypeScript parameter property nem támogatott strip-only módban.

Ez nem alkalmazáshiba volt. A projektben nincs külön `tsx` / `ts-node` runtime dependency, ezért csak egy acceptance kedvéért nem került új dependency telepítésre.

### Végleges megoldás

A runtime acceptance a valódi futó DEV API-t használja:

`PATCH /api/dev/console/development-map/[taskId]`

Így ugyanazt a Next runtime-ban betöltött repository-logikát ellenőrzi, mint a valódi felhasználói felület.

### Runtime acceptance — 13/13 PASS

Ellenőrzött tételek:

1. unauthenticated mutation → 401;
2. izolált DEV fixture létrehozás;
3. első térképi átsorolás API-n;
4. `physicalGitMove=false`;
5. második átsorolás;
6. előző besorolás historyban megmarad;
7. project/branch/worktree fizikailag változatlan;
8. undo API-n;
9. undo továbbra sem mozgat Git-et;
10. history egy elemmel visszalép;
11. undo audit `productionAccess=DENY`;
12. törölt/ismeretlen korábbi node fail-closed;
13. üres history fail-closed.

### Browser acceptance — 15/15 PASS

A futó `admin.dev.dimpro.hu:3100/admin/dev-map` felületen:

- `Aktív / Technikai / Archív` rétegek megjelennek;
- a rétegszámlálók működnek;
- az aktív fixture csak az Aktív rétegben látható;
- technikai fixture a Technikai rétegben izolálódik;
- lezárt fixture az Archív rétegben jelenik meg;
- `Előző besorolás` gomb megjelenik;
- browserből indított undo visszaállítja a korábbi node-ot;
- project/branch/worktree fizikailag változatlan;
- audit PROD DENY;
- `TAXONÓMIA: V1 · EXCEL JÓVÁHAGYÁSRA VÁR` guard látható;
- 390 px mobil nézetben a rétegvezérlők megmaradnak;
- desktop és mobil vízszintes overflow nincs.

A taxonómia továbbra sem került automatikusan átírva az Excelből. Jóváhagyott végleges taxonómia nélkül a V1 besorolás marad aktív.

## 4. Common Chat / Conversation V2 runtime + browser acceptance

Új tartós acceptance-script:

`scripts/benjadmin-common-chat-v2-runtime-browser-acceptance.mjs`

A teszt izolált DEV projektet és ideiglenes worklog/presence fixture-öket használ, majd a `finally` ágban eltávolítja őket.

### Runtime/browser acceptance — 30/30 PASS

#### Worker activity és dedupe

- unauthenticated worker activity write → 401;
- task nélküli ARMINAI activity sikeresen létrejön;
- explicit hierarchia megmarad:
  - BENJADMIN;
  - AI Fejlesztői Tér;
  - Közös fejlesztői csevegés;
  - Munkarész;
- explicit 6/2 stage megmarad;
- `productionAccess=DENY` megmarad;
- ugyanazon ARMINAI teljesen azonos esemény 30 percen belül ugyanazt a persisted message ID-t adja vissza;
- ugyanebből csak egy DB worklog sor készül;
- `activityDedupeKey` ténylegesen tárolódik;
- ugyanaz a summary JAZMINAI alatt külön esemény;
- ugyanaz a worker + summary, de eltérő fejlesztési kontextus esetén külön esemény.

#### Valós worker-átadás modell

Az acceptance ugyanazon task-kontextushoz két worker-presence history rekordot készít:

`ARMINAI → JAZMINAI`

A futó `/api/dev/console/live` ebből ténylegesen létrehozta:

- `reason=TASK_HANDOFF`;
- helyes projectId;
- helyes Főmodul / Modul / Almodul;
- helyes Munkarész.

A browserben a `LEGUTÓBBI WORKER-ÁTADÁSOK` strip megjelent, benne az ARMINAI → JAZMINAI átadással és a fejlesztési kontextussal.

#### Cursor és archívum

- 25 izolált cursor fixture alapján az első messages oldal `hasMore=true`;
- `oldestAt` cursor létrejön;
- a második oldal nem tartalmaz átfedő ID-ket;
- a második oldal ténylegesen eléri a korábbi fixture-adatokat.

Az archívum browser-ellenőrzése visszadátumozott tartós DB rekordok helyett kontrollált böngészőidőt használ:

- +3 napos browser-idő: az aktuális fixture az `ELMÚLT 7 NAP` csoportba kerül;
- a konkrét `day:YYYY-MM-DD` csoport nyitható;
- task nélküli worker-kártyán látható a fejlesztési hierarchia és 6/2;
- ARMINAI és JAZMINAI külön kártya marad;
- +9 napos browser-idő: `Korábbi archívum megjelenítése` kapu megjelenik;
- a fixture a megfelelő `week:YYYY-MM-DD` csoportba kerül;
- 390 px mobil nézetben az archívum megmarad és nincs vízszintes overflow.

## 5. Contract-védelem

### Development Map V2

A contract **15/15 PASS** és most már azt is védi, hogy:

- a runtime acceptance a valódi API-t használja közvetlen TS repository-import helyett;
- a browser acceptance lefedi a V2 rétegeket, undo-t és responsive kaput.

### Common Chat V2

A contract **32/32 PASS** és most már azt is védi, hogy a runtime/browser acceptance tartalmazza:

- exact dedupe;
- worker switch;
- kontextusérzékeny dedupe;
- valós derived worker transition;
- transition strip;
- cursor pagination;
- 7 napos és korábbi archívum;
- mobil responsive kapu.

## 6. Teljes regresszió

- `git diff --check`: PASS;
- `npx tsc --noEmit`: PASS;
- célzott ESLint: PASS / 0 error;
- teljes `npm run lint`: PASS / **0 error, 103 meglévő warning**;
- Development Map V1: **25/25 PASS**;
- Development Map V2: **15/15 PASS**;
- Common Chat V2: **32/32 PASS**;
- Worker Context Cards V1: **20/20 PASS**;
- Worker Activity + Archive V1.4: **27/27 PASS**;
- Context Unified V2: **10/10 PASS**;
- Worker Presence Bridge V1: **27/27 PASS**;
- Map V2 runtime: **13/13 PASS**;
- Map V2 browser: **15/15 PASS**;
- Common Chat V2 runtime/browser: **30/30 PASS**.

## 7. Fixture cleanup

A runtime tesztek után külön adatbázis-ellenőrzés történt. Maradvány:

- `project_chatv2_%`: 0;
- `dev-task-chatv2-transition-%`: 0;
- `dev-task-map-v2-%`: 0;
- `map-v2-%`: 0;
- `%CHAT-V2-%` worklog: 0;
- `%MAP-V2-UI-%` worklog: 0.

## 8. Kódváltozás jellege

A BLOKK 7 **nem módosította a BENJADMIN alkalmazás runtime komponenseit vagy üzleti logikáját**. A módosítások acceptance-harness, contract és dokumentáció jellegűek.

A fejlesztési workflow egységessége és az immutable release identity miatt a blokk végén külön exact DEV build/candidate/cutover kapu futtatható, hogy az aktív release source commitja a teszt- és dokumentációs baseline-nal is egyezzen. PROD továbbra is érintetlen.

## 9. Következő fejlesztési szint

A Conversation V2 és Development Map V2 korábban nyitott runtime/browser kapui ezzel lezárhatók. A következő új funkcionális blokk már ne ezek újratesztelése legyen, hanem a BENJADMIN roadmap következő önálló fejlesztési egysége.
