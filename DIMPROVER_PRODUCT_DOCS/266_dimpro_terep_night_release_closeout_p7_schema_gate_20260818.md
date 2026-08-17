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
