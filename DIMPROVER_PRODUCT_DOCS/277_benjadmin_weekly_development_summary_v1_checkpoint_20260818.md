# 277 — BENJADMIN Weekly Development Summary V1 · source checkpoint

**Dátum:** 2026-08-18  
**BLOKK:** 8  
**Állapot:** source kész · statikus/regressziós kapuk zöldek · candidate runtime/browser kapu következik · DEV-only

## Cél

A közös fejlesztési kontextusmodell már megjelent a Worker Inboxban, Live Workspace-ben, worker-kártyákon és a Common Chatben. A Weekly Development Summary V1 ugyanezt a modellt vezeti át a naptári heti vezetői összesítésbe.

A funkció nem készít külön párhuzamos taxonómiát. A meglévő `ConsoleMessage` → `enrichMessagesWithTaskContext` → `resolveTaskDevelopmentContext` láncot használja.

## Heti időablak

- explicit időzóna: `Europe/Budapest`;
- naptári hét: hétfő 00:00 → következő hétfő 00:00;
- DST-biztos helyi idő → UTC konverzió;
- magyar dátumtartomány-címke;
- jelenlegi V1 csak az aktuális naptári hetet mutatja.

## Backend

Új read-only API:

`GET /api/dev/console/weekly-summary`

Opcionális query:

`?projectId=<project_id>`

Az API admin DEV autorizációt igényel és `cache-control: no-store` választ ad.

Adatforrások:

- `dev_center_live_worklog`;
- `dev_center_audit_events`;
- `dev_center_tasks`;
- `dev_center_workers`;
- `dev_center_projects`.

DB migráció nem szükséges.

## Aggregált adatok

### Statisztika

- heti aktivitások;
- worker-ek;
- fejlesztési kontextusok / munkarészek;
- nyitott taskok;
- héten lezárt taskok;
- blokkolt taskok;
- build események;
- tesztesemények;
- hibák.

### Worker összesítés

Worker-enként:

- kód és név;
- aktivitásszám;
- érintett kontextusok száma;
- legutóbbi aktivitás;
- legutóbbi 6/x fázis.

Támogatott worker identitások:

`BENAI`, `ARMINAI`, `JAZMINAI`, `OUTMINAI`, `MFORGE`, `VGUARD`.

### Fejlesztési kontextus összesítés

A közös hierarchia szerint:

`Projekt → Főmodul → Modul → Kontextus Modul / Almodul → Munkarész`

Kontextusonként:

- aktivitásszám;
- résztvevő worker-ek;
- legutóbbi aktivitás;
- legutóbbi 6/x fázis;
- fázisonkénti darabszám 1–6;
- legutóbbi művelet.

## UI

Új komponens:

`components/admin/developer-console/WeeklyDevelopmentSummary.tsx`

Elhelyezés:

- a középső Developer Console oszlopban;
- közvetlenül a `KÖZÖS FEJLESZTŐI CSEVEGÉS` fejléc alatt;
- a chat scrollertől külön sorban, ezért nem tűnik el a legfrissebb üzenetre történő automatikus görgetéskor.

Működés:

- alapból nyitott, de összecsukható;
- 60 másodpercenként automatikus frissítés;
- kézi frissítőgomb;
- projektváltáskor újratölt;
- kompakt statisztikai sor;
- worker chipek aktivitásszámmal és 6/x értékkel;
- legfeljebb 6 legfrissebb fejlesztési kontextus;
- desktop/tablet/mobil responsive;
- 390 px mobilra külön szabály;
- `PROD DENY` jelzés.

## Biztonság

- read-only funkció;
- admin DEV authorization;
- nincs adatbázis-migráció;
- nincs PROD write;
- response: `productionAccess: DENY`;
- 1000 soros forrásonkénti biztonsági limit;
- limit elérésekor `truncated=true`.

## Statikus és regressziós kapuk

- Weekly Summary V1 contract: **19/19 PASS**;
- `npx tsc --noEmit`: PASS;
- célzott ESLint: PASS;
- teljes `npm run lint`: PASS — **0 error / 103 meglévő warning**;
- Common Chat V2: **32/32 PASS**;
- Worker Context Cards V1: **20/20 PASS**;
- Context Unified V2: **10/10 PASS**;
- Worker Activity + Archive V1.4: **27/27 PASS**;
- `git diff --check`: PASS.

## Runtime/browser acceptance terv

Az izolált DEV fixture ellenőrzi:

1. unauthenticated API → 401;
2. projekt-szűrés;
3. Budapest naptári hét és hétfői kezdés;
4. 2 worker (`ARMINAI`, `JAZMINAI`);
5. 2 fejlesztési kontextus;
6. 6/2 → 6/3 és 6/5 → 6/4 fázistörténet;
7. nyitott / blokkolt / lezárt task számlálás;
8. build / test / error számlálás;
9. projekt/Főmodul/Modul/Almodul/Munkarész megjelenés;
10. collapse/reopen;
11. desktop overflow;
12. 390 px mobil overflow;
13. fixture cleanup;
14. PROD DENY.

A runtime/browser acceptance csak az exact candidate build elkészülte után tekinthető lezártnak.

## Candidate-ben feltárt SSE lifecycle regresszió

A Weekly Summary candidate browser acceptance után a Next runtime `ERR_INVALID_STATE: Controller is already closed` unhandled rejectiont jelzett. A stack nem a heti API-ra, hanem a meglévő `/api/dev/console/stream` SSE route-ra mutatott.

A race oka: a `send()` async DB-lekérdezése alatt a kliens abortálhatta a streamet és lezárhatta a controllert; a visszatérő `send()` még `enqueue`-olt, majd a `catch` ág ismét `enqueue`-olt a már lezárt controllerre.

Javítás:

- közös `stop()` lifecycle;
- `safeEnqueue()` fail-closed wrapper;
- DB-await után ismételt `closed` ellenőrzés;
- error event csak nyitott streamre;
- abort és cancel ugyanazt a stop logikát használja.

A javításhoz külön `benjadmin-console-stream-lifecycle-v1-contract.mjs` regressziós védelem készült. A release csak új exact build + browser close log-gate után engedhető tovább.

## Candidate-ben feltárt projekt-bootstrap race

A `6918978` SSE-fix candidate újrafuttatásakor a heti panel egyszer `data-project-id=all` állapotban indult, miközben a mentett fixture projekt már a live snapshotban szerepelt. A `DeveloperConsoleShell` bootstrapja a `silentFetch()` után a React `liveRef` aszinkron frissítésére támaszkodott.

Javítás: a `silentFetch()` közvetlenül visszaadja a betöltött `ConsoleLiveState` snapshotot, a bootstrap pedig elsődlegesen ennek `projects` listájából oldja fel a mentett projektet. A ref csak fallback. Ez determinisztikussá teszi a mentett projekt visszaállítását normál felhasználói betöltésnél is.

### Late live-project recovery

A candidate második futása megmutatta, hogy az első bootstrap snapshot sikertelensége után az SSE/polling által később megérkező projektlista már nem próbálta újra a mentett projekt feloldását. Emiatt a shell `Összes projekt` állapotban maradhatott.

A `DeveloperConsoleShell` most a live projektlista változásakor is fail-safe módon visszaállítja a mentett projektet. Ha a tárolt projekt már nem létezik, egyetlen elérhető projektre áll át, több projekt esetén pedig biztonságosan az összes projekt nézetre esik vissza.

### Projektváltás alatti stale-ready állapot

A production candidate acceptance megmutatta, hogy a mentett projekt helyreállítása után a Weekly panel egy rövid ideig még az előző `all` summary-t jelölte `data-ready=true` állapotúnak, miközben az új projekt-specifikus kérés már futott.

A panel readiness most request-scope-olt: csak akkor `ready=true`, ha a betöltött summary `projectId` értéke megegyezik az aktuális `selectedProjectId` értékkel. Így projektváltáskor nem tekinthető késznek a régi összesítés, és a UI/acceptance megvárja az új projektadatot.
