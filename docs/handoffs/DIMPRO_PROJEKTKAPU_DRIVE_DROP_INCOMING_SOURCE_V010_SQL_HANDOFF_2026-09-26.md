# DIMPRO Projektkapu – DRIVE DROP Incoming Source V0.1.0 · DEV SQL átadó

## Cél

A DEV adatbázisban a `drive_core_upload_sessions.source` constraint jelenleg csak `WEB` és `DESKTOP` értéket enged. A Projekt Beküldőkapu DROP → DRIVE import első osztályú `DROP` provenance-t használ, ezért a constraintet `WEB, DESKTOP, DROP, SYSTEM` készletre kell bővíteni.

Ez a migráció kizárólag DEV-re készült. PROD alkalmazás tilos külön engedély nélkül.

## Fájl

Fájlnév:

`DIMPRO_PROJEKTKAPU_DRIVE_DROP_INCOMING_SOURCE_V010_BOOTSTRAP.sql`

VPS teljes elérési út:

`/srv/dimpro-dev/worktrees/worker-benjaminai-dev-task-grid-22b48c4d9bae10e22e09/supabase/DIMPRO_PROJEKTKAPU_DRIVE_DROP_INCOMING_SOURCE_V010_BOOTSTRAP.sql`

SHA-256:

`bb3c7476aeaf8eb683d3ea0f891d965c25a612ed96fc875576217e1863e1740d`

## Letöltés Windowsra – opcionális

PowerShell:

`scp root@213.160.68.32:"/srv/dimpro-dev/worktrees/worker-benjaminai-dev-task-grid-22b48c4d9bae10e22e09/supabase/DIMPRO_PROJEKTKAPU_DRIVE_DROP_INCOMING_SOURCE_V010_BOOTSTRAP.sql" "C:\\Users\\admin\\Downloads\\DIMPRO_PROJEKTKAPU_DRIVE_DROP_INCOMING_SOURCE_V010_BOOTSTRAP.sql"`

Ha SSH-jelszót kér, a DEV szerverhez tartozó saját hitelesítést használd. Jelszót ne küldj chatbe.

## Supabase alkalmazás

1. Nyisd meg a DEV Supabase projekt SQL Editorát.
2. `New query`.
3. Nyisd meg a fenti SQL fájlt VS Code-ban.
4. `Ctrl+A`, majd `Ctrl+C`.
5. Supabase SQL Editorban `Ctrl+V`.
6. Ellenőrizd, hogy a script `begin;` sorral indul és `commit;` sorral végződik.
7. `Run`.

## Elvárt eredmény

A lekérdezés hiba nélkül lefut.

Ezután a rendszerben:
- `drive_core_upload_sessions.source` engedi: `WEB, DESKTOP, DROP, SYSTEM`;
- a `drive_storage_schema_meta` táblában megjelenik:
  - component = `drive-drop-incoming-source`
  - schema_version = `0.1.0`
  - migration_count = `1`
  - bootstrap_id = `drive-drop-incoming-source-v010-20260926`.

A SQL futtatása után a kódmérnöknek read-only ellenőrzést, Projektkapu pilot preflightot és fizikai DROP → DRIVE E2E tesztet kell futtatnia.
