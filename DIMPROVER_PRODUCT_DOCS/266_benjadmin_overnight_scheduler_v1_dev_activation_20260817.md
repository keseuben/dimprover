# 266 — BENJADMIN Overnight Development Scheduler V1 · DEV aktiválás

**Dátum:** 2026-08-17  
**Állapot:** DEV aktív · PROD változatlan / DENY

## Cél

Az éjszakai és óránkénti fejlesztési folyamat ne egyetlen ChatGPT Scheduled Task állapotától függjön. A BENJADMIN tartsa meg az ütemezési tervet, az órás slotokat, a retry/recovery állapotot és a futási naplót; a ChatGPT Plus Scheduled Task csak külső ébresztő/handoff szerepet kapjon.

## Aktív release

- source: `4407b156d8e44754de9965d98585abecf3f71907`
- build: `pykXqwGMHSZYIGD_DnHQd`
- release: `.next-benjadmin-scheduler-drop-final-4407b15`
- trusted baseline: `refs/heads/integration/benjadmin-dev -> 4407b156d8e44754de9965d98585abecf3f71907`
- rollback: `.next-drop-v1212-multi-image-host-fix-3a163b6`
- PM2 UI: `dimpro-benjadmin-operator-ui-v2-dev` ONLINE
- PM2 monitor: `dimpro-benjadmin-monitor-dev` ONLINE
- PROD: nem módosult

A release együtt tartalmazza a BENJADMIN Scheduler V1-et és a legfrissebb Drop/GyorsSend DEV javításokat, beleértve a mobil voice/upload stabilizálást és a multi-image DEV multipart host fixet.

## Scheduler architektúra

A V1 nem igényel új adatbázis-migrációt. A tartós scheduler state a már aktív control-plane `dev_center_decision_memory` táblára épül.

Storage mode:
`CONTROL_PLANE_DECISION_MEMORY_V1`

Fő objektumok:
- Development Schedule: aktív időablak, cadence, nextRunAt, pause/resume/cancel, maxRuns, missedRunCount, externalWakeMissCount.
- Scheduler Run: determinisztikus órás slot, task/worker, attemptCount, ready_for_pull/completed/failed állapot, wake deadline és recovery metadata.

Az órás run kulcs determinisztikus és adatbázis-szinten egyedi `decision_key`-re épül, ezért ugyanaz a slot VPS/PM2 restart vagy ismételt heartbeat esetén sem indulhat csendben kétszer.

## Működési lánc

`BENJADMIN schedule -> MONITOR 60S -> due hourly slot -> Ben-AI worker routing -> READY_FOR_PLUS_PULL -> ChatGPT Scheduled Task / Folytasd. -> RUNNING -> scheduler wake observed -> run completed -> következő slot`

Ha nincs szabad/jogosult worker, a scheduler nem indít párhuzamos fejlesztést.

Ha a ChatGPT külső wake nem érkezik meg 15 percen belül:
- a run nem vész el;
- `DEVELOPMENT_SCHEDULER_EXTERNAL_WAKE_MISSED` audit készül;
- `externalWakeMissCount` nő;
- ugyanaz az esemény idempotensen csak egyszer számítódik;
- a később megérkező `Folytasd.` továbbra is felismerhető és lezárja a scheduler run-t.

Crash-window esetén, amikor a run már lezárult, de a schedule léptetése megszakadt, a következő heartbeat `duplicate_recovered` recovery-vel előrelépteti a `nextRunAt` értéket új run létrehozása nélkül.

## Biztonság

- DEV-only runtime guard.
- `productionAccess: DENY` minden scheduler schedule/run és audit metadata szinten.
- natív OpenAI API/provider nincs bekapcsolva.
- scheduler nem hoz létre önálló fejlesztési taskot; meglévő queue taskokat használ.
- worker routing a meglévő Ben-AI kapacitás- és project-isolation szabályt használja.
- already-routed task esetén a project isolation újraellenőrzött.
- minimum cadence 60 perc.
- dedikált scheduler SQL migration elkészült, de V1-ben nem alkalmazott; későbbi V1.1 optimalizációként staged marad.

## UI

Új `ÉJSZAKAI FEJLESZTÉS` panel a BENJADMIN Fejlesztői Konzolban:
- 23:00–07:00 óránként gyorspreset;
- aktív/szünetelő állapot;
- következő futás;
- futásszám;
- kimaradt slotok;
- külső wake hiányok;
- utolsó run állapot;
- Szünet / Folytatás / Leállítás;
- `MONITOR 60S`, `PLUS SCHEDULED TASK`, `PROD DENY` státuszjelzés.

## Acceptance

Scheduler contract: **32/32 PASS**.

Scheduler runtime lifecycle: **30/30 PASS**:
- auth denial;
- migration nélküli storage readiness;
- órás schedule;
- Ben-AI routing;
- READY_FOR_PLUS_PULL;
- determinisztikus run ledger;
- ismételt heartbeat deduplikáció;
- 15 perces missed external wake;
- missed-wake idempotencia;
- későbbi `Folytasd.` felismerés;
- crash recovery;
- pause/resume/cancel;
- audit lifecycle.

Scheduler browser/UI: **14/14 PASS**:
- desktop;
- mobil;
- overnight preset;
- aktív/szünetelő állapot;
- pause/resume/cancel;
- overflow safety.

BENJADMIN regresszió:
- V1.5 runtime: **20/20 PASS**;
- V1.5 browser: **10/10 PASS**;
- V1.4 runtime: **18/18 PASS**;
- V1.4 browser: **15/15 PASS**;
- V1.3 runtime: **13/13 PASS**;
- V1.3 browser: **10/10 PASS**;
- Plus V1.2 runtime: **29/29 PASS**.

Drop/GyorsSend source acceptance: **36/36 PASS**.

Build:
- TypeScript PASS;
- célzott lint 0 error;
- build PASS;
- 245 static chunk PASS;
- post-build retention PASS.

Post-cutover:
- BENJADMIN HTTP 200;
- Drop `/send` HTTP 200;
- scheduler API `ready=true`;
- heartbeat mode `MONITOR_60S`;
- external wake mode `CHATGPT_SCHEDULED_TASK`;
- tick API PASS, `productionAccess=DENY`;
- PM2 UI online / unstable 0;
- PM2 monitor online / unstable 0.

## Következő fejlesztési irány

A V1 után a következő érdemi szint a külső ChatGPT wake kezelése:
1. egy tartós, óránkénti Plus Scheduled Task legyen az egyetlen külső ébresztő;
2. az éjszakai 23:00–07:00 vagy más időablakot már kizárólag BENJADMIN schedule vezérelje;
3. a külső wake minden órában csak lekérdezze, van-e due scheduler run;
4. ha nincs due run, ne indítson fejlesztést;
5. ha van, vegye fel a `READY_FOR_PLUS_PULL` taskot;
6. BENJADMIN jelezze a külső wake egészségi állapotát és a legutóbbi sikeres ébresztést.

Így nem kell minden estére új, 9 alkalmas ChatGPT schedule-t készíteni, és az éjszakai terv nem tűnik el akkor sem, ha egy külső wake kimarad.
