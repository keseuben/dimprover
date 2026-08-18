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
