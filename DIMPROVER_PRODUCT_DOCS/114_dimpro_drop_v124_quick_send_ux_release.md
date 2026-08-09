# DIMPRO Drop 1.2.4 – Gyors KépSend UX és letöltőoldal release

**Kiadás dátuma:** 2026-08-08  
**Állapot:** éles private-pilot release  
**Fejlesztési Központ:** `version_17dec28a-eee` – `released`  
**Aktív release:** `.next-v124-release-final`  
**BUILD_ID:** `6DvBEXmmNeLGfj8gs7dw9`  
**Közvetlen rollback:** `.next-v123-release-final`

## Fő változások

- A Gyors KépSendben a `DIMPRO rendezett fotónév` az alapértelmezett és ajánlott névszabály.
- A fotósorszám új rövid formátuma: `F0001`, `F0002`, …; példa: `260807_0740_260808_F0001_helyszini_bej.jpg`.
- Háromszintű fotómegnevezés: összes kép alapmegnevezése → csoport megnevezése → képenkénti felülírás.
- A képenkénti megjegyzés összecsukott mobilkártyán is közvetlenül szerkeszthető.
- Legutóbbi hozzáadás visszavonása és képkártya drag&drop törlés kukaterületre.
- Gyors KépSendnél a hitelesített Identity Core felhasználó saját e-mail-címe automatikus első címzett; további címzett opcionális.
- A küldeményhez opcionális üzenet írható.
- Sikeres küldés után egyértelmű következő lépések: `Új képfeltöltés / Send` vagy `Bezárás / kezdőlap`.
- A letöltőoldalon opcionálisan megjelenik a feladó, tárgy, címzettlista és üzenet. A címzettlista megjelenítése alapértelmezetten bekapcsolt.
- Az S3-album bélyegképeinek CSP engedélyezése javítva; a valós tesztkép ténylegesen betöltődött.
- Chromium-alapú böngészőben a ZIP mentési hely kiválasztása megelőzi a szerveroldali ZIP-készítést; `Mégse` esetén a szerverfolyamat nem indul el. Futó ZIP külön megszakítható.

## Adatbázis

Additív migráció:

`supabase/DIMPRO_DROP_124_QUICK_SEND_UX.sql`

Új / ellenőrzött mező:

`drop_public_package_workflows.show_recipients_on_download boolean not null default true`

A migráció idempotens (`ADD COLUMN IF NOT EXISTS`). A migráció előtt célzott PostgreSQL schema- és data-backup készült.

## Validáció

- TypeScript: **PASS**
- teljes ESLint: **0 error**, 108 meglévő warning
- DROP 1.2.4 UX contract: **14/14 PASS**
- DROP 1.2.0 UX regresszió: **12/12 PASS**
- Send entitlement regresszió: **24/24 PASS**
- Identity consumer contract: **55/55 PASS**
- private-pilot regresszió: **PASS**
- mobil/e-mail regresszió: **PASS**
- candidate production build: **exit 0**
- standalone asset: **140/140 chunk PASS**
- candidate user/licenc/Send/Quick Send browser E2E: **19/19 PASS**
- immutable release browser E2E: **19/19 PASS**
- production PM2 browser E2E: **19/19 PASS**
- teljes S3 → ClamAV → finalize → audit/rate-limit → album → ZIP E2E: **43/43 PASS**
- valós albumkép: `naturalWidth > 0` – **PASS**
- live HTTPS `/`, `/send`, `/open`: **200 / 200 / 200**
- live HTTPS `/send`: DROP 1.2.4 látható, overflow nincs, page error nincs
- Identity Core: **12/12 READY**
- Drop worker timer: **active**
- tesztmaradványok: **0 user / 0 szervezet / 0 Identity E2E user / 0 Identity E2E projekt**

## Backup és rollback

- DB migráció előtti backup: `backups/drop_v124_db_migration_20260808_080409`
- aktiválás előtti backup: `backups/drop_v124_pre_activation_20260808_081451`
- aktiválási backup: `backups/drop_v124_release_activation_20260808_081509`
- közvetlen alkalmazás rollback: `.next-v123-release-final`
- aktiváló script: `scripts/activate-drop-v124-release.sh`

## Release-megjegyzés

A kiadás továbbra is private pilot; `generalAvailabilityReleased=false`. A File System Access API-t támogató Chromium böngészőkben a natív mentési hely kiválasztása előtt nem indul ZIP-generálás. Más böngészőkben a platform korlátai miatt a natív mentési párbeszéd megszakítása nem minden esetben érzékelhető, de a DIMPRO felületen futó ZIP-kérés külön megszakítható.
