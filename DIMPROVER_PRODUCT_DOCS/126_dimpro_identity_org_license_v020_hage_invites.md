# DIMPRO Identity Core 0.2.0 – szervezeti licenc, felhasználói helyek és meghívások

Dátum: 2026-08-10
Állapot: DEV validáció alatt, production csak DEV PASS után
Dev Center: `version_ca168289-4d5`
Korábbi, az M2 PostgreSQL migrációból kimaradt hivatkozás: `version_ac6e2f1f-a0d`

## Cél

A HAGE-INVEST Kft. korábbi, gépkötött HAGE-INVEST ONE / munkatér licencét nem külön második licencként kezeljük, hanem egyetlen központi szervezeti licenc alapjaként. A gépkötés megmarad az azt igénylő desktop alkalmazásoknál, miközben ugyanahhoz a szervezeti licenchez webes szolgáltatások – például DIMPRO Send, Gyors KépSend és DIMPRO Drive – is kapcsolhatók.

## Végleges licencmodell

- `max_users`: szervezeti felhasználói helyek száma.
- `max_devices`: külön eszköz-/géplimit; nem azonos a felhasználói hellyel.
- `legacy_license_ref`: a korábbi licencrekord biztonságos hivatkozása; nyers licenckulcs nem kerül az Identity Core-ba.
- `dimpro_license_modules`: a szervezet által megvásárolt/engedélyezett szolgáltatások.
- `dimpro_membership_modules`: az egyes szervezeti tagokra szűkített szolgáltatások.
- A felhasználó csak olyan modult kaphat, amelyet a szervezeti licenc is tartalmaz.
- A Send/Drop runtime a felhasználói modul-szűkítést is érvényesíti.

## Meghívási folyamat

1. Licencközpont → szervezeti licenc.
2. `Felhasználó meghívása`.
3. Név, e-mail, szerepkör és engedélyezett szolgáltatások kiválasztása.
4. A meghívás lefoglal egy felhasználói helyet.
5. A rendszer kriptográfiailag véletlen, egyszer használatos tokent készít.
6. Az adatbázis kizárólag HMAC-SHA256 lenyomatot és rövid hintet tárol; nyers token nincs tárolva.
7. Meghívó e-mail a DIMPRO központi mail infrastruktúrán keresztül.
8. Az egyszer használatos link a `/account/meghivas` oldalra vezet.
9. Elfogadáskor a központi felhasználó és tagság aktív lesz, az e-mail az invitation-flow alapján ellenőrzött állapotba kerül.
10. Ezután a felhasználó e-mail + egyszer használatos OTP kóddal lép be.
11. Első sikeres központi OTP belépésnél a `dimpro_users.auth_user_id` összekapcsolható a Supabase Auth felhasználóval.

A függő meghívás visszavonható; ekkor a meghívott tagság revokált lesz és a felhasználói hely felszabadul.

## Belépési kapu

A korábbi `DIMPRO_APP_ALLOWED_EMAILS` tulajdonosi lista biztonsági fallbackként megmarad. Az új elsődleges adatbázisos jogosultság:

- aktív és e-mailben igazolt `dimpro_users` rekord;
- és aktív felhasználói licenc, vagy
- aktív szervezeti tagság + aktív/trial szervezeti licenc;
- tagsági lejárat és licenclejárat ellenőrzése.

A `request-otp`, `verify-otp` és `proxy.ts` ugyanazt a központi jogosultsági modellt használja.

## DEV HAGE-INVEST fixture

DEV Supabase-ben létrejött:

- Szervezet: `HAGE-INVEST Kft.`
- Központi licenc: `LIC-26-HAGE-2468`
- `max_users = 20`
- `max_devices = 20`
- `legacy_license_ref = lic-hage-invest-mvp`
- lejárat a régi licenccel összehangolva: 2027-01-01
- modulok:
  - `HAGE_WORKSPACE`
  - `TASKS`
  - `VACATIONS`
  - `AI_ASSISTANT`
  - `DROP_SEND`
  - `DROP_QUICK_IMAGE_SEND`
  - `DROP_PROJECT_INBOX`
  - `DRIVE`

A DEV fixture-ben a fejlesztési tesztek után 1/20 hely foglalt, 19 szabad.

## Adatbázis

Migráció:
`supabase/migrations/20260810063500_dimpro_org_license_seats_invites_v020.sql`

Új tábla:
- `dimpro_membership_modules`
- `dimpro_organization_invitations`

Identity schema marker:
- version: `0.2.0`
- migration count: `4`
- bootstrap id: `dimpro-identity-org-license-v020-20260810`

DEV adatbázis backup:
`/srv/dimpro-dev/artifacts/identity-org-license-v020-db-pre-20260810T062840Z`

DEV forrásbackup:
`/srv/dimpro-dev/artifacts/identity-org-license-v020-preedit-20260810T062040Z`

## DEV tesztek az első build előtt

- `npx tsc --noEmit`: PASS
- teljes `npm run lint`: 0 error / 108 meglévő warning
- `dimpro-identity-core-schema-contract.test.mjs`: PASS
- `dimpro-identity-org-license-v020-contract.mjs`: 24/24 logikai kapu PASS
- `dimpro-supabase-migration-order-contract.mjs`: PASS, 29 migráció
- `dimpro-identity-core-live-preflight.mjs`: READY, Identity 0.2.0, feature flag ON
- HAGE szervezeti licenc + invitation integráció: 19/19 PASS
- ellenőrizve: seat limit, külön device limit, legacy hivatkozás, tokenhash, preview, elfogadás, OTP jogosultság, tagsági modul-szűkítés, Send tiltás, keretcsökkentés-védelem, cap enforcement, revoke/seat release és teszttakarítás.

### DEV séma-paritási javítás

A compiled Licencközpont teszt során kiderült, hogy a production Send motorban már használt `max_saved_contacts`, `upload_rules_acceptance_count`, `upload_rules_version` és `upload_rules_last_accepted_at` mezők productionben léteznek, de a DEV clean-install migrációs láncból hiányoztak. Az Identity 0.2.0 migráció idempotensen verziózza ezeket is; productionön a meglévő oszlopokat nem írja felül.

## Production migrációs elv

Csak DEV candidate build és E2E PASS után:

- production DB backup;
- Identity 0.2.0 séma migráció;
- a meglévő production `HAGE-INVEST Kft.` szervezethez egy központi szervezeti licenc létrehozása;
- `max_users = 20`, `max_devices = 20`;
- `legacy_license_ref = lic-hage-invest-mvp`;
- a két meglévő production tag (Keserű Benjámin, Csató Ferenc) megőrzése és szolgáltatás-hozzárendelése;
- a régi fájlalapú HAGE licenc és gépaktiválások NEM törlődnek;
- production build/release/smoke/E2E után Dev Center lezárás.

## Production kiadás – 2026-08-10

Állapot: **ÉLES / RELEASED**

- aktív release: `.next-identity-v020-release-final`
- BUILD_ID: `KTN9Co5yUC7kb4yhwBWXB`
- közvetlen alkalmazás rollback: `.next-v1211-release-final`
- DB/HAGE rollback: `supabase/IDENTITY_V020_HAGE_PROD_ROLLBACK_20260810.sql`
- aktiváló script: `scripts/activate-identity-v020-release.sh`
- kézi rollback script: `scripts/rollback-identity-v020-release.sh`
- production forrás- és DB backup: `backups/identity_org_license_v020_preprod_20260810T073236Z`
- teljes `public` custom dump és schema-only dump checksum-validált, `pg_restore --list` 1103 bejegyzést olvasott.

### Production HAGE-INVEST állapot

A korábbi `LIC-26-HAGE-HAGE` központi Send licencet helyben, új licenc létrehozása nélkül alakítottuk át HAGE-INVEST szervezeti licenccé. Az azonosító és a meglévő Send entitlement kapcsolat változatlan maradt.

- szervezet: `HAGE-INVEST Kft.`
- központi licenc: `LIC-26-HAGE-HAGE`
- `owner_type = organization`
- `max_users = 20`
- `max_devices = 20`
- `legacy_license_ref = lic-hage-invest-mvp`
- közös licenc lejárata: 2027-12-31
- legacy HAGE modulok (`HAGE_WORKSPACE`, `TASKS`, `VACATIONS`, `AI_ASSISTANT`) érvényessége: 2027-01-01
- összes aktív licencmodul: 10
- meglévő szervezeti tagok: Keserű Benjámin és Csató Ferenc
- tagsági modul-hozzárendelések az élesítéskor: 14
- Csató Ferenc számára a migráció nem hozott létre automatikusan új Send entitlementet.

### Production validáció

- production build: PASS
- standalone asset: 141/141 PASS
- Identity health: `0.2.0`, READY, 14/14 tábla
- schema marker: migration 4 / `dimpro-identity-org-license-v020-20260810`
- Drop health: `DROP 1.2.11`, `coreReady=true`
- DIMPRO Send: READY
- e-mail: READY
- ClamAV: READY
- worker claim limit: 4
- Identity 0.2.0 static contract: 27/27 PASS
- Identity Core V010 regressziós contract: PASS, 24 acceptance teszt
- meglévő Keserű Benjámin Send context: standard Send, Gyors KépSend, Projekt Drop és Quick Voice jogosultság megmaradt
- Keserű Benjámin központi login source: `identity_organization_license`
- Csató Ferenc központi login source: `identity_organization_license`
- browser/UI production smoke: 6/6 PASS
- mobil meghívóoldal: 390 px viewporton nincs vízszintes overflow
- teljes lint a release előtt: 0 error / 108 korábban meglévő warning

A külön 3220-as production candidate runtime a végső smoke után leállításra került.

## IDENTITY 0.2.1 hotfix – Send felhasználómeghívás / onboarding

Dátum: 2026-08-10

A `license.dimpro.hu/drive/drop/public-workflows` felületen a korábbi „Új központi felhasználó létrehozása” funkció még a régi Send-admin `createUser` útvonalat használta. Ez csendben aktiválta a központi rekordot, de nem hozott létre szervezeti meghívást és nem küldött meghívó e-mailt. Emiatt egy új vagy korábban migrált HAGE-tag nem kapott onboarding levelet.

A 0.2.1 hotfix:

- a public-workflows oldalon a régi közvetlen user-create UI helyett a `POST /api/dimpro-identity/admin/organization-invitations` folyamatot használja;
- szervezeti licenc, szerepkör és szolgáltatások választhatók;
- új felhasználónál központi user + `invited` tagság + egyszer használható meghívó + e-mail készül;
- meglévő aktív szervezeti tagnál, ha `auth_user_id` még nincs, onboarding meghívó küldhető úgy, hogy a tagság `active` marad;
- már valódi auth-fiókkal rendelkező aktív tag új szervezeti onboarding meghívását a backend továbbra is blokkolja;
- a Send entitlement admin explicit `grantMembershipModules: true` esetén a kiválasztott `DROP_SEND`, `DROP_QUICK_IMAGE_SEND`, `DROP_PROJECT_INBOX` modulokat a tagsághoz rendeli, de csak akkor, ha azokat a szervezeti licenc ténylegesen tartalmazza;
- a Send admin overview minden licencmodult visszaad, hogy a meghívópanelen a teljes szervezeti szolgáltatáskészlet választható legyen;
- a public-workflows fejléc alkalmazásverziója `IDENTITY CORE 0.2.1`; a DB-séma továbbra is `0.2.0 / migration_count=4`.

Validáció a build előtt:

- TypeScript: PASS
- célzott ESLint: PASS
- teljes lint: 0 error / 108 korábban meglévő warning
- statikus hotfix contract: 16/16 PASS
- production DB-integrációs fixture: 12/12 PASS
- fixture maradvány: 0

A teszt igazolta az új user invite → accept, aktív member onboarding → accept és Send entitlement által végzett explicit membership-module grant folyamatot.

### IDENTITY 0.2.1 – éles release eredmény

- Production release: `.next-identity-v021-release-final`
- BUILD_ID: `megBg7beGJiNIZEw_s7gM`
- Közvetlen alkalmazás-rollback: `.next-identity-v020-release-final`
- Aktiválási backup: `backups/identity_v021_release_activation_20260810_113716`
- Aktiváló script: `scripts/activate-identity-v021-release.sh`
- Rollback script: `scripts/rollback-identity-v021-release.sh`
- DB-séma: változatlan `0.2.0`, migration_count `4`
- TypeScript: PASS
- célzott ESLint: PASS
- full lint: 0 error / 108 baseline warning
- hotfix contract: 16/16 PASS
- közvetlen DB-integráció: 12/12 PASS
- final candidate API E2E: 8/8 PASS
- final candidate browser UI: 10/10 PASS
- production API E2E: 8/8 PASS
- production browser UI: 10/10 PASS
- standalone asset: 141/141 PASS
- production Identity health: 0.2.1 / 14/14 READY
- Drop regresszió: DROP 1.2.11 coreReady; Send, e-mail, ClamAV READY
- tesztfixture maradvány: 0
- candidate runtime leállítva, candidate build törölve

A `license.dimpro.hu/drive/drop/public-workflows` felületen most a központi felhasználó létrehozása helyett valódi szervezeti meghívási/onboarding folyamat érhető el. Új HAGE-felhasználó e-mailben meghívható; meglévő, auth-fiókkal még nem rendelkező HAGE-taghoz onboarding meghívó küldhető a meglévő aktív tagság megtartásával.
