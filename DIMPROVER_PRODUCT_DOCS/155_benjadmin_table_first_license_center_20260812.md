# BENJADMIN táblázat-első Licencközpont

Dátum: 2026-08-12
Környezet: DEV
Állapot: checkpoint

## Cél

A korábbi nagyméretű kártyás Licencközpont átalakítása nagy licencmennyiséget kezelő, táblázat-első (table-first) BENJADMIN munkafelületté.

## Főfelület

Az `/admin/licenckozpont` most a közös `BenjadminDataWorkspace` komponenst használja.

A fő táblázat oszlopai:

- Licenckód;
- Tulajdonos;
- Termék / csomag;
- Státusz;
- Felhasználók;
- Eszközök;
- Modulok;
- Send-jog;
- Lejárat;
- Művelet.

A felső munkasávban kompakt KPI-k, státuszszűrés, keresés és 25 / 50 / 100 soros lapozás található.

## Létrehozás és szerkesztés

Az új licenc és a meglévő licenc szerkesztése nem tolja le a fő táblázatot. Mindkét folyamat jobb oldali szerkesztőfiókban történik.

Megőrzött funkciók:

- saját licenckód;
- szervezet / felhasználó tulajdonos;
- termék és csomag;
- státusz és lejárat;
- felhasználó- és eszközkeret;
- moduljogosultságok;
- szervezeti felhasználók;
- Send-jogosultság (entitlement) létrehozás;
- saját Send-kód, automatikus nyers kódgenerálás nélkül;
- meglévő Send-jogosultságok áttekintése.

Az acceptance kizárólag read-only UI műveleteket végzett: a létrehozó és szerkesztő fiókot megnyitotta és bezárta, mentést/létrehozást nem indított.

## Acceptance

`scripts/benjadmin-table-license-acceptance.mjs`

Eredmény: 16/16 PASS.

Regressziók:

- táblázat-első belépési audit: 14/14 PASS;
- BENJADMIN csapatképernyő: 42/42 PASS;
- Vezérlés / Partner V3: 21/21 PASS;
- Kiadás / Audit / Licenc-AI V3: 28/28 PASS;
- TypeScript: PASS;
- lint: 0 hiba;
- diff-check: PASS.

## Következő fejlesztési pont

A következő átalakítandó régi adminoldal a Release Központ. A kiadási lista lesz az elsődleges táblázat, a release részletei és szerkesztése külön szerkesztőfiókba kerülnek. A PRODUCTION műveleti és jóváhagyási korlátok változatlanok maradnak.
