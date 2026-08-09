# DIMPRO Projektkapu – DRIVE Core 0.3.0

**Dátum:** 2026. augusztus 2.  
**Állapot:** pre-SQL kiadás, kézi Supabase-futtatásra vár  
**Dev Center:** `version_26deb389-478`

## Cél

A Projektkapu Dokumentumtár modulja közös, projektazonosítóhoz kötött adatmagra került. A 0.3.0 kör még nem kapcsol valós objektumtárhelyet és nem ír fájlbájtot. A cél a biztonságos mappa-, dokumentum-, verzió-, audit- és desktop szinkronalap elkészítése.

A meglévő fejlesztői `/api/drive` előnézet kompatibilitási céllal megmaradt. A DIMPRO Drop forrása, API-ja és adatmodellje nem változott.

## Új adatmodell

A kézi SQL-futtatás után hét PostgreSQL-tábla jön létre:

1. `drive_core_schema_meta`
2. `drive_core_folders`
3. `drive_core_documents`
4. `drive_core_document_versions`
5. `drive_core_change_events`
6. `drive_core_sync_cursors`
7. `drive_core_project_bootstraps`

Minden projektadat a meglévő `project_core_projects.id` kulcshoz kapcsolódik. A mappák projekten belül egyedi útvonalat kapnak. A dokumentumok külön főrekordot és növekvő verziószámú verziórekordokat használnak.

## Biztonsági és integritási szabályok

- A böngésző nem kap service-role kulcsot.
- Az adatbázist csak a szerveroldali repository éri el.
- RLS minden DRIVE Core táblán aktív.
- Az `anon` és `authenticated` közvetlen táblajogosultsága visszavont.
- Az írási folyamatok security-definer RPC-kben, tranzakciósan futnak.
- Mappa- és dokumentumíráshoz `document.write`, olvasáshoz `document.read` Project Core-jogosultság kell.
- A DRIVE Core automatikus fájlos fallbacket nem használ; hiányzó séma esetén 503 állapottal leáll.
- A dokumentumverziók optimista ütközésellenőrzést támogatnak.
- A tényleges objektumtárhely nincs aktiválva; a verziók `METADATA_ONLY` állapotban készülnek.

## Audit és szinkron

A közös Project Core audit az alábbi új entitástípusokat kezeli:

- `folder`
- `document`
- `document_version`
- `sync`

A `drive_core_change_events.sequence` monoton változáskurzor. A Drive Desktop vagy a teljes Fájlműhely a legutóbbi kurzor után kérheti le a módosításokat, majd a saját klienskurzorát visszaírhatja.

## Projektalapmappák

A post-SQL admin bootstrap projektenként idempotensen létrehozza:

- `01_Tervek`
  - `Epiteszet`
  - `Gepeszet`
  - `Elektromos`
- `02_Muszaki_dokumentumok`
- `03_Penzugy`
- `04_Szerzodesek`
- `05_Jegyzokonyvek`
- `06_Atadas`
- `99_Archivum`

## Projektkapu API

- `GET /api/projects/[projectId]/drive/health`
- `GET /api/projects/[projectId]/drive/tree`
- `POST /api/projects/[projectId]/drive/folders`
- `POST /api/projects/[projectId]/drive/documents`
- `POST /api/projects/[projectId]/drive/documents/[documentId]/versions`
- `GET /api/projects/[projectId]/drive/changes?cursor=[sequence]`
- `POST /api/projects/[projectId]/drive/sync/cursor`
- `POST /api/projects/admin/bootstrap-drive-core`

## Felület

A DRIVE modul a korábbi előkészített kártya helyett tényleges projektfájltár-munkaterületet kapott:

- mappafa;
- dokumentumlista;
- keresés;
- verzió-, forrás-, méret- és módosítási adatok;
- mappa- és dokumentum-metaadat létrehozási űrlap;
- jogosultságfüggő írási gombok;
- schema-health és biztonságos pre-SQL állapot;
- világos/sötét téma;
- desktop/tablet/mobil responsive elrendezés.

## SQL-fájl

```text
supabase/DIMPRO_PROJEKTKAPU_DRIVE_CORE_V030_BOOTSTRAP.sql
```

SHA-256:

```text
b9deb7a962ee30bc730fd096684dc18e0a2b571826a2f3bd71ba68e49fe69aad
```

## Teszteredmények a kézi SQL előtt

- SQL contract: 24/24 PASS
- célzott ESLint: PASS
- TypeScript: PASS
- production build: PASS
- candidate API regresszió: 13/13 PASS
- hitelesített responsive vizuális ellenőrzés: 4/4 PASS
- Project Core Supabase-regresszió: PASS
- legacy `/api/drive` regresszió: PASS
- hiányzó DRIVE-séma fail-closed működése: PASS
- DIMPRO Drop forrásváltozás: 0

A teljes repository-szintű automatikus smoke futás időkorlátot ért el. Az érintett fájlok célzott lintje, a teljes TypeScript-ellenőrzés és a production build hibamentes.

## Következő kézi lépés

A felhasználó futtatja a teljes SQL-fájlt a Supabase SQL Editorban. Siker után szerveroldali schema-health, idempotens alapmappa-bootstrap, CRUD/verzió/szinkron teszt, éles ellenőrzés és kiadás következik.

## 2026-08-02 – Éles pre-SQL kihelyezés

A biztonságosan letiltott pre-SQL verzió kikerült az éles Projektkapura.

- éles build: `FcmPQ0sk4IunWJtjGAvsY`;
- PM2: online;
- Nginx: hibamentes;
- éles HTTPS/API regresszió: 11/11 PASS;
- DRIVE Core adatbázis: szándékosan `ready: false` a kézi SQL előtt;
- valós objektumírás: letiltva;
- Project Core: továbbra is Supabase `0.2.0`, ready;
- legacy Drive regresszió: PASS;
- Drop regresszió: PASS;
- Drop forrásváltozás: 0;
- Dev Center állapot: `blocked`, kézi Supabase SQL-futtatásra vár.

## 2026-08-02 – Post-SQL aktiválás és verzióütközés-hotfix

Az alap DRIVE Core SQL sikeresen lefutott. A séma `0.3.0` állapotban ready, a D6 projekthez 10 alapmappa jött létre, az ismételt bootstrap idempotens.

A teljes integrációs teszt közben kiderült, hogy a dokumentumverzió-ütközéshez használt PostgreSQL `40001` hibakódot a Supabase tranzakciós újrapróbálkozásként értelmezi, ezért a szerver időtúllépést kapott. A javítás két részből áll:

1. Az API az RPC előtt ellenőrzi az aktuális dokumentumverziót, és elavult kliensverziónál azonnal `409 Conflict` választ ad. Ez már az éles buildben működik.
2. A PostgreSQL függvény minimális hotfixe `P0001` alkalmazáshibakódra vált, így valódi párhuzamos ütközésnél sem indul Supabase retry/timeout.

Hotfix fájl:

```text
supabase/DIMPRO_PROJEKTKAPU_DRIVE_CORE_V030_CONFLICT_HOTFIX.sql
```

Hotfix SHA-256:

```text
b4194cf05d3bfcdf11db7d95302dc0bea0210dabbc0ed9c4878074c149e4ad1b
```

A teljes bootstrap forrás javított SHA-256 értéke:

```text
04a6b6ce47dddcc7bf83974eae0c21b84d058653f09428fb29fef6fb8a90466c
```

### Post-SQL eredmények

- schema-health: ready, `0.3.0`;
- D6 bootstrap: 10 mappa;
- ismételt bootstrap: idempotens;
- candidate CRUD/verzió/szinkron teszt: 15/15 PASS;
- éles CRUD/verzió/szinkron teszt: 15/15 PASS;
- verzióelőellenőrzés és `409 Conflict`: PASS;
- változáskurzor és monoton desktop sync cursor: PASS;
- adatbázisrekord-számlálás: PASS;
- tesztprojekt teljes cascade takarítása: PASS;
- D6 projekt tesztadat-szennyezés: 0 dokumentum;
- post-SQL responsive vizuális teszt: 4/4 PASS;
- éles regresszió: 10/10 PASS;
- Nginx: PASS;
- PM2: online;
- éles build: `aARmb6-NbQ6kkS1PZaIZj`;
- rollback: `.next_before_projectgate_drive_v030_precheck_20260802_103943`;
- Drop forrásváltozás: 0.

A fejlesztés a minimális conflict-hotfix SQL kézi futtatásáig blokkolt. A fájl nem módosít táblát vagy projektadatot; csak a `drive_core_add_version_atomic` függvényt cseréli le és visszaállítja a service-role végrehajtási jogosultságot.

## Továbbépítés: Object Storage 0.4.0

A 0.3.0 stabil metaadat- és szinkronmotor változatlan alapként marad. A fájlbájt-tárolás külön 0.4.0 réteg, saját séma-health, feltöltési munkamenet és S3-konfiguráció mellett. A különválasztás biztosítja, hogy tárhelyhiba esetén a dokumentumjegyzék és a projektmappák ne álljanak le.
