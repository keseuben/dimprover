# BENJADMIN V1.4 Worker Activity + Chat Archive

Dátum: 2026-08-16
Állapot: candidate acceptance PASS, DEV aktiválás előkészítve
PROD: READ_ONLY / változatlan

## Cél

A BENJADMIN Fejlesztői Konzolban a belső kódmérnök AI-k munkája ne csak IN_PROGRESS státuszként legyen látható, hanem részletes, SANITIZED kódolási eseményfolyamként. Ezzel párhuzamosan a KÖZÖS FEJLESZTŐI CSEVEGÉS ne nőjön korlátlan kártyalistává: mai teljes nézet, napi/heti archív csoportok, lazy history és ismétlődő rendszeresemény-összevonás szükséges.

## Worker identity színek

A közös csevegés világos/pasztell háttérszínt kap az avatár identitása szerint:

- Ben-AI: világos kék;
- ÁrminAI: világos zöld;
- JázminAI: világos lila/levendula;
- OutminAI: világos borostyán;
- BenjAdmin: világos accent/cyan;
- error/warning állapot továbbra is elsőbbséget élvez az identitásszínnel szemben.

A színek light, dark és sunlight témában CSS `color-mix()` alapján a téma változóiból készülnek.

## Részletes worker kódolási csevegés

A jobb oldali worker-kártyák új `Részletes kódolási csevegés` műveletet kapnak. A worker drawer tartalmazza:

- aktív worker/task/session/build összefoglalót;
- LIVE → SESSION → HISTORY retention tájékoztatást;
- Minden / Kód / Fájl-Diff / Teszt / Build szűrőt;
- analysis/coding eseményt;
- fájlmódosítást;
- diff összefoglalót;
- terminál aktivitást SANITIZED formában;
- teszt/build/commit/release mérföldköveket;
- progress százalékot;
- task és projekt kapcsolatot.

Új message kindok:

- `CODE_ACTIVITY`
- `FILE_CHANGE`
- `DIFF`
- `TERMINAL_ACTIVITY`
- `ARCHIVE_SUMMARY`

## Worker Activity Bridge

Új DEV endpoint:

`POST /api/dev/console/activity`

Új helper:

`node scripts/benjadmin-worker-activity.mjs`

A helper JSON payloadot stdin-en fogad, tehát admin kulcs vagy activity tartalom nem kerül CLI argumentumba. A helper alapértelmezetten kizárólag localhost DEV endpointot és `.dev.dimpro.hu` hostot enged.

A worker activity endpoint:

- admin-auth szükséges;
- ismert worker allowlistet használ;
- ismert phase allowlistet használ;
- secret scannerrel ellenőrzi summary/detail/command/diff mezőket;
- érzékeny fájlútvonalat maszkol;
- minden event metadata mezőben `productionAccess: DENY` jelölést kap;
- raw titkot nem ír a live worklogba.

A Manual ChatGPT Bridge handoff prompt mostantól explicit kéri, hogy analysis / coding / file-change / diff / test / build / commit / release mérföldköveknél a worker activity helperen keresztül érkezzen SANITIZED esemény.

## Közös fejlesztői csevegés archiválás

A jelenlegi nap eseményei teljes részletességgel maradnak a fő csevegésben.

Korábbi események:

- 1–7 nap: napi csoport;
- 7 napnál régebbi: heti csoport;
- archív csoport alapból összecsukott;
- csak kattintásra rendereli a benne lévő kártyákat;
- a DOM-terhelés csökkentésére `content-visibility` használható;
- régebbi history cursoros API-val tölthető be.

A message API új cursor paraméterei:

`GET /api/dev/console/messages?limit=120&before=<ISO timestamp>`

A válasz `page` metadata mezője tartalmazza a `before`, `oldestAt`, `newestAt`, `hasMore` értékeket.

Az SSE merge nem dobhatja el a már korábban lazy-loadolt history oldalakat.

## Ismétlődő kártyák összevonása

Az egymás után érkező, azonos worker + kind + summary + detail + task események 30 perces ablakban egy megjelenítési kártyává vonhatók össze. A kártyán `×N` badge jelzi az ismétlésszámot.

A forrásadat nem törlődik és nem módosul; az összevonás kizárólag UI-megjelenítési optimalizálás.

## Acceptance

Forráskapuk:

- TypeScript: PASS
- célzott ESLint: PASS
- teljes lint: 0 error / 103 meglévő warning
- V1.4 contract: 23/23 PASS
- candidate build: PASS
- static chunks: 245 PASS
- post-build retention: PASS

Valós runtime acceptance a candidate release-en:

- 18/18 PASS
- auth nélkül activity deny;
- ismeretlen worker deny;
- kódolási progress mentés;
- `.env` jellegű érzékeny útvonal maszkolás;
- API-key jellegű titok maszkolás;
- raw secret nincs API válaszban és nincs persisted worklogban;
- stdin worker helper működik;
- nem DEV host fail-closed;
- cursoros archive history több oldalon működik;
- minden worker activity `productionAccess: DENY`.

Valós browser acceptance:

- 15/15 PASS
- Ben-AI / ÁrminAI / JázminAI háttérszínek ténylegesen eltérők;
- ismétlődő TASK_UPDATE `×2` formában összevonódik;
- tegnapi archív csoport alapból csukott;
- napi archívum kérésre nyitható;
- heti archívum lazy-loadolható és nyitható;
- ÁrminAI worker drawer megnyílik;
- fájlútvonal + diff látható;
- desktop overflow nincs;
- mobil drawer működik és overflow nincs.

## Candidate release

Feature branch:

`feature/armin-benjadmin-v14-worker-activity-20260816`

Feature commit:

`9b23e73d98f03b21ffdd5990f3963d8addfba54f`

Candidate build:

`9uqMqMZ5e-qVgNl14oivY`

Candidate dist:

`.next-benjadmin-v14-worker-activity-candidate`

## Következő blokk

V1.4 aktiválás után a következő cél a parancsindítási lánc további lezárása:

BENJADMIN parancs → Ben-AI routing → worker → Plus/MCP handoff → `Folytasd.` pull → worker activity → eredmény / build / teszt → Ben-AI következő task előkészítés.

A natív AI provider továbbra sincs automatikusan bekapcsolva; a Plus/MCP híd fail-closed elve megmarad.
