# BENJADMIN táblázat-első DIMPRO Fájlműhely verziók

Dátum: 2026-08-12
Környezet: DEV
Állapot: checkpoint

## Cél

A DIMPRO Fájlműhely / Drive Desktop kiadási előzmények kártyás verziófájának átalakítása táblázat-első BENJADMIN release-nyilvántartássá, a történeti rekordok és védett letöltési logika megtartásával.

## Főfelület

Az `/admin/fajlmuhely-verziok` a közös `BenjadminDataWorkspace` komponenst használja.

A fő tábla oszlopai:

- Verzió;
- Fejlesztési ág;
- Fájl;
- Státusz;
- Méret;
- Kiadás ideje;
- Lejárat;
- Letöltések száma;
- Utolsó letöltés;
- Művelet.

Keresés, öt státuszszűrő, fejlesztési ág szerinti szűrés és 25 / 50 / 100 soros lapozás került a munkatérbe.

## Státuszlogika

A verziók egyértelműen megkülönböztetik:

- legfrissebb és aktív kiadást;
- aktív letöltési linket;
- lejárt linket;
- már törölt fájlhoz tartozó történeti rekordot.

A fájl törlése nem törli a verzióelőzményt.

## Részletező panel

A release részletei jobb oldali panelen nyílnak. Itt elérhető:

- teljes fájlnév;
- verzió és fejlesztési ág;
- fájlméret;
- kiadás és lejárat;
- letöltési statisztika;
- szerveren lévő fájl állapota;
- aktív link állapota;
- változáslista;
- SHA256;
- védett letöltési oldal hivatkozása, ha az aktív és a fájl elérhető.

## Biztonság

A lista read-only. Az acceptance nem hozott létre, nem törölt és nem módosított release rekordot. A feltöltés külön `Release feltöltő` felületen marad.

## Acceptance

`scripts/benjadmin-table-fajlmuhely-versions-acceptance.mjs`

Eredmény: 15/15 PASS.

Ellenőrzött:

- 1440×900 egy-viewport desktop;
- 10 oszlopos release tábla;
- ragadós fejléc;
- keresés, 5 státuszszűrő, ág-szűrő és lapozás;
- release feltöltő hivatkozás;
- részletező panel, ha van adat;
- világos/sötét mód;
- tablet és mobil no-page-overflow.

DEV adatforrásban jelenleg 0 Fájlműhely release rekord található, ezért a részletező teszt írás nélkül kihagyásra került.

Regressziók:

- Fejlesztési Napló: 19/19 PASS;
- Szerver- és tárhelyállapot: 21/21 PASS;
- Fejlesztési Központ: 18/18 PASS;
- Release Központ: 17/17 PASS;
- Licencközpont: 16/16 PASS;
- Belépési audit: 14/14 PASS;
- TypeScript: PASS;
- lint: 0 hiba;
- diff-check: PASS.

## Következő fejlesztési pont

A következő verziókezelő adminfelület a `HAGE-INVEST Munkatér verziók`. Annak kártyás DEV/RUN páros kiadáskezelését kell táblázatos nézetre átvezetni úgy, hogy a páros verziólogika megmaradjon.
