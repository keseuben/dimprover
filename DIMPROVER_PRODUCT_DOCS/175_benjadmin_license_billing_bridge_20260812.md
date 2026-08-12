# BENJADMIN – Licencközpont előfizetés / számlázás biztonságos legacy bridge

Dátum: 2026-08-12
Környezet: DEV
Állapot: lezárt fejlesztési checkpoint

## Cél

A legacy licencrekord előfizetési és számlázási állapotának elérhetővé tétele a modern BENJADMIN Licencközpontban úgy, hogy a fizetési szolgáltatói azonosítók, licenckulcsok és gépazonosítók ne kerüljenek a böngészőbe.

## Új célzott API

`/api/license/admin-billing`

Műveletek:

- `GET`: adatminimalizált előfizetési összesítő;
- `PATCH`: kizárólag a legacy előfizetési/adminisztratív számlázási mezők célzott módosítása.

Hitelesítés nélkül a végpont `401` választ ad.

## Kliensnek átadott adatok

- legacy licencazonosító;
- cég neve;
- legacy licencállapot;
- kezdő- és lejárati dátum;
- legacy maximális eszközszám;
- csomagkód;
- számlázási ciklus;
- fizetési állapot;
- előfizetési mennyiség;
- aktuális számlázási időszak vége;
- inaktív eszköz automatikus felszabadítási beállítása;
- szolgáltatói ügyfél- és előfizetéskapcsolat puszta igen/nem állapota.

Nem kerül át a kliensnek:

- `stripeCustomerId`;
- `stripeSubscriptionId`;
- `licenseKey`;
- `machineIdHash`;
- privát kulcs vagy service-role titok.

## Központi és legacy csomagkapcsolat

A modern Identity Core `plan_code` mezője marad a központi adminisztratív csomagforrás. A panel külön megmutatja a központi és a legacy csomagkódot, és jelzi az eltérést.

A `Előfizetési adatok mentése` művelet a legacy `planCode` értéket a már mentett központi `plan_code` értékhez igazítja. A gomb az Identity Core licencet nem módosítja.

Automatikus név- vagy cégnév alapú összerendelés nincs: a blokk csak pontos `legacy_license_ref` esetén szerkeszthető.

## Kezelhető mezők

- számlázási ciklus: nincs / havi / éves / kézi;
- fizetési állapot: nincs / aktív / fizetési késedelem / megszűnt / próbaidő / kézi;
- előfizetési mennyiség;
- aktuális számlázási időszak vége;
- inaktív gép automatikus felszabadítása;
- inaktivitási küszöb napokban.

A szolgáltatói Stripe-azonosítók szándékosan nem szerkeszthetők ezen az átmeneti bridge-en.

## Audit és értesítés

A módosítás külön `updateLicenseBilling` auditbejegyzést készít. Valódi változás esetén a meglévő licencváltozás e-mail motor kapja meg a változáslistát `updateLicense` értesítési típussal; változatlan mentésnél nincs felesleges e-mail küldés.

## UI

A modern Licencközpont licencszerkesztő fiókjában új szakasz:

`Előfizetés és számlázási állapot`

A panel:

- magyar elsődleges;
- világos és sötét módban működik;
- működési szövege legalább 12 px;
- tablet és mobil nézetben nem okoz teljes oldali vízszintes túlcsordulást.

## Acceptance

Új acceptance:

`scripts/benjadmin-license-billing-acceptance.mjs`

Eredmény: **17/17 PASS**.

Ellenőrzi:

- unauth API DENY;
- admin API elérhetőség;
- érzékeny azonosítók hiánya;
- központi/legacy csomageltérés megjelenítése;
- számlázási mezők betöltése;
- szolgáltatói kapcsolat csak állapotként való megjelenítése;
- 12 px minimum működési szöveg;
- pontos legacy licencazonosító a PATCH-ben;
- legacy csomag központi csomaghoz igazítása;
- módosított mennyiség és automatikus felszabadítás PATCH-je;
- titokmentes PATCH;
- világos mód;
- tablet/mobil overflow-védelem.

A böngészős PATCH teszt elfogott fixture-kérést használ; valós legacy számlázási rekordot nem módosít.

## Regresszió

- gépkötés bridge: **19/19 PASS**;
- kapcsolattartó bridge: **16/16 PASS**;
- Licencközpont táblázat-első: **16/16 PASS**;
- központi AI-policy: **18/18 PASS**;
- tagsági AI-policy: **16/16 PASS**;
- B3.2 P5: **53/53 PASS**;
- `npx tsc --noEmit`: PASS;
- teljes ESLint: 0 error / 104 meglévő warning;
- `git diff --check`: PASS.

Aktív DEV build:

`qhjaVfFzcRu0Qn1kpi5fD`

## Következő lépés

A három legacy bridge – kapcsolattartók, gépkötések, előfizetés/számlázás – már a modern Licencközpontban elérhető. A következő rendszer-hardening feladat a B3/B3.1/B3.2 normatív tervből a P4 partner handoff + release + audit tranzakciós atomizálása, valamint a dedikált Control VPS előkészítése.

## PROD

PROD alkalmazás, PROD adatbázis és PROD számlázási adat nem módosult.
