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

## 11. AUTH V0.4.3–V0.4.4 SSO hotfixek

2026-10-04-én a böngészős Drive SSO E2E során két külön hibát sikerült reprodukálni és javítani.

### V0.4.3 – PostgreSQL sorzár-szűkítés

Az SSO authorization-code kiadás és exchange lekérdezései JOIN mellett általános `FOR UPDATE` zárat használtak. PostgreSQL emiatt a csak olvasandó JOIN-táblákat is zárolni próbálta, ami least-privilege runtime szerepkör mellett hibát okozott. A javítás kizárólag a ténylegesen módosítandó sorokat zárolja:

- authorization request: `FOR UPDATE OF r`;
- authorization code: `FOR UPDATE OF ac`;
- app-session revoke: `FOR UPDATE OF s`.

A runtime szerepkörhöz nem került új, felesleges UPDATE jogosultság.

### V0.4.4 – redirect response cookie-k explicit kötése

A Drive callback sikeresen létrehozta az `auth_app_sessions` rekordokat, de böngészőben redirect loop alakult ki. A callback és start route-ok cookie-kezelése explicit módon a ténylegesen visszaadott `NextResponse` objektumhoz lett kötve:

- `__Host-dimpro_sso` a start redirect response-on;
- `__Host-dimpro_app` a callback redirect response-on;
- flow-cookie törlés a saját hiba/siker response-on.

Új contractok:

- `auth-v043-sso-row-lock-contract.mjs` → `5/5 PASS`;
- `auth-v044-response-cookie-contract.mjs` → `6/6 PASS`.

V0.4.4 runtime source: `f65fe8f5653e5af59c96d04cd26547c2d3abfaef`. Build ID: `MOdqGa9JjpmsNucoWLDyV`. Artifact SHA-256: `171ec930fa843c24872e002a22775f15c555151c6568fb79d2b264180270007f`.

DEV aktiválás: AUTH `127.0.0.1:3367`, Drive `127.0.0.1:3368`. Korábbi V0.4.3 runtime-ok rollbackként futva megmaradtak. PROD továbbra is DENY.

## 12. V0.4.5–V0.4.6 Drive SSO redirect-loop lezárás

A böngészős E2E napló alapján a callback első kérése már sikeresen lefutott (`SSO_AUTHORIZE=SUCCESS`, `SSO_TOKEN_EXCHANGE=SUCCESS`), majd a böngésző visszatért `/drive`-ra. A loopot két Drive-oldali örökölt viselkedés tartotta fenn.

### V0.4.5 – auth redirect cache tiltása

Minden Drive authentication redirect explicit `Cache-Control: no-store, no-cache, max-age=0, must-revalidate`, `Pragma: no-cache`, `Expires: 0` fejlécet kap. Ez megakadályozza a session nélküli 307 válasz böngésző/edge újrahasználatát.

### V0.4.6 – legacy DEV password gate kikapcsolása central SSO alatt

Az `app/drive/page.tsx` korábban a proxy által már elfogadott central app-session után is ellenőrizte a régi `DRIVE_DEV_ACCESS_COOKIE` cookie-t, és annak hiányában `/login`-ra redirectelt. Ez hozta létre a ciklust:

`callback SUCCESS → /drive → /login → SSO start → authorize → callback`.

V0.4.6-tól, ha `resolveDriveSsoConfig(host)` central SSO-t jelez, a Drive page **nem** futtatja a legacy DEV password gate-et. A legacy fallback csak nem-SSO hoston marad meg.

V0.4.6 source commit: `63b55aa03384da4cc67029295bb46d3eb3291780`. Build ID: `S0Q8kSLGruMWmmlpSSEIn`. Artifact SHA-256: `2f9529ea0cacc6846df66e301d566cab9dc9162a82ce49c50b3cf72e1b3e4076`.

DEV Drive upstream: `127.0.0.1:3370`; header: `63b55aa0 DRIVE V0.9.13 AUTH V0.4.4 SSO PAGEFIX DEV`. A V0.4.5 cachefix runtime `127.0.0.1:3369` rollbackként online maradt. PROD DENY.

## 13. V0.4.8 – Drive single authoritative auth gate

A 2026-10-04-i böngészős E2E naplók bizonyították, hogy az első callback sikeres volt, az `auth_app_sessions` rekord létrejött, és a konkrét app-sessionhöz `drive.access = TRUE` tartozott. A callback után mégis `/drive → /login` redirect történt.

A végleges architekturális javítás: a Drive hitelesítésnek egyetlen authoritative kapuja marad, a `proxy.ts`.

- Central SSO hoston: `__Host-dimpro_app` session + `drive.access` permission ellenőrzés a proxyban.
- Legacy DEV mód csak akkor aktív, ha nincs central SSO konfiguráció.
- `app/drive/page.tsx` többé nem tartalmaz saját auth redirectet, host-alapú auth döntést, `DRIVE_DEV_ACCESS_COOKIE` ellenőrzést vagy `/login` redirectet.
- A DrivePage kizárólag rendereli a Drive UI-t; ha a proxy beengedte a kérést, a page nem végez második, versengő hitelesítést.

Új contract: `auth-v048-drive-single-auth-gate-contract.mjs` → `5/5 PASS`.

A V0.4.8 javítást a közben live-ra került BenjaminAI Desktop scan-auth ággal (`01fd976ace0b828e74ec085c8f368287465079ac`) egyesítettük. Az integrált merge commit: `12f62a7d39a5263860deeb8a3ee4074b81cce963`.

Integrált build ID: `QCWId8ANOj8Sr1wV85kRQ`. Artifact SHA-256: `f196cc8e126ca76cee3ca31907880000df111496f7ae711353b17e4c88dee513`.

DEV Drive upstream: `127.0.0.1:3373`. Header: `12f62a7d DRIVE V0.9.13 AUTH V0.4.4 SSO SINGLE-GATE + DESKTOP SCAN AUTH DEV`. A korábbi `01fd976a` scanfix runtime `127.0.0.1:3372` porton rollbackként online maradt. PROD DENY.

## 14. V0.4.9 – terminal central SSO proxy ág

A böngészős E2E napló alapján a central SSO authorize és token exchange sikeres volt, az app-session létrejött, és a konkrét sessionhöz `drive.access = TRUE` tartozott. A tényleges redirect-loop oka a Drive proxy vezérlési láncában volt: sikeres central SSO ellenőrzés után a kérés továbbfutott a legacy Supabase auth-rétegbe, amely Supabase session hiányában `/login` redirectet adott.

A V0.4.9 javítás sikeres central Drive SSO + `drive.access` ellenőrzés után azonnali `return response`-szal terminálja a Drive auth-láncot. A legacy Supabase auth többé nem kaphatja meg ugyanazt a már central SSO-val hitelesített Drive kérést.

Contract: `auth-v049-drive-proxy-terminal-sso-contract.mjs` → `6/6 PASS`.

Source commit: `9f45b8bf9ec0b49901ecccf7806c60334df44afd`. Build ID: `TLFlNLDXd43zn4HIVsWGp`. Artifact SHA-256: `b4377b153fcab88d17c4cd10bf7c6835757aedf9b581d4d9832ed8c25e2b82bb`.

A böngészős E2E a javítás után sikeres volt: a Drive felület betöltött, és az SSO redirect-loop megszűnt.

## 15. V0.5.0 – első osztályú Saját Drive munkatér

A DriveShell a korábbi `/api/projects` lista helyett a közös `/api/drive/workspaces` contractot használja. A személyes Drive és a projektmunkaterek külön típusok maradnak; a Saját Drive nem álprojekt.

Fő működés:

- `PERSONAL` workspace ID: `personal:<userId>`;
- `PROJECT` workspace ID: `project:<projectId>`;
- személyes jogosultság esetén a Saját Drive az elsődleges/alapértelmezett munkatér;
- projekt létrehozása után a `project:<id>` munkatér kerül kiválasztásra;
- projekt-specifikus provisioning, ACL, Beérkező Drop, Kedvencek és CsomagBOX nem fut személyes módban;
- a projekt-Drive meglévő motorja változatlanul projektmunkatérként működik.

A személyes Drive jelenlegi backend-képessége szándékosan `USER_ROOT` szintű. A teljes személyes mappafa még nincs aktiválva, ezért a UI ezt egyértelműen jelzi és nem imitál projektmappafát.

Új személyes tartalom API-k:

- `GET /api/drive/personal/content` – kizárólag exact `drive.personal.access` entitlement után, owner-scoped USER tartalomreferenciák;
- `GET /api/drive/personal/content/[refId]/download` – exact tulajdonosi ellenőrzés, csak `security_status=clean` és `virus_scan_status=clean` tartalomhoz, szerveroldali signed GET URL-lel.

A Content Core lekérdezés `owner_type=USER` + exact `owner_user_id` alapján történik. Storage key nem kerül ki a listázó API válaszában.

Új UI: `PersonalDriveWorkspace`, amely a tényleges USER_ROOT tartalmakat mutatja név, forrás, méret, módosítási idő és biztonsági státusz szerint. Üres USER_ROOT esetén külön személyes Drive üres állapot jelenik meg, nem a korábbi „Nincs elérhető projekt” üzenet.

Contract: `auth-v050-personal-workspace-ui-contract.mjs` → `10/10 PASS`. TypeScript PASS 4 GB heap mellett; targeted ESLint PASS; teljes AUTH/Drive/Desktop regressziós csomag PASS.

V0.5.0 source commit: `711b7e1bc7d52e1113faf05f56ec7e5cfc45ed8b`. Build ID: `tmnNr9d2QZO_det4YRogW`. Artifact SHA-256: `f53b3e11011eb856f8cadf9fe07df2a2d4e8864034fdd786cc6b8ae2b3d4a5e4`.

DEV aktiválás: Drive `127.0.0.1:3375`; publikus header: `711b7e1b DRIVE V0.9.13 AUTH V0.5.0 PERSONAL USER_ROOT + SSO TERMINAL + DESKTOP SCAN AUTH DEV`. Előző `9f45b8bf / 3374` runtime rollbackként online maradt. AUTH továbbra is V0.4.4 `3367`. PROD DENY.
