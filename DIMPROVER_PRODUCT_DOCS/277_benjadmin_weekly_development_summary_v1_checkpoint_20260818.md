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
