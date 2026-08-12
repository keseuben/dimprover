# BENJADMIN – Licencközpont gépkötés / eszközaktiválás biztonságos bridge

Dátum: 2026-08-12
Környezet: DEV
Állapot: lezárt fejlesztési checkpoint

## Cél

A legacy licencmotorban kezelt gépaktiválások és gépkötések elérhetővé tétele a modern BENJADMIN Licencközpontban úgy, hogy a böngésző ne kapja meg a teljes gépazonosító hash-t és ne legyen lehetőség másik licenchez tartozó eszköz módosítására.

## Biztonságos API

Új végpont:

`/api/license/admin-devices`

Műveletek:

- `GET`: kizárólag maszkolt, adminisztrációhoz szükséges gépkötési összesítőt ad;
- `PATCH action=updateMeta`: használó, szervezeti egység és megjegyzés módosítása;
- `PATCH action=setStatus`: aktív / tiltott státusz módosítása;
- `PATCH action=remove`: gépkötés felszabadítása.

A végpont a meglévő licencadmin-hitelesítést használja. Hitelesítés nélkül `401` választ ad.

## Adatminimalizálás

A kliens nem kapja meg:

- a teljes `machineIdHash` értéket;
- a nyers licenckulcsot;
- Stripe-azonosítókat;
- privát kulcsot vagy szolgáltatói titkot.

A gépazonosító csak maszkolt formában jelenik meg, például:

`••••89abcdef`

Ez elegendő az adminisztratív megkülönböztetéshez, de nem teszi ki a teljes géphash-t a modern böngészős felületnek.

## Licenchatár-védelem

Minden módosító művelet kötelezően megkapja:

- `legacyLicenseId`;
- `deviceId`.

A szerver a módosítás előtt ellenőrzi, hogy a megadott gépkötés valóban a megadott legacy licenchez tartozik. Eltérés esetén a művelet nem hajtható végre.

A modern licenc oldalon a gépkötések kizárólag a pontos `legacy_license_ref` alapján kerülnek a megfelelő központi licenchez. Név- vagy cégalapú találgatás nem történik.

## Modern Licencközpont felület

A licenc szerkesztőfiókban új szakasz:

`Gépkötések és aktivált eszközök`

Megjelenik:

- maszkolt gépazonosító;
- géphasználó;
- szervezeti egység;
- megjegyzés;
- alkalmazásazonosító;
- első aktiválás;
- utolsó online ellenőrzés;
- aktív / tiltott státusz;
- licenckerethez viszonyított gépszám.

Műveletek:

- gép metaadatainak mentése;
- gép tiltása / újraaktiválása;
- gépkötés felszabadítása.

A státuszváltás és felszabadítás megerősítő párbeszédet kér. A műveletek a meglévő legacy adminmotoron futnak, ezért annak audit- és licencváltozás-értesítési szabályai érvényben maradnak.

## Responsive és téma

A géptábla saját belső vízszintes görgetést használ. Tablet és mobil nézetben nem okoz teljes oldali vízszintes túlcsordulást.

A működési szöveg legalább 12 px. A panel világos és sötét BENJADMIN témában is használható.

## Acceptance

Új teszt:

`scripts/benjadmin-license-devices-acceptance.mjs`

Eredmény: **19/19 PASS**.

Ellenőrzött elemek:

- hitelesítés nélküli tiltás;
- admin API elérhetőség;
- érzékeny gép-/licencmezők hiánya;
- maszkolt gépazonosító;
- metaadatok és státusz megjelenítése;
- mentés / tiltás / felszabadítás elérhetősége;
- metaadat PATCH pontos licenckapcsolata;
- státusz PATCH;
- felszabadítási PATCH;
- 12 px minimum működési szöveg;
- világos mód;
- tablet / mobil overflow-védelem.

A böngészős módosítási acceptance elfogott fixture-kéréseket használ; valós DEV gépkötést nem hoz létre, nem tilt és nem töröl.

Regressziók:

- kapcsolattartók: **16/16 PASS**;
- Licencközpont táblázat-első nézet: **16/16 PASS**;
- központi AI-policy: **18/18 PASS**;
- tagsági AI-policy: **16/16 PASS**;
- B3.2 P5: **53/53 PASS**.

Aktív DEV build a validációkor:

`o6bfxVAcYualrf687y7W4`

## Következő lépés

A gépkötés továbbra is legacy runtime-adat. Későbbi Identity Core migráció előtt szükséges meghatározni a központi eszközmodellt, a trusted-device / session logikát, a desktop kliens eszközazonosítását és a régi aktiválások idempotens migrációját. A jelenlegi bridge ezeket nem előlegezi meg adatduplikálással.

## PROD

PROD alkalmazás, PROD adatbázis és PROD gépkötés nem módosult.
