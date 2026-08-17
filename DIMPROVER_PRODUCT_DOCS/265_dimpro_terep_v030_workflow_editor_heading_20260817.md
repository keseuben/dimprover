# DIMPRO Terep – workflow, képjelölő és kamerairány javítás

Dátum: 2026-08-17
Verzió: Terep 0.3.0-dev
Alap: Drop PWA / Terep külön Context Module

## Cél

A fizikai Samsung teszten az első kép után nem volt egyértelmű továbbhaladás, a képet nem lehetett szerkeszteni/jelölni, a GPS korábban tiltott böngészőengedélynél nem adott használható helyreállítási útmutatót, a tájolás pedig a készülék egyszerű `360-alpha` értékéből készült és a hátlapi kamera tényleges nézeti irányát tévesen mutathatta.

## 1. Háromlépéses helyi workflow

A Terep felülete három egyszerű lépést kap:

1. Rögzítés
2. Ellenőrzés
3. Mentés

Az első kép után megjelenik a `Tovább az ellenőrzéshez` gomb. Az Ellenőrzés lépésben a képkártyák automatikusan kinyílnak, módosítható a megjegyzés, működik a Voice Input, újramérhető a GPS és a kamerairány, illetve megnyitható a képjelölő. Ezután `Tovább a mentéshez` vezet a helyi mentési összegzéshez.

A 3. lépés szándékosan nem állítja, hogy a kép már DIMPRO szerverre került. A P7 szerveres capture session/upload/sync külön fejlesztési kapu.

## 2. DIMPRO Képjelölő

Új közös komponens:

`components/image-editor/DimproImageMarkupEditor.tsx`

Első terepi eszközök:

- toll
- nyíl
- téglalap
- kör
- szöveg
- kivágás
- visszavonás / újra
- jelölések törlése
- zoom / képhez igazítás

A Terep képkártyán külön `Kép szerkesztése / jelölése` gomb nyitja meg. A szerkesztett változat újra átmegy a közös DIMPRO Image Engine optimalizálásán. Az item `edited` és `editRevision` állapota IndexedDB-ben is megmarad.

## 3. Kamerairány javítása

A korábbi egyszerű `360 - alpha` logika nem alkalmas a hátlapi kamera nézeti irányának meghatározására, különösen függőlegesen tartott telefonnál, ahol az alpha és gamma összekapcsolódhat.

Az új modell a W3C Device Orientation Z-X'-Y'' rotációját használja, és a hátlapi kamera `-z` optikai tengelyét forgatja a világkoordinátákba. A vízszintes vetületből számol azimutot. Több szenzormintából körátlag készül, az abszolút minták előnyt élveznek.

- túl kis vízszintes kamera-vektor: bizonytalan / nem használható
- relatív orientáció: UNSTABLE
- absolute/deviceorientationabsolute vagy iOS webkit compass alap: stabilabb
- a kép mentése soha nem vár a szenzorra
- képenként külön `Kamerairány újramérés`

## 4. GPS tiltás UX

`DENIED` állapotnál a képkártya kiírja:

Chrome → címsor / webhelybeállítások → Hely → Engedélyezés → GPS újramérés.

A böngészőből korábban letiltott helyengedélyt a webalkalmazás nem kapcsolja vissza automatikusan.

## 5. Minőségi kapuk build előtt

- TypeScript: PASS
- célzott ESLint: PASS
- statikus Terep acceptance: 60/60 PASS
- browser acceptance frissítve olyan szenzoradatra, ahol a régi képlet hibás irányt adna, az új kameravektor Dél / 180° eredményt kell adjon

## Következő kapu

Build → DEV cutover → mobil browser acceptance → fizikai Samsung teszt. Ezután indulhat a P7 szerveres capture session/upload/szinkron.
