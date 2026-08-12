# BENJADMIN táblázat-első Release Központ

Dátum: 2026-08-12
Környezet: DEV
Állapot: checkpoint

## Cél

A korábbi kártyás, kétpaneles Release Központ átalakítása táblázat-első (table-first) BENJADMIN munkafelületté, a meglévő kiadási és biztonsági logika megtartásával.

## Főfelület

Az `/admin/release-kozpont` most a közös `BenjadminDataWorkspace` komponenst használja.

Fő tábla oszlopai:

- Verzió;
- Release cím;
- Típus;
- Státusz;
- DEV/STAGING/PRODUCTION útvonal;
- Modulok;
- Checklist;
- Build / smoke;
- Frissítés ideje;
- Művelet.

A felső sávban kompakt KPI-k, státuszszűrők, keresés, környezetállapot és 25 / 50 / 100 soros lapozás található.

## Release létrehozás és részletek

Az új release jelölt és a meglévő release részletei jobb oldali szerkesztőfiókban nyílnak. A fő adatgrid nem mozdul el.

Megőrzött szerkesztési adatok:

- cím és verzió;
- státusz;
- release típus;
- forrás- és célkörnyezet;
- érintett modulok;
- rövid összefoglaló;
- technikai, publikus és belső changelog;
- ismert hibák / kockázatok;
- build és smoke eredmény;
- rollback terv és útvonal;
- AI release átadó blokk;
- élesítési checklist;
- RC, élesítésre kész, élesítettként rögzített és rollback-kész státuszok.

## Biztonsági korlát

A Release Központ továbbra sem végez automatikus PRODUCTION deploy műveletet. Az „Élesítettként rögzítés” nyilvántartási státuszművelet marad. Az acceptance sem mentést, sem státuszváltást, sem checklist-írást nem végzett.

Ha a környezeti runtime-adat nem érhető el, a DEV/STAGING/PRODUCTION státuszsáv `UNKNOWN` állapotot mutat; nem generál kitalált állapotot.

## Acceptance

`scripts/benjadmin-table-release-acceptance.mjs`

Eredmény: 17/17 PASS.

Ellenőrzött:

- 1440×900 egy-viewport desktop;
- 10 oszlopos release tábla;
- sticky fejléc;
- keresés/szűrés/lapozás;
- környezetállapot-sáv;
- új release drawer;
- read-only meglévő release drawer ellenőrzés, ha van adat;
- sötét/világos mód;
- tablet és mobil no-page-overflow.

Regressziók:

- táblázat-első Licencközpont: 16/16 PASS;
- táblázat-első belépési audit: 14/14 PASS;
- BENJADMIN csapatképernyő: 42/42 PASS;
- TypeScript: PASS;
- lint: 0 hiba;
- diff-check: PASS.

## Következő fejlesztési pont

A következő átalakítandó régi adminoldal a Fejlesztési Központ (`/admin/dev`). Elsődleges cél a projektek, verziók, munkamenetek és fejlesztési feladatok táblázatos kezelése, a részletes műveletek külön oldalsó panellel.
