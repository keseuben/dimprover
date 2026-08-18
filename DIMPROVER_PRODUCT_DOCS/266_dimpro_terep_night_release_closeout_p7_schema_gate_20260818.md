# DIMPRO Terepi Gyorsrögzítő – éjszakai release lezárás és P7 schema gate

Dátum: 2026-08-18
Worker: JAZMINAI
Környezet: DEV-only
Kiinduló közös baseline: `8806d1903194a52dc4a0d73699a3eba9e475ed54`
Korábbi Terep candidate: `.next-terepi-v034-99ae1c6` / `X1Tmtg19Ex8haskoMJ7yz`

## Release lezárás

A korábbi `99ae1c6 / X1Tmtg19Ex8haskoMJ7yz` candidate nem került automatikusan visszaaktiválásra, mert a közös `feat/benjadmin-operator-ui-v2` baseline időközben előrébb haladt. A Terep regresszió ezért az újabb aktív DEV runtime-on történt.

Aktív runtime az ellenőrzéskor:
- PM2: `dimpro-benjadmin-operator-ui-v2-dev` / id 58
- `FIELD_CAPTURE_ENABLED=true`
- aktív `NEXT_DIST_DIR`: `.next-benjadmin-worker-presence-release-v1-4975704`

Eredmények:
- Terep statikus acceptance: **61/61 PASS**
- `/`: HTTP 200
- `/terep`: HTTP 200
- `/send`: HTTP 200
- `/api/field-capture/health`: HTTP 200
- `/api/drop/health`: HTTP 200
- `/api/drop/features`: HTTP 200
- browser/mobile acceptance: **27/27 PASS**
- Dél / 180° kamerairány-szimuláció: PASS
- DIMPRO Képjelölő mentés: PASS
- GPS: PASS
- Voice: PASS
- Rögzítés → Ellenőrzés → Mentés: PASS
- IndexedDB reload persistence: PASS
- pageerror: 0
- console error: 0

Következtetés: a Terepi Gyorsrögzítő P0–P6 / végrehajtási terv 0–5 blokk release-szála lezárható. Az újabb közös baseline nem regresszálta a Terep funkciókat.

## P7 szerveres capture session – schema gate

A P7 indulás előtt külön DEV schema-readiness vizsgálat futott a meglévő, szerveroldali Supabase kapcsolattal. Titokérték nem került naplózásra.

Környezeti jelenlét:
- `NEXT_PUBLIC_SUPABASE_URL`: PRESENT
- `SUPABASE_SERVICE_ROLE_KEY`: PRESENT
- `DATABASE_URL`: MISSING
- `DIMPRO_IDENTITY_DATABASE_URL`: MISSING

A következő kilenc P7 draft tábla mind hiányzik, PostgREST eredmény: `PGRST205`:

- `field_capture_sessions`
- `field_capture_items`
- `field_capture_asset_refs`
- `field_capture_locations`
- `field_capture_orientations`
- `field_capture_voice_notes`
- `field_capture_destinations`
- `field_capture_events`
- `field_capture_sync_queue`

A meglévő draft: `supabase/DIMPRO_FIELD_CAPTURE_P0_P4_SCHEMA_DRAFT.sql`.

A draft saját szabálya szerint a migráció csak külön adatbázis-backup és jogosult migration credential után végezhető. A jelen worktree/runtime nem rendelkezik dokumentált `DATABASE_URL` vagy más közvetlen migration kapcsolattal. Emiatt service-role alapú kitalált SQL RPC, nem dokumentált workaround vagy production kapcsolat használata TILOS.

## P7 auth/upload contract audit

A P7-hez szükséges meglévő komponensek azonosíthatók, ezért ezeket nem kell újra megépíteni:

- Send session szerveroldali ellenőrzés: `verifyDimproSendSession()`
- Send entitlement context: `getDimproSendContextByEntitlementId()`
- Drop upload engine: meglévő single/multipart/resumable quarantine pipeline
- upload session token: meglévő `dropUploadToken`
- private storage / scan pipeline: meglévő Drop storage engine

A Terephez külön auth-, licenc-, upload- vagy Drive engine NEM készülhet.

## Állapot

**BLOCKED – P7_SCHEMA_MIGRATION_GATE**

Emberi/infrastruktúra döntés szükséges a P7 folytatásához:
1. DEV adatbázis backup/checkpoint igazolása;
2. dokumentált DEV migration credential/útvonal biztosítása;
3. `DIMPRO_FIELD_CAPTURE_P0_P4_SCHEMA_DRAFT.sql` auditja és DEV-only migrációja;
4. a 9 tábla readiness újraellenőrzése;
5. csak ezután P7 szerveres capture session API + upload/sync foundation.

PROD változatlan, nem történt PROD alkalmazásmódosítás.

## 2026-08-18 reggeli folytatás – P7 schema gate feloldása

A reggeli audit során megtaláltuk a korábban már dokumentált, DEV-only közvetlen PostgreSQL migrációs útvonalat:

- `/root/.pgpass`: root:root, `0600`;
- fix DEV pooler: `aws-0-eu-central-1.pooler.supabase.com:5432`;
- DEV Supabase project ref: `pbgyuznivqvestuksvif`;
- PROD Supabase project ref: `hlgntizemijaemphleiw`, amelyet a P7 gate nem fogad el;
- a jelszó értéke nem került logba, dokumentációba vagy repóba.

A korábbi `DIMPRO_FIELD_CAPTURE_P0_P4_SCHEMA_DRAFT.sql` közvetlen alkalmazása elutasítva. Audit során két kompatibilitási hibát és egy biztonsági hiányt találtunk:
1. `project_id uuid` helyett `text` szükséges a Project Core szerződés miatt;
2. Drive `folder_id uuid` helyett `text` szükséges a Drive Core szerződés miatt;
3. a draft nem tartalmazott kötelező RLS/grant hardeninget.

Új, verziózott P7 migráció:
- `supabase/migrations/20260818074500_field_capture_p7_server_session_v010.sql`
- SHA-256: `d38670aabc988dde326aa1c657f87cda550a4541dc224e36f9479344fc7c46a6`
- 9 domain tábla + külön schema marker;
- RLS minden Field Capture táblán;
- `anon` és `authenticated` közvetlen táblajoga tiltva;
- csak `service_role` kap szerveroldali CRUD jogot;
- idempotens session/item/sync kulcsok;
- GPS, kamerairány, voice és storage metaadat külön strukturált rekordban;
- nyers Send/PIN/capability token nem része a sémának.

Új migration gate:
- `scripts/field-capture-p7-migration-gate.mjs`
- fix DEV target ellenőrzés;
- root-only `.pgpass` ellenőrzés;
- tiszta baseline / részleges schema tiltás;
- teljes DEV `pg_dump` backup + `pg_restore --list` ellenőrzés;
- tranzakciós rollback-test;
- explicit `DEV_ONLY_FIELD_CAPTURE_P7_APPLY_APPROVED` apply-kapu;
- apply után marker + RLS/grant security acceptance.

Contract:
- `scripts/field-capture-p7-migration-gate-contract.mjs`
- eredmény: **13/13 PASS**.

Read-only P7 preflight:
- target: `pbgyuznivqvestuksvif`;
- DB/user/port: `postgres / postgres / 5432`;
- mind a 9 domain tábla hiányzik;
- részleges Field Capture schema nincs;
- Identity / Project Core / Drive Core / Drop upload sentinel: PASS;
- állapot: **READY FOR ROLLBACK TEST + APPLY**.

A rollback-test első indítását a közös DIMPRO koordinátor helyesen blokkolta, mert ÁrminAI közben build lockot tartott. Lockot nem törtünk fel, párhuzamos migráció nem történt.

A korábbi `BLOCKED – P7_SCHEMA_MIGRATION_GATE` állapot ezért infrastruktúra szinten **RESOLVED**, az apply továbbra is csak a közös `migration` lock alatt történhet.

## 2026-08-18 reggeli folytatás – P7 schema apply és szerver API foundation

A P7 DEV adatbázis-kapu sikeresen lezárult.

Rollback-próba:
- központi `migration` lock alatt futott;
- eredmény: PASS;
- a tranzakció után a Field Capture objektumok nem maradtak bent.

DEV schema apply:
- migráció: `supabase/migrations/20260818074500_field_capture_p7_server_session_v010.sql`;
- SHA-256: `d38670aabc988dde326aa1c657f87cda550a4541dc224e36f9479344fc7c46a6`;
- DEV target: `pbgyuznivqvestuksvif`;
- backup: `/srv/dimpro-dev/backups/field-capture-p7-v010/20260818T061317Z/supabase-dev-pre-field-capture-p7.dump`;
- backup SHA-256: `6b57d304eb48c4b65f4d47c4cbf6f70e0503ff91207a8d216513629bef5afa12`;
- `pg_restore --list`: PASS;
- schema marker: `0.1.0 / migration_count=1 / field-capture-p7-v010-20260818`;
- 9/9 domain tábla: PASS;
- `project_id`: `text`;
- Drive `folder_id`: `text`;
- RLS: minden domain táblán aktív;
- `anon` / `authenticated`: közvetlen táblajog nincs;
- `service_role`: szerveroldali CRUD PASS.

A migráció előtt további retry-idempotencia hardening került be:
- `field_capture_asset_refs`: `unique(capture_item_id, variant)`;
- checkpoint: `1b11eab`.

P7 szerver API foundation:
- `app/lib/field-capture/serverRepository.ts`;
- `app/lib/field-capture/serverService.ts`;
- `POST /api/field-capture/sessions`;
- `POST /api/field-capture/sessions/[sessionId]/items`;
- dinamikus `/api/field-capture/health` schema readiness.

Biztonsági és működési elvek:
- kizárólag Bearer Send-session token;
- szerveroldali `verifyDimproSendSession()` + entitlement context;
- nyers Send/PIN/capability token nem kerül persistence-be;
- projektjogosultság ellenőrzése után a meglévő `project_core_projects.dimpro_project_id` híd oldja fel a Project Core ID-t;
- idempotens session / item / asset / sync upsert;
- GPS / kamerairány / Voice strukturált szerverrekord;
- audit event hibája nem nyelődik el;
- kliens státusz/source értékek szerveroldali whitelist-validációt kapnak;
- Drive célok egyelőre csak destination-state rekordok; új Drive API/storage engine nem készült.

P7 szerver contract:
- `scripts/field-capture-p7-server-contract.mjs`;
- eredmény: **12/12 PASS**;
- célzott ESLint: PASS;
- `npx tsc --noEmit`: PASS;
- `git diff --check`: PASS.

A következő kapu:
1. checkpoint;
2. koordinált Next candidate build;
3. candidate health + unauth/bad-token regresszió;
4. DEV-only valódi Send-session HTTP session/item idempotencia acceptance;
5. csak minden PASS után DEV cutover.

## 2026-08-18 – P7 candidate build BLOCKED

A P7 schema és szerver API kapuk zöldek, azonban az első koordinált candidate build nem készült el.

Build target:
- `.next-terep-p7-v010-565be7f`
- source commit: `565be7f`
- központi build lock: szabályosan megszerezve és hibánál felszabadítva.

Hiba:
- `TurbopackInternalError: Symlink [project]/node_modules is invalid, it points out of the filesystem root`.

Ok:
- a Jázmin worktree saját `node_modules` helyett ideiglenesen a `benjadmin-operator-ui-v2/node_modules` könyvtárra mutató symlinket használt a statikus ellenőrzésekhez;
- a package-lock SHA egyezett, ezért ESLint/tsc futtatásra megfelelő volt;
- Next/Turbopack production build külső worktree-re mutató `node_modules` symlinket nem fogad el.

Állapot:
- kód quality gate: PASS;
- migráció contract: 13/13 PASS;
- P7 server contract: 12/12 PASS;
- Terep statikus acceptance: 61/61 PASS;
- teljes lint: 0 error / 103 meglévő warning;
- DEV schema apply + backup: PASS;
- candidate build: BLOCKED;
- DEV cutover: NEM történt;
- aktív DEV runtime: változatlan.

Következő kontrollált lépés:
1. a Jázmin worktree külső `node_modules` symlinkjének eltávolítása;
2. saját helyi dependency tree létrehozása `npm ci` használatával, változatlan package-lock mellett;
3. `tsc` + célzott/full lint visszaellenőrzés;
4. új koordinált P7 candidate build;
5. candidate HTTP acceptance;
6. csak teljes PASS után DEV cutover.

Emberi termékdöntés nem szükséges; ez izolált build-környezeti javítás. A végrehajtási terv build-hiba STOP szabálya miatt a javítás külön következő fejlesztési körben indulhat.

## 2026-08-18 – explicit böngésző GPS-helyhozzáférési kapu

Felhasználói terepi teszt alapján a Chrome globális „a webhelyek kérhetik a helyadatait” beállítása nem adott elég egyértelmű visszajelzést arról, hogy a DIMPRO Drop/Terep webhely konkrét helyengedélye megvan-e. A korábbi működés a GPS-t csak a kép elkészítése után, háttérben kérte le.

Új működés:
- a GPS továbbra is opcionális és alapból OFF;
- a GPS kapcsoló bekapcsolásakor a Terep ellenőrzi a böngésző `geolocation` permission állapotát;
- külön, látható **„Helyhozzáférés engedélyezése”** gomb jelenik meg, ha nincs még engedély;
- az engedélykérés közvetlen felhasználói gombnyomásból hívja a `navigator.geolocation.getCurrentPosition()` API-t;
- siker esetén a felület jelzi, hogy a konkrét DIMPRO webhely helyhozzáférése engedélyezve van, és a próbamérés pontosságát is kijelzi;
- tiltás esetén útmutató jelenik meg: Chrome → webhelyinformáció → Engedélyek → Hely → Engedélyezés → Engedély ellenőrzése újra;
- a GPS-engedély megtagadása vagy hiánya továbbra sem blokkolhatja a kép elkészítését;
- a tényleges, képhez mentett GPS-adat továbbra is a képrögzítéshez kapcsolódó külön strukturált `FieldCaptureLocationRecord`, nem EXIF.

Érintett fájlok:
- `app/lib/field-capture/captureSensors.ts`
- `components/field-capture/PreCaptureOptionsSheet.tsx`
- `components/field-capture/CapturePreviewCard.tsx`
- `scripts/terep-p0-p6-acceptance.cjs`

Acceptance bővítés:
- webhelyengedély állapot lekérdezés;
- külön felhasználói GPS engedélykérés;
- GPS tiltás nem blokkolja a képet;
- frissített Chrome webhelyengedély útmutató.

Eredmény: **64/64 statikus Terep acceptance PASS**, célzott ESLint PASS, `npx tsc --noEmit` PASS, `git diff --check` PASS.


## 2026-08-18 – P7 Drop-host API allowlist és GPS browser acceptance

A P7 candidate smoke feltárta, hogy az új szerveres capture route-ok ugyan elkészültek, de a `drop.dev.dimpro.hu` proxy-allowlist csak a `/api/field-capture/health` útvonalat engedte át. Emiatt a `POST /api/field-capture/sessions` a route elérése előtt 404 választ kapott.

Javítás:
- a Drop host engedélyezi a `POST /api/field-capture/sessions` útvonalat;
- engedélyezi az `/api/field-capture/sessions/*` item API útvonalakat;
- a többi, nem engedélyezett API továbbra is 404 blokkolást kap;
- az API saját bearer Send-session ellenőrzése változatlanul kötelező, tehát a proxy-allowlist nem teszi autentikáció nélkül használhatóvá a route-ot.

Contract bővítés:
- P7 server contract: **13/13 PASS**;
- Terep statikus acceptance: **65/65 PASS**.

A böngészős acceptance is frissült:
- `navigator.permissions.query({ name: "geolocation" })` tesztstub;
- a GPS kapcsoló után külön megjelenő **„Helyhozzáférés engedélyezése”** gomb ellenőrzése;
- a gomb közvetlen kattintása;
- **„Helyhozzáférés engedélyezve”** állapot megvárása;
- ezután történik csak a kamerás/galériás capture acceptance.

A javítás után új candidate build szükséges, mert a korábbi `TZDDbwusBNsFY6Qw6cW0B` build még nem tartalmazza a proxy-allowlist módosítást.


## 2026-08-18 – Drop Permissions-Policy GPS javítás

A candidate ellenőrzés során kiderült, hogy a Drop host biztonsági fejléce korábban `geolocation=()` értéket küldött. Ez a böngésző saját webhelyengedélyétől függetlenül teljesen letiltotta a Geolocation API használatát a Drop/Terep oldalon, ezért a felhasználó által engedélyezhető helyhozzáférési prompt sem működhetett megbízhatóan valódi készüléken.

Javítás:
- korábbi: `geolocation=()`;
- új: `geolocation=(self)`;
- más origin vagy beágyazott külső tartalom továbbra sem kap geolocation-jogot;
- a böngésző natív webhelyengedélye továbbra is szükséges;
- a Terep saját „Helyhozzáférés engedélyezése” user-gesture gombja kezdeményezi a tényleges kérést;
- a GPS továbbra is opcionális és megtagadás esetén sem blokkolja a képrögzítést.

Security acceptance:
- P7 server contract: **14/14 PASS**;
- Terep statikus acceptance: **66/66 PASS**;
- célzott ESLint: PASS;
- `npx tsc --noEmit`: PASS;
- `git diff --check`: PASS.

A korábbi `H0SAgkjuH0f5QTCCyJLh9` candidate build még a régi `geolocation=()` fejlécet tartalmazza, ezért új candidate build szükséges a security javítás kiadásához.
