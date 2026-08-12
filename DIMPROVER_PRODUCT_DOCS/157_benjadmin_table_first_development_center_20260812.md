# BENJADMIN táblázat-első Fejlesztési Központ

Dátum: 2026-08-12
Környezet: DEV
Állapot: checkpoint

## Cél

A korábbi hosszú, kártyás Fejlesztési Központ átalakítása táblázat-első (table-first) BENJADMIN munkafelületté úgy, hogy a projekt-, verzió-, munkamenet- és időnyilvántartási funkciók megmaradjanak.

## Főfelület

Az `/admin/dev` most a közös `BenjadminDataWorkspace` komponenst használja.

Három elsődleges adattábla váltható ugyanazon munkatérben:

1. Verziók;
2. Munkamenetek;
3. Projektek.

Mindhárom nézet kereshető és lapozható. A Verziók nézet külön státuszszűrőket is kapott.

A felső kompakt KPI sor a projektek, folyamatban lévő és tesztelés alatt álló verziók, blokkolt elemek és teljes fejlesztési idő összesítését mutatja.

## Verzió részletek

A verzió főtábla mezői:

- Projekt;
- Modul;
- Verzió;
- Fejlesztés;
- Státusz;
- Ráfordítás;
- Aktív időkategória;
- Frissítés;
- Művelet.

A részletek jobb oldali panelen nyílnak. Itt megmaradt:

- projekt és modul;
- összefoglaló;
- időbontás;
- tesztösszefoglaló;
- következő lépés;
- kapcsolódó URL / Fejlesztési napló;
- aktív munkamenet időkategóriája;
- munkamenet indítás/leállítás.

Az acceptance a részletezőt kizárólag read-only módon nyitja meg és zárja be; időmérési műveletet nem indít.

## Fejlesztési motor

A `DevEnginePanel` nem veszett el. A fő táblázatot nem foglalja el, hanem külön `Fejlesztési motor` oldalsó panelben nyitható meg.

## Acceptance

`scripts/benjadmin-table-dev-center-acceptance.mjs`

Eredmény: 18/18 PASS.

Ellenőrzött:

- 1440×900 egy-viewport desktop;
- 9 oszlopos Verziók tábla;
- 9 oszlopos Munkamenetek tábla;
- 9 oszlopos Projektek tábla;
- ragadós fejléc;
- keresés, státuszszűrés és lapozás;
- verzió részletező panel, ha van adat;
- Fejlesztési motor panel;
- sötét/világos mód;
- tablet és mobil no-page-overflow.

Regressziók:

- Release Központ: 17/17 PASS;
- Licencközpont: 16/16 PASS;
- Belépési audit: 14/14 PASS;
- BENJADMIN csapatképernyő: 42/42 PASS;
- TypeScript: PASS;
- lint: 0 hiba;
- diff-check: PASS.

## Következő fejlesztési pont

A következő táblázat-első átalakítás a Szerver állapotfigyelő. A cél a DEV, PRODUCTION, DATABASE és objektumtárhely célok egységes infrastruktúra-táblája, CPU / RAM / swap / lemez / válaszidő / státusz oszlopokkal, miközben a meglévő részletes DEV diagnosztika külön panelként megmarad.
