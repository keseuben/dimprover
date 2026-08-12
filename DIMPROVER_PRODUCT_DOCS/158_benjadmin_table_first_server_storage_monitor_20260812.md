# BENJADMIN táblázat-első Szerver- és tárhelyállapot

Dátum: 2026-08-12
Környezet: DEV
Állapot: checkpoint

## Cél

A BENJADMIN infrastruktúra-felület átalakítása táblázat-első (table-first) üzemeltetési munkatérre úgy, hogy a korábbi részletes DEV diagnosztika változatlanul elérhető maradjon külön útvonalon.

## Főfelület

Az `/admin/szerver` most a közös `BenjadminDataWorkspace` komponenst használja.

Az egységes infrastruktúra-táblában együtt jelenik meg:

- BENJADMIN DEV VPS;
- PRODUCTION / ÉLES VPS;
- DB VPS;
- DIMPRO Drive objektumtárhely;
- DIMPRO Drop objektumtárhely.

Fő oszlopok:

- rendszer;
- típus;
- állapot;
- CPU;
- memória;
- swap;
- lemez / tárhely;
- foglalt / kapacitás;
- load / válaszidő;
- adatminta ideje;
- részletek.

## Telemetria és adatforrás

A DEV szerver CPU/RAM/swap/lemez adatai a helyi szerverállapotból és a B3.1 monitorozási mintákból származnak.

A PRODUCTION és DATABASE erőforrásértékek read-only vezérlőoldali minták. Ha az erőforrásminta régi, a felület ezt külön jelzi `Élő · régi erőforrásminta` szöveggel. Az élő elérhetőségi vizsgálat és a régebbi erőforrásminta ezért nem keveredik össze.

A Drive és Drop S3 tárhely esetén a valós foglaltság és objektumszám jelenik meg. Ha nincs DIMPRO tárhelykeret konfigurálva, a felület `keret nincs beállítva` értéket mutat; nem talál ki szolgáltatói kapacitást.

## Részletező panelek

A szerverek részletezője megmutatja a CPU, RAM, swap, lemez, kapacitás, load, válaszidő és mintafrissesség adatokat, továbbá az utolsó B3.1 monitorozási mintákat.

A DEV részletezőben külön megmaradt a Nginx, PM2, Node.js, üzemidő és swap foglaltság.

Az S3 részletező bucket, endpoint, objektumszám és DIMPRO tárhelykeret adatot mutat.

## Korábbi részletes DEV diagnosztika

A régi részletes szerverdiagnosztikai felület nem került törlésre. Új útvonala:

`/admin/szerver/reszletes`

Itt továbbra is elérhető a korábbi memória-, swap-, lemez-, PM2-, nagy fájl-, mappa- és fejlesztési csomag diagnosztika.

## Biztonság

A fő infrastruktúra-nézet read-only. PRODUCTION műveleti gomb nincs rajta. A PROD forrás csak olvasási/állapotmérési célból kerül megjelenítésre.

## Acceptance

`scripts/benjadmin-table-server-acceptance.mjs`

Eredmény: 21/21 PASS.

Regressziók:

- Fejlesztési Központ: 18/18 PASS;
- Release Központ: 17/17 PASS;
- Licencközpont: 16/16 PASS;
- Belépési audit: 14/14 PASS;
- Vezérlés / Partner V3: 21/21 PASS;
- Kiadás / Audit / Licenc-AI V3: 28/28 PASS;
- TypeScript: PASS;
- lint: 0 hiba;
- diff-check: PASS.

## Következő fejlesztési pont

A következő körben a még régi BENJADMIN adminfelületek közül a Fejlesztési napló és a verziókezelő oldalak felépítését kell auditálni. A táblázat-első minta csak ott alkalmazandó, ahol a fő feladat nagy rekordmennyiség keresése, szűrése és kezelése; dokumentumszerű szerkesztőfelületet nem kell indokolatlanul adatgriddé alakítani.
