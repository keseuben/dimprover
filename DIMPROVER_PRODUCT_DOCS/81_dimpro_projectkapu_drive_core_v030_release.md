# DIMPRO Projektkapu – DRIVE Core 0.3.0 végleges kiadás

**Dátum:** 2026. augusztus 2.

## Végleges állapot

A DRIVE Core 0.3.0 PostgreSQL/Supabase sémája aktív. A D6 projekthez tíz alapmappa jött létre, a bootstrap idempotens. A Projektkapu DRIVE munkatér a közös Project Core jogosultság-, tagság- és auditmodelljére épül.

A tárolási mód ebben a verzióban `METADATA_ONLY`; valós objektumtárhelyre történő fájlbájt-írás nem aktív.

## Conflict hotfix

A dokumentumverzió-ütközéshez eredetileg használt PostgreSQL `40001` hibakódot a Supabase újrapróbálható tranzakciós hibaként értelmezte, ami időtúllépést okozott. A végleges javítás:

- API-oldali aktuális verzióelőellenőrzés és `409 Conflict` válasz;
- adatbázisoldali `P0001 / DRIVE_CORE_VERSION_CONFLICT` alkalmazáshiba;
- közvetlen RPC teszt: PASS;
- válaszidő: 74 ms;
- Supabase retry/timeout: megszűnt.

## Teszteredmények

- SQL contract: 24/24 PASS;
- schema-health: `0.3.0`, ready;
- D6 bootstrap: 10 mappa;
- ismételt bootstrap: idempotens;
- candidate CRUD/verzió/szinkron: 15/15 PASS;
- éles CRUD/verzió/szinkron: 15/15 PASS;
- API verzióelőellenőrzés: 409 PASS;
- közvetlen RPC conflict hotfix: PASS, 74 ms, `P0001`;
- post-SQL responsive vizuális teszt: 4/4 PASS;
- éles regresszió: 10/10 PASS;
- teljes tesztadat-takarítás: PASS;
- D6 tesztdokumentum-maradvány: 0;
- PM2: online;
- Nginx: hibamentes;
- DIMPRO Drop aktív forrásmódosítás: 0.

## Éles állapot

- build: `aARmb6-NbQ6kkS1PZaIZj`;
- PM2 folyamat: `dimprover`, online;
- rollback: `.next_before_projectgate_drive_v030_precheck_20260802_103943`;
- canonical felület: `https://projektkapu.dimpro.hu/project/d6-irodaepulet/drive`.

## Következő fejlesztési szint

**PROJEKTKAPU 0.4.0 – DRIVE objektumtárhely**

- szerveroldali signed upload/download;
- staging állapot;
- vírus- és fájlellenőrzés;
- SHA-256 checksum;
- megszakított feltöltés folytatása;
- Drive Desktop kézi fájlszinkron;
- jogosultság- és auditkapcsolat;
- a DIMPRO Drop aktív forrásának változatlanul hagyása.
