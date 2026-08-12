# BENJADMIN táblázat-első admin UI – 1. ütem

Dátum: 2026-08-12
Környezet: DEV
Állapot: checkpoint

## Cél

A BENJADMIN régi kártyás adminoldalainak fokozatos átalakítása nagy adatmennyiséget kezelő, táblázat-első (table-first) munkafelületté.

## Közös UI motor

Új komponens:

`components/admin/BenjadminDataWorkspace.tsx`

Közös elemek:

- kompakt fejléc;
- kompakt KPI/státuszsor;
- szűrő- és keresősáv;
- belső görgetésű adatgrid;
- ragadós táblázatfejléc;
- 25 / 50 / 100 soros lapozás;
- státuszjelölők;
- világos/sötét téma a közös admin változókból;
- desktop egy-viewport irány;
- tablet/mobil teljes oldali vízszintes túlcsordulás tiltása.

## DIMPRO belépési audit

Az `/admin/dimpro-belepesek` oldal elsőként átállt az új rendszerre.

Fő változások:

- a nagy kártyák helyett egy 5 elemes kompakt státuszsor;
- keresés e-mail, IP, domain, eszköz és eredmény alapján;
- Mind / Tiltott / Sikeres gyorsszűrő;
- 8 oszlopos részletes audit tábla;
- lapozás és sor/oldal választó;
- ragadós fejléc;
- a táblázat közvetlenül a szűrősáv alatt kezdődik;
- engedélyezett e-mail lista csak kompakt státuszként marad a fő munkatérben.

## Acceptance

`benjadmin-table-login-audit-acceptance.mjs`

Eredmény: 14/14 PASS.

Ellenőrzött:

- 1440x900 desktop egy viewport;
- ragadós fejléc;
- keresés/szűrés/lapozás;
- sötét/világos mód;
- tablet no page overflow;
- mobil no page overflow.

## Következő oldalak

1. Licencközpont;
2. Release Központ;
3. Fejlesztési Központ;
4. Szerver állapotfigyelő.
