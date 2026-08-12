# BENJADMIN Licencközpont – lejárati értesítések átvezetése

Dátum: 2026-08-12
Környezet: DEV
Állapot: checkpoint

## Cél

A régi licenc-dashboard egyik fontos üzemeltetési funkciójának, a licenclejárati értesítéseknek az elérhetővé tétele a modern, táblázat-első `/admin/licenckozpont` felületen.

## Új Licencközpont funkció

A fejlécben új `Lejárati értesítések` művelet nyit egy külön jobb oldali panelt.

A panel mutatja:

- 30 / 7 / 1 / 0 napos értesítési küszöböket;
- Europe/Budapest időzónát;
- legutóbbi futásokat;
- ellenőrzött licencek számát;
- aktív értesítési fokozatokat;
- címzetteket;
- kiküldött és hibás e-mailek számát.

## Kézi futtatás

Két külön művelet maradt:

1. `Előnézet küldés nélkül` – dry-run, nem küld e-mailt;
2. `Értesítések futtatása` – külön böngészős megerősítés után indítható.

A rendszer a korábban már kiküldött aktuális értesítési fokozatokat nem küldi újra.

## Fontos átmeneti állapot

A jelenlegi `/api/license/expiry-reminders` szolgáltatás még a régi fájlalapú licencstore-t (`readLicenseStore`) vizsgálja, nem az Identity Core központi licenceit.

Ezért az új panel ezt egyértelműen `Átmeneti kompatibilitási szolgáltatás` néven jelzi. A funkció UI-szinten már a modern Licencközpontból használható, de az adatforrás migrációja még hátravan.

## Acceptance

`scripts/benjadmin-expiry-reminder-center-acceptance.mjs`

Eredmény: 8/8 PASS.

Ellenőrzött:

- lejárati panel elérhető a központi Licencközpontból;
- 30/7/1/0 napos szabály és migrációs figyelmeztetés látható;
- működési szöveg legalább 12 px;
- read-only futástörténet megjelenik;
- dry-run előnézet működik;
- az acceptance nem küldött valódi e-mailt: a POST dry-run böngészős fixture-rel volt interceptálva;
- világos mód;
- tablet és mobil no-page-overflow.

Regressziók:

- Licencközpont: 16/16 PASS;
- elsődleges Licencközpont útvonal: 7/7 PASS;
- Operator UI: 30/30 PASS;
- Vezérlés / Partner V3: 21/21 PASS;
- TypeScript: PASS;
- lint: 0 hiba;
- diff-check: PASS.

## Következő fejlesztési pont

A lejárati értesítő motor adatforrását később át kell vezetni az Identity Core licencmodellre. Addig a régi licencstore csak kompatibilitási adatforrásként maradjon, és a két licencállományt nem szabad automatikusan összemosni.

## Biztonság

PROD nem módosult. A DEV acceptance nem küldött e-mailt és nem módosított licencadatot.
