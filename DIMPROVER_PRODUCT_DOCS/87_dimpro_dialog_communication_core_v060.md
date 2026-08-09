# DIMPRO Projektkapu – DIALOG Communication Core 0.6.0

## Cél

Projektazonosítóra, Project Core jogosultságokra, Project Calendar határidőkre és központi auditnaplóra épülő egyeztetési és RFI témakártya-motor.

## Témakártyatípusok

- `RFI` – szakági kérdés;
- `DATA_REQUEST` – adatkérés;
- `DESIGN_COMMENT` – tervészrevétel;
- `COORDINATION` – kooperációs pont;
- `DECISION_LOG` – döntési napló.

## Fő funkciók

- projektenként automatikus, évenként olvasható sorszám, például `RFI-2026-0001`;
- cím, leírás, szakág, prioritás, felelős és résztvevők;
- kapcsolódó dokumentumazonosítók;
- válaszadási határidő;
- automatikus DIALOG → Project Calendar határidőkapcsolat;
- állapotok: nyitott, válaszra vár, folyamatban, megoldva, lezárva, visszavonva;
- optimista verzióütközés-védelem;
- auditált hozzászólás-, kérdés-, válasz- és állapotjegyzet-folyam;
- auditált létrehozás, módosítás, megoldás, lezárás és visszavonás.

## Jogosultság

- OWNER, PROJECT_MANAGER, CONTRIBUTOR és REVIEWER: `dialog.read`, `dialog.write`;
- VIEWER: csak `dialog.read`.

## Adatmodell

- `dialog_core_schema_meta`;
- `dialog_core_sequences`;
- `dialog_core_threads`;
- `dialog_core_messages`.

## API

- `GET /api/projects/[projectId]/dialog/health`;
- `GET /api/projects/[projectId]/dialog/threads`;
- `POST /api/projects/[projectId]/dialog/threads`;
- `GET /api/projects/[projectId]/dialog/threads/[threadId]`;
- `PATCH /api/projects/[projectId]/dialog/threads/[threadId]`;
- `POST /api/projects/[projectId]/dialog/threads/[threadId]/messages`.

## Felület

- bal oldali kereshető és szűrhető témakártya-lista;
- jobb oldali részletes téma- és hozzászólásnézet;
- új RFI/egyeztetés űrlap;
- státuszváltó műveletek;
- felelős-, szakág-, résztvevő-, dokumentum- és naptárkapcsolat;
- desktop kétpaneles, tablet/mobil egymás alatti responsive elrendezés;
- minimum betűméret: 12 px.

## Naptárfejléc-javítás

A DOCK heti naptár fejlécében a hét száma és a teljes időszak egy közös, diszkrét keretben jelenik meg:

`31. hét | 2026. július 27. – augusztus 02.`

A hétfelirat desktopon/tableten 23 px, mobilon 20 px. A külön `NAPTÁRI HÉT` felirat megszűnt.

## SQL

Fájl:

`/root/dimprover/supabase/DIMPRO_PROJEKTKAPU_DIALOG_CORE_V060_BOOTSTRAP.sql`

SHA-256:

`74963c57e11445c11ad94acd1514be3fb81218eb3de5f808dd03102ea0dc7b1a`

## Pre-SQL ellenőrzés

- SQL/API/UI szerződés: 76/76 PASS;
- ESLint: PASS;
- TypeScript: PASS;
- production build: PASS;
- candidate DIALOG API: 10/10 PASS;
- DIALOG vizuális audit: 4/4 PASS;
- naptárfejléc vizuális audit: 4/4 PASS;
- Projektkapu tipográfia: 21/21 PASS;
- DRIVE regresszió: 15/15 PASS;
- minimum betűméret: 12 px;
- tesztadat-maradvány: 0;
- DROP forrásváltozás: 0.

## Biztonsági állapot

A DIALOG 0.6.0 SQL futtatásáig a témakártya- és hozzászólás-végpontok `DIALOG_CORE_SCHEMA_NOT_READY` hibával, fail-closed módban állnak le. A Project Calendar, DRIVE és DROP ettől függetlenül működik.

## Éles pre-SQL kiadás

- éles build: `7qBPqVXVfuk9-mkjJRuo-`;
- rollback: `.next_before_projectgate_dialog_v060_20260802_152702`;
- éles DIALOG API: 10/10 PASS;
- éles DIALOG vizuális audit: 4/4 PASS;
- éles naptárfejléc audit: 4/4 PASS;
- megjelenített fejléc: `31. hét | 2026. július 27. – augusztus 02.`;
- hétfelirat: desktop/tablet 23 px, mobil 20 px;
- éles Projektkapu tipográfia: 21/21 PASS;
- minimum betűméret: 12 px;
- éles DRIVE regresszió: 15/15 PASS;
- PM2: online;
- Nginx: PASS;
- D6 projekt: 10 DRIVE mappa, 0 dokumentum, 0 naptáresemény;
- tesztadat-maradvány: 0;
- DROP forrásváltozás: 0;
- nyilvános SQL-letöltés SHA-256 értéke egyezik a VPS eredetivel.

## Éles post-SQL kiadás

- DIALOG séma: `0.6.0`, aktív;
- éles build: `7qBPqVXVfuk9-mkjJRuo-`;
- rollback: `.next_before_projectgate_dialog_v060_20260802_152702`;
- SQL/API/UI szerződés: 76/76 PASS;
- éles DIALOG API: 10/10 PASS;
- teljes sorszámozási, témakártya-, hozzászólás-, jogosultsági, verzió-, naptár- és auditintegráció: 27/27 PASS;
- aktív DIALOG vizuális audit: 4/4 PASS;
- naptárfejléc vizuális audit: 4/4 PASS;
- megjelenített fejléc: `31. hét | 2026. július 27. – augusztus 02.`;
- hétfelirat: desktop/tablet 23 px, mobil 20 px;
- Projektkapu tipográfia: 21/21 PASS;
- minimum betűméret: 12 px;
- DRIVE regresszió: 15/15 PASS;
- D6 projekt: 0 DIALOG téma, 0 naptáresemény, 10 DRIVE mappa, 0 dokumentum;
- ideiglenes projekt- és felhasználó-maradvány: 0;
- PM2: online;
- Nginx: PASS;
- DROP forrásváltozás: 0.
