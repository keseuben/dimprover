# DIMPRO Licencközpont V0.9.45 – digitális segédappok

Dátum: 2026-10-11. Státusz: SOURCE CANDIDATE, PROD DENY.
Nem futott migráció élő szerveren. Nincs DEV/PROD deploy, PM2 újraindítás, ügyfél-aktiválás vagy árkiadás.

## Elfogadott termékcsoport és előzetes scope-ok

Az öt kiegészítő, nem kizárólag építőipari termék saját licencazonosítót és külön admin katalóguskártyát kap:

| Termék | Technikai kód | Tervezett licencscope |
| --- | --- | --- |
| DIMPRO Árutér | DIMPRO_ARUTER | ORGANIZATION |
| DIMPRO Felújítási Gyorskalkulátor | DIMPRO_FELUJITASI_GYORSKALKULATOR | USER, ORGANIZATION |
| DIMPRO Ingatlanfelmérő | DIMPRO_INGATLANFELMERO | USER, ORGANIZATION |
| DIMPRO Gazdasegéd | DIMPRO_GAZDASEGED | USER, ORGANIZATION |
| DIMPRO ONE Egészség | DIMPRO_ONE_EGESZSEG | USER |

Az ötszintű DIMPRO főarchitektúra (DIMPROONE, WORK, Projektkapu, BUILD, DIMPROVER) változatlan. A Drive továbbra is közös szolgáltatás. Az öt új termék külön, önálló segédapp-kategória, nem építőipari réteg és nem valamelyik másik előfizetéshez kötelezően kapcsolt kiegészítés.

## Elkészült változások

1. app/lib/license/dimproMiniAppCatalog.ts: központi TypeScript katalógus öt külön termékkel, javasolt licencscope-pal, leírással, kapcsolt főtermékkel, külön egészségügyi adatérzékenység jelöléssel és kötelező DIMPRO_MINI_APP_COMMERCIAL_RELEASED=false beállítással.
2. db/auth/migrations/020_auth_v057_dimpro_mini_app_catalog.sql: 018 után futtatható, source-only PostgreSQL előkészítés. Az auth_products törzsbe a mini appok inaktív DISABLED bejegyzésként kerülhetnek, a korábbi termékadatok/statuszok változtatása nélkül. Új, külön auth_mini_app_catalog tábla csak tervezési termékmetaadatokkal; commercial_state=PLANNED, entitlement_enabled=false, requires_primary_subscription=false, központi app DB-role csak SELECT jogosultsággal. Nincs tárolt személyes/egészségügyi adat, termék-előfizetés, szervezeti licencek kiadása vagy SSO-hozzáférés.
3. components/license/MiniAppLicenseCatalog.tsx és .module.css: önálló kártyás, reszponzív digitális segédapp katalógus a központi Licencközpontban, az ötszintű architektúra mellett; UI egyértelműen jelzi, hogy még nincs licencértékesítés vagy áraktiválás.
4. app/admin/licenckozpont/page.tsx: a digitális segédapp csoport megjelenítése az ötszintű ProductArchitectureOverview után, a projektlicencek előtt.
5. components/drive/driveBuildInfo.ts: V0.9.45 forrásjelölt; nem az élő DEV verziója.
6. DIMPRO_PRODUCT_ARCHITECTURE.md: öt segédapp termékkódja, összefüggése és külön licencelési alapelv.

## Biztonsági és termékfejlesztési határok

- A mini app katalógus üzleti scope-ja javaslat; a végleges termékkonstrukciók a felhasználó döntése után aktiválhatók.
- A DIMPRO ONE Egészség nem DIMPROONE általános user-entitlement. Egészségügyi adatok külön domain adatbázisában/adatvédelmi rétegben kezelendők, nem a Licencközpontban. A felhasználói egészségadatokat az operátori termékkatalógus soha nem kérdezheti le.
- A jelenlegi központi AUTH user-license (019) és project-license (014–017) termék-code check constraintjeit nem bővítettük ezekre a mini appokra: kereskedelmi licenckiadás továbbra sem lehetséges. Ehhez külön, kellően jogosultság-szűrt, három scope-os kereskedelmi motor szükséges.
- Nincs automatikus Drive tárhely, nincs szervezet- vagy projekttagság, nincs díjszabás, nincs hozzáférési jogosultság.
- A dimpro.hu publikus kártyáin vagy élő DEV/PROD belépőjén ez a fejlesztés nem változtatott, külön publikálás/deploy szükséges.

## Ellenőrzések és további mérföldkő

Izolált tesztfájlok:
- scripts/tests/dimpro-mini-app-catalog-contract.mjs
- scripts/tests/dimpro-mini-app-catalog-pglite.mjs

A régi AUTH terméktopológia, projekt- és személyeslicenc-keretek, Drive értesítések, átjárási ACL és teljes Next.js build nem sérülhet. A 018–020 migrációkat valós DB szerverre külön DBA/adatmentés/jóváhagyás után szabad alkalmazni.

Következő üzleti/technikai feladat: az egyedi segédapp-csomagok kialakítása (pl. személyes vs szervezeti, hozzáférők száma, modulok, díjak), majd a közös kereskedelmi USER/ORGANIZATION motor folytatása. A korábban tervezett V0.9.45 személyes licenckiadási workflow a segédapp termékkatalógus miatt a következő külön fejlesztési fázisra tolódik.

A teljes BUILD01 és commit az ellenőrzés lezárása után rögzítendő.

## BUILD01 ellenőrzött eredmény – 2026-10-11

- BUILD01 run: dimpro-mini-v0945-bf859e52d-20261011-build01-b1.
- Forráscommit: bf859e52d7b718415ede07a77119fd7c927d749f.
- Next.js teljes build: PASS, TypeScript PASS, 104/104 oldal generálva, 274 standalone statikus chunk ellenőrizve.
- Build ID: 9-3_i7NVoxH8pgPlcNq6U.
- Artifact SHA-256: 25e0dbf4ea19e057c114a49ed51d00268f29d5a59b30de60727d326b5247c3a4.
- Ellenőrizve: a tényleges artifact SHA, a build státusz és a metadata SHA azonos.
- Új mini-app kontraktus és izolált PostgreSQL-teszt: PASS.
- Korábbi regresszió: 11/11 szerződéses tesztcsoport, 5/5 izolált PostgreSQL-tesztcsoport, 2/2 mock API-jogosultsági teszt, 14/14 értesítési tesztcsoport PASS; TypeScript és célzott ESLint PASS.
- Kizárólag source és BUILD01 artifact, nincs DEV/PROD telepítés, nincs AUTH DB migráció, nincs terméklicenc-aktiválás.
- A termékkártyák a Licencközpont következő deploy-jára előkészítettek, a nyilvános dimpro.hu honlap nem módosult.
- PROD DENY változatlan.
