# DIMPRO Projektkapu – DIARY Project Log Core 0.8.0

## Cél

Projektalapú napi napló- és eseménykezelő réteg a DIMPRO Projektkapuban. A DIARY időjárást, létszámot, napi munkavégzést, akadályokat, munkavédelmi és ellenőrzési információkat, valamint külön eseményeket rögzít közös Project Core jogosultsággal, Project Calendar kapcsolattal és auditnaplóval.

A DIARY projekt-előkészítő és nyomon követő munkanapló. Nem helyettesíti a hivatalos e-építési naplót.

## Jogosultság

- OWNER: `diary.read`, `diary.write`, `diary.close`;
- PROJECT_MANAGER: `diary.read`, `diary.write`, `diary.close`;
- CONTRIBUTOR: `diary.read`, `diary.write`;
- REVIEWER: csak `diary.read`;
- VIEWER: csak `diary.read`.

## Adatmodell

### diary_core_schema_meta

A DIARY sémaverzióját és bootstrap-azonosítóját tárolja.

### diary_core_sequences

Projektenként és évenként monoton napi naplósorszám. A kód formája `NAP-ÉÉÉÉ-NNNN`.

### diary_core_entries

Egy projekt–dátum párhoz legfeljebb egy napi napló:

- dátum, kód, cím és állapot;
- időjárási állapot és megjegyzés;
- minimum és maximum hőmérséklet;
- teljes létszám és szakági/szervezeti bontás;
- elvégzett munkák;
- akadályok és késedelmek;
- munkavédelem;
- ellenőrzések;
- kapcsolódó dokumentumazonosítók;
- lezárási időpont és megjegyzés;
- optimista verzió.

### diary_core_events

A napi naplóhoz kapcsolódó külön események:

- munkafolyamat;
- akadály;
- rendkívüli esemény;
- ellenőrzés;
- szállítás;
- munkavédelem;
- időjárási esemény;
- megjegyzés.

Az eseménykód formája `NAP-ÉÉÉÉ-NNNN/E-NNN`. Az eseményhez felelős, határidő, dokumentum, DIALOG-témakártya és DECIDE-kérelem kapcsolható.

## Állapotok

Napi napló:

- `DRAFT`;
- `OPEN`;
- `CLOSED`;
- `CANCELLED`.

Esemény:

- `OPEN`;
- `RESOLVED`;
- `CANCELLED`.

Súlyosság:

- `INFO`;
- `MEDIUM`;
- `HIGH`;
- `CRITICAL`.

## Project Calendar kapcsolat

Határidős esemény létrehozásakor ugyanabban az adatbázis-tranzakcióban DIARY-forrású naptáresemény készül. Az eseménytípus alapján feladat, ellenőrzés vagy határidő keletkezik. Megoldáskor a naptáresemény `COMPLETED`, visszavonáskor `CANCELLED` állapotba kerül.

## API

- `GET /api/projects/[projectId]/diary/health`;
- `GET /api/projects/[projectId]/diary/entries`;
- `POST /api/projects/[projectId]/diary/entries`;
- `GET /api/projects/[projectId]/diary/entries/[entryId]`;
- `PATCH /api/projects/[projectId]/diary/entries/[entryId]`;
- `POST /api/projects/[projectId]/diary/entries/[entryId]/close`;
- `POST /api/projects/[projectId]/diary/entries/[entryId]/events`;
- `PATCH /api/projects/[projectId]/diary/entries/[entryId]/events/[eventId]`.

## Felület

- kétpaneles desktop munkatér;
- bal oldali napi naplólista;
- jobb oldali részletes időjárás-, létszám-, munkavégzés- és eseménynézet;
- napi napló létrehozása és szerkesztése;
- vezetői lezárás;
- esemény létrehozása, megoldása és visszavonása;
- mobilon és tableten egymás alá rendezett panelek;
- világos és sötét mód;
- minimum 12 px betűméret;
- állandó figyelmeztetés az e-építési naplótól való elhatárolásról.

## SQL

Fájl:

`/root/dimprover/supabase/DIMPRO_PROJEKTKAPU_DIARY_CORE_V080_BOOTSTRAP.sql`

SHA-256:

`b8bb20b850a2ff9b758b28e4ac1f4145b5af753267e69da285b8b4346bc36859`

## Pre-SQL ellenőrzés

- SQL/API/UI szerződés: 89/89 PASS;
- ESLint: PASS;
- TypeScript: PASS;
- production build: PASS;
- candidate DIARY API: 14/14 PASS;
- candidate DIARY vizuális audit: 4/4 PASS;
- DIALOG integráció: 27/27 PASS;
- DECIDE integráció: 36/36 PASS;
- projekt-naptár fejléc: 4/4 PASS;
- Projektkapu tipográfia: 21/21 PASS;
- DRIVE regresszió: 15/15 PASS;
- `/account/modules` átirányítás: PASS;
- tesztadat-maradvány: 0;
- DROP forrásváltozás: 0.

## Biztonsági állapot

A DIARY 0.8.0 SQL alkalmazásáig minden írási végpont `DIARY_CORE_SCHEMA_NOT_READY` hibával, fail-closed módban áll le. A többi Projektkapu modul ettől függetlenül működik.

## Éles pre-SQL kiadás

- éles build: `0aKwUFQl39FnPH3yPi9_A`;
- rollback: `.next_before_projectgate_diary_v080_20260802_195716`;
- éles DIARY API: 14/14 PASS;
- éles DIARY vizuális audit: 4/4 PASS;
- DIALOG integráció: 27/27 PASS;
- DECIDE integráció: 36/36 PASS;
- naptárfejléc audit: 4/4 PASS;
- Projektkapu tipográfia: 21/21 PASS;
- minimum betűméret: 12 px;
- DRIVE regresszió: 15/15 PASS;
- `/account/modules` → Projektkapu gyökér: HTTP 307 PASS;
- SQL-letöltés: HTTP 200, SHA-256 egyezik;
- PM2: online;
- Nginx: PASS;
- D6 projekt: 0 DIALOG-téma, 0 DECIDE-kérelem, 0 naptáresemény, 10 DRIVE-mappa, 0 dokumentum;
- ideiglenes projekt- és felhasználó-maradvány: 0;
- DROP forrásváltozás: 0.

## Éles post-SQL kiadás

- DIARY séma: `0.8.0`, aktív;
- éles build: `0aKwUFQl39FnPH3yPi9_A`;
- rollback: `.next_before_projectgate_diary_v080_20260802_195716`;
- SQL/API/UI szerződés: 89/89 PASS;
- séma- és RPC-ellenőrzés: PASS, 4 tábla és 5 atomikus függvény;
- teljes napi napló-, esemény-, jogosultság-, verzió-, lezárás-, naptár- és auditintegráció: 39/39 PASS;
- éles aktív DIARY API: 14/14 PASS;
- aktív DIARY vizuális audit: 4/4 PASS;
- DIALOG integráció: 27/27 PASS;
- DECIDE integráció: 36/36 PASS;
- naptárfejléc vizuális audit: 4/4 PASS;
- Projektkapu tipográfia: 21/21 PASS;
- minimum betűméret: 12 px;
- DRIVE regresszió: 15/15 PASS;
- `/account/modules` átirányítás: PASS;
- D6 projekt: 0 DIARY-bejegyzés, 0 DIARY-esemény, 0 DIALOG-téma, 0 DECIDE-kérelem, 0 naptáresemény, 10 DRIVE-mappa, 0 dokumentum;
- ideiglenes projekt- és felhasználó-maradvány: 0;
- PM2: online;
- Nginx: PASS;
- DROP forrásváltozás: 0.
