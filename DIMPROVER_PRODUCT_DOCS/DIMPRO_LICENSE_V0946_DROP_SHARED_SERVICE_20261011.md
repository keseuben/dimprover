# DIMPRO V0.9.46 – Drop a Drive mellett, külön előfizethető szolgáltatásként

Dátum: 2026-10-11
Státusz: SOURCE CANDIDATE, PROD DENY. Nem aktív központi licenc; nem történt DEV/PROD deploy vagy valós AUTH migráció.

## Elfogadott termékstruktúra

A DIMPRO Drop a DIMPRO Drive mellett, de tőle önállóan is előfizethető. A Drop használható e-mailes fájlküldőként Drive nélkül; a projekt és a Drive célmappája csak opcionális, külön jogosultsági és irányítási réteg. A Drop nem mini-app és nem hatodik DIMPRO fő termékszint, hanem a Drive-hoz hasonlóan külön értékesíthető közös szolgáltatás.

| Szolgáltatás | Alaprendeltetés | Önálló licenc |
| --- | --- | --- |
| DIMPRO Drive | Tartós fájltár, fájlverzió, szinkron, megosztott projektmappák | Igen |
| DIMPRO Drop | Átmeneti fájlküldés/-fogadás, e-mailes küldés, csomagok, beküldőkapuk és Drop Tér | Igen |
| Opcionális Drop → Drive | Jóváhagyott csomaghoz tartozó dokumentumok átadása jogosult célmappába | Meglévő Drop- és Drive/Project Core jogosultság szerint, nem automatikusan |

Induló tervezett licencscope: felhasználó (USER) és szervezet (ORGANIZATION). A projektkapcsolatos funkció engedélye külön kezelendő, az önálló Drop licenc nem emeli a Project Core ACL-t. Drive vásárlása nem kötelező Drop használatához.

## A jelenlegi Drop kódban igazolt licencállapot

Az aktuális Drop alkalmazásnak már van licence, ezért az új központi licencregistrációval nem szabad váratlanul kiváltani a működő Identity Core jogosultságokat.

- A components/drop/DropPublicWorkflowManager.tsx alapértelmezett termékkódja DIMPRO_DROP, és a meglévő Identity Core dimpro_licenses, dimpro_license_modules adataival dolgozik.
- A régi Identity Core terméklicenc LIC-ÉÉ-XXXX-XXXX formátumú; személyhez vagy szervezethez tartozhat, státusz, kezdés/lejárat, eszközkeret és plan code mezőkkel. Forrás: supabase/migrations/20260806213000_dimpro_identity_license_project_core_v010.sql.
- A Send entitlement a dimpro_send_entitlements táblában önálló, külön HMAC-védett Send-kóddal, címzettmóddal, címzettkorláttal, csomagmérettel, havi küldésszámmal, státusszal és moduljoggal. Forrás: supabase/migrations/20260806214000_dimpro_send_project_access_v010.sql és app/lib/identity-core/repository.ts.
- A tényleges Send modulok: DROP_SEND, DROP_QUICK_IMAGE_SEND, DROP_PROJECT_INBOX, DROP_QUICK_VOICE_NOTE. A CsomagDrop, Beküldőkapu és Drop Tér eltérő capability/link/space-tagsági jogosultsággal is működhet; nem szabad ezeket automatikusan Send entitlementnek tekinteni.
- A Drop adminban már létezik linkLegacy művelet, ami külön operátori döntéssel a régi Send-kódot újabb Identity Core entitlementhez kötheti és opcionálisan visszavonhatja. Ez nem a mostani központi PostgreSQL AUTH-migráció. Nem hívtuk és nem módosítottuk.
- A Drop ideiglenes fájltárolása és a Drive tartós fájlverziói két külön elszámolási és megőrzési domén; kapcsolás csak jogosult és auditált átadással.

## V0.9.46 elkészült forrás

1. app/lib/license/dimproDropServiceCatalog.ts: önálló DIMPRO_DROP termékkód, Drive-hoz kapcsolódó, de külön licencelhető szolgáltatás, létező Send modulok és tiltott kereskedelmi/cutover feature flag. A previewDropLegacyMigration tiszta, read-only és fail-closed előnézet; hiteles központi AUTH UUID hiányában blokkol, e-mailből nem azonosít.
2. db/auth/migrations/021_auth_v058_dimpro_drop_shared_service.sql: új, NEM FUTTATOTT katalogizáló migráció. A már meglévő Drop termékazonosítót és státuszt megőrzi, új read-only szolgáltatás-metaadattal; entitlement_enabled=false, legacy_cutover_released=false, MIGRATION_PLANNED, requires_companion_license=false és külön Drop-transfer storage policy. A runtime DB role csak SELECT jogot kap.
3. components/license/ProductArchitectureOverview.tsx és CSS: a központi Licencközpont öt fő szintje alatt a Drive és a Drop külön-külön, páros szolgáltatásként jelenik meg. Keskeny képernyőn egymás alá kerülnek.
4. components/drive/driveBuildInfo.ts: V0.9.46 forrásjelölt; az élő DEV verzióját nem módosítja.
5. DIMPRO_PRODUCT_ARCHITECTURE.md: hivatalos Drop és Drive termék-/jogosultsági kiegészítés.

## A későbbi tényleges migráció kötelező követelményei

1. Read-only inventory a régi Identity Core licencekről és Send entitlementekről: teljes modul, státusz, terv, limit, lejárat és tulajdonosi scope összevetése.
2. Hiteles AUTH USER vagy ORGANIZATION UUID megfeleltetés. E-mail vagy Send-kód alapján nincs automatikus licencmigráció, kétértelműség esetén UNKNOWN/DENY.
3. Idempotens, auditált migrációs megfeleltetési tábla és visszaállítható lépések; CsomagDrop/Drop Tér/Beküldőkapu önálló hozzáférési szabályai.
4. Két rendszer párhuzamos, összehasonlító működése. A korábbi Drop jogosultsági motor addig authoritative, amíg külön jóvá nem hagyott cutover történik. Nincs kettős számlázás.
5. Teljes E2E és biztonsági ellenőrzés: eredeti Send-kód használhatósága, címzettek, meghívottak, havi küldés, csomaglimitek, e-mail értesítés, lejárat, projekt/Drive ACL, migrációs audit, backup és rollback.
6. Csak külön üzemeltetői/üzleti jóváhagyás után engedélyezhető tényleges licenckiadás, DB migráció, régi entitlement kivezetése, új díj vagy átállás.

A V0.9.46 nem olvasott ki éles ügyfélrekordot a Drop Identity Core-ból, és nem módosította a már kibocsátott licenceket, Send-kódokat, címzetteket, tárhelyeket, jogosultságokat vagy korábbi Drop csomagokat.

## QA

Új tesztek: scripts/tests/dimpro-drop-license-catalog-contract.mjs, scripts/tests/dimpro-drop-service-catalog-pglite.mjs. TypeScript és célzott ESLint ellenőrzés szükséges, a korábbi AUTH/Drive/Drop regressziós tesztekkel és a teljes BUILD01 fordítással.

PROD DENY. A teszt- és buildadatokat a validáció lezárásakor rögzítjük.

## Validált forrásellenőrzések és elkülönített régi Drop-tesztek

- Új DIMPRO Drop licenckatalógus/legacy bridge contract: PASS.
- Új 018 + 020 + 021 sorrendű izolált PGlite migráció, 12 központi termékkel, a meglévő Drive/Drop/Projektkapu termékrekordok változatlanul tartásával: PASS.
- Korábbi 11/11 licencszerződés-csoport, 5/5 izolált PostgreSQL-csoport, 2/2 licenc-API guard és 14/14 Drive notification regressziós tesztcsoport PASS.
- TypeScript, célzott ESLint és git diff --check PASS.
- Külön vizsgált, a V0.9.46 által NEM módosított régi Drop alkalmazási tesztek: scripts/drop-v094-product-family-contract.mjs a fejlesztői worktree-ben hiányzó .env.local fájlt vár, ezért nem futtatható ezen a környezeten. scripts/drop-v127-contract.mjs voice-recording-feedback ellenőrzése fail eredményt ad; e régebbi Drop UI-regresszió okát nem kutattuk vagy módosítottuk, mert a jelen fejlesztés csak licencforrásra/UI-architektúrára terjed ki. E két régi Drop tesztre NEM állítunk PASS eredményt.
- Teljes BUILD01 státusz: ellenőrzés alatt.

## BUILD01 ellenőrzött eredmény – 2026-10-11

- Run: dimpro-drop-license-v0946-f842ee12e-20261011-build01-b1.
- Forráscommit: f842ee12ec21170b6214ea415091306d33ccd1b0.
- Teljes Next.js build: PASS; TypeScript PASS, 104/104 oldal, 274 standalone statikus chunk ellenőrizve.
- BUILD ID: cxKxZUWzqsBbXaW36uPkN.
- Artifact SHA-256: e8fe05e711e1170b2979d8685d69ed8aa5ec915fe2eda45842a16e67fda3fb16.
- A tényleges artifact SHA-256, a BUILD gateway státusz és a metaadat ellenőrzőösszege egyezik.
- Kód: TypeScript, célzott ESLint PASS; új Drop licenckatalógus és új PGlite kontraktus PASS; 11/11 korábbi licencteszt-csoport, 5/5 PGlite-csoport, 2/2 licenc API-guard és 14/14 Drive értesítési tesztcsoport PASS.
- A két régebbi, másik fejlesztési körből származó Drop alkalmazás-UX tesztet nem tudtuk PASS-nak minősíteni: az egyik .env.local fájlt igényel; a másik voice-recording-feedback eltérést jelez. Ezek a V0.9.46 licencrétegtől külön vizsgálandók.
- DEV lemez a záróméréskor 78 GiB, ~71 GiB foglalt, ~5,9 GiB szabad (93%). Nincs DEV deploy, AUTH/Drop DB migráció, PM2 restart vagy PROD módosítás.
- Az új központi katalogizáló 021 migráció csak izolált PostgreSQL/PGlite adatbázisban futott.
- A régi Drop Identity Core licencek továbbra is változatlanok, nem történt cutover vagy új számlázás. PROD DENY.
