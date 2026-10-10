# DIMPRO Drive V0.9.34 – komplex forrásfejlesztési átadó
Dátum: 2026-10-10
Státusz: **SOURCE IMPLEMENTED / NOT DEPLOYED / MIGRATIONS NOT APPLIED / EMAIL NOT ENABLED**
PROD DENY. A jelenlegi nyilvános DEV továbbra is a V0.9.33 candidate port 3412; rollback V0.9.32 port 3411.

## Kiinduló forrás
- Közös working branch: `worker/benjaminai/drive-desktop-v019-v0924-integration-20261007`
- Korábbi V0.9.34 UI checkpoint: `0002852ac510dfc46d0bfd66e03dd653b62f0f4a`.
- Nem változtatható nem kapcsolódó untracked munkatartalom: `.desktop-v019-css`, `.resolve-write-test`, `.resolved-drive-css`, `.v0925-css`, `desktop/dimpro-drive-desktop/windows-installer/native/`.

## 1. Dokumentumkezelési UX
Korábban elkészült: név előtöltése, Tervellenőrzés fájltípus-szűrés, szakág/témakör cellából részletező, megjelenítő oldalsó nyilai. Ebben a körben a megjelenítő dokumentumsorrendje a FileGridPanel aktuális szűrt/rendezett sorait követi; a működés böngészős regressziós tesztelése szükséges, különösen PDF lapozás és full-screen esetén.

## 2. Követett dokumentumok
- Adattáblák: `supabase/migrations/20261010_drive_document_follow_v010.sql` (csak előkészítve)
- Repository: `app/lib/drive-core/followRepository.ts`
- ACL-szűrt GET/PUT: `app/api/projects/[projectId]/drive/follows/route.ts`
- UI: Drive táblázatban Kedvencek csillag mellett külön türkiz csengő, egyéni követési beállító ablak: verziók, revíziók, jóváhagyások, gyakoriság, követés kikapcsolása.
- Identitás: stabil dokumentum ID (nem egyetlen verzió).
- A bell funkció adatbázismigráció hiányában disabled; a GET 503-at biztonságosan lekezeli.

## 3. Központi AUTH profilfotó
- Előkészített külön auth migráció: `db/auth/migrations/012_auth_v049_profile_photo.sql`
- `app/api/dimpro-auth/profile/photo/route.ts` csak saját központi SSO sessionben, GET/POST/DELETE, POST eredeti max 4 MB, JPG/PNG/WebP, csak optimalizált 256x256 WebP tárolás a saját AUTH-adatbázisban; nincs külön Supabase AUTH.
- `components/auth/ProfilePhotoControl.tsx` és css; a Drive fejléc felhasználói avatarját helyettesíti.
- Egyelőre a többi modul profilfotó megjelenítése nincs bekötve. Az AUTH migrációt külön szigorú jóváhagyással kell ellenőrizni, központi DB szerveren.
- `sharp` közvetlen függőségként bekerült package.json + lock. Az offline npm install lock-only teszt külső optional Tailwind csomagcache miatt sikertelen; TypeScript és ESLint PASS; BUILD01 valós install/build szükséges.

## 4. Értesítési alapmotor
- A már létező `drive_core_change_events` az authoritative változásnapló. Nem készül párhuzamos új eseménytár.
- `app/lib/drive-notifications/digestCore.ts`: szigorú allowlist (feltöltés, új verzió, új revízió, formális kiadás és releváns döntés), metaadat-/átnevezési és biztonsági scan események kizárva. Címzett+projekt+ACL+jóváhagyási scope szerinti szűrés. HTML karakterek escape-elése és no-empty-digest.
- `supabase/migrations/20261010_drive_review_decision_events_v010.sql`: a már tárolt műszaki ellenőrzési/jóváhagyási mezők változásait a dokumentum metadata tranzakciójában, pontosan tényleges döntésváltozáskor naplózó trigger. Nem alkalmaztuk.
- `app/lib/drive-notifications/scheduling.ts`: Europe/Budapest 4h/8h/daily 07/weekly Monday 07/monthly first business day 07. Magyar ünnepnap/munkanap-kalendáriumhoz hiteles adatforrás kell, havi automatikus futás enélkül tiltva.
- `supabase/migrations/20261010_drive_notification_preferences_v010.sql`: felhasználó/projekt/kategória beállítások, elkülönített `DOCUMENT_CHANGES` és `APPROVAL_DECISIONS`, plusz idempotens kézbesítési ledger (PENDING/PROCESSING/SENT/FAILED) séma. Kiküldés még nincs.
- `app/lib/drive-notifications/preferenceRepository.ts` és ACL-authos GET/PUT `app/api/projects/[projectId]/drive/notification-preferences/route.ts`.
- `components/drive/DriveNotificationSettings.tsx` és css: Drive Értesítések gomb működő beállítóablakra nyílik, e-mail küldés inaktív figyelmeztetéssel.
- `app/lib/drive-notifications/digestAttachment.ts`: címzettenként ACL-re szűrt XLSX, főlapok Összesítő/Dokumentumváltozások/Tervjóváhagyások/Jelmagyarázat, opcionális csak látható Teljes fájllista, ténylegesen és azonos ACL mellett kézbesített címzettek Kiküldési adatok lapja; képlethasználat elleni sztringvédelem. HTML Outlook-kompatibilis táblázat mintával.
- Kézbesítő worker (valódi email), per-sending ACL+recipient verification, scheduler durable lease / cursor checkpoint, retry/outbox idempotency, HU napnaptár, jogosult címzett-transzparencia, küldés utáni delivery audit, Excel csatolás együttes integrációja MÉG HIÁNYZIK.
- A default category opt-in `enabled=false`; semmilyen automatikus levél nem indul.

## 5. Tesztek és állapot
- `npx tsc --noEmit --pretty false`: PASS.
- `npx eslint` érintett TSX/TS és API: PASS.
- `git diff --check`: PASS.
- `node --experimental-strip-types scripts/tests/drive-notification-digest-contract.mjs`: PASS.
- `node --experimental-strip-types scripts/tests/drive-notification-scheduling-contract.mjs`: 10/10 PASS.
- `node --experimental-strip-types scripts/tests/drive-notification-excel-contract.mjs`: 5/5 PASS.
- Böngészős auth/jogosultság QA, adatbázis-migrációk, BUILD01/02 build, runtime smoke, mail preview / kiküldés: **NEM KÉSZ**.

## 6. Kötelező folytatás telepítés előtt
1. Megfelelő DEV lemez és DotRoll erőforrásbővítés; a DEV kb. 97-98%-ban foglalt. BUILD01/02 build csak ezek valamelyikén.
2. A DB migációkat külön száraz vizsgálattal, AUTH és Drive DBA-szabályokkal jóváhagyni. A saját AUTH rendszer DB-je nem Supabase.
3. Böngésző QA: dokumentumléptetés szűrés/rendezés/PDF/fullscreen, szerepkörönként a follow API és metadata fókusz, profilszelfi upload/delete.
4. A valódi deduplikált, ACL-jogosult e-mail pipeline, engedélyezett delivery queue/worker, recipient handling, Excel és HTML, majd levélküldés izolált teszt SMTP/címzettekkel.
5. Későbbi UI/architektúra külön scope: 2-soros közös Projektadatlap fejléc, szakmai többes szerepkörök közös permission profilok, Legutóbbiak / Projektáttekintő.
