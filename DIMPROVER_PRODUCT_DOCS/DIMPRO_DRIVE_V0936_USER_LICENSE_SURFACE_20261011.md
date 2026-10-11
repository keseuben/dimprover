# DIMPRO Drive – önálló felhasználói Licenc és előfizetés nézet

Dátum: 2026-10-11
Állapot: SOURCE CANDIDATE ONLY | NO DEV DEPLOY | NO DB MIGRATION | NO EMAIL | PROD DENY

## Feladat és működés

A DIMPRO Drive bal oldali kibontott boardján, Rendszer csoport alatt:
- Licenc és előfizetés -> /drive/licenc
- A korábban inaktív Tárhely bővítése gomb helyett Tárhely / licenc link ugyanoda.
- Új ikongomb a laptopos, állandóan keskeny navigációs railbe NEM került.

Önálló, világos Drive-stílusú oldal:
- Központi AUTH alapján aktuális személyes Drive hozzáférés és a saját felhasználó nevének/e-mailjének megjelenítése.
- Aktuális, felhasználónak megengedett projektmunkaterek száma és projektszerepei.
- A user_id alapján szűrt Drive termék-hozzáférési bejegyzések állapota, érvényességi időpontjai. A valid_until NEM fizetős előfizetés lejárata.
- Munkatérválasztóval személyes és projekt tárhely foglaltság/keret. A meglévő két külön ACL-védett tárolási API szolgálja ki.
- A központi Identity Core számlázási adatai a jelenlegi AUTH fiókhoz még NINCSENEK hitelesen kötve: előfizetési csomag, díj, fizetési státusz, megújítási dátum NINCS kitalálva, UNLINKED státusszal világos magyarázat jelenik meg.
- Ügyféligénylés vagy kapacitásbővítés külön, manuálisan az üzemeltetőnél; nincs automatikus jogosultság/lízing aktiválás.

## Architektúra

- UI: app/drive/licenc/page.tsx; components/drive/DriveLicenseCenter.tsx és DriveLicenseCenter.module.css.
- GET /api/drive/license: resolveProjectCoreAuth munkamenet-ellenőrzés, központi auth_access_grants a saját access.actor.userId alapján, hasPersonalDriveAccess, listAccessibleProjects(userAliases). Nincs kliens által beküldhető idegen user_id. Cache private no-store.
- Személyes tárhely: GET /api/drive/personal/storage, a jogosult personal content actor alapján.
- Projekt-tárhely: GET /api/projects/{projectId}/drive/storage a külön document.read ACL ellenőrzéssel.
- Felhasználói saját Drive-licenc felület NEM tartalmaz admin/licenc-generálási vagy idegen előfizetési adatokat.
- A meglévő központi admin felület: app/admin/licenckozpont/page.tsx. Megőrizzük, azonban jelenlegi Identity Core / régebbi license integrációja még részben Supabase és legacy license motor; a központi új AUTH adatmodellhez való kereskedelmi licenc-szinkron külön fejlesztési fázis.
- Későbbi közös licenc-core linkage csak stabil user/organization/license UUID és auditált előfizetés-hozzárendelés alapján. Email/név illesztés alapján automatikus kapcsolás TILOS.

## Operátori értesítések

Az új, emailben igazolt személyes Drive igénylések jóváhagyott üzemeltetői címzettje: admin@dimpro.hu.
Ezt forrásszintű alapértelmezésként beállítottuk az AUTH operátor-notice modulban.
DRIVE_OPERATOR_MAIL_RELEASED=false továbbra is HARD OFF, ezért email nem indul.
A jóváhagyott címzett beállítása nem jelenti a migráció/SMTP kiküldés automatikus aktiválását.

## Release állapot

- Forrás és TypeScript/ESLint sikeres.
- Legutóbbi drive-license-read-contract tesztek 13/13 PASS. Scope és AUTH ellenőrzés, eltérő státuszok, admin-kulcs hiánya, licenc-billing összerendelés explicit UNLINKED.
- Külön BUILD01 teljes Next fordítás, böngészős responsive teszt (1366x768 és 1600x900), személyes/project ACL QA szükséges.
- Új licenc DB migráció NINCS; új auth mail operator migráció (013) továbbra is csak source candidate.
- Jelenlegi DEV Drive működése és PROD érintetlen.

## BUILD01 teljes build ellenőrzése – 2026-10-11

- Futás: drive-v0936-f97921e46-20261011-build01-b1.
- Source commit: f97921e46a88ff32f760c24c56236db450c8fffe.
- Állapot: **PASS**.
- Build ID: PTu_ZSXs-aCDjXC5HP5bz.
- Artifact SHA-256: 2db2ba926bff8739db450107ca51d59a7f8daffc8f29059673126e972048bb78.
- A metadata, gateway status és az artifact tényleges SHA-256 értéke megegyezik.
- A buildnapló külön felsorolja a /drive/licenc oldalt, Next.js fordítás/TypeScript/standalone PASS.
- A BUILD01 kizárólag külön build szerver, a DEV működő Drive útvonala nem módosult.
- DEV 2026-10-11 ellenőrzött lemez: 118 GiB összes / 115 GiB foglalt / 2.1 GiB szabad, 99%.
- Előfizetési licencadatok összerendelése, AUTH+Identity Core adatmodell és licencjogosultságok, valamint browser QA még külön release gate.
