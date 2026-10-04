# DIMPRO AUTH + Drive V0.4.2 – Saját Drive regisztráció, egységes munkatér és projekt-hozzáférés

Állapot: **DEV ACTIVE · PROD DENY**
Dátum: **2026-10-04**

## 1. Aktivált baseline

- Központi AUTH: **V0.4.2 DEV**.
- Drive: **V0.9.13 + AUTH V0.4.2 + Drive Desktop V0.1.7 DEV**.
- Integrált runtime source commit: `b019cd8f6615a09ca753c80d25b9ef66953dbed8`.
- Integrált build ID: `JpQkuDcVbPs3E862kUhPv`.
- Integrált artifact SHA-256: `6411f8b6ce6a0cd903d2af2c3f3237e49c89832bd590aa49bd3498dac539d1fd`.
- AUTH DEV DB migration baseline: **7 migráció**; aktuális utolsó migráció: `007_auth_v040_drive_registration.sql`.
- A PROD elérés továbbra is tiltott.

## 2. Saját Drive regisztráció

A központi DIMPRO belépés továbbra sem általános, nyitott OTP-belépés ismeretlen felhasználóknak. Ettől külön folyamatként létezik a **Saját Drive igénylése**.

DEV útvonal: `https://auth.dev.dimpro.hu/register/drive`.

Folyamat:

1. A felhasználó megadja a nevét, e-mail-címét és opcionálisan a szervezetét.
2. A rendszer külön `DRIVE_REGISTRATION` célú, egyszer használatos OTP-t küld.
3. Új identity esetén az `auth_users` rekord `ACTIVE`, `SIMPLE`, de `login_enabled=false` állapotban jön létre.
4. Az OTP sikeres ellenőrzése csak az e-mail-címet igazolja, és a regisztrációt `EMAIL_VERIFIED` állapotba viszi.
5. **Az e-mail-cím igazolása önmagában nem ad Drive tárhelyet, előfizetést vagy `drive.personal.access` grantot.**
6. Saját Drive aktiválás csak külön jogosultság/licenc/admin jóváhagyás után történhet.
7. Ha az e-mail már projektmeghívott identityhez tartozik, ugyanaz az `auth_users.id` használható tovább; nem készül második felhasználói identity.

A regisztráció lifecycle: `PENDING_EMAIL → EMAIL_VERIFIED → APPROVED | REJECTED | CANCELLED`.

DEV admin jóváhagyási művelet: `approve-personal-drive-registration`. Ez csak `EMAIL_VERIFIED` kérésből adhat `DRIVE_PERSONAL_USER` jogosultságot és kapcsolhatja be a belépést.

## 3. Személyes és projekt Drive jogosultság különválasztása

A központi identity egyetlen személyhez egyetlen `auth_users.id` rekordot használ. A hozzáférések külön entitlementek:

- `drive.personal.access` → Saját Drive; `project_id IS NULL`.
- `drive.project.access` → pontos projekthez kötött hozzáférés.

Ezért egy felhasználó lehet:

- csak projektmeghívott;
- csak Saját Drive felhasználó;
- Saját Drive + egy vagy több projekt résztvevője.

Projekt-hozzáférés visszavonása nem vonhatja vissza a személyes Drive grantot. Személyes Drive aktiválása nem adhat automatikusan idegen projekthez hozzáférést.

## 4. Egységes Drive munkatér-szerződés

Új protected API: `GET /api/drive/workspaces`.

A válasz ugyanazon központi identity alatt két külön típust kezel:

- `PERSONAL` – Saját Drive;
- `PROJECT` – meghívott vagy saját projekt munkatér.

A Saját Drive **nem hamis projektként** jelenik meg. A V0.4.2 szerződésben `projectId=null`, `storageScope=USER_ROOT`, `browsing=LIMITED_ROOT`, és a teljes projekt-mappafa még nincs készre jelentve. A jelenlegi személyes Drive backend ezért külön, korlátozott `USER_ROOT` képességként szerepel.

A projektmunkatér megőrzi a Project Core projektazonosítót, szerepkört és permission-listát.

## 5. Projektmeghívás regisztrációs kényszer nélkül

A projektgazda/projektvezető a Drive **Projekt-hozzáférések** panelből küldhet meghívást. A meghívás felhasználói inputja:

- e-mail-cím;
- szervezet;
- jogosultság/szerepkör.

A külön névmező kikerült a meghívó űrlapból. A meghívott személy központi identityje az e-mail-címhez kötődik.

Választható Project Core szerepkörök:

- `PROJECT_MANAGER` – Projektvezető;
- `CONTRIBUTOR` – Közreműködő;
- `REVIEWER` – Ellenőrző;
- `VIEWER` – Megtekintő.

A központi AUTH-ban kizárólag a `PROJECT_MANAGER` kap `DRIVE_PROJECT_MANAGER` grantot; a többi projektszerep `DRIVE_PROJECT_MEMBER` grantot kap. A részletes szakmai szerepkör a Project Core-ban marad authoritative.

A meghívottnak **nem kell külön regisztrációs űrlapot kitöltenie**. A meghívó elfogadása után a központi AUTH/OTP flow igazolja az identityt, majd pontosan a meghívott projekthez tartozó grant aktiválódik.

Ha a meghívott később Saját Drive csomagot kap, ugyanahhoz a központi identityhez kerül hozzá a személyes entitlement; a projektjei változatlanul megmaradnak.

## 6. Projekt-hozzáférés adminisztráció

A Drive V0.9.13 ProjectAccessMenu integrált adminfunkciói megmaradtak és V0.4.2 AUTH-tal működnek:

- aktív tagok listázása;
- függő meghívások listázása;
- meghívó újraküldése;
- meghívó visszavonása;
- aktív tag szerepkörének módosítása;
- projekthozzáférés megszüntetése;
- OWNER és saját szerepkör védelme.

A `project.manage_members` jogosultság szerveroldali, authoritative Project Core ellenőrzésből származik.

## 7. Biztonsági szabályok

- Projektmeghívás nem ad személyes Drive-ot.
- Saját Drive regisztráció nem grantol automatikusan tárhelyet.
- Ismeretlen felhasználó továbbra sem léphet be pusztán a login oldalon megadott e-mail-címmel.
- Meghívás és regisztráció külön OTP/invitation célokat és egyedi tokeneket használ.
- Grant-változás a `session_version` mechanizmuson keresztül érvényteleníti a régi sessionöket.
- Projektmeghívásnál a szervezet kötelező és audit metaadatként is megőrződik.
- A Drive és AUTH böngészős session központi SSO-ra épül.
- PROD hozzáférés tiltott.

## 8. Teszt- és buildállapot

Integráció előtt és merge után PASS:

- AUTH security: `56/56`;
- AUTH invitation: `25/25`;
- AUTH project scope: `8/8`;
- Drive project integration: `16/16`;
- AUTH session policy: `16/16`;
- Saját Drive registration: `11/11`;
- unified workspaces: `7/7`;
- integrált project invitation UI: `8/8`;
- Drive V0.9.13 + AUTH V0.4.2 compatibility: `10/10`;
- Drive V0.9.13 Project Access Administration: `19/19`;
- Drive Desktop V0.1.7 Plan: `41/41`;
- Drive Desktop V0.1.7 plan acceptance: `13/13`;
- Drive Desktop V0.1.7 download apply acceptance: `14/14`;
- Drive Desktop V0.1.7 security scan acceptance: `15/15`;
- targeted ESLint: PASS;
- `git diff --check`: PASS;
- teljes integrált Next.js build: PASS.

## 9. DEV runtime / rollback

- `auth.dev.dimpro.hu`: AUTH V0.4.2, source `b29f9407...`, DB migrationCount `7`.
- `drive.dev.dimpro.hu`: integrált Drive V0.9.13 + AUTH V0.4.2 + Desktop V0.1.7, source `b019cd8f...`.
- Aktív Drive upstream: `127.0.0.1:3364`.
- Drive rollback candidate: korábbi `61826450` runtime `127.0.0.1:3361`, futva megőrizve.
- Nginx cutover backup: `/srv/dimpro-dev/artifacts/backups/nginx-drive-v0913-auth042/`.

## 10. Következő fejlesztési lépés

A következő nagy feladat a Saját Drive tényleges, első osztályú böngészhető tárolómotorának kialakítása. A jelenlegi `USER_ROOT` tartalomréteg nem kezel még teljes mappafát, ezért a projektalapú Drive Core-t nem szabad hamis személyes projekttel újrahasznosítani. A következő fázisnak valódi personal-workspace storage/provisioning modellt kell adnia, amely ugyanazon közös fájlmotorra épülhet, de nem szivárogtat projekt-szemantikát.
