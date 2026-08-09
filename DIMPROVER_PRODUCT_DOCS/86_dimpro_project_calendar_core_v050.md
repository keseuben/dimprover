# DIMPRO Projektkapu – Project Calendar Core 0.5.0

## Cél

Projektazonosítóra, Project Core jogosultságokra és központi auditnaplóra épülő közös projekt-naptár és határidőmotor. Nem külön hetedik D6 főmodul: a DOCK közös projektfunkciója, amelybe a DIALOG, DECIDE, DIARY és DRIVE később automatikusan írhat eseményeket.

## Eseménytípusok

- `MEETING` – értekezlet;
- `DEADLINE` – határidő;
- `TASK` – feladat;
- `INSPECTION` – ellenőrzés;
- `MILESTONE` – mérföldkő;
- `REMINDER` – emlékeztető.

## Forrásmodulok

`DOCK`, `DIALOG`, `DECIDE`, `DIARY`, `DRIVE`, `SYSTEM`.

## Jogosultság

- OWNER: `calendar.read`, `calendar.write`;
- PROJECT_MANAGER: `calendar.read`, `calendar.write`;
- CONTRIBUTOR: `calendar.read`, `calendar.write`;
- REVIEWER: csak `calendar.read`;
- VIEWER: csak `calendar.read`.

## Adatmodell

### project_calendar_schema_meta

A séma verziójelzője. Elvárt verzió: `0.5.0`.

### project_calendar_events

Projektazonosító, cím, leírás, eseménytípus, forrásmodul, státusz, prioritás, kezdés/befejezés, egész napos jelző, helyszín, felelős, forrásügy-kapcsolat, optimista verzió, létrehozó/módosító és időbélyegek.

Állapotok: `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.

Prioritások: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

## API

- `GET /api/projects/[projectId]/calendar/health`
- `GET /api/projects/[projectId]/calendar/events`
- `POST /api/projects/[projectId]/calendar/events`
- `PATCH /api/projects/[projectId]/calendar/events/[eventId]`
- `DELETE /api/projects/[projectId]/calendar/events/[eventId]`

A módosítás és visszavonás `expectedVersion` mezővel védett. A visszavonás külön auditált útvonal; közvetlen törlés nincs.

## DOCK felület

- heti, hétfőtől vasárnapig tartó projektkép;
- ISO 8601 szerinti naptári hét nagy, de diszkrét számjelöléssel és hét-év kijelzéssel;
- közelgő, legfeljebb 90 napos határidőlista;
- eseménytípus- és modulforrás-szűrés;
- új esemény űrlap;
- folyamatban/teljesítve/visszavonva műveletek;
- lejárt, mai és hétnapos összesítők;
- desktop, tablet, mobil és sötét mód;
- minimum betűméret: 12 px.

## SQL

Fájl:

`/root/dimprover/supabase/DIMPRO_PROJEKTKAPU_PROJECT_CALENDAR_CORE_V050_BOOTSTRAP.sql`

SHA-256:

`af70065d2b3a041c3f535d088807aca9cac1a42b6c6f5ca5c379638923d65553`

## Pre-SQL ellenőrzés

- statikus szerződés: 58/58 PASS;
- ESLint: PASS;
- TypeScript: PASS;
- production build: PASS;
- candidate API: 10/10 PASS;
- DRIVE Core regresszió: 15/15 PASS;
- vizuális audit: 4/4 PASS;
- Projektkapu tipográfia: 21/21 PASS;
- minimum betűméret: 12 px;
- tesztadat-maradvány: 0;
- DROP forrásváltozás: 0.

## Biztonsági állapot

Az SQL alkalmazásáig a naptár lekérdezési és írási végpontjai `PROJECT_CALENDAR_SCHEMA_NOT_READY` hibával, fail-closed módon állnak le. A meglévő DOCK, DRIVE és további Projektkapu-funkciók ettől függetlenül működnek.

## Éles pre-SQL kiadás

- éles build: `50gMYrXlP48Oyi9coWiYP`;
- rollback: `.next_before_projectgate_calendar_v050_20260802_140202`;
- éles API: 10/10 PASS;
- éles DRIVE Core regresszió: 15/15 PASS;
- éles vizuális audit: 4/4 PASS;
- éles Projektkapu tipográfia: 21/21 PASS;
- minimum betűméret: 12 px;
- PM2: online;
- Nginx: PASS;
- D6 projekt: 10 DRIVE mappa, 0 dokumentum;
- ideiglenes projekt- és felhasználó-maradvány: 0;
- Drop forrásváltozás: 0;
- letölthető SQL SHA-256: ellenőrzötten egyezik a VPS eredetivel.

## Post-SQL candidate kiadás

- build: `-r06pfwgP5m7mZXcmm6BJ`;
- rollback: `.next_before_projectgate_calendar_v050_postsql_20260802_150002`;
- SQL/API/UI szerződés: 61/61 PASS;
- naptár-életciklus és szerepkörintegráció: 23/23 PASS;
- candidate API: 10/10 PASS;
- DRIVE Core regresszió: 15/15 PASS;
- naptári hét vizuális audit: 4/4 PASS;
- ISO naptári hét: desktop/tablet 38 px, mobil 34 px;
- Projektkapu tipográfia: 21/21 PASS;
- minimum megjelenő betűméret: 12 px;
- D6 naptáresemény: 0;
- tesztadat-maradvány: 0.

## Éles post-SQL kiadás

- éles build: `-r06pfwgP5m7mZXcmm6BJ`;
- rollback: `.next_before_projectgate_calendar_v050_postsql_20260802_150002`;
- SQL/API/UI szerződés: 61/61 PASS;
- éles naptár-API: 10/10 PASS;
- esemény-életciklus és szerepkörintegráció: 23/23 PASS;
- éles vizuális audit: 4/4 PASS;
- ISO 8601 naptári hét: desktop/tablet 38 px, mobil 34 px;
- éles Projektkapu tipográfia: 21/21 PASS;
- minimum megjelenő betűméret: 12 px;
- éles DRIVE Core regresszió: 15/15 PASS;
- PM2: online;
- Nginx: PASS;
- D6 projekt: 0 naptáresemény, 10 DRIVE mappa, 0 dokumentum, 0 feltöltési munkamenet, 0 cleanup-feladat;
- ideiglenes projekt- és felhasználó-maradvány: 0;
- Drop forrásváltozás: 0.
