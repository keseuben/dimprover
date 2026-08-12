# BENJADMIN részletes DEV szerverdiagnosztika – egységes téma és kompakt vezérlés

Dátum: 2026-08-12
Környezet: DEV
Állapot: checkpoint

## Cél

A `/admin/szerver/reszletes` mélydiagnosztikai oldal egységesítése a BENJADMIN fejlesztőközpont vizuális rendszerével anélkül, hogy a részletes üzemeltetési funkciók elvesznének.

## Vizuális és UX módosítások

- a dekoratív kék rácsháttér megszűnt;
- a fejléc kompaktabb fejlesztőközponti panel lett;
- az admin kulcs és frissítési vezérlés külön, tömör vezérlősáv;
- a hét diagnosztikai nézet fülsora kompaktabb;
- a részletes panel a BENJADMIN közös világos/sötét témáját örökli;
- a mobil/tablet alsó navigáció megmaradt, de a közös BENJADMIN felületi változókat használja;
- a nagy lekerekítések visszafogottabb, műszaki-admin arányra kerültek;
- a részletes táblák és diagnosztikai panelek világos módban is olvashatók.

## Megőrzött nézetek

1. Áttekintés;
2. Tárhely;
3. Folyamatok;
4. Üzemeltetés;
5. Warningok;
6. Szerverőr;
7. Részletes listák.

A memória-, swap-, tárhely-, PM2-, backup-, domain-, SSL-, log-, biztonsági és cleanup diagnosztika változatlanul elérhető.

## Acceptance

`scripts/benjadmin-server-detail-theme-acceptance.mjs`

Eredmény: 13/13 PASS.

Ellenőrzött:

- BENJADMIN témaöröklés;
- dekoratív rács hiánya;
- kompakt fejléc és vezérlősáv;
- 1440×900 no-page-overflow;
- a hét részletes diagnosztikai fül megléte;
- élő DEV állapotlekérésből swap és erőforrásadatok;
- világos mód;
- tablet és mobil no-page-overflow;
- mobil részletes szervernavigáció.

Regressziók:

- fő Szerver- és tárhelyállapot: 21/21 PASS;
- E-mail Központ: 24/24 PASS;
- Drive admin: 20/20 PASS;
- Vezérlés / Partner V3: 21/21 PASS;
- TypeScript: PASS;
- lint: 0 hiba;
- diff-check: PASS.

## Biztonság

A módosítás kizárólag DEV UI és CSS. PROD nem módosult. Automatikus törlés, restart vagy deploy funkció nem került a részletes szerveroldalba.
