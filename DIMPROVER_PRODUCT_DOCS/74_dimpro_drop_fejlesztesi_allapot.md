# DIMPRO Drop fejlesztési állapot

**Fejlesztési kör:** DROP 0.2.0  
**Dátum:** 2026. augusztus 1.  
**Projekt:** DIMPRO / DIMPROVER webes platform  
**Modul:** DIMPRO Drop / KépDrop és FájlDrop  
**Állapot:** az adatbázistól független csomagmotor, adminfelület és tesztrendszer elkészült; a végső Supabase bootstrap szándékosan nincs alkalmazva

## Infrastrukturális állapot

- PROD VPS: stabil, Ubuntu 24.04 LTS, `dimprover` PM2 online;
- aktív éles `.next` és PM2 folyamat a DROP 0.2.0 fejlesztés alatt nem változott;
- DEV VPS: még nem érhető el;
- DATABASE VPS: még nem érhető el;
- Supabase szerveroldali kapcsolat elő van készítve, de a Drop SQL bootstrap nincs lefuttatva;
- a readiness jelenleg mind a hét kötelező Drop táblára `404 / schema not ready` állapotot ad;
- a release gate és minden fájlműveleti flag zárva maradt.

## Elkészült kódrétegek

### Csomag- és hozzáférési motor

- bővített Drop típusmodell;
- címzett-, csoport-, e-mail-, retention- és méretlimit-validáció;
- hatjegyű PIN generálás;
- egyedi salt és scrypt PIN-hash;
- külön upload, view, download és report capability-token;
- célhoz kötött tokenprefix;
- HMAC-SHA256 tokenhash;
- nyers PIN és nyers token adatbázismentésének tiltása;
- IP- és tokenfingerprint HMAC naplózás;
- publikus csomagkód + PIN kapu;
- tokenpurpose-keverés elleni védelem;
- lejárat-, státusz- és használatilimit-ellenőrzés;
- IP-, csomag+IP- és token+IP-rate limit.

### Repository és adatbázisfüggetlen tesztelés

- `DropRepositoryPort` hozzáférési repository-szerződés;
- `DropAdminRepositoryPort` adminisztrációs repository-szerződés;
- Supabase service-role adapter;
- kizárólag automatizált tesztekben példányosítható memóriás repository;
- ugyanazon PIN-, token-, rate-limit- és életciklus-szolgáltatás fut memóriás és Supabase adapterrel;
- adatbázis nélküli csomag-előnézet;
- valós mentési gomb automatikus zárolása hiányos séma esetén.

### Csomagéletciklus

- szabályozott állapotgép: `draft`, `preparing`, `active`, `upload_closed`, `expiring`, `reporting`, `deleting`, `expired`, `deleted`, `failed`;
- `upload_closed` állapotban az upload-token megszűnik, a megtekintés/letöltés/riport még engedélyezhető;
- lejárati állapotban minden aktív capability-token visszavonódik;
- tiltott állapotváltás 409-es konfliktussal áll meg;
- optimista státuszellenőrzés és adatbázisoldali sorzárolás.

### Belső adminfelület

- új csomagterv és adatbázis nélküli ellenőrző előnézet;
- címzettek és logikai csoportok előnézete;
- sématáblák és DROP 0.2.0 sémaverzió állapota;
- csomaglista;
- feltöltési időszak lezárása;
- lejárati folyamat indítása;
- purpose-specifikus link újrakiadása;
- egyedi token visszavonása;
- veszélyes műveleteknél megerősítés;
- nyers új link csak egyszeri megjelenítése;
- minden valódi adminművelet tiltva marad, amíg a teljes sémaszerződés és a package engine kapu nem kész.

## Védett admin API-k

- `POST /api/drop/admin/packages/preview` – adatbázis nélküli előnézet;
- `GET /api/drop/admin/packages` – csomaglista;
- `POST /api/drop/admin/packages` – fájl nélküli csomaglétrehozás;
- `PATCH /api/drop/admin/packages/[packageId]/status` – állapotváltás;
- `POST /api/drop/admin/packages/[packageId]/tokens/[purpose]/reissue` – új link kiadása;
- `POST /api/drop/admin/packages/[packageId]/tokens/by-id/[tokenId]/revoke` – egyedi token visszavonása.

A nyilvános `drop.dimpro.hu` host az admin API-kat 404 válasszal blokkolja.

## Tranzakciós SQL motor

A végső bootstrap hat forrásmigrációból áll:

1. `20260731143500_drop_core.sql`;
2. `20260801003000_drop_access_engine.sql`;
3. `20260801090000_drop_admin_lifecycle.sql`;
4. `20260801100000_drop_token_transactions.sql`;
5. `20260801110000_drop_atomic_package_creation.sql`;
6. `20260801120000_drop_schema_version.sql`.

Előkészített atomi PostgreSQL-függvények:

- `drop_create_package_atomic` – csomag, címzettek, csoportok, négy tokenhash és esemény egy tranzakcióban;
- `drop_transition_package_status` – státuszváltás, token-visszavonás és esemény egy tranzakcióban;
- `drop_mark_access_token_used` – használatszámláló versenyhelyzet nélküli növelése;
- `drop_reissue_access_token` – régi purpose-token visszavonása és új hash létrehozása egy tranzakcióban;
- `drop_revoke_access_token` – egyedi token és audit esemény egy tranzakcióban.

Az RPC-k csak `service_role` jogosultsággal hívhatók. `public`, `anon` és `authenticated` végrehajtási jog nincs. A bootstrap nem hoz létre anonim RLS policyt.

## Kötelező sémaverzió-kapu

A `drop_schema_meta` tábla végső migrációként rögzíti:

- sémaverzió: `DROP 0.2.0`;
- migrációszám: `6`;
- bootstrap azonosító: `drop-020-atomic-package-engine-20260801`.

A package engine csak akkor tekinthető késznek, ha mind a hét kötelező tábla és ez a pontos verziójelölő elérhető. Régebbi vagy részleges séma nem nyithatja ki a release gate-et.

## Bootstrap állapot

- fájl: `supabase/DIMPRO_DROP_020_SUPABASE_BOOTSTRAP.sql`;
- SHA256: `591250bb1bdda6087b50ff7b94ea2b7a3c40e09301285c2460eba9318d1bae55`;
- teljes bootstrap: explicit `BEGIN` / `COMMIT` tranzakció;
- SQL alkalmazva: **nem**;
- adatbázisírás történt ebben a fejlesztési körben: **nem**.

## Tesztek

A `scripts/drop-offline-acceptance.sh` 11 lépcsője hibamentes:

1. core security;
2. adatbázis-sémaszerződés;
3. atomi csomaglétrehozási szerződés;
4. aktiválási preflight és SHA256;
5. csomag-előnézet;
6. csomagéletciklus;
7. memóriás hozzáférési integráció;
8. admin életciklus és atomi adapterág;
9. admin API-szerződés és route-konfliktus ellenőrzés;
10. célzott ESLint;
11. teljes TypeScript.

Candidate ellenőrzések:

- nyilvános smoke: 11/11 PASS;
- admin jogosultság nélkül: 401 PASS;
- admin előnézet: 200 PASS;
- valódi adminművelet zárt gate mellett: 503 PASS;
- desktop/tablet/mobil responsive: 3/3 PASS;
- vízszintes túlcsordulás: nincs;
- a korábban azonosított eltérő dinamikus route-paraméternév ütközés javítva és regressziós teszttel védve.

## Végső aktiválásra előkészített parancsok

- biztonságos, írás nélküli preflight: `scripts/drop-activation-preflight.mjs`;
- adatbázis-readiness: `scripts/drop-db-readiness.mjs`;
- explicit engedélyhez kötött, automatikusan takarító integrációs teszt: `scripts/drop-post-activation-integration.test.ts`.

Az integrációs teszt nem fut automatikusan. Csak a bootstrap kézi alkalmazása után, zárt release gate mellett indítható, és a létrehozott tesztcsomagot `finally` ágban törli.

## Végleges candidate ellenőrzés

- ellenőrzés időpontja: `2026-08-01 12:18:56 CEST`;
- candidate könyvtár: `.next_candidate_drop_v020_final`;
- candidate buildazonosító: `bRGZhZmb1KdjcmcOdMoLR`;
- teljes 11 lépcsős offline acceptance: **PASS**;
- nyilvános smoke: **11/11 PASS**;
- responsive ellenőrzés: **desktop, tablet, mobil 3/3 PASS**;
- vízszintes túlcsordulás: **nincs**;
- belső adminoldal jogosultság nélkül: **307 / login redirect PASS**;
- belső Drop admin API jogosultság nélkül: **401 PASS**;
- nyilvános Drop hoston admin API: **404 PASS**;
- sémadiagnosztika: mind a hét hiányzó tábla külön `PGRST205` hibával és teljes `missingTables` listával jelenik meg;
- végleges SQL SHA256: `591250bb1bdda6087b50ff7b94ea2b7a3c40e09301285c2460eba9318d1bae55`;
- SQL alkalmazva: **nem**;
- adatbázisírás: **nem történt**;
- éles `.next` csere: **nem történt**;
- PM2 restart: **nem történt**;
- következő kötelező lépés: a bootstrap kézi futtatása a Supabase SQL Editorban, majd readiness és ideiglenes integrációs teszt.

## Private-pilot aktiválás

- aktiválás időpontja: `2026-08-01 17:54:07 CEST`;
- futási szint: `private-pilot`;
- központi release gate: **bekapcsolva**;
- csomagmotor: **aktív**;
- PIN- és tokenalapú hozzáférési kapu: **aktív**;
- Supabase séma: **7/7 kötelező tábla kész**;
- sémaverzió: `DROP 0.2.0`;
- migrációszám: `6`;
- bootstrap azonosító: `drop-020-atomic-package-engine-20260801`;
- valós fájl-, kép-, ZIP- és vegyes feltöltés: **továbbra is tiltva**;
- Object Storage: **nincs aktiválva**;
- háttérworker és automatikus törlés: **nincs aktiválva**;
- admin csomaglétrehozási API: **PASS**;
- admin csomaglista API: **PASS**;
- nyilvános PIN-kapu: **PASS**;
- tokenes megtekintési oldal: **PASS**;
- sikeres PIN- és tokenaudit: **PASS**;
- tesztcsomag automatikus törlése: **PASS**;
- licencadmin kezelőfelület: `https://license.dimpro.hu/drive/drop`;
- kezelőfelületi böngészőteszt: **HTTP 200, 0 konzolhiba, 0 hibás válasz, 0 px overflow**;
- környezeti rollback-mentés: `backups/drop_v020_private_pilot_env_20260801_174930.env.local`.

## Hozzáférési linkkártya UX-javítás

- kiadás időpontja: `2026-08-01`;
- éles buildazonosító: `4YnlBgL2eELxO87RF3zw5`;
- csomag létrehozása után az űrlap automatikusan bezárul;
- a felület automatikusan az egyszeri biztonsági átadási kártyához görget;
- külön megjelenik a `https://drop.dimpro.hu/open` PIN-es belépési oldal;
- külön, magyar felirattal jelenik meg a közvetlen megtekintési link;
- a csomagkód, PIN, feltöltési, letöltési és riportlink másolható;
- a nyers PIN és tokenek továbbra is csak egyszer jelennek meg;
- candidate build: PASS;
- célzott ESLint és TypeScript: PASS;
- candidate böngészőteszt: PASS;
- éles böngészőteszt: PASS;
- éles Drop smoke: 11/11 PASS;
- böngészőhiba: 0;
- hibás hálózati válasz: 0;
- vízszintes túlcsordulás: nincs;
- tesztcsomag automatikus törlése: PASS;
- rollback: `.next_before_drop_v020_link_ux_20260801_181909`.

## Továbbra is tiltott

- valós fájlfeltöltés;
- signed Object Storage upload;
- fájl- és ZIP-letöltés;
- ZIP feldolgozás;
- vírusellenőrzés nélküli fájlkezelés;
- KépDrop és FájlDrop upload aktiválás;
- PDF-riport generálás;
- háttérworker és automatikus törlés;
- Drive-archiválás;
- éles `.next` csere és PM2 restart a végső SQL/integrációs ellenőrzés előtt.

## Adminindító kártya, e-mail értesítések és 2 mp-es megerősítés

- kiadás időpontja: `2026-08-01`;
- éles buildazonosító: `a8vRNUE08vVsQx6HsAzAP`;
- előző éles build: `um7dReY7pUt0mMyj8duZx`;
- rollback: `.next_before_drop_email_hold_20260801_191621`;
- a `https://license.dimpro.hu/admin` belépési választóoldalon külön, harmadik fő **DIMPRO Drop / Drop csomagkezelő** kártya készült;
- a licenc-dashboard fejlécében állandó **Drop csomagkezelő** gomb készült;
- a Drop kezelőközpont közvetlen útvonala továbbra is `https://license.dimpro.hu/drive/drop`;
- aktiválva: `DROP_EMAIL_NOTIFICATIONS_ENABLED=true`;
- e-mail küldőprofil: `drive` / `ertesites.drive@dimpro.hu`;
- csomaglétrehozás után a `receive_invitation=true` címzettek külön-külön meghívó e-mailt kapnak;
- a meghívó tartalmazza a csomagnevet, projektnevet, csomagkódot, PIN-t, lejáratot, PIN-es belépési oldalt és közvetlen megtekintési linket;
- sikeres meghívó után a `drop_recipients.invitation_sent_at` mező kitöltődik;
- sikeres és sikertelen küldés is külön `drop_events` audit eseményt kap;
- a csomag létrejötte nem kerül visszavonásra SMTP-hiba esetén; a felület külön jelzi a címzettenkénti eredményt;
- elkészült a sikeres fájlfeltöltés utáni értesítési szolgáltatás is; a feltöltőt nem értesíti saját műveletéről, a csomaggazdát és az aktivitási értesítésre jogosult címzetteket igen;
- a feltöltési értesítés tényleges meghívása a későbbi Storage-véglegesítési workflow-ba kerül, mert a valós fájlfeltöltés továbbra is tiltott;
- közös új komponens: `components/ui/HoldActionButton.tsx`;
- a korábbi ingatlanfelmérő HoldActionButton kompatibilis újraexporttal ugyanazt a közös komponenst használja;
- 2 másodperces nyomva tartás szükséges: csomaglétrehozás, feltöltés lezárása, lejárat indítása, új capability-link kiadása és aktív token visszavonása;
- az egyszerű `window.confirm` használata ezeknél a Drop műveleteknél megszűnt;
- private-pilot preflight paraméterezve lett a nyitott release gate ellenőrzésére;
- valódi Supabase + SMTP integráció: PASS;
- `invitation_sent_at` mentés: PASS;
- e-mail audit esemény: PASS;
- automatikus tesztcsomag-takarítás: PASS;
- private-pilot offline acceptance: 11/11 PASS;
- candidate smoke: 11/11 PASS;
- éles smoke: 11/11 PASS;
- candidate és éles böngészőteszt: PASS;
- rövid nyomás blokkolta a műveletet: PASS;
- teljes 2 mp-es nyomás végrehajtotta a műveletet: PASS;
- böngészőhiba: 0;
- konzolhiba: 0;
- `window.confirm` hívás: 0;
- vízszintes túlcsordulás: nincs;
- Object Storage, kép-/fájl-/ZIP-feltöltés és worker továbbra is tiltott.

## DROP 0.3.0 hozzáférési terek – első fejlesztési kör

- kiadás időpontja: `2026-08-01`;
- éles build: `o25oO2K7KLQKEwYb4Ix7V`;
- rollback: `.next_before_drop_spaces_phase1_20260801_201938`;
- adminindító Drop kártya világos és sötét kontrasztja javítva;
- a kártya új címe: **Drop hozzáférési tér**;
- a Drop kezelőben megjelent az inaktív **Hozzáférési terek a csomagok fölött** panel;
- új domainmodellek: tér, tagság, projektkapcsolat, csomagláthatóság;
- szerepkörök: owner, space_admin, contributor, uploader, viewer;
- a vendégfelhasználónak nem kell külön fizetős licenc;
- a fizető térgazda licence mindig felső időkorlát;
- projektkapcsolat és Drive-archiválás másolat nélküli azonosítókapcsolatra előkészítve;
- staged SQL: `supabase/DIMPRO_DROP_030_SPACES_BOOTSTRAP.sql`;
- SQL SHA256: `92b4dda620958c6cc8638d0fb6d5537ded9e18015ed6ab98aeab4470068a40df`;
- SQL alkalmazva: **nem**;
- feature flag: `DROP_SPACES_ENABLED=false`;
- új táblák staged állapotban: `drop_spaces`, `drop_space_memberships`, `drop_space_projects`, `drop_package_members`;
- legacy csomagkompatibilitás megmarad;
- DROP 0.3.0 preflight: 4/4 PASS;
- meglévő DROP acceptance: 11/11 PASS;
- éles smoke: 11/11 PASS;
- éles böngészőteszt: PASS;
- világos leírás kontraszt: 9,65:1;
- sötét leírás kontraszt: 13,35:1;
- fájlfeltöltés továbbra is tiltott.

Részletes dokumentáció: `77_dimpro_drop_spaces_access_model.md`.


## DROP 0.3.0 aktív hozzáférési térkezelő

- aktiválás: `2026-08-01`;
- Supabase séma: `DROP 0.3.0`;
- bootstrap: `drop-030-spaces-access-model-20260801`;
- `DROP_SPACES_ENABLED=true`;
- éles build: `IE8AbgSsaJrB5olBGmDiJ`;
- rollback: `.next_before_drop_spaces_crud_20260801_211605`;
- aktív API: `GET/POST /api/drop/admin/spaces`;
- belső admin létrehozhat licencgazdához kötött Drop teret;
- automatikusan létrejön az aktív owner tagság;
- opcionálisan azonnal létrejön a projektkapcsolat;
- licenclejárat minden lejárati mód felső korlátja;
- a térlista mutatja a runtime módot, tag-, projekt-, csomag- és tárhelykeretet;
- valós repository-integráció: PASS;
- candidate API-integráció: PASS;
- aktív preflight: 6/6 PASS;
- meglévő DROP acceptance: 11/11 PASS;
- éles smoke: 11/11 PASS;
- éles böngészőteszt: PASS;
- publikus admin API: tiltva;
- publikus fájlfeltöltés: továbbra is tiltva;
- hardlink deduplikációval 736,39 MiB lemezhely felszabadítva.

## DROP 0.3.1 tagsági meghívás – éles

- éles build: `d-5x1MUMZDqkV9GbgE7dP`;
- rollback: `.next_before_drop_v031_invites_20260801_214915`;
- e-mailes térmeghívás: aktív;
- egyszer használható meghívótoken: aktív;
- biztonságos vendégmunkamenet: aktív;
- közreműködői munkatér: aktív;
- vendég külön fizetős licenc nélkül használhatja a teret;
- fájlfeltöltés: tiltott.

## DROP 0.3.2 tércsomagkészítés – kézi SQL-re vár

- candidate build: `mnB5mJ6_3LW4lwj27yMER`;
- feature flag: `DROP_SPACE_PACKAGE_CREATION_ENABLED=false`;
- SQL: `supabase/DIMPRO_DROP_032_SPACE_PACKAGES_BOOTSTRAP.sql`;
- SHA256: `df482acc96c6cd3a711f55da16d223ece43b275f9c07926d9c1d99472e2363ac`;
- pre-SQL preflight: 6/6 PASS;
- meglévő acceptance: 11/11 PASS;
- candidate smoke: 11/11 PASS;
- mentési API zárva: HTTP 503;
- fájlfeltöltés: tiltott.

## DROP 0.3.2 tércsomagkészítés – éles

- éles build: `X9Jxtcs2lSP1Y6ynq6dKf`;
- előző build: `d-5x1MUMZDqkV9GbgE7dP`;
- rollback: `.next_before_drop_v032_20260801_230325`;
- `DROP_SPACE_PACKAGE_CREATION_ENABLED=true`;
- DROP térből saját csomag létrehozása: aktív;
- kiválasztott tértagokkal történő megosztás: aktív;
- projektkapcsolat-ellenőrzés: aktív;
- szerveroldali csomagláthatóság: aktív;
- 2 másodperces csomaglétrehozás: aktív;
- egyszer megjelenő PIN és capability-linkek: aktív;
- post-SQL preflight: 7/7 PASS;
- valós Supabase-integráció: PASS;
- legacy acceptance: 11/11 PASS;
- candidate és éles smoke: 11/11 PASS;
- candidate és éles böngészőteszt: PASS;
- ideiglenes tesztadat: 0;
- Object Storage és valódi fájlfeltöltés: továbbra is tiltott.

## DROP 0.3.3 privát Storage Core – kézi SQL-re vár

- candidate build: `LucQT03AEvrKCrs-08Psm`;
- candidate könyvtár: `.next_candidate_drop_v033_pre_sql_final`;
- SQL: `supabase/DIMPRO_DROP_033_PRIVATE_STORAGE_BOOTSTRAP.sql`;
- SHA256: `253ceb07d7620ca84a909ccc1882b9841f38d061743bf2f7e60ba92793d17d9d`;
- Storage Core és karanténfeltöltés feature flag: false;
- privát streaming tárhelymotor: elkészült;
- térsession- és capability-feltöltés: elkészült;
- SHA-256, MIME és ZIP ellenőrzés: elkészült;
- víruskereső hiányában letöltés: tiltott;
- pre-SQL preflight: 7/7 PASS;
- candidate smoke: 11/11 PASS;
- fájl/session/kvótafoglalás pre-SQL állapotban: 0;
- éles DROP 0.3.2 változatlanul működik.

## DROP 0.3.3 privát karanténfeltöltés – éles

- éles build: `CqdDLmk_TTMiuN1VGJLQo`;
- előző build: `X9Jxtcs2lSP1Y6ynq6dKf`;
- rollback: `.next_before_drop_v033_20260802_003654`;
- storage schema: `DROP 0.3.3`, `migration_count=1`;
- `DROP_STORAGE_CORE_ENABLED=true`;
- `DROP_QUARANTINE_UPLOAD_ENABLED=true`;
- privát tárhely: `.data/drop-storage`, jogosultság `0700`;
- térsessiones és capability-linkes feltöltés: aktív;
- fájlonkénti limit: 9 MB;
- streaming, SHA-256, MIME és ZIP ellenőrzés: aktív;
- víruskereső: nincs;
- karanténfájl letöltése: tiltott;
- teljes FileDrop/KépDrop/ZIP release: zárt;
- post-SQL preflight: 7/7 PASS;
- candidate és éles smoke: 11/11 PASS;
- éles HTTPS feltöltés: PASS;
- ideiglenes tesztadat: 0.

## DROP 0.3.4 folytatható multipart feltöltés – kézi SQL-re vár

- candidate build: `nDFH9It3S1XJ4NS7o4NHO`;
- candidate könyvtár: `.next_candidate_drop_v034_pre_sql`;
- backup: `backups/drop_v034_chunked_upload_20260802_005537`;
- teljes fájl maximum: 500 MB;
- alapértelmezett részméret: 64 MB;
- Nginx részkorlát sablon: 70 MB;
- megszakítás utáni folytatás: elkészült;
- csak a hiányzó részek újraküldése: elkészült;
- részenkénti és teljes SHA-256: elkészült;
- helyi adapteres összefűzés: PASS;
- Hetzner S3-kompatibilis adapter: előkészítve, még nincs konfigurálva;
- `DROP_RESUMABLE_UPLOAD_ENABLED=false`;
- adatbázismarker továbbra is `DROP 0.3.3`;
- SQL: `supabase/DIMPRO_DROP_034_RESUMABLE_MULTIPART_BOOTSTRAP.sql`;
- SHA256: `d95c08ee60df0732cedf7e1dc4887fc8615408a99ddcc6fdbd6077213f2fdab5`;
- pre-SQL preflight: 7/7 PASS;
- candidate smoke: 11/11 PASS;
- éles DROP 0.3.3 változatlanul működik.

## DROP 0.3.4 – 500 MB-os folytatható multipart feltöltés – éles

- kiadás dátuma: 2026-08-02;
- Fejlesztési / License Központ verzióazonosító: `version_9fd09863-b28`;
- állapot a Fejlesztési Központban: `released`;
- éles build: `6T1br1RsNy0bI7MGOb-UB`;
- előző build: `CqdDLmk_TTMiuN1VGJLQo`;
- rollback: `.next_before_drop_v034_20260802_002440`;
- adatbázisséma: `DROP 0.3.4`, `migration_count=2`;
- `DROP_RESUMABLE_UPLOAD_ENABLED=true`;
- maximális fájlméret: 500 MB;
- alapértelmezett részméret: 64 MB;
- Nginx részfeltöltési korlát: 70 MB, kizárólag a multipart részútvonalon;
- folytatási ablak: legfeljebb 24 óra, a csomag vagy meghívó korábbi lejáratával korlátozva;
- megszakítás után csak a hiányzó részek töltődnek újra;
- részenkénti és teljes SHA-256-ellenőrzés: aktív;
- MIME-, kiterjesztés- és ZIP-biztonsági ellenőrzés: aktív;
- privát karantén: aktív;
- víruskereső: még nincs bekötve;
- karanténfájl letöltése: tiltott;
- Hetzner Object Storage adapter: előkészítve, de a bucket és a kulcsok még nincsenek konfigurálva;
- jelenlegi tárhelyprovider: `local-private`;
- feltöltési szabályzat: `DIMPRO-DROP-UPLOAD-HU-1.0`;
- szabályzat elfogadása a feltöltés előtt kötelező;
- elfogadás és folytatáskor történő újbóli megerősítés auditálva;
- rövid felhasználói kártyák: 500 MB/fájl, folytathatóság, PIN/jogosultságvédelem, megőrzés;
- roadmap-jelzés: „Hamarosan: akár 2 GB / fájl”;
- post-SQL preflight: 9/9 PASS;
- legacy DROP regresszió: PASS;
- candidate és éles smoke: 11/11 PASS;
- candidate és éles böngészőteszt: PASS, browser/console hiba 0;
- éles HTTPS + TLS + Nginx 65 MB-os teszt: PASS;
- valós részméretek az éles tesztben: 64 MB + 1 MB;
- teljes SHA-256 egyezés: PASS;
- tesztadat- és tesztfájltakarítás: PASS.


## DROP 0.6.0 – aktív munkatér, feltöltés és megjegyzések – éles

- kiadás dátuma: `2026-08-03`;
- futási szint: `private-pilot`;
- éles build: `7f0bXP2n3gDBocotBKRcp`;
- aktív release: `.next-v060-release-final`;
- előző rollback release: `.next-v050-release-final`;
- KépDrop, FájlDrop, ZIP, vegyes csomag és megjegyzések: **aktív**;
- közvetlen Hetzner S3 multipart feltöltés: **PASS**;
- ClamAV és teljes fájl SHA-256: **PASS**;
- tiszta fájl signed letöltése és bájtegyezése: **PASS**;
- e-mail egységteszt és valós SMTP-integráció: **PASS**;
- szerződésellenőrzés: **47/47 PASS**;
- TypeScript: **PASS**;
- ESLint: **0 hiba**;
- desktop, tablet és mobil böngészőteszt: **PASS**;
- browser/console/network hiba: **0**;
- tesztadat- és S3-maradvány: **0**;
- rollback: `scripts/rollback-drop-v060-release.sh`;
- részletes dokumentáció: `93_dimpro_drop_workspace_upload_comments_v060.md`;
- PDF-riport és Drive-archiválás: külön következő fejlesztési kör, továbbra is zárva.

## DROP 0.7.0 – automatikus végleges PDF-riport – éles

- kiadás dátuma: `2026-08-04`;
- futási szint: `private-pilot`;
- éles build: `lik1aQUxewddN4Exr6lwl`;
- aktív release: `.next-v070-release-final`;
- előző rollback release: `.next-v060-release-final`;
- `DROP_PDF_REPORT_ENABLED=true`;
- automatikus A4-es végleges PDF a feltöltés lezárásakor: **aktív**;
- fájljegyzék, biztonsági állapot, képmelléklet és megjegyzések: **aktív**;
- privát Hetzner S3 riporttárolás: **aktív**;
- címzettenkénti idempotens SMTP-kézbesítés: **aktív**;
- frissességi kapu és automatikus érvénytelenítés: **aktív**;
- retention törlés csak friss, kézbesített riport után: **aktív**;
- riport-tokenes időkorlátos PDF-letöltés: **aktív**;
- szerződésellenőrzés: **37/37 PASS**;
- teljes TypeScript és production build: **PASS**;
- ESLint: **0 hiba**;
- valós S3 + ClamAV + képes PDF + SMTP E2E: **PASS**;
- lefordított éles worker E2E: **PASS**;
- desktop, tablet és mobil böngészőteszt: **PASS**;
- browser/console/network hiba: **0**;
- tesztadat- és S3-maradvány: **0**;
- rollback: `scripts/rollback-drop-v070-release.sh`;
- részletes dokumentáció: `94_dimpro_drop_automatic_pdf_report_v070.md`.

## DROP 0.8.0 – tartós DIMPRO Drive archiválás – éles

- kiadás dátuma: `2026-08-04`;
- futási szint: `private-pilot`;
- éles build: `TAvdt6fCmIXa75CPiBxPT`;
- aktív release: `.next-v080-release-final`;
- előző rollback release: `.next-v070-release-final`;
- `DROP_DRIVE_ARCHIVE_ENABLED=true`;
- külön Hetzner Drop és Drive bucket: **aktív**;
- külön Drop és Drive hozzáférési kulcs: **aktív**;
- szerveroldali streamelt objektummásolat és méretellenőrzés: **aktív**;
- ClamAV-tiszta fájlok tartós Drive-archiválása: **aktív**;
- végleges PDF-riport tartós Drive-archiválása: **aktív**;
- automatikus Drive mappastruktúra: **aktív**;
- idempotens archiválás és hiányzó objektum visszaállítása: **aktív**;
- retention törlés kötelező Drive-archívumig blokkolva: **aktív**;
- Drive globális mód továbbra is `quarantine`;
- kizárólag `source=DROP`, `AVAILABLE` verziók megbízható letöltése: **aktív**;
- védett archívumállapot API és responsive UI-kártya: **aktív**;
- szerződésellenőrzés: **44/44 PASS**;
- teljes TypeScript és production build: **PASS**;
- ESLint: **0 hiba**;
- candidate és éles compiled worker E2E: **PASS**;
- Drive-példány működése Drop-törlés után: **PASS**;
- desktop, tablet és mobil böngészőteszt: **PASS**;
- browser/console/network hiba: **0**;
- tesztadat- és objektummaradvány: **0**;
- rollback: `scripts/rollback-drop-v080-release.sh`;
- részletes dokumentáció: `95_dimpro_drop_drive_archive_v080.md`.

## DROP 0.9.0 – Mobil PWA és egységes asztali feltöltő

**Kiadás:** 2026. augusztus 4.  
**Build:** `t7E8Qgp0eEc8siO48RQqy`  
**Állapot:** éles private-pilot kiadás.

Elkészült a telepíthető DIMPRO Drop mobil PWA és az egységes mobil–asztali feltöltő. Mobilon Galéria és Kamera, asztalon/tableten drag & drop és tallózás használható. A két felület ugyanazt a biztonságos Drop csomag-, jogosultság-, Object Storage-, ClamAV-, PDF-riport- és Drive-archiválási motort használja.

Fő funkciók:

- többképes galériaválasztás;
- kamerás helyszíni képbevitel;
- képcsoport létrehozása és kiválasztása;
- automatikus képoptimalizálás;
- HEIC/HEIF kompatibilitási kísérlet és biztonságos fallback;
- EXIF/GPS eltávolítás;
- eredeti és mentett méret auditálása;
- méretmegtakarítás megjelenítése a felületen és PDF-ben;
- privát válaszokat nem cache-elő PWA service worker;
- Android és iOS telepítési folyamat;
- egyszerű, alapból összecsukott haladó beállítások.

Ellenőrzési eredmény:

- szerződés: 44/44 PASS;
- TypeScript: PASS;
- teljes lint: 0 hiba;
- production build: PASS;
- desktop/tablet/mobil: PASS;
- valós Hetzner feltöltés és ClamAV: PASS;
- 82%-os mintakép-megtakarítás: PASS;
- automatikus 5 oldalas PDF-riport: PASS;
- tesztadat- és S3-maradvány: 0.

Részletes dokumentáció: `96_dimpro_drop_mobile_pwa_v090.md`.

## DROP 0.9.1 – Képcsoport-alapú Drive mappák és egyszerűsített Drive nézet

**Kiadás:** 2026. augusztus 5.  
**Állapot:** éles private-pilot kiadás.  
**Build:** `eraossim390Jvj_vFLA4i`.

A mobil KépDrop képcsoportjai most valódi DIMPRO Drive almappákba kerülnek. A csomagmappa alatt képcsoportonként külön mappa jön létre, a csoport nélküli fájlok pedig `Csoport nélkül` mappába kerülnek. A végleges PDF a csomagmappa gyökerében marad.

A korábbi archívumdokumentumok ismételt archiváláskor új tárhelymásolat nélkül, auditált mappakapcsolat-frissítéssel rendeződnek át. A művelet a Drive Desktop szinkronkurzora számára is változáseseményt készít.

A webes Drive felület egyszerűsödött:

- négy közérthető főmutató;
- technikai státuszok összecsukható haladó részben;
- teljes mappaágat mutató dokumentumlista;
- almappakártyák;
- Drop / saját fájlok forrásszűrő;
- külön Drop forrásjelölés;
- recursive fájlszám a mappalistában.

Ellenőrzés:

- szerződés: 25/25 PASS;
- TypeScript: PASS;
- valós Supabase + két Object Storage + ClamAV + PDF teszt: PASS;
- 3 képcsoportmappa és 4 Drive dokumentum: PASS;
- meglévő dokumentum auditált átrendezése: PASS;
- idempotencia és duplikációvédelem: PASS;
- teljes automatikus teszttakarítás: PASS.

Részletes dokumentáció: `97_dimpro_drop_drive_group_folders_v091.md`.

## DROP 0.9.2 – Élő kezdőoldal és PIN-helyreállítás

**Kiadás:** 2026. augusztus 5.  
**Állapot:** éles private-pilot kiadás.  
**Build:** `aFb7RffMl_D2YAX6xnu5x`.

A Drop kezdőoldal a korábbi statikus „feltöltés tiltva” bemutatóállapot helyett a valós feature flag-, Object Storage- és ClamAV-készültséget mutatja. A KépDrop, FájlDrop, ZIP és vegyes csomag aktív állapotban a hozzáférési kapura vezet.

A PIN-helyreállítás egyedi kérésazonosítót, belső eredménynaplót és csomagszintű elutasítási auditot kapott. A rate limit csak sikeres küldést számol. A régi PIN csak valódi SMTP-küldési hiba esetén áll vissza; egy már elküldött új PIN-t későbbi naplóhiba nem érvényteleníthet.

Ellenőrzés:

- szerződés: 23/23 PASS;
- TypeScript: PASS;
- Drive SMTP profilteszt: PASS;
- ideiglenes csomagos valós PIN-e-mail: PASS;
- jogosulatlan cím audit: PASS;
- rate limit és audit: PASS;
- tesztadat-takarítás: PASS.

Részletes dokumentáció: `98_dimpro_drop_access_landing_pin_v092.md`.

Éles hotfix ellenőrzés: publikus PIN API HTTP 202; publikus worker és admin API HTTP 404; desktop/tablet/mobil PASS; mobil overflow 0; valós SMTP PIN-kézbesítés PASS.

## DROP 0.9.3 – Másodpercalapú robotvédelem

**Kiadás:** 2026. augusztus 5.  
**Állapot:** éles private-pilot kiadás.  
**Build:** `DPUM3KVVvXAQCr3z3fqGN`.  
**Fejlesztési Központ idő:** 68 perc.

A feltöltés két jogosultsági ágán szerveridős, egyszer használható upload-intent kötelező. A 400 ms alatti session-indítás blokkolódik, 400–1500 ms között várakoztatás történik, 1500 ms felett indulhat a feltöltés. Honeypot, replay-védelem, csomag- és munkamenet-kötés, öt aktív sessiones limit, batch rate limit és Nginx API-limit került bevezetésre.

Ellenőrzés:

- viselkedési motor: 18/18 PASS;
- forrásszerződés: 44/44 PASS;
- TypeScript: PASS;
- Nginx konfiguráció: PASS;
- Fejlesztési Központ: DROP 0.9.2 `released`, DROP 0.9.3 `released`, lezárt 68 perces időmérővel.

Részletes dokumentáció: `99_dimpro_drop_robot_guard_v093.md`.

Éles ellenőrzés: teljes mobil HTTPS feltöltés PASS; kliens 1588 ms, szerver 2108 ms; 400 ms alatti támadás 429; honeypot 403; Nginx rate limit 429; Hetzner CORS és ClamAV PASS; maradvány 0.

## DROP 0.9.4 – CsomagDrop, Beküldőkapu és DIMPRO Send

**Kiadás:** 2026. augusztus 5.  
**Állapot:** éles private-pilot release.

A meglévő 500 MB-os meghívásos rendszer végleges neve DIMPRO CsomagDrop. Az új DIMPRO Beküldőkapu személyes, projekt- és szervezeti kaput biztosít előre rögzített címzettekkel. Az új DIMPRO Send hatjegyű küldési jogosultsági kóddal 250 MB-os küldeményt továbbít szabadon megadott címzetteknek.

Közös funkciók:

- DIMPRO HexaUpload drag & drop;
- mobil Galéria és Kamera;
- képméretcsökkentés és EXIF/GPS eltávolítás;
- rövid üzenet, csomag- és fájlmegjegyzések;
- link vagy link + hatjegyű letöltési PIN;
- Human Timing Gate és honeypot;
- Nginx rate limit;
- privát S3, karantén és ClamAV;
- címzettenkénti e-mail;
- megjegyzések a letöltési oldalon.

Ellenőrzés:

- publikus core: 39/39 PASS;
- forrásszerződés: 133/133 PASS;
- TypeScript: PASS;
- célzott ESLint: 0 hiba;
- Nginx: PASS.

Részletes dokumentáció: `100_dimpro_drop_product_family_v094.md`.

Éles release: `.next-v094-release-final`, build `0SJxGLTishQHSil9kxYtI`. Fejlesztési Központ: `released`, 146 perc. Candidate és éles HTTPS E2E, ClamAV, SMTP, Secure PIN-proof, SHA-256 letöltés és maradványaudit PASS.

## DROP 0.9.5 – Központi PostgreSQL workflow-tár

**Fejlesztés:** 2026. augusztus 5.  
**Állapot:** éles PostgreSQL release.

A DIMPRO Send és Beküldőkapu publikus jogosultsági állapota központi PostgreSQL-adaptert kapott. A séma hiányában a meglévő `0700/0600` jogosultságú fájltár változatlanul működik. A séma és az ellenőrzött import után a rendszer PostgreSQL-re zárol, többpéldányos működésre alkalmassá válik, és adatbázishiba esetén fail-closed módon leáll ahelyett, hogy csendben a régi fájltárba írna.

Fő elemek:

- öt új központi tábla;
- RLS és service-role-only hozzáférés;
- atomi session–csomag és kvótafoglalás;
- atomi finalizálási zár;
- idempotens fájltár-import;
- helyi és adatbázis aktiválási marker;
- automatikus üres-store aktiválás;
- admin SQL-letöltés és migrációs panel;
- részletes health/readiness;
- `DROP_PUBLIC_STORE_MODE=auto`.

Ellenőrzések:

- PostgreSQL szerződés: 115/115 PASS;
- fallback: 12/12 PASS;
- 0.9.4 core regresszió: 39/39 PASS;
- forrás-runtime séma nélkül: PASS;
- TypeScript: PASS;
- célzott ESLint: 0 hiba.

Részletes dokumentáció: `101_dimpro_drop_postgres_workflow_store_v095.md`.

Fejlesztési Központ: `released`, 118 perc. Éles build: `SP_JZkDQCPf4sjWDlcOXD`, release `.next-v095-release-final`. A bootstrap SQL sikeresen lefutott; 5/5 tábla és 5/5 RPC READY. A PostgreSQL-store aktív, többpéldányos működésre kész és fail-closed. Candidate és éles PostgreSQL E2E, csomaglétrehozási race hotfix, finalizálási race, S3, ClamAV, SMTP, PIN és SHA-256 PASS; maradvány 0.

Éles fallback release: `.next-v095-release-final`, build `Azm5OHYOuDCOiSe1LWipJ`, 88 oldal, 70 chunk. Candidate API, publikus desktop/tablet/mobil, adminpanel, Object Storage, ClamAV, SMTP, PIN-proof és SHA-256 letöltés PASS. Tesztmaradvány 0. A 0.9.5 fájltári fallbackben éles, de a központi PostgreSQL-store még nem aktív. A Fejlesztési Központ kézi Supabase SQL-lépésre váró `blocked` állapotban marad.

## DROP 0.9.6 – üzemeltetési monitor, képelőnézet és kézbesítési korrekció

**Dátum:** 2026. augusztus 5.  
**Részletes dokumentáció:** `100_dimpro_drop_operations_heic_delivery_v096.md`

- új Drop üzemeltetési központ gyors és mély S3-audittal;
- 15 perces worker-monitor, előzménytár és adminriasztás;
- Send/Beküldőkapu bélyegképes, 1/2/3 oszlopos képkártya-rács;
- képenként közvetlenül szerkeszthető megjegyzés és nagyított előnézet;
- HEIC/HEIF → JPG kliensoldali konverzió `heic-to/csp` modullal;
- kiterjesztésalapú HEIC-felismerés hibás vagy hiányzó MIME-típus esetén;
- publikus workflow-knál fájlonkénti aktivitási e-mail automatikus tiltása;
- címzettenként egy összesített végleges kézbesítési levél;
- a csak linkes címzetti letöltőútvonal változatlanul közvetlen és PIN-mentes;
- részleges vagy hibás kézbesítés automatikus vak újraküldése tiltva;
- üzemeltetési/HEIC/e-mail szerződés: 175/175 PASS;
- scanner-gyorsítási szerződés: 27/27 PASS;
- összes szerződéses ellenőrzés: 202/202 PASS;
- valós HEIC teszt: 1,89 MB → 554 KB, 71% megtakarítás, bélyegkép PASS;
- azonnali systemd scanner-trigger, két párhuzamos ClamAV-vizsgálat és képfájl-prioritás;
- candidate scanner: 3,13 s; éles scanner: 2,82 s;
- éles release: `.next-v096-release-final`, build `EOIQ3qRnfiH1efAwdZT58`;
- rollback: `.next-v095-release-final`, `scripts/rollback-drop-v096-release.sh`;
- Fejlesztési Központ: `released`, 229 perc, nyitott időmérő 0.

## DROP 0.9.7 – mobil navigáció és képernyő-ébrentartás

**Dátum:** 2026. augusztus 6.  
**Részletes dokumentáció:** `102_dimpro_drop_mobile_dock_wake_lock_v097.md`  
**Állapot:** éles private-pilot release.

- 5 elemes, safe-area képes lebegő mobil dokk;
- középső hexagon Feltöltés gyorsmenü;
- Galéria, Kamera és fájltallózás globális megnyitása aktív feltöltőnél;
- virtuális billentyűzet és külső modal esetén automatikus dokkelrejtés;
- tokenes letöltő/feltöltő/jelentés útvonalakon rejtett globális navigáció;
- automatikus Screen Wake Lock kép-előkészítés, feltöltés és finalizálás közben;
- manuális ébrentartási kapcsoló és PWA-alapértelmezés;
- háttérből visszatéréskori automatikus újrakérés;
- nem támogató vagy energiatakarékos böngészőn biztonságos fallback;
- PWA gyorsparancsok: Send, Megnyitás, Beküldőkapu;
- service worker cache: `dimpro-drop-static-v097`;
- PostgreSQL workflow-séma: változatlanul DROP 0.9.5.

Forrásellenőrzés:

- mobil/PWA/Wake Lock szerződés: 63/63 PASS;
- 0.9.6 üzemeltetési/HEIC/e-mail regresszió: 175/175 PASS;
- scanner regresszió: 27/27 PASS;
- összesen: 265/265 PASS;
- TypeScript: PASS;
- teljes ESLint: 0 hiba, 113 korábbi figyelmeztetés;
- production build: 88 oldal, 72 statikus chunk;
- éles release: `.next-v097-release-final`, build `MeShA63db3FLJwzqqCul_`;
- rollback: `.next-v096-release-final`, `scripts/rollback-drop-v097-release.sh`;
- candidate és éles mobil shell, Wake Lock, Galéria gyorsművelet, billentyűzet/modal és PWA regresszió: PASS;
- tesztmaradvány: 0;
- új csevegés átadás: `103_dimpro_drop_new_chat_handoff_after_v097.md`.
- Fejlesztési Központ: `released`, 77 perc, nyitott időmérő 0.

## DROP 0.9.8 – offline mobil helyreállítás, ismételt kamera és e-mailes képelőnézet

**Dátum:** 2026. augusztus 6.  
**Részletes dokumentáció:** `104_dimpro_drop_offline_mobile_v098.md`  
**Állapot:** production candidate ellenőrzött; éles aktiválás előkészítve.  
**Candidate build:** `khbESIjmxOVR6sLeA8lEE`.

Fő fejlesztések:

- tokenmentes IndexedDB feltöltési sor;
- oldalfrissítés utáni publikus session- és csomaghelyreállítás;
- Wi‑Fi/mobilinternet váltás kontrollált újrakötéssel;
- valódi szerverelérhetőségi monitor és automatikus retry;
- multipart checkpoint és kész partok kihagyása;
- PWA-frissítésjelzés, Background Sync kliensébresztés és helyi elkészült értesítés;
- determinisztikus PWA-kezdőállapottal megszüntetett React hydration mismatch;
- minden kamerafotó után új natív kamera-input és `Újabb fotó` munkafolyamat;
- azonos nevű kamerafájl ismételt elfogadása;
- privát Object Storage-ból szerveroldalon készített 180 × 120 px JPEG e-mail-előnézet;
- legfeljebb 6 `cid:` inline kép címzettenként;
- eredeti fájlok e-mail-mellékletként történő küldésének tiltása;
- előnézetkészítési hiba esetén fájlkártyás e-mail fallback.

Ellenőrzések:

- TypeScript: PASS;
- teljes lint: 0 hiba, 113 korábbi figyelmeztetés;
- szerződések: 447/447 PASS;
- production build: 88 oldal, 73 statikus chunk;
- négy publikus oldalon hydration/page/console hiba: 0;
- két egymást követő kamerakép + IndexedDB + reload + offline/online: PASS;
- sessioncookie-alapú resume és hálózati újrakötés: PASS;
- 65 MB-os valódi S3 multipart megszakítás/folytatás: PASS;
- privát S3 képelőnézet, 6 képes limit, fallback és helyi MIME: PASS;
- tesztadat- és Object Storage-maradvány: 0.

Fennmaradó ellenőrzés: fizikai iPhone/Android, energiatakarékos mód és valódi levelezőkliensek kézi private-pilot tesztje.

### DROP 0.9.8 éles release

**Élesítve:** 2026-08-06T14:00:05.853Z  
**Aktív release:** `.next-v098-release-final`  
**Build:** `khbESIjmxOVR6sLeA8lEE`  
**Rollback:** `.next-v097-release-final` / `scripts/rollback-drop-v098-release.sh`

Az éles HTTPS-, health-, PWA-, hydration- és ismételt kamerás IndexedDB helyreállítási ellenőrzések PASS állapotúak. Az e-mailes képelőnézet aktív, legfeljebb 6 darab 180 × 120 px JPEG `cid:` képpel; az eredeti fájlok nem kerülnek e-mail-mellékletként kiküldésre. Külső teszt-e-mail nem ment ki. Fizikai mobilkészülék és valódi levelezőkliens kézi private-pilot validációja még szükséges.

## DROP 0.9.9 – e-mail kliensvalidáció, ZIP-tömeges letöltés és egységes PWA ikon

**Élesítve:** 2026. augusztus 6.  
**Állapot:** éles private-pilot release.  
**Részletes dokumentáció:** `105_dimpro_drop_email_validation_zip_pwa_icons_v099.md`  
**Új csevegés átadás:** `106_dimpro_drop_new_chat_handoff_after_v099.md`

Fő fejlesztések:

- az éles címzetti sablont használó, 8 levelezőkliens-profilt kezelő admin validációs központ;
- kézi címzett, `TESZT` megerősítés, 60 másodperces címzettkorlát és napi 20 teszt;
- 3 CID-képes, 5 fájlkártyás böngészős előnézet;
- több fájl egyetlen, jogosultságvédett és streamelt ZIP-ben;
- maximum 500 fájl / 2 GB;
- `DIMPRO_DROP_fajllista.txt` manifest SHA-256 értékekkel és megjegyzésekkel;
- fájlonkénti ZIP-letöltési audit és csomagesemények;
- webes Drop faviconból generált, verziózott 32/180/192/512 és maskable PWA ikoncsomag;
- Apple Touch, gyorsparancs- és értesítési ikonok egységesítése;
- service worker cache: `dimpro-drop-static-v099-icons`.

Ellenőrzés:

- 648/648 deklarált szerződéses/runtime ellenőrzés PASS;
- TypeScript PASS;
- teljes ESLint 0 hiba, 113 korábbi figyelmeztetés;
- production build: 88 oldal, 73 statikus chunk;
- candidate és éles 13 fájlos ZIP E2E 13/13 SHA-256 PASS;
- compiled és éles e-mail panel 8 kliens / 3 kép / 5 fájlkártya PASS;
- candidate és éles favicon/PWA ikon HTTP, manifest és metadata PASS;
- ClamAV PONG;
- tesztmaradvány 0;
- külső teszt-e-mail 0.

Éles release: `.next-v099-release-final`, build `C1O7K6FBn329lzLVSvrjA`. Közvetlen rollback: `.next-v098-release-final`, `scripts/rollback-drop-v099-release.sh`.
Fejlesztési Központ: `version_8dd0f4dd-198`, `released`, 153 perc, nyitott időmérő 0.

## Összesített fejlesztési állapot – 2026. augusztus 6.

A százalékok a jelenlegi működő, dokumentált és tesztelt funkciók alapján becsült készültségi értékek.

| Rendszer | Jelenlegi szint | Használhatóság |
|---|---:|---|
| DIMPRO Drop | 94% | Éles private-pilot, fő munkafolyamatok használhatók. |
| DIMPRO Drive backend | 72% | Alap fájl-, projekt-, storage- és archiválási motor használható. |
| DIMPRO Drive webes felület | 58% | Alap műveletek használhatók, további workflow-fejlesztés szükséges. |
| Drive Desktop | 38% | Fejlesztés alatt, teljes szinkron még nem kész. |
| Drop → Drive archiválás | 78% | Backend és biztonsági alap működik, további felületi tesztelés szükséges. |
| Teljes Drop + Drive termékcsomag | 68% | Drop érett, Drive és Desktop további fejlesztést igényel. |

## DROP 1.0.0 candidate – 2026. augusztus 6.

Elkészült a 44 tételes private-pilot validációs központ, a Gyors KépSend, az egységes Nagy/Közepes/Kicsi/Eredeti képméretprofil, a GPS/EXIF törlés vagy megőrzés, a biztonságos galériatörlési emlékeztető, az egysoros hatjegyű kódmező és a hatodik számjegy utáni automatikus belépés.

Candidate BUILD_ID: `J2YKT8CWA6eE236IRTytr`. Az éles release változatlanul DROP 0.9.9. Tesztek: 147/147 szerződés, 16/16 böngésző, TypeScript, célzott lint és build PASS. Preflight: 20 PASS, 1 tárhely-warning, 0 FAILED.

A DROP 1.0.0 production kiadás továbbra is függ a fizikai iPhone/Android, valós levelezőkliens, PIN-es ZIP, képernyőolvasó, backup-restore és rollback validációtól.

## DROP 1.1.0 candidate – licencalapú Send, modulmagyarázatok és publikus képcsoportok

**Dátum:** 2026. augusztus 6.  
**Állapot:** candidate forrásfejlesztés elkészült; private-pilot build- és böngészővalidáció következik.  
**Részletes dokumentáció:** `109_dimpro_drop_send_entitlement_groups_v110.md`.

Elkészült:

- a Drop kezdőlapon mind a négy termékhez állandó `Mikor ezt válassza?`, `Hozzáférés` és DIMPRO Drive-magyarázat;
- `admin@dimpro.hu` technikai hozzáférési kapcsolattartás;
- a Send-kód új `ABCD-123-456` formátuma automatikus nagybetűsítéssel, kötőjelekkel és automatikus ellenőrzéssel;
- meglévő DIMPRO-licenchez, névhez és regisztrációs e-mail-címhez kötött Send-jogosultság;
- hitelesített, nem szerkeszthető feladói adatok;
- zárolt alapcímzett, jóváhagyott címzettlista és szabad címzett mód;
- külön Normál Send, Gyors KépSend, képcsoport és fájlmegjegyzés feature-jogosultság;
- látható, de inaktív projektlista- és `PRJ-26-K7M-4Q9` kódmező;
- publikus capability-védett képcsoport API;
- aktív helyszínmappa, visszaválasztható korábbi csoport, kamera/galéria hozzárendelés és offline group-megőrzés;
- átmeneti, szerveroldali `0700/0600` Send-profil kompatibilitási tár a központi Supabase felhasználói adatbázis elkészültéig;
- régi hatjegyű private-pilot Send-kódok átmeneti kompatibilitása.

Ellenőrzés:

- új Send-jogosultsági teszt: 24/24 PASS;
- korábbi publikus workflow regresszió: 39/39 PASS;
- TypeScript: PASS;
- módosított fájlok ESLint: PASS;
- teljes lint: 0 hiba, 113 korábbi figyelmeztetés.

A projekt Beérkező Drop továbbítás továbbra is inaktív, és csak a külön fejlesztett központi felhasználói/licenc-/projektadatbázis bekötése után aktiválható.

## DROP 1.2.2 – kézi központi licenckód és teljes Send adminfolyamat – éles

**Kiadás:** 2026. augusztus 7.  
**Állapot:** éles private-pilot release.  
**Éles release:** `.next-v122-release-final`  
**BUILD_ID:** `r2ZFL-goBnOHXH_veTf8a`  
**Rollback:** `.next-v121-release-final`  
**Részletes dokumentáció:** `112_dimpro_drop_v122_manual_license_send_release.md`

A központi DIMPRO Licencközpont és a Drop Send-admin most már teljes használati láncot biztosít: a licencadmin saját `LIC-ÉÉ-XXXX-XXXX` kódot adhat meg, a licencet közvetlenül a LIVE Identity Core `dimpro_licenses` táblába hozhatja létre, majd ugyanazon felületen saját `ABCD-123-456` Send-kódot és entitlementet rendelhet hozzá. Automatikus licenckód- vagy Send-kódgenerálás nem kötelező. A duplikált licenckód tiltott, a Send-kód nyers formája nem kerül központi adatbázisba, a műveletek auditáltak.

Ellenőrzés: licenc/Send Supabase E2E 13/13 PASS; candidate, release és production admin böngésző E2E 14/14 PASS; teljes S3/ClamAV/projekt/album/ZIP E2E 42/42 PASS; Send regresszió 24/24 PASS; Identity szerződés 55/55 PASS; kamera/e-mail 58/58 PASS; private-pilot validáció 97/97 PASS; Identity Core 12/12 READY; TypeScript PASS; teljes ESLint 0 hiba; tesztmaradvány 0/0/0. A release továbbra is private pilot, GA=false.


## DROP 1.2.3 – központi Send felhasználó és használható Send-kód – éles

Dátum: 2026-08-08. Fejlesztési Központ: `version_53f700a6-ed8`, `released`. Éles release: `.next-v123-release-final`, BUILD_ID `Vgc0cCBB8Qp0ZHQmPY8g5`, rollback `.next-v122-release-final`.

A Send adminfelületen új vagy meglévő központi Identity Core felhasználó kezelhető névvel, e-maillel, opcionális telefonnal és szervezettel. Azonos e-mail esetén nincs duplikált user; a meglévő rekord frissül és Send-használatra aktiválható. A licencválasztás most az aktiválási és lejárati időt is ellenőrzi. A saját Send-kód létrehozása után ugyanazzal a kóddal a `/send` felületen tényleges belépés történik.

Validáció: TypeScript PASS; teljes ESLint 0 hiba / 107 meglévő warning; build exit 0; backend 11/11 + meglévő user aktiválás 7/7; candidate/release/live browser E2E 16/16; teljes S3/ClamAV/album/ZIP E2E 42/42; regresszió 24/24 + 55/55 + 58/58 + 97/97; Identity Core 12/12 READY. Aktiválási backup: `backups/drop_v123_release_activation_20260807_222244`; forrásbackup: `backups/drop_v123_final_pre_release_20260807_222025`. Részletes release-jegyzőkönyv: `113_dimpro_drop_v123_central_user_send_release.md`.

## DROP 1.2.4 – Gyors KépSend UX és letöltőalbum – éles

**Dátum:** 2026-08-08.  
**Fejlesztési Központ:** `version_17dec28a-eee`, `released`.  
**Éles release:** `.next-v124-release-final`.  
**BUILD_ID:** `6DvBEXmmNeLGfj8gs7dw9`.  
**Rollback:** `.next-v123-release-final`.  
**Részletes dokumentáció:** `114_dimpro_drop_v124_quick_send_ux_release.md`.

A Gyors KépSend használhatósági köre lezárva: saját e-mail alapcímzett, opcionális további címzettek és üzenet; alapértelmezett rendezett fotónév `F0001` sorszámmal; összes kép/csoport/képenkénti megnevezés; összecsukott kártyás megjegyzés; queue-visszavonás és drag&drop törlés; küldés utáni következő lépések; letöltőoldali küldési összefoglaló; S3 album-preview CSP javítás; megszakítható és Chromium alatt mentési hely kiválasztása után induló ZIP.

Validáció: TypeScript PASS; teljes lint 0 error; UX 14/14; Identity 55/55; candidate/release/production browser E2E 19/19; teljes S3/ClamAV/album/ZIP E2E 43/43; Identity Core 12/12 READY; live HTTPS 200; tesztmaradvány 0. Private pilot marad, GA=false.

## 2026-08-08 – DROP 1.2.5 private-pilot release

Éles release: `.next-v125-release-final`  
BUILD_ID: `ivMzYTCL57pVKLlMYYPDJ`  
Állapot: released / private pilot, GA=false.  
Fő újdonságok: 30 képes e-mail preview, Send-címjegyzék, 5 további Gyors KépSend címzett, első 3 használatos szabályelfogadás, logikai képcsoportok, opcionális ZIP/Drive csoportmappák, PDF/TXT csomagriport és ZIP-integráció.  
Részletes release dokumentum: `115_dimpro_drop_v125_send_groups_reports_release.md`.

## DROP 1.2.6 – biztonságos Send-folyamat, PDF/TXT és hangos megjegyzés – éles

**Dátum:** 2026-08-08.  
**Fejlesztési Központ:** `version_6b9c95bc-c3b`.  
**Éles release:** `.next-v126-release-final`.  
**BUILD_ID:** `RyRkEq_beVb7vBcg-l4NR`.  
**Rollback:** `.next-projectgate-shortcut-v0901-release-final`.  
**Részletes dokumentáció:** `116_dimpro_drop_v126_send_safety_pdf_voice_release.md`.

A feltöltés már nem finalizál automatikusan: külön 2 mp-es feltöltés és külön 2 mp-es végleges küldés van, további feltöltés- és lebegő csoportkezelővel. A külön PDF/TXT letöltés javítva, a ZIP-ben a PDF/TXT külön kapcsolható, a PDF 1/2/4/6 képes A4 elrendezést és riportkép-optimalizálást kapott. Az e-mail preview limit 20 kép, a megnyitógomb felül és alul is látható. A Gyors KépSend licencelt `DROP_QUICK_VOICE_NOTE` device-diktálást kapott 60 mp-es visszaszámlálóval; szerveres hangarchívum és AI nincs benne. Az IndexedDB offline feltöltési sor és multipart folytatás megmaradt, teljes offline Send és offline hangqueue későbbi fejlesztés.

Validáció: TSC PASS; lint 0 error / 108 warning; v1.2.6 contract 24/24; e-mail/ZIP 3/3; private-pilot 99/99; candidate/release/live browser E2E 29/29; teljes S3/ClamAV/PDF/TXT/ZIP E2E 52/52; production Drop/Send/Open/Drive/Projektkapu HTTP 200; Identity 12/12 READY. Private pilot marad, GA=false.

## DROP 1.2.7 – hangátírás, megjegyzés és Send session javítás – éles

**Dátum:** 2026-08-08.  
**Fejlesztési Központ:** `version_79a37084-9e8`.  
**Éles release:** `.next-v127-release-final`.  
**BUILD_ID:** `HCvL04edGt_r4vonVtJZR`.  
**Rollback:** `.next-v126-release-final`.  
**Részletes dokumentáció:** `117_dimpro_drop_v127_voice_session_comment_fix_release.md`.

A Gyors KépSend file- és levélüzenet-diktálása látható felvétel/feldolgozás/kész/hiba állapotot kapott. A karantén/virusellenőrzés alatt álló kép megjegyzése tovább szerkeszthető és véglegesítés előtt szinkronizálódik. A Send package/session mismatch gyökérokát megszüntettük: Send package csak központi Identity azonosítás után, azonos entitlementhez kötve állítható vissza; új küldés forceNew sessiont kap. Candidate és production teljes E2E 58/58 PASS, `notification_status=sent`.

## DROP 1.2.8 – mikrofonengedély és képcsoport-áthelyezés hotfix – éles

**Dátum:** 2026-08-09.  
**Fejlesztési Központ:** `version_e6666fab-ee0`.  
**Éles release:** `.next-v128-release-final`.  
**BUILD_ID:** `9UEmGZhWCN3pgyR6BFvs7`.  
**Rollback:** `.next-v127-release-final`.  
**Részletes dokumentáció:** `119_dimpro_drop_v128_microphone_group_move_hotfix.md`.

A webes diktálás explicit mikrofonengedély-kérést kapott, a Drop host `Permissions-Policy` szabálya `microphone=(self)`. A friss Gyors KépSend csomag azonnal továbbadja a hangjogosultságot, ezért a képkártya Diktálás gombja feltöltés előtt is megjelenik. Minden képkártya külön csoportválasztót kapott, és már feltöltött, vírusellenőrzés alatt álló kép is áthelyezhető másik logikai csoportba szerveroldali `group_id` frissítéssel. A `Csoport nélkül` rendszerkategóriából tömegesen hozható létre új csoport. Validáció: contract 28/28; browser E2E 35/35; teljes S3/ClamAV/finalize/e-mail/PDF/TXT/ZIP E2E 61/61; production browser 35/35; Identity 12/12 READY; tesztmaradvány 0. Private pilot marad, GA=false.

## DROP 1.2.9 – beszédduplikáció, PDF képrács és csoportos kimenetek – éles

**Dátum:** 2026-08-09.  
**Fejlesztési Központ:** `version_99708ea1-aca`.  
**Éles release:** `.next-v129-release-final`.  
**BUILD_ID:** `OdrfWvJQdkRbCvUrznF_9`.  
**Rollback:** `.next-v128-release-final`.  
**Részletes dokumentáció:** `120_dimpro_drop_v129_speech_pdf_groups_release.md`.

A fizikai Samsung/Chrome tesztből azonosított SpeechRecognition-duplikáció javítva: a levélüzenet és képenkénti diktálás közös, `resultIndex`-alapú transcript motort használ overlap-védelemmel, AI nélkül. A PDF 4 képes mód fix 2×2, a 6 képes mód fix 3×2 rács; a hosszú megjegyzés nem ejti vissza az oldalkapacitást. Az e-mail, a biztonságos letöltőalbum, a PDF, a TXT és az opcionális ZIP csoportmappák egységes csoportsorrendet használnak. A webes csoportok alapból mind nyitva vannak, utólag összecsukhatók; a felső csoportösszesítő közvetlenül a blokkhoz navigál és szükség esetén újranyitja azt.

Validáció: contract **28/28**; runtime speech/e-mail/TXT **13/13**; TypeScript PASS; lint **0 error / 108 meglévő warning**; candidate build PASS / 141 chunk; candidate és production browser E2E **37/37**; candidate és production teljes S3/ClamAV/finalize/SMTP/webalbum/PDF/TXT/ZIP E2E **75/75**; valós Bocskai 4 / Kossuth 7 PDF-rács és ZIP-csoportmappa PASS; Identity Core **12/12 READY**; live HTTPS health PASS; tesztcsomag- és tesztfelhasználó-maradvány 0. Private pilot marad, GA=false.


## DROP 1.2.10 – mobil hálózat/scan/e-mail/PDF/diktálás/PWA hotfix – éles

**Dátum:** 2026-08-09.  
**Fejlesztési Központ:** `version_e649e509-6ca`.  
**Éles release:** `.next-v1210-release-final`.  
**BUILD_ID:** `YtYjsCjg5WLQFundZIY8j`.  
**Rollback:** `.next-v129-release-final`.  
**Részletes dokumentáció:** `121_dimpro_drop_v1210_mobile_network_scan_pdf_voice_hotfix.md`.

A fizikai mobiltesztből azonosított hotfix kezeli a Wi-Fi/mobilnet átmenetet és a resume deduplikálását; a 425 vírusellenőrzési várakozás többé nem általános szerverhibaként jelenik meg; az azonnali ClamAV-trigger összevont sentinelre állt át, a systemd path helyreállt, a worker claim limit 4. Az idempotens finalize megőrzi a tényleges elküldött címzettszámot. A mobil e-mail megjegyzése teljes szélességű sor, a 4-up PDF kisebb kép mellett több helyet ad a megjegyzésnek. A közös diktálási motor pont/vessző/felkiáltójel/kérdőjel parancsokat és `szó szerint ...` kivételt kezel AI nélkül. A telepített PWA release-specifikus service-worker/cache verziót, explicit update-checket és `Új DIMPRO Drop verzió érhető el – Frissítés` folyamatot kapott, így a következő kiadásoknál nem kell az alkalmazást törölni és újratelepíteni.

Validáció: TypeScript PASS; teljes lint **0 error / 108 meglévő warning**; speech/e-mail/TXT **20/20**; hálózat/finalize **16/16**; scan **28/28**; mobil/PWA **70/70 + 115/115**; PWA update **15/15**; candidate és production browser E2E **37/37**; candidate és production teljes S3/ClamAV/finalize/SMTP/album/PDF/TXT/ZIP E2E **75/75**; Identity Core **12/12 READY**; live PWA SW **1.2.10**; tesztmaradvány **0**. Private pilot marad, GA=false.

## DROP 1.2.11 – PWA alkalmazásadatok és frissítési állapot – éles

**Dátum:** 2026-08-09.  
**Fejlesztési Központ:** `version_28bf226a-70b`.  
**Éles release:** `.next-v1211-release-final`.  
**BUILD_ID:** `XFvAsUHhS9ZELCepVr65m`.  
**Rollback:** `.next-v1210-release-final`.  
**Részletes dokumentáció:** `122_dimpro_drop_v1211_pwa_app_info_release.md`.

A mobil PWA Menü új alkalmazásadat-kártyát kapott: `DIMPRO Drop · v1.2.11`, utolsó frissítési dátum, `Telepített webalkalmazás (PWA)` megjelölés, `Naprakész / Frissítés elérhető / Ellenőrzés… / Offline` állapot és kézi `Frissítés keresése` gomb. A service worker `DROP 1.2.11`, a cache `dimpro-drop-static-v1211`; a meglévő automatikus update-check és Frissítés folyamat megmaradt. Az aktív Drop API-k release-jelölései is egységesen 1.2.11-re frissültek.

Validáció: PWA contract **19/19**; TypeScript PASS; teljes lint **0 error / 108 meglévő warning**; candidate build PASS / **141 chunk**; candidate browser **41/41**; candidate teljes infrastruktúra E2E végleges újrafuttatás **75/75**; production browser **41/41**; production teljes S3/ClamAV/finalize/SMTP/album/PDF/TXT/ZIP E2E **75/75**; Identity Core **12/12 READY**; Object Storage takarítás **11/11**; tesztmaradvány **0**. Private pilot marad, GA=false.

## DROP 1.2.12 / IDENTITY 0.2.2 – Send-kód e-mail, iPhone HEIC és PWA hotfix – fejlesztés alatt

**Dátum:** 2026-08-10.  
**Fejlesztési Központ:** `version_1ac59d3a-d29`, `in_progress`.  
**Részletes dokumentáció:** `127_dimpro_drop_v1212_ios_sendmail_heic_pwa_hotfix.md`.

A hotfix DEV-first módon javítja a Send entitlementhez hiányzó automatikus `Saját DIMPRO Send-kód` levelet és hozzáadja a biztonságos `Új kód + e-mail` rotációt; iPhone HEIC/HEIF konverziós hiba esetén az eredeti fájl feltölthető marad; az iOS PWA telepítési gomb pedig Safari-specifikus, lépésről lépésre telepítési útmutatót nyit. A Drop release- és service-worker verzió 1.2.12, az Identity admin API 0.2.2. Private pilot marad, GA=false.

**DROP 1.2.12 DEV candidate gate:** BUILD_ID `AK30OQyQBMklA3SZKvKWX`; standalone 141/141; Send integráció 16/16; HEIC fallback PASS; contract 27/27; compiled browser 15/15; TypeScript PASS; lint 0 error / 108 baseline warning; tesztmaradvány 0. A production release-gate következik.

## DROP 1.2.12 / IDENTITY 0.2.2 – éles

**Dátum:** 2026-08-10.  
**Fejlesztési Központ:** `version_1ac59d3a-d29`.  
**Éles release:** `.next-drop-v1212-release-final`.  
**BUILD_ID:** `DAcj-ZwTkKDHf3repNMgZ`.  
**Rollback:** `.next-identity-v021-release-final`.  
**Részletes dokumentáció:** `127_dimpro_drop_v1212_ios_sendmail_heic_pwa_hotfix.md`.

Éles a Send-kód automatikus e-mail kézbesítés és biztonságos `Új kód + e-mail` rotáció, az iPhone HEIC/HEIF konverziós fallback, valamint az iOS Safari PWA telepítési útmutató. Csató Ferenc és Nagy Róbert Send-kódja élesben újragenerálva és SMTP által elfogadva; Csató hiányzó `DROP_QUICK_VOICE_NOTE` tagsági modulja engedélyezve. Production candidate browser 12/12, live browser 8/8, contract 27/27, Send DEV integráció 16/16, standalone 141/141, TypeScript PASS, lint 0 error / 108 baseline warning. Private pilot marad; fizikai iPhone HEIC/PWA validáció szükséges.

## 2026-08-17 – DROP 1.2.12 GyorsSend DEV stepper stabilizálás

A DEV GyorsSend / Gyors KépSend folyamat 6 lépéses stepperre állt át: Beállítások, Képek, Ellenőrzés, Mentés, Riport, Lezárás. A stepper már a Gyors KépSend alapadatainál látható, és sikeres csomag-előkészítés után közvetlenül a 2. Képek lépésen folytatódik. A fájlfeltöltés normál kattintásos, a véglegesítés jobbra húzható megerősítés; a mentett Send-kód törlése és a képtörlés balra húzásos, piros vizuális visszajelzéssel. A riportküldés nem automatikus.

A DEV workflow-adatbázis régebbi sémájához visszafelé kompatibilis repository-fallback készült; hivatalos DDL migráció credential hiányában nem történt. Aktív DEV BUILD_ID: `4BKkRbtTUaizcCxvwZkOh`, kódcommit: `3f1dec4`, acceptance 36/36 PASS, TypeScript PASS, célzott ESLint PASS, valós Send-kódos package create HTTP 201 és 2. Képek lépés PASS. PROD változatlan.
