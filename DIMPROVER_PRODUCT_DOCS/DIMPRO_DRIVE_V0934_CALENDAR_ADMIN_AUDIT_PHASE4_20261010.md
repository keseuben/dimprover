# DIMPRO Drive V0.9.34 – HU munkanaptár, admin értesítési audit – Phase 4

Dátum: 2026-10-10
**SOURCE PREPARED | NO DATABASE MIGRATION APPLIED | NO BUILD/DEPLOY | NO EMAIL SENT | PROD DENY**

Authoritative DEV továbbra is V0.9.33; készülő V0.9.34 forrás branch:
`worker/benjaminai/drive-desktop-v019-v0924-integration-20261007`.

## Megvalósított kódfunkciók

**1. Magyar munkanaptár (fail closed).**
- Migráció: `supabase/migrations/20261010_drive_notification_hu_calendar_v014.sql`.
- Teljes naponta rögzített, hivatalos forrásreferenciával, jóváhagyóval és időponttal rendelkező adatmodell. RLS aktív; runtime service_role kizárólag SELECT jogosultságot kap. NINCS automatikusan feltöltött/guessing ünnepnaplista.
- `app/lib/drive-notifications/huCalendarCore.ts`: ellenőrzött hónaplefedettség, hiányzó/duplikált/jóváhagyatlan nap szigorú tiltása. Munkanapos szombatok is egyértelműen rögzíthetők. `calendarWindowMonths` a havi késői slot számításhoz szükséges összes hónapot betölti.
- `app/lib/drive-notifications/huCalendarRepository.ts`: adatbázis-read-only teljes hónaplekérés, sikertelen vagy hiányos forrásnál nincs ütemezés.
- `app/lib/drive-notifications/digestProducer.ts`: MONTHLY-hoz validált munkanap-függvény; minden más gyakoriság az eddigi Budapest-időzóna szerinti kalkulációban marad.
- Éles jóváhagyott 2026-os/2027-es munkanapadatok: **NINCSENEK BETÖLTVE**. A tesztek szintetikus tesztnaptárral működnek, nem történeti/hivatalos állítások.

**2. Projektadminisztrátori kézbesítési audit.**
- API: `GET /api/projects/[projectId]/drive/notification-admin-audit`: a két kötelező szerveroldali jogosultság `audit.read` ÉS `project.manage_members`. Legfeljebb 150 legfrissebb, projekthez tartozó naplóbejegyzés, külön truncation jelzéssel, no-store.
- `app/lib/drive-notifications/adminAuditProjection.ts`: a címzett aktuális projekttagsági neve, szakmai szerepkörének mai technikai címkéje, mostani projektben megadott e-mail címe, tagsági státusza, SMTP acceptance időpont, hibaállapot. A **mostani e-mail nem történeti kézbesítési cím**; azt nem állítjuk bizonyítékként.
- `components/drive/DriveNotificationSettings.tsx`: admin audit külön szekcióban, kizárólag a jogosultnak; saját értesítési előzmények minden megfelelően jogosult felhasználónak külön.
- A DB ledger csupán egyirányú, történeti címzett e-mail SHA-256 hash-t tárol; tényleges történeti SMTP címzettlista e-mail és XLSX kijelzése **NEM kész**; külön szerveroldali/hozzáférési/adatvédelmi döntés szükséges, csak engedélyezett címzettekkel.

**3. Kiadásbiztonsági automatikus regression.**
- `scripts/tests/drive-notification-release-safety-contract.mjs`: a producer és az SMTP küldés kódszintű `false` kapcsolója, két adminjogosultság, önálló user history és munkanaptár RLS ellenőrzése.
- `scripts/tests/drive-notification-hu-calendar-contract.mjs`: 14/14 PASS, szintetikus november nélküli, részleges hónap nélküli, átmozgatott szombatos és késői havi ütemezési próba.
- `scripts/tests/drive-notification-admin-audit-contract.mjs`: 8/8 PASS, projektközi izoláció és „jelenlegi e-mail nem történeti cím” bizonyítás.

## Release előtt kötelező vizsgálatok

1. Drive Supabase/PostgreSQL DBA migrációk szemrevételezése és külön jóváhagyása: a három önálló `20261010_drive_*_v010.sql` (document_follow, review_decision_events, notification_preferences) függőségei után `v011` delivery gate, `v012` consent RPC, `v013` cursor producer, `v014` HU calendar. Azonos dátumú fájlok név szerint, kötelező sorrendben; automatikus lexikális glob nem biztonságos.
2. A központi AUTH profilfotó migrációja **külön adatbázison**: `db/auth/migrations/012_auth_v049_profile_photo.sql`, saját `db.dimpro.hu` / saját AUTH PostgreSQL, Supabase AUTH nélkül.
3. `v014` adatbázist tartsuk forrásadathoz kötve; a magyar hatályos munkaszüneti és áthelyezett munkanapokról hivatalos, hitelesített naptár importja, emberi jóváhagyással; bizonyíték/forráskövetés.
4. Valós PostgreSQL SQL-parser/DB tranzakciós integrációs teszt elkülönített DEV adatbázisban; ezek a forrásbeli unit/static tesztektől különböznek.
5. BUILD01/BUILD02 Next build, többszerepkörös böngészős QA, Drive/Projektkapu/auth regression, HTML/XLSX és felhasználói profilfotó E2E.
6. A levelező és a producer valós aktiválásához önálló review + célzott manuális jóváhagyás, először izolált tesztcímmel. Addig a `DRIVE_DIGEST_SENDING_RELEASED=false` és `PRODUCER_RELEASED=false` hard gate marad, scheduler nincs.
7. További ütemező/scanner: napi/órás autonóm futás, hibák és elakadt sorok dashboard, külön dokumentum-követési frekvencia végleges kezelése. Ezek még fejlesztendők.

## Forrás QA – 2026-10-10

- 11 különálló notification contract tesztcsoport: PASS.
- TypeScript: PASS.
- ESLint: PASS.
- git diff --check: PASS.
- SQL-migrációk futtatása: NEM.
- PROD: DENY.

A korábbi átadók további V0.9.34 részfeladatokat tartalmaznak:
`DIMPRO_DRIVE_V0934_COMPLEX_SOURCE_HANDOFF_20261010.md`,
`DIMPRO_DRIVE_V0934_NOTIFICATION_DISPATCH_PHASE2_20261010.md`,
`DIMPRO_DRIVE_V0934_NOTIFICATION_PRODUCER_PHASE3_20261010.md`.
