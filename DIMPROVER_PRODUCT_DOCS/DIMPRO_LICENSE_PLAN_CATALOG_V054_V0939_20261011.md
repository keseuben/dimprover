# DIMPRO Drive V0.9.39 – Saját Drive, Projekt Drive és Projektkapu csomagkatalógus

Dátum: 2026-10-11
Állapot: SOURCE CANDIDATE · A CSOMAGOK CSAK TERVEZETEK · NINCS DB MIGRÁCIÓ · NINCS DEV/PROD TELEPÍTÉS · PROD DENY

## Üzleti döntés

Nem szükséges a csomagméreteket, díjakat és szolgáltatások határait a jelenlegi fejlesztési lépésnél véglegesíteni. A fejlesztés rugalmas adatmodellt tart fenn, minden javasolt csomag DRAFT, public_visible=false, monthly_price_huf=NULL, annual_price_huf=NULL.

| Termék/scope | Tervezeti csomag | Javasolt logikai tárhely | Résztvevői keret |
| --- | --- | ---: | ---: |
| Saját Drive | Start | 5 GiB | 1 |
| Saját Drive | Plus | 25 GiB | 1 |
| Saját Drive | Pro | 100 GiB | 1 |
| Projekt Drive | Start | 25 GiB | 10 |
| Projekt Drive | Team | 100 GiB | 25 |
| Projekt Drive | Enterprise | 500 GiB | 100 |
| Projektkapu | Alap | NEM önálló Drive tárhely | 10 |
| Projektkapu | Pro | NEM önálló Drive tárhely | 25 |
| Projektkapu | Enterprise | NEM önálló Drive tárhely | 100 |

Ezek sem valódi csomagok, sem ajánlatok, sem a jelenlegi Drive-tárhelykonfiguráció részei. A funkcióflag kódok és tagkeretek szintén pusztán javaslatok: a fejlesztés során válhatnak valós jogosultsági feltételekké, külön jóváhagyás után.

**Fontos: a jelenlegi tényleges kód szerint** a Saját Drive Content Core alapértelmezett quota 50 GiB, a Projekt Drive Storage Core alapértelmezett projektkvóta 10 GiB (környezeti beállítással felülírható). A 5 GiB Saját Drive Start tervezete az első éles ügyfelekhez képest akár csökkentés volna: a migráció/tervtarifa összekötés nem írhatja felül csendben a jelenlegi 50 GiB kvótát. Legacy/grandfathered/free trial kategóriák, valamint a már elfoglalt tárhely védelme külön szabályozandó.

## Tervezett üzleti modell

- A fizetős Projektkapu licenc modulokat/projektfunkciókat és legfeljebb résztvevői keretet biztosíthat, **nem állít be a projekthez második fizetős Drive-kvótát**.
- A Projektkapuba ágyazott Drive / dokumentumkezelő és a teljes DIMPRO Drive motor ugyanarra a központi file asset/repository struktúrára épül. Egy bináris file fizikailag ne duplikálódjon feleslegesen, és az üzleti quota-számítás ne számolja két önálló tárhelyként a ugyanazon fizikai állományra mutató hivatkozásokat. Ennek tényleges végrehajtása külön műszaki auditot igényel.
- A projektlicenc résztvevői száma nem jelenti automatikusan, hogy minden meghívottnak külön fizetős licencet kell vásárolnia. A státusz/hozzáférés továbbra is projekt és ACL alapú.
- Külön megrendelési opció lehet Drive+Projektkapu kombinált csomag; a két alap terméklicenc és a fizetés kapcsolata lehet kedvezményes, de fizikai adatduplikációt nem hozhat létre.
- Érdemes külön később meghatározni a fizetős többlettárhely-szinteket, archiválás/backup költséget, változatmegőrzést, letöltési/egress forgalmat, AI API költségeket és tömeges projektfrissítéseket.
- Árat nem állapítottunk meg a tényleges havi szerver, tárolás, mentés, hálózati forgalom, karbantartás, ügyféltámogatás és elvárt fedezet nélkül. Javasolt havi/éves árazás és nagyméretű Enterprise-nál egyedi ajánlat.

## Elkészült kód

- app/lib/license/planCatalogDrafts.ts: típusos, külön termék/scope szerint megadott első 9 db döntési tervezet, publikálás és ár nélkül, általános szerepkör/jogosultság átadása nélkül.
- components/license/PlanDraftCatalogue.tsx + CSS: külön háromfüles, laptop/tablet/mobil responsive összehasonlító nézet, mindegyik kártyán megadott kapacitás, résztvevők, tervezett funkcionalitás és nem aktivált státusz.
- app/admin/licenckozpont/page.tsx: a meglévő admin Licencközpont alján megjelenik az új csomagkatalógus előnézete; a régi licencadatokat és meglévő admin funkciókat változatlanul megőrzi. Nincs csomagmentési gomb addig, amíg az AUTH licencadminisztráció erős jogosultsága nem kész.
- db/auth/migrations/017_auth_v054_license_plan_catalog_drafts.sql: külön PostgreSQL-auth csomagkatalógus, scope (PERSONAL/PROJECT), product_code (DRIVE/PROJECT_GATE), planCode, proposed_features JSONB, optional storage quota, seats, price_mode (PENDING/FIXED/QUOTE), nullable HUF monthly/annual price, DRAFT/APPROVED/RETIRED, approval identity+timestamp, public_visible gate és immutable history/audit trigger, monoton revision. Mind a 9 kezdő csomag DRAFT, nem publikus, ár nélkül. Runtime DB csak SELECT jogot kap, tényleges licenc- / quota-módosítás nincs.
- db/auth/migrations/016_auth_v053_project_product_license_issuance.sql: további jogosultsági szigorítás. A normál dimpro_auth_app_* szerepkör **nem kaphat EXECUTE jogot** az operator-issue/approve RPC-kre, és az SQL belső caller-role deny ellenőrzést is tartalmaz. Éles bevezetés előtt dedikált admin DB role, azonosított admin SSO és DBA review szükséges. A hard release gate a korábban létrehozott admin API-n változatlanul FALSE.

## Tudatosan későbbre hagyott rész

- Az AUTH terméklicenc kiadási RPC és az APPROVED plan catalogue összekötése (plan code, scope, keret és szolgáltatások validálása).
- A csomagok biztonságos szerkesztő/approval UI-ja és a központi AUTH/Identity Core számlázási rendszer összekötése; nincs automatikus fizetési activation.
- Valós ügyfél tárhelykvótájának adatbázison keresztüli, read-only preview/alkalmazása, meglévő felhasználók védelmével.
- Új termékcsomagok árai és előfizetési feltételei – emberi üzleti döntés.
- Browser E2E és PROD/DEV telepítési ellenőrzés a jelenlegi PROD DENY és DEV tárhelykorlát miatt.

## QA

- scripts/tests/drive-plan-draft-catalog-pglite.mjs – izolált PostgreSQL seed, 9/9 kódegyezés, ár-null, publikálás deny, revision, audit, hard-delete deny, runtime SELECT-only.
- scripts/tests/project-product-issuance-pglite.mjs – normál app role még ismert SUPERADMIN UUID mellett is tiltott, 16/16 PASS.
- scripts/tests/drive-license-plan-catalog-contract.mjs – javaslatok, product/scope egyezés, null pricing, korábbi kvóta-állandók és UI nézet.
- TypeScript és ESLint PASS; a BUILD01 ellenőrzés eredménye utólag kerül ebbe a fájlba.

## Kiadásvédelmi szabály

A csomagok végleges, díjakkal ellátott jóváhagyásáig nem jelennek meg publikus vásárlási ajánlatként, és nem érvényesülnek a Drive/Projektkapu runtime hozzáférésben vagy tárolásban. Az eddigi felhasználóknál semmilyen automatikus kvótacsökkentés/törlés nem engedélyezett.
