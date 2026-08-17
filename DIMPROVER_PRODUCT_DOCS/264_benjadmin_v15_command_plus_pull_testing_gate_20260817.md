# BENJADMIN V1.5 · Command → Plus Pull → Testing Gate

Dátum: 2026-08-17
Állapot: feature kész, candidate build / runtime acceptance előtt
Környezet: DEV-only
PROD: READ_ONLY / változatlan

## Cél

A BENJADMIN napi fejlesztési indítása a lehető legkevesebb kézi ChatGPT-oldali állapotváltással működjön, miközben a tesztkapu nem gyengülhet.

Célfolyamat:

`BENJADMIN parancs → Ben-AI routing → worker → READY_FOR_PLUS_PULL → Folytasd. → RUNNING → RESULT_TO_TESTING → TESTING → COMPLETE → következő task előkészítés`

## 1. Első task automatikusan ChatGPT pullra kész

A BENJADMIN közös fejlesztői csevegésből létrehozott és Ben-AI által sikeresen kiosztott task azonnal megkapja:

- `coordinatorChainState: READY_FOR_PLUS_PULL`;
- `coordinatorChainPreparedAt`;
- `coordinatorChainSource: BENJADMIN_COMMAND`;
- worker kód és worker név;
- `TASK_BENAI_CHAIN_PREPARED` audit esemény;
- `productionAccess: DENY` védelmet.

Elfogadott alternatív worker-javaslat esetén a forrás `BENJADMIN_SUGGESTION_ACCEPTED`.

A konzol állapotjelzése: `ChatGPT pullra kész`, alatta `Folytasd. → felvétel`.

A `READY_FOR_PLUS_PULL` tasknál a kézi `Indítás` gomb rejtett, mert a Plus/MCP pull maga hozza létre a sessiont és viszi a bridge-et RUNNING állapotba.

## 2. Plus/MCP egy szavas indítás

A meglévő `scripts/benjadmin-plus-bridge-cli.mjs` továbbra is támogatja:

- `continue`;
- `folytasd`;
- `folytatas`;
- `kovetkezo`.

Ezek ugyanazt a `POST /api/dev/console/plus-bridge/<WORKER>/next` endpointot használják.

A natív OpenAI provider nincs bekapcsolva; a Plus/MCP híd marad az elsődleges út.

## 3. Eredmény → TESTING egy művelettel

Új task action:

`RESULT_TO_TESTING`

Új CLI aliasok:

- `report-testing`;
- `result-testing`.

A művelet sorrendje:

1. strukturált és SANITIZED ChatGPT eredmény rögzítése;
2. commit / build / tests / docs / nextStep metaadat mentése;
3. bridge `RESULT_PENDING`;
4. task `TESTING` állapotba helyezése;
5. audit és közös fejlesztői csevegés frissítése.

## 4. Sikeres lezárás csak TESTING állapotból

A backend új fail-closed szabálya:

`DEV_CENTER_TASK_COMPLETE_TESTING_REQUIRED`

A `COMPLETE` művelet 409 választ ad, ha a task még nem `testing` vagy korábban már nem `completed`.

A konzol `Kész` gombja csak `testing` státuszban jelenik meg.

A `FAIL` út továbbra is használható blokkoló hibánál, mert hiba esetén nem szabad mesterségesen végigvinni a sikeres tesztkaput.

## 5. Acceptance terv

Kötelező V1.5 kapuk:

- TypeScript;
- célzott ESLint;
- V1.5 contract;
- BENJADMIN parancs → Ben-AI routing;
- `READY_FOR_PLUS_PULL` metadata + audit;
- egy `Folytasd.` → ugyanaz a task RUNNING;
- közvetlen COMPLETE RUNNING állapotból tiltva;
- `RESULT_TO_TESTING` → TESTING;
- strukturált result megmarad;
- COMPLETE TESTING után engedett;
- audit: result + testing + completed;
- V1.3 next-chain regresszió;
- push/deep-link regresszió;
- build + standalone assets + DEV smoke;
- csak sikeres teljes kapu után DEV cutover.

## Feature checkpoint

Első commit:

`ccb6be08844f8b01b206b93c570fa8e542dea6ee`

Testing-gate commit:

`dced01b34e1454e101925546727e21ebdbecf5e7`

A végleges build ID, runtime acceptance és DEV aktiválási adatok a candidate teszt után kerülnek ide.

## DEV aktiválási lezárás · 2026-08-17 10:05 CEST

A BENJADMIN V1.5 a JázminAI által lezárt Drop/GyorsSend v1.2.12 változtatásokkal közös, egyesített DEV release-ben került aktiválásra.

- aktív kódforrás: `2993748ca098e19704085e0288a6e096c2834902`
- aktív build: `kdYIPMc_9wAXSfHo3W1XN`
- active release: `.next-drop-v1212-simple-stepper-2993748`
- rollback release: `.next-benjadmin-v14-worker-activity-final`
- trusted baseline: `2993748ca098e19704085e0288a6e096c2834902`
- PM2: `dimpro-benjadmin-operator-ui-v2-dev` online, unstable 0
- PROD: változatlan / READ_ONLY

### Aktiválási acceptance

- TypeScript: PASS
- célzott ESLint: 0 error
- BENJADMIN V1.5 contract: 19/19 PASS
- BENJADMIN V1.5 live runtime: 20/20 PASS
- TESTING-gate browser: 10/10 PASS
- korábbi exact candidate kapuk: next-chain browser 10/10, deep-link 13/13, V1.4 worker browser 15/15, V1.4 contract 23/23, V1.4 runtime 18/18, next-chain runtime 13/13, Plus V1.2 runtime 29/29
- BENJADMIN post-cutover HTTP smoke: 200
- Drop post-cutover HTTP smoke: 200

A sikeres lezárási szabály változatlanul fail-closed: `COMPLETE` csak `TESTING` állapotból engedett. Blokkoló hiba aktív task közben továbbra is `FAIL` úton jelenthető.
