# BENJADMIN táblázat-első HAGE-INVEST Munkatér verziók

Dátum: 2026-08-12
Környezet: DEV
Állapot: checkpoint

## Cél

A HAGE-INVEST Munkatér korábbi kártyás DEV/RUN release-pár nézetének átalakítása táblázat-első BENJADMIN kiadáskezelővé úgy, hogy az eredeti DEV/RUN párosítási logika változatlanul megmaradjon.

## Főfelület

Az `/admin/hage-verziok` a közös `BenjadminDataWorkspace` komponenst használja.

A fő tábla oszlopai:

- Verzió;
- DEV csomag;
- DEV állapot;
- RUN csomag;
- RUN állapot;
- DEV + RUN összméret;
- Letöltések;
- Frissítés;
- Kiadáspár állapota;
- Művelet.

A munkatér keresést, öt párszűrőt és 25 / 50 / 100 soros lapozást kapott.

## DEV / RUN párosítás

A meglévő logika megmaradt:

- a kiadás típusát a verzió-, fájlnév- és címmező `DEV` / `RUN` jelölése határozza meg;
- az alapverzió a verzió- vagy fájlnévből kerül kinyerésre;
- ugyanazon alapverzió DEV és RUN csomagja egyetlen kiadáspárként jelenik meg;
- az egyéb kapcsolódó release rekordok nem vesznek el, a részletezőben külön jelennek meg.

A pár állapota külön jelzi:

- teljes és aktív DEV + RUN pár;
- teljes, de lejárt linket;
- teljes párt hiányzó fizikai fájllal;
- hiányos DEV/RUN párt.

## Részletező

A jobb oldali kiadáspár-részletező külön DEV és RUN blokkban mutatja:

- fájlnevet;
- leírást;
- méretet;
- kiadási és lejárati időt;
- letöltésszámot és utolsó letöltést;
- szerveres fájlállapotot;
- aktív link állapotot;
- változáslistát;
- SHA256 értéket;
- védett letöltési oldalt, ha elérhető.

## Acceptance

`scripts/benjadmin-table-hage-versions-acceptance.mjs`

Eredmény: 18/18 PASS.

A DEV HAGE release adatforrás jelenleg 0 rekordot tartalmaz. Emiatt az acceptance írás nélküli böngészős fixture-rel is ellenőrzi a tényleges kliensoldali párosítási logikát: egy v123 DEV + RUN pár és egy v124 csak-DEV pár kerül kizárólag a tesztböngésző API-válaszába. A szerveres release-adattár nem módosul.

Ellenőrzött:

- 1440×900 egy-viewport desktop;
- 10 oszlopos HAGE verziópár tábla;
- sticky fejléc;
- keresés, 5 párszűrő és lapozás;
- HAGE release feltöltő hivatkozás;
- DEV/RUN alapverzió-párosítás;
- hiányos pár figyelmeztetés;
- DEV és RUN részletező blokkok, SHA256 és letöltési link;
- világos/sötét mód;
- tablet és mobil no-page-overflow.

Regressziók:

- DIMPRO Fájlműhely verziók: 15/15 PASS;
- Fejlesztési Napló: 19/19 PASS;
- Szerver- és tárhelyállapot: 21/21 PASS;
- Vezérlés / Partner V3: 21/21 PASS;
- TypeScript: PASS;
- lint: 0 hiba;
- diff-check: PASS.

## Következő fejlesztési pont

A `Védett ZIP feltöltő` (`/admin/releases`) nem tisztán listaoldal, ezért nem szabad egyszerűen adatgriddé alakítani. A következő körben a feltöltő űrlap maradjon dedikált műveleti panel, a kapcsolódó release-előzmények és feltöltési állapotok viszont kapjanak kompakt táblázatos munkateret.
