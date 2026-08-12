# BENJADMIN release feltöltő – táblázat-első lista + műveleti panel

Dátum: 2026-08-12
Környezet: DEV
Állapot: checkpoint

## Cél

A `Védett ZIP feltöltő` átalakítása olyan hibrid BENJADMIN munkatérre, ahol a release rekordok kereshető, szűrhető táblázata az elsődleges felület, míg az új ZIP / 7Z feltöltés továbbra is dedikált műveleti űrlap marad.

## Főfelület

Az `/admin/releases` a közös `BenjadminDataWorkspace` komponenst használja.

A fő release tábla oszlopai:

- Verzió;
- Fájl;
- Státusz;
- Méret;
- Kiadás;
- Lejárat;
- Letöltések;
- Utolsó letöltés;
- SHA256 rövidített értéke;
- Művelet.

A munkatér projektválasztót, keresést, öt státuszszűrőt és 25 / 50 / 100 soros lapozást kapott.

Támogatott projektpresetek:

- DIMPRO Fájlműhely;
- HAGE-INVEST Munkatér;
- DIMPRO Teams;
- DIMPRO Drive Desktop.

## Feltöltési munkafolyamat

Az `Új release feltöltés` jobb oldali műveleti panelen nyílik. A fő lista közben a helyén marad.

Megőrzött funkciók:

- ZIP / 7Z fájlválasztás;
- maximum 150 MB tájékoztatás;
- projekt és verzió;
- cím;
- lejárat;
- feltöltő;
- verzióleírás;
- változáslista;
- privát VPS release tárhely;
- tokenes letöltési link;
- SHA256;
- sikeres feltöltés utáni letöltési oldal és linkmásolás.

Fájl kiválasztása nélkül a feltöltés gomb letiltva marad.

## Release részletek és törlés

A meglévő release külön részletező panelen nyílik. Itt látható a teljes SHA256, letöltési állapot, fájl jelenléte és a letöltési link.

A `Szerverfájl törlése` csak ebben a részletezőben jelenik meg, és a korábbi megerősítési lépés megmaradt. A törlés csak a fizikai ZIP / 7Z fájlt távolítja el; a történeti release rekord megmarad.

## Acceptance

`scripts/benjadmin-release-upload-hybrid-acceptance.mjs`

Eredmény: 20/20 PASS.

Az acceptance nem indított uploadot és nem hívta a delete végpontot. A részletező és státuszlogika ellenőrzése böngészős read-only fixture-rel történt, ezért a DEV release-adattár nem módosult.

Ellenőrzött:

- 1440×900 egy-viewport desktop;
- 10 oszlopos release lista;
- sticky fejléc;
- projektválasztó, keresés, 5 státuszszűrő és lapozás;
- külön feltöltő drawer;
- fájl nélküli upload tiltása;
- aktív és törölt történeti release státusz;
- részletező SHA256 és letöltési adatok;
- törlés külön részletező műveletként;
- világos/sötét mód;
- tablet és mobil no-page-overflow.

Regressziók:

- HAGE verziók: 18/18 PASS;
- Fájlműhely verziók: 15/15 PASS;
- Release Központ: 17/17 PASS;
- Licencközpont: 16/16 PASS;
- Vezérlés / Partner V3: 21/21 PASS;
- TypeScript: PASS;
- lint: 0 hiba;
- diff-check: PASS.

## Következő fejlesztési pont

A további régi adminoldalakat célzottan kell auditálni. A tisztán beállítási űrlapokat nem kell indokolatlanul táblázattá alakítani; a táblázat-első minta ott elsődleges, ahol sok rekord keresése, szűrése és kezelése a fő feladat.
