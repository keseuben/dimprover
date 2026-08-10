# DIMPRO Identity Core 0.2.0 – szervezeti licenc, felhasználói helyek és meghívások

Dátum: 2026-08-10
Állapot: DEV validáció alatt, production csak DEV PASS után
Dev Center: `version_ac6e2f1f-a0d`

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
