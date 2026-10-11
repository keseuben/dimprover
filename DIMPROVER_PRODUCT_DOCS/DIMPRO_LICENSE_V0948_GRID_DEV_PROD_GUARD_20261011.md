# DIMPRO Licencközpont V0.9.48 – Drive-szerű táblázat és DEV/PROD írásvédelem

Dátum: 2026-10-11. Státusz: SOURCE CANDIDATE / PROD DENY / NINCS DEV DEPLOY.
A DotRoll VPS-bővítésére várunk. A közös BENJADMIN 3100-as runtime nem változott; sem PROD, sem DEV licencadat nem módosult.

## Feladat

A DIMPRO Licencközpont a meglévő license.dev.dimpro.hu/admin/licenckozpont útvonal része. Az alapelv: DEV csak izolált tesztadatokhoz, PROD csak jogosult operátori valós licencadatokhoz férhet hozzá. Önálló új adminalkalmazás nem jön létre.

## Táblázatkezelés – elkészült forrás

- app/lib/license/licenseGridPreferences.ts: 10 oszlop, négy kötelező oszlop (kód, tulajdonos, státusz, szerkesztő); láthatóság, 76–480 pixeles szélesség, normal/compact sorok; hibás vagy régi beállítások biztonságos eldobása.
- app/admin/licenckozpont/page.tsx: oszlopok húzással vagy bal/jobb nyíllal méretezhetők; nem kötelező oszlopok elrejtése; alapérték visszaállítása; kompakt/normal mód, teljes ablakos licenctábla, ESC visszalépés. A teljes ablakból szerkesztő megnyitáskor visszatérés a normál nézetbe.
- app/admin/licenckozpont/license-center.css: kizárólag a Licencközpont hatókörében működő, Drive-szerű, sticky fejléces, vízszintesen görgethető, reszponzív táblázat és oszlopbeállító.
- A beállítás localStorage kulcsa dimpro.license-center.grid.v1. Ez csak böngészőhöz kötött UI-beállítás, nem felhasználónként szinkronizált szerverprofil. Nem tartalmaz admin kulcsot, licencazonosítót, ügyféladatot.

## Kötelező szerveroldali környezetvédelem

- app/lib/license/licenseEnvironmentPolicy.ts: a licencet módosító szervervégpontok fail-closed környezeti kapuja. Ismeretlen DEV/PROD, eltérés vagy hiányzó igazolás esetén 423-as HTTP LOCKED válasz, még adatbázis-hívás vagy body parse előtt, adminhitelesítés után.
- Az elkülönített DEV-teszt üzemi paraméterei: DIMPRO_LICENSE_RUNTIME_ENV=DEV; DIMPRO_LICENSE_DATA_ENV=DEV; DIMPRO_LICENSE_DATA_BOUNDARY_ATTESTATION=VERIFIED_DEV_ISOLATED; DIMPRO_LICENSE_DEV_TEST_WRITES_RELEASED=DEV_TEST_ONLY_APPROVED. Egyetlen paramétert sem állítottunk be. Ezek beállítása előtt külön igazolni kell a tényleges DEV adattár és jogosultság elkülönítését.
- PROD licencírás a V0.9.48 forrásban MINDIG tiltott, mert DIMPRO_LICENSE_PROD_WRITES_RELEASED=false. Runtime paraméterrel nem kapcsolható át. Később új, felülvizsgált release, központi AUTH RBAC és üzleti/számlázási ellenőrzés kell. A legacy admin-kulcs önmagában nem hiteles PROD operátori jogosultság.
- Tilos NODE_ENV vagy HTTP Host alapján DEV/PROD környezetet hitelesíteni: mindkét Next.js standalone üzemi NODE_ENV értéke production lehet.
- A védelem forrásban be lett kötve az Identity Core licencek, Drop Send-jogok, szervezeti meghívások, tagsági AI-jogok, projekttermék-licencek, és a legacy licencadmin, számlázás, kontaktok, eszközök, levelek, mail-settings, lejárati értesítés író route-jaiba.
- A GET licences admin API nem érzékeny környezeti összesítést ad az admin UI-nak. Az adminfelület DEV/PROD/UNKNOWN státuszt mutat; a nem engedélyezett új licenc és lejárati értesítő indítás le van tiltva. A tényleges biztonságot a szerver ellenőrzi, nem az inaktív gomb.

## Felülvizsgálandó problémák

Az Identity Core régi Supabase-alapú terméklicenc adatforrása, DEV/PROD tenant elkülönítése és szerepkör-/számlázási összerendelése NEM igazolt. A szerveroldali környezeti attesztáció nem helyettesíti a valós DB-hitelesítést. A jelenlegi régi admin-kulcsot később központi AUTH jogosultsági tokenre kell cserélni, operátori audit és külön kiadási jog mellett.

**Kompatibilitási figyelmeztetés:** ez a forrás, ha konfigurálatlanul kerülne telepítésre, az érintett régi admin ÍRÁSokat zárolná. Ez tervezett fail-closed működés, de a meglévő üzemeltetésre hatással lehet. DEV/PROD telepítés előtt kötelező a közös 3100-as hostok és a legacy licenc írási útvonalak kompatibilitási elővizsgálata. PROD-ra telepítés a jelen scope-ban tiltott.

## Tesztek

- scripts/tests/dimpro-license-grid-v0948-contract.mjs: oszlopok, szélesség, hibás mentések, billentyűkezelés és CSS-szabályok.
- scripts/tests/dimpro-license-env-boundary-v0948-contract.mjs: fail-closed DEV/PROD kombinációk, 423-as válasz, guardok az összes licencadmin író végponton, pozitív izolált DEV-tesztútvonal.
- scripts/tests/project-product-admin-release-gate.mjs: aktualizált route mock, amely továbbra is tiltott licenckiadási viselkedést bizonyít.
- További teljes licenc- és Drive regresszió, TypeScript, ESLint és külön BUILD01 fordítás szükséges.

A V0.9.47 telepítési elővizsgálat szerinti blokkolók változatlanok: a DEV szabad tárhelye korábban kb. 1,1 GiB, a license.dev host közös 3100-as BENJADMIN alkalmazáson fut. A DotRoll válasz és a DEV kapacitás helyreállításáig nincs deploy.
