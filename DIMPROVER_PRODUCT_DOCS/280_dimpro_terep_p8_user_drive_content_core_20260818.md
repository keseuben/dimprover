# DIMPRO Terepi Gyorsrögzítő – P8 Saját DIMPRO Drive / Content Core V0.1

Dátum: 2026-08-18
Környezet: DEV-only
Kiinduló baseline: `d6f2c6d`

## Architektúra

P8 csak a személyes `USER` ownership backendet aktiválja. A `PROJECT` ownership a P9 Projektkapu Drive feladata. Álprojekt használata tilos.

Új Content Core táblák:
- `dimpro_content_schema_meta`
- `dimpro_content_objects`
- `dimpro_content_refs`

A fizikai Drive objektum SHA-256 + méret alapján deduplikálható. A személyes referencia `owner_type=USER`, `owner_user_id` kötött, `owner_project_id=NULL`, `folder_id=NULL`, `retained_independently=true`. P8 V0.1 célja a `USER_ROOT`; személyes mappafa későbbi bővítés.

## Biztonság

Saját Drive-ba csak Drop fájl kerülhet, ha `upload_status=ready`, `processing_status=ready`, `security_status=clean`, `virus_scan_status=clean`, S3-kompatibilis tárhelyen van, és érvényes SHA-256 + pozitív méret tartozik hozzá.

A Content Core RLS-védett. `anon` és `authenticated` közvetlen tábla-hozzáférés tiltott; `service_role` szerveroldali CRUD engedélyezett. Raw Send/PIN/capability/upload token nem kerül Content Core vagy Field Capture állapotba.

## Közös Drop → Drive motor

A P8 nem épít új másolómotort. A meglévő projektarchiváló stream-copy logikából közös `dropDriveObjectCopy` helper készült. Menet: Drop S3 stream → Drive S3 stream → méretellenőrzés → SHA-256 visszaolvasás → csak ezután Content Object + USER reference.

Drop és Drive külön bucketet használ, ezért a Saját Drive példány független a Drop retentiontől.

## Field Capture állapot

P8 csak `SERVER_STORED` itemre indulhat, és előre kért `USER_DRIVE` destination szükséges. Siker után:
- destination `STORED`
- `retained_independently=true`
- `scope=USER_ROOT`
- `driveSynced=true`
- sync operation `SYNC_USER_DRIVE` / `DONE`
- audit event `USER_DRIVE_STORED`

A kliensoldali Saját Drive kapcsoló még fail-closed (`ready=false`), amíg az IndexedDB → P7.1 upload → reconcile → P8 lánc nincs bekötve. `PROJECT_DRIVE` továbbra is false.

## Migráció és acceptance

- Content Core schema contract: 14/14 PASS
- transactional rollback: PASS
- DEV backup: `/srv/dimpro-dev/backups/content-core-p8-v010/20260818T181717Z`
- backup SHA-256: `f71de4e577b51419b491f5282eb2ff665f87db73333461241a1240f851657f59`
- DEV migration + RLS/service-role verify: PASS
- P8 USER Drive contract: 14/14 PASS
- Terep acceptance: 66/66 PASS
- valós Drop→Drive E2E: PASS
- első másolás: true; retry másolás: false
- ugyanaz Content Object + USER ref retry esetén: PASS
- SHA-256 + méret: PASS
- cleanup: session 0, ref 0, teszt Content Object 0

## Reboot recovery

A DEV VPS reboot után a PM2 régi `NEXT_DIST_DIR`-rel indult. A pointer szerinti közös release visszaállt, P7/P7.1 health zöld, majd `pm2 save` frissítette a tartós PM2 dumpot.

## Következő lépés

P8 candidate build → live USER_DRIVE API acceptance → kliensoldali P7.1/P8 szinkronlánc → csak ezután UI `ready=true` → P9 Projektkapu Drive.
