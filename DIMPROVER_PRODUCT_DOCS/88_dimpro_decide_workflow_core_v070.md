# DIMPRO Projektkapu – DECIDE Workflow Core 0.7.0

## Cél

Projektazonosítóra, Project Core jogosultságokra, Project Calendar határidőkre és központi auditnaplóra épülő döntési és jóváhagyási workflow-motor. A DECIDE terv-, termékkiváltási, költség-, határidő- és műszaki döntések soros vagy párhuzamos jóváhagyási folyamatát kezeli.

## Döntési kérelemtípusok

- `PLAN_APPROVAL` – tervjóváhagyás;
- `PRODUCT_SUBSTITUTION` – termékkiváltás;
- `COST_IMPACT` – költséghatásos döntés;
- `SCHEDULE_IMPACT` – határidőhatásos döntés;
- `TECHNICAL_DECISION` – általános műszaki döntés.

## Jóváhagyási szakaszok

A kérelem egy vagy több, 1-től folyamatosan számozott szakaszból áll.

- `ALL`: a szakasz minden kijelölt jóváhagyójának jóváhagyása szükséges;
- `ANY`: legalább egy kijelölt jóváhagyó jóváhagyása elegendő, a többi függő feladat `SKIPPED` állapotba kerül;
- azonos szakaszszám párhuzamos jóváhagyást jelent;
- a következő szakasz csak az aktuális sikeres lezárása után aktiválódik;
- elutasítás vagy módosításkérés lezárja a kérelmet, a további feladatokat kihagyottra állítja;
- csak az aktuális szakasz kijelölt felhasználója válaszolhat.

## Jogosultság

- OWNER: `approval.read`, `approval.write`, `approval.respond`;
- PROJECT_MANAGER: `approval.read`, `approval.write`, `approval.respond`;
- CONTRIBUTOR: `approval.read`, `approval.write`;
- REVIEWER: `approval.read`, `approval.respond`;
- VIEWER: csak `approval.read`.

A `approval.respond` projektjogosultság önmagában nem elegendő: az adatbázis azt is ellenőrzi, hogy a felhasználó az aktuális szakasz kijelölt jóváhagyója-e.

## Adatmodell

### decide_core_schema_meta

A DECIDE sémaverzióját és bootstrap-azonosítóját tárolja.

### decide_core_sequences

Projektenként monoton sorszámot kezel. A kérelmek kódja `DEC-ÉÉÉÉ-NNNN` alakú, például `DEC-2026-0001`.

### decide_core_requests

A döntési kérelmek fő adatai:

- típus, cím és leírás;
- státusz és prioritás;
- kérelmező és felelős;
- döntési határidő;
- költséghatás és pénznem;
- határidőhatás napokban;
- kapcsolódó dokumentumok;
- opcionális DIALOG-témakártya;
- Project Calendar esemény;
- aktuális és összes jóváhagyási szakasz;
- optimista verzió.

### decide_core_approvers

A jóváhagyási szakaszok résztvevői, az `ALL`/`ANY` működési mód, felhasználóazonosító, név, szerep, válasz, indoklás és válaszidő.

### decide_core_notes

Auditált döntési megjegyzések és állapotjegyzetek.

## Állapotok

Kérelem:

- `DRAFT`;
- `PENDING`;
- `APPROVED`;
- `REJECTED`;
- `CHANGES_REQUESTED`;
- `CANCELLED`.

Jóváhagyói feladat:

- `WAITING`;
- `PENDING`;
- `APPROVED`;
- `REJECTED`;
- `CHANGES_REQUESTED`;
- `SKIPPED`.

## Project Calendar kapcsolat

Határidős kérelem létrehozásakor a DECIDE ugyanabban az adatbázis-tranzakcióban `source_module = DECIDE` naptáreseményt hoz létre. A döntési folyamat változásakor:

- folyamatban lévő kérelem → naptáresemény `IN_PROGRESS`;
- jóváhagyott kérelem → `COMPLETED`;
- elutasított, módosításra visszaadott vagy visszavont kérelem → `CANCELLED`.

## API

- `GET /api/projects/[projectId]/decide/health`;
- `GET /api/projects/[projectId]/decide/requests`;
- `POST /api/projects/[projectId]/decide/requests`;
- `GET /api/projects/[projectId]/decide/requests/[requestId]`;
- `PATCH /api/projects/[projectId]/decide/requests/[requestId]`;
- `POST /api/projects/[projectId]/decide/requests/[requestId]/respond`;
- `POST /api/projects/[projectId]/decide/requests/[requestId]/notes`.

## DECIDE munkatér

- bal oldali kereshető és szűrhető döntésilista;
- jobb oldali részletes döntési és jóváhagyási panel;
- költség- és határidőhatás;
- dokumentum- és DIALOG-kapcsolat;
- dinamikus soros/párhuzamos jóváhagyói lánc;
- kijelölt felhasználó „Rád váró döntés” panelje;
- jóváhagyás, elutasítás és módosításkérés;
- auditált döntési megjegyzések;
- desktop kétpaneles, tablet/mobil egymás alatti responsive elrendezés;
- minimum betűméret: 12 px.

## SQL

Fájl:

`/root/dimprover/supabase/DIMPRO_PROJEKTKAPU_DECIDE_CORE_V070_BOOTSTRAP.sql`

SHA-256:

`6002928d4cd5bdadce894545b412018ed7aadb91e701edc05994d3e6c7e9f40d`

## Pre-SQL ellenőrzés

- SQL/API/UI szerződés: 82/82 PASS;
- ESLint: PASS;
- TypeScript: PASS;
- production build: PASS;
- candidate DECIDE API: 12/12 PASS;
- candidate DECIDE vizuális audit: 4/4 PASS;
- DIALOG teljes integráció: 27/27 PASS;
- projekt-naptár fejléc audit: 4/4 PASS;
- Projektkapu tipográfia: 21/21 PASS;
- DRIVE regresszió: 15/15 PASS;
- minimum betűméret: 12 px;
- tesztadat-maradvány: 0;
- DROP forrásváltozás: 0.

## Biztonsági állapot

A DECIDE 0.7.0 SQL alkalmazásáig a kérelem-, válasz- és megjegyzés-végpontok `DECIDE_CORE_SCHEMA_NOT_READY` hibával, fail-closed módban állnak le. A DIALOG, Project Calendar, DRIVE és DROP ettől függetlenül működik.

## Éles pre-SQL kiadás

- éles build: `li4-q_9LK3roC-1Ah_YGo`;
- rollback: `.next_before_projectgate_decide_v070_20260802_162314`;
- éles DECIDE API: 12/12 PASS;
- éles DECIDE vizuális audit: 4/4 PASS;
- DIALOG teljes integráció: 27/27 PASS;
- projekt-naptár fejléc audit: 4/4 PASS;
- Projektkapu tipográfia: 21/21 PASS;
- minimum betűméret: 12 px;
- DRIVE regresszió: 15/15 PASS;
- PM2: online;
- Nginx: PASS;
- D6 projekt: 0 DIALOG-téma, 0 naptáresemény, 10 DRIVE-mappa, 0 dokumentum;
- ideiglenes projekt- és felhasználó-maradvány: 0;
- DROP forrásváltozás: 0;
- a nyilvános SQL-fájl HTTP 200 választ ad, SHA-256 értéke egyezik a VPS eredetivel;
- SQL első sora `begin;`, utolsó sora `commit;`.

## Éles post-SQL kiadás

- DECIDE séma: `0.7.0`, aktív;
- éles build: `li4-q_9LK3roC-1Ah_YGo`;
- rollback: `.next_before_projectgate_decide_v070_20260802_162314`;
- SQL/API/UI szerződés: 82/82 PASS;
- éles aktív DECIDE API: 13/13 PASS;
- teljes ALL/ANY, kijelölt jóváhagyó, szerepkör, verzió, döntés, naptár és auditintegráció: 36/36 PASS;
- aktív DECIDE vizuális audit: 4/4 PASS;
- DIALOG teljes integráció: 27/27 PASS;
- naptárfejléc vizuális audit: 4/4 PASS;
- Projektkapu tipográfia: 21/21 PASS;
- minimum betűméret: 12 px;
- DRIVE regresszió: 15/15 PASS;
- D6 projekt: 0 DECIDE-kérelem, 0 DIALOG-téma, 0 naptáresemény, 10 DRIVE-mappa, 0 dokumentum;
- ideiglenes projekt- és felhasználó-maradvány: 0;
- PM2: online;
- Nginx: PASS;
- DROP forrásváltozás: 0.
