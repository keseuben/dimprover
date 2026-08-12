# BENJADMIN – Licencközpont kapcsolattartók biztonságos legacy bridge

Dátum: 2026-08-12
Környezet: DEV
Állapot: lezárt fejlesztési checkpoint

## Cél

A régi fájlalapú licencadminban már meglévő kapcsolattartói adatok megjelenítése és szerkesztése a modern, Identity Core-alapú BENJADMIN Licencközpontban úgy, hogy a modern böngészős felület ne kapja meg a teljes legacy licencrekordot és különösen ne kapjon nyers licenckulcsot vagy gépazonosító adatot.

## Adatforrás

A kapcsolattartói mezők ebben a checkpointban továbbra is a legacy `LicenseRecord` részét képezik:

- elsődleges kapcsolattartó neve, e-mail címe és telefonszáma;
- másodlagos kapcsolattartó neve, e-mail címe és telefonszáma;
- további értesítési kapcsolattartók neve, szerepköre, e-mail címe, telefonszáma és e-mail értesítési kapcsolója.

A központi Identity Core sémába ezek az adatok még nem kerültek átmigrálásra. A felület ezt `Átmeneti legacy bridge` jelöléssel egyértelművé teszi.

## Biztonságos API

Új, célzott végpont:

`/api/license/admin-contacts`

Műveletek:

- `GET`: kizárólag a kapcsolattartói összesítőt adja vissza;
- `PATCH`: kizárólag egy pontos legacy licencrekord kapcsolattartói mezőit módosítja.

Mindkét művelet a meglévő licencadmin jogosultság-ellenőrzést használja. Hitelesítés nélkül `401` választ ad.

Az API válasza szándékosan nem tartalmazza többek között:

- `licenseKey`;
- `machineIdHash`;
- Stripe ügyfél- vagy előfizetés-azonosítót;
- privát kulcsot;
- szolgáltatói titkot.

A modern Licencközpont ezért nem használja a teljes legacy `/api/license/admin` GET választ a kapcsolattartókhoz.

## Pontos licenckapcsolat

A modern licenc kapcsolattartói szerkesztése csak akkor engedélyezett, ha a központi `dimpro_licenses.legacy_license_ref` pontosan egy létező legacy rekord azonosítójára mutat.

Ha nincs ilyen pontos kapcsolat:

- a panel látható marad;
- a felület figyelmeztetést jelenít meg;
- nem hoz létre automatikus kapcsolatot;
- nem próbál cég- vagy kapcsolattartónév alapján találgatni;
- nem hoz létre új legacy licencrekordot.

## Felület

A meglévő licenc jobb oldali szerkesztőfiókjában új `Kapcsolattartók` szakasz található.

Kezelhető:

- elsődleges kapcsolattartó;
- másodlagos kapcsolattartó;
- több további értesítési kapcsolattartó;
- további kapcsolattartó hozzáadása és eltávolítása;
- személyenkénti e-mail értesítési kapcsoló.

A további kapcsolattartók szerkesztése táblázatos formában történik. A mini-tábla saját vízszintes görgetést használ, ezért tablet és mobil nézetben nem okoz teljes oldali vízszintes túlcsordulást.

A kapcsolattartói működési szöveg és mezőfeliratok legalább 12 px méretűek. Világos és sötét megjelenésben ugyanazt a BENJADMIN témarendszert használják.

## Mentési hatókör és audit

A `PATCH` csak az alábbi mezőket írja:

- elsődleges kapcsolattartó adatai;
- másodlagos kapcsolattartó adatai;
- `additionalContacts`.

A licenc státusza, licenckulcsa, moduljai, AI-beállításai, eszközkerete és számlázási adatai ettől a művelettől nem változnak.

A módosítás külön auditbejegyzést kap:

`updateLicenseContacts`

A dedikált kapcsolattartó-mentés ebben a checkpointban nem indít általános licencváltozás e-mailt, így egy kapcsolattartói adminisztráció nem okoz nem szándékolt licencértesítést.

## Acceptance

Új acceptance:

`scripts/benjadmin-license-contacts-acceptance.mjs`

Eredmény: **16/16 PASS**.

Ellenőrzi többek között:

- hitelesítés nélküli API-tiltást;
- admin API elérhetőséget;
- érzékeny legacy mezők hiányát a válaszból;
- pontos legacy mapping használatát;
- elsődleges, másodlagos és további kapcsolattartók betöltését;
- módosítási PATCH payload hatókörét böngészős, elfogott kérésen, valódi adatírás nélkül;
- 12 px minimum működési szöveget;
- világos módot;
- tablet és mobil teljes oldali overflow hiányát.

Regressziók:

- Licencközpont táblázat-első acceptance: **16/16 PASS**;
- Licencközpont belépési konszolidáció: **7/7 PASS**;
- központi AI-policy: **18/18 PASS**;
- tagsági AI-policy: **16/16 PASS**;
- B3.2 P5: **53/53 PASS**.

TypeScript, célzott ESLint és `git diff --check`: PASS.

Aktív DEV build a validációkor:

`96AsIGvarosoTajqcUZlT`

## Következő migrációs lépés

A végleges megoldás előtt külön központi kapcsolattartó adatmodell szükséges az Identity Core-ban. Ennek kialakításakor külön kell dönteni:

- licenchez, szervezethez vagy mindkettőhöz tartozzon-e a kapcsolattartó;
- legyen-e több szerepkörtípus;
- hogyan történjen az értesítési preferenciák kezelése;
- hogyan migrálhatók a legacy rekordok idempotensen és auditálhatóan.

A jelenlegi bridge addig megőrzi a meglévő funkcionalitást anélkül, hogy a teljes legacy licencobjektumot kitenné a modern kliensnek.

## PROD

PROD alkalmazás, PROD adatbázis és PROD licencadat nem módosult.
