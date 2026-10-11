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

## BUILD01 ellenőrzött kiadásjelölt – 2026-10-11

- Run: benjadmin-license-grid-v0947-b7f791586-20261011-build01-b1.
- Forráscommit: b7f791586e620861d8d4a7ea82ee19c130eb7fdd.
- Teljes Next.js 16.2.6 fordítás PASS, TypeScript PASS, 104/104 oldal, 274 standalone chunk ellenőrizve.
- Build ID: pHGXJJupAHhRzGRaiGXot.
- Artifact SHA-256: 4c2b5026b8bb134a264e53064310fff0d56f90d2c2b9cd4512baf2d195c3fbe3.
- Artifact tényleges SHA, gateway státusz és build metadata megegyezik.
- A standalone artifactban az új app/admin/licenckozpont/license-center.css jelen van, és a lefordított .next/static/chunks/*.css kimenetben a dimpro-license-center .benjadmin-data-workspace szabály ténylegesen megtalálható.
- QA: új UX contract PASS, TypeScript PASS, ESLint PASS, 15/15 admin release gate PASS, 11/11 projektlicenc ACL API-guard PASS, személyeslicenc API guard PASS, 13/13 Drive license read PASS, mini app és Drop product contract PASS, 14/14 értesítési regressziós tesztcsoport PASS.
- DEV disk ellenőrzés: 78 GiB, 71 GiB foglalt, 5.8 GiB szabad (93%). Nem történt DEV deploy, PM2 restart, auth DB migráció vagy PROD művelet.
- A jelenlegi browser screenshot még nem az új UI-t mutatja. A valódi vizuális és működésbeli smoke csak a külön jóváhagyott DEV deployment után történhet.

## Kiadási követelmény

A kötelező következő lépés a license.dev.dimpro.hu jelenlegi CANONICAL runtime/service és annak release pipeline-jának beazonosítása. Csak az eredeti BENJADMIN admin host alkalmazásba szabad integrálni, új külön app nélkül. Nem deployolható vakon a Drive runtime-ra vagy másik porton új admin instance-ként. Kiépített rollback terv, változatlan ügyféllincenckészlet és böngészős smoke ellenőrzés kötelező.
