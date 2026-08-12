# BENJADMIN központi Licencközpont – elsődleges belépési útvonal

Dátum: 2026-08-12
Környezet: DEV
Állapot: checkpoint

## Cél

A modern, táblázat-első `/admin/licenckozpont` legyen a BENJADMIN elsődleges licenckezelő felülete. A korábbi nagyméretű licenc-dashboard átmenetileg kompatibilitási nézetként maradjon elérhető, amíg minden régi speciális funkció át nem kerül az új központba.

## Módosítás

A BENJADMIN indítópult alsó `Licencadmin` művelete most közvetlenül a következő útvonalra vezet:

`/admin/licenckozpont`

A normál `/admin` megnyitás nem vált át a régi `Licenc-dashboard` felületre.

A régi kompatibilitási felület explicit útvonala:

`/admin?legacyLicense=1`

A modern Licencközpont fejlécében `Régi licencadmin` néven külön kompatibilitási hivatkozás érhető el.

## Megőrzött régi funkciók

A régi dashboard kódja ebben a körben nem lett törölve. A kompatibilitási nézetben továbbra is elérhető többek között:

- automatikus lejárati értesítések;
- régi licenc- és gépkezelési mezők;
- névre szóló AI-jogosultság és AI-keretek;
- kapcsolattartók;
- előfizetési / billing előkészítő adatok;
- régi audit- és eszközműveletek.

Ezeket később célzottan kell átvezetni a központi Identity Core alapú Licencközpontba. Addig a régi nézet nem törölhető.

## Acceptance

`scripts/benjadmin-license-entry-consolidation-acceptance.mjs`

Eredmény: 7/7 PASS.

Ellenőrzött:

- BENJADMIN indítópult → `/admin/licenckozpont`;
- normál `/admin` nem nyit régi licenc-dashboardot;
- modern Licencközpont az elsődleges licencfelület;
- explicit kompatibilitási útvonal megmarad;
- kompatibilitási felületen lejárati értesítés, AI és új licenc funkciók megmaradnak;
- világos mód működik.

Regressziók:

- táblázat-első Licencközpont: 16/16 PASS;
- BENJADMIN Operator UI: 30/30 PASS;
- Vezérlés / Partner V3: 21/21 PASS;
- részletes DEV szerverdiagnosztika: 13/13 PASS;
- TypeScript: PASS;
- lint: 0 hiba;
- diff-check: PASS.

## Következő fejlesztési pont

Készítendő egy funkció-átvezetési mátrix a régi licenc-dashboard és az Identity Core alapú Licencközpont között. A cél, hogy a lejárati értesítési, AI-keret-, eszköz-, kapcsolattartó- és előfizetési funkciók megfelelő adatmodellre kerüljenek, majd a kompatibilitási nézet később kivezethető legyen.

## Biztonság

Csak DEV UI és navigáció módosult. PROD érintetlen. Licencadatot, jogosultságot vagy adatbázis-sémát ez a kör nem módosított.
