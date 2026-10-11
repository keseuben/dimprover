# DIMPRO V0.9.47 – BENJADMIN Licencközpont, táblázatos UX javítás

Dátum: 2026-10-11. Státusz: SOURCE CANDIDATE / PROD DENY.
Nem telepített verzió. Nincs AUTH DB migráció, licencadat- vagy hozzáférésmódosítás.

## Felhasználói kérés és gyökérok

A license.dev.dimpro.hu/admin/licenckozpont felület maradjon áttekinthető táblázatos, DIMPRO Drive-hoz hasonló kialakításban.

Az app/admin/licenckozpont/page.tsx korábban már a BenjadminDataWorkspace és benjadmin-data-* osztályokat használta, de a kapcsolódó admin CSS osztályok nem voltak definiálva. A screenshotban a fejléc, statisztikák, szűrők és a táblázat ezért jelennek meg összefolyva. Nem építünk új admin appot.

## Forrásban elkészült

1. app/admin/licenckozpont/license-center.css: kizárólag a dimpro-license-center gyökér alatt ható, világos és sötét BENJADMIN témákkal kompatibilis, tömör, Drive-szerű táblázatos CSS. Metrikakártyák, státuszok, keresők, sticky header, vízszintes scroll, lapozás, látható szerkesztő oldalsó panel, laptop/tablet/mobil töréspontok.
2. app/admin/licenckozpont/page.tsx: öt külön nézet: Licencek, Moduljogok, Termékek, Projektlicencek, Csomagok és díjak. Az első fül az alapértelmezett. A fő táblázat az eredeti adatforrást és oldalsó licencszerkesztőt használja. Termék- és státuszszűrő, keresés, lapozás, kijelölt sor, oszloprendezés (licenckód, tulajdonos, termék, státusz, felhasználók, lejárat).
3. app/lib/license/licenseGrid.ts: determinisztikus, read-only táblázati rendezési segédmotor.
4. components/license/UnifiedProductGrid.tsx és UnifiedProductGrid.module.css: 12 soros, központi terméktábla: öt fő szint, DIMPRO Drive és Drop, öt önálló digitális segédapp. Keresés, termékcsoport szerinti szűrés és ABC sorrend. A korábbi architektúra-/segédappkártyák összecsukható részletes nézetben megmaradtak.
5. Moduljogok fül: a meglévő Identity Core moduljogok és Send-entitlementek külön, olvasható táblázatai; az eredeti szerkesztési workflow megmarad.
6. Projektlicencek és Csomagok/díjak fülek: a korábbi ProjectProductLicensesAdmin, PlanDraftCatalogue, PricingProposalWorkshop és SubscriptionImpactPreview komponensek változatlanul megmaradtak; csak a napi licenctábla mellől külön fülre kerültek.
7. scripts/tests/dimpro-license-grid-v0947-contract.mjs: sorrendtesztek, 12 termék ellenőrzése, eredeti licencadmin API-k és szerkesztő megőrzése, CSS scoping.

## Kötelező biztonsági és átadási feltételek

- A korábbi két Identity Core licenc az eredeti API-ból töltődik; sem új AUTH user license, sem új migráció/entitlement nem került a rendszerbe.
- A korábbi Drop Send-kódok és projekttag-jogok változatlanok; az új Drop-licencmigráció nem futott le.
- A terméktábla csak katalógus, semmilyen fizetős ügyféllicencet nem aktivál.
- A felület nem töröl, nem migrál, nem módosít e-mailt, kvótát vagy licencadatot önmagától.
- A meglévő új licenc / szerkesztés gombok továbbra is csak admin AUTH után és a korábbi végpontokon működnek.

## QA

TypeScript, ESLint, új UX contract, korábbi projekt/user admin release gate és Drive notification regresszió, BUILD01 Next.js teljes build. Az artifact SHA és a végső commit csak a build PASS után rögzítendő.

Későbbi, külön engedélyezett DEV publikálás után valódi böngészős ellenőrzés szükséges a világos/sötét témákra és laptop méretekre, valamint keresés, sortolás, szűrők, lapozás, drawer és moduljogok helyes megjelenítésére. Oszlopok méretezése és oszlopláthatóság egy további jóváhagyható UX kör lehet.

PROD DENY, az üzemi DEV változatlan.
