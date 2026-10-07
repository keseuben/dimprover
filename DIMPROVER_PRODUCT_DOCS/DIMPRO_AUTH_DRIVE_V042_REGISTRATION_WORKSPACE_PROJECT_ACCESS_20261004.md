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

## 16. V0.5.2 – Saját Drive nézet-capability modell

A Saját Drive és a Projekt Drive közös nézetváltó komponenst használ, de workspace capability szerint eltérő nézetkészlettel.

- PERSONAL: `simple`, `engineering`;
- PROJECT: `simple`, `engineering`, `review`;
- a `Tervellenőrzés` projekt-only funkció marad;
- a Saját Drive Mérnöki nézet támogatja a személyes tervdokumentumok későbbi műszaki metaadatait;
- hiányzó tervszám/revízió/lépték nem kerül kitalálásra, `—` jelenik meg.

A premium loader V0.5.2-ben READY állapotot csak tényleges 100%-nál jelez; 75%-nál már nem jelenhet meg `SYSTEM READY` / `DIMPRO Drive készen áll`.

Source commit: `ba635548074b898fcf088739a924ac269c5a5cdb`. Build ID: `KIARgM_qtoC3rt0YFSjQA`. Artifact SHA-256: `dd358640c57a16663b7321abe0a7de0a534f2badc88d17f03ffff34a17622340`.

## 17. V0.6.0 – Saját Drive personal folder core

A Content Core korábban fenntartott `dimpro_content_refs.folder_id` mezőjére építve elkészült a külön, felhasználói tulajdonú személyes folder core. Ez nem projektmappa és nem használ projekt ACL-t.

Új tábla: `public.dimpro_content_personal_folders`.

Fő invariánsok:

- exact `owner_user_id` tulajdonosi scope;
- stabil UUID mappaazonosító;
- `parent_id` csak ugyanazon tulajdonos mappájára mutathat;
- aktív testvérmappák neve case-insensitive egyedi;
- safe mappanév validáció;
- soft-trash életciklus előkészítve;
- RLS aktív;
- `anon` és `authenticated` közvetlen tábla-hozzáférés tiltva;
- `service_role` szerveroldali hozzáférés.

A base Content Core `0.1.0` marker változatlan maradt. A personal folder add-on külön marker:

`content-personal-folders · 0.1.0 · content-personal-folders-v010-20261006`.

DEV migráció:

- migration SHA-256: `44857a6d9bd6307b665d6d4cfc1533d9855c4574606b1891ce7273aae98c971c`;
- canonical direct DEV target: `db.pbgyuznivqvestuksvif.supabase.co`;
- guarded preflight: PASS;
- guarded apply: PASS;
- külön verify: PASS;
- PostgREST schema visibility: PASS;
- meglévő content object/ref sorok apply előtt és után: `0 / 0`;
- új folder tábla induló sorai: `0`;
- backup: `/srv/dimpro-dev/backups/content-personal-folders-v010/20261006T111341Z/content-core-before-personal-folders-v010.dump`;
- backup SHA-256: `79345ec61be4eb5164820a8d02487ef81f69d39f8cdefa64f1674b44ecb24040`;
- PROD DENY.

A migration gate támogatja a canonical Supabase pooler és direct DEV targetet is, allowlistelt host/user párral és élő kapcsolati credential-próbával. Tooling fix commit: `25f32ecf3`.

V0.6.0 alkalmazásfunkciók:

- hierarchikus, lenyitható/összecsukható Saját Drive mappafa;
- gyökér és tetszőleges mélységű almappák;
- inline `Új mappa` névbevitel Enter mentés / Esc megszakítás logikával;
- inline mappa-átnevezés;
- a fájllista az aktuális mappa közvetlen tartalmát mutatja;
- fájl célmappája módosítható exact owner-scope ellenőrzéssel;
- Egyszerű + Mérnöki nézet megmarad;
- Tervellenőrzés továbbra is projekt-only;
- destructive mappatörlés ebben a foundation fázisban nincs bekapcsolva.

Runtime source commit: `59e13dea48cb128c05e8337a1a7e2f04fec8e08c`. Build ID: `ETEOvFeKW3HlhLHvCSAop`. Artifact SHA-256: `7110cd1e1fa1fb678044116e5411871487e096126de7c8678206cc93364e02d0`.

DEV aktiválás: Drive `127.0.0.1:3378`; publikus header: `59e13dea DRIVE V0.9.13 AUTH V0.6.0 PERSONAL FOLDERS + SIMPLE+ENGINEERING + SSO TERMINAL + DESKTOP SCAN AUTH DEV`. V0.5.2 `3377` rollbackként online maradt. AUTH V0.4.4 változatlan. PROD DENY.

## 18. V0.6.1 – Saját Drive közös projekt-Drive felület

A V0.6.1 megszünteti a Saját Drive külön, egyszerűsített munkafelületének runtime-irányát. A személyes munkatér ugyanazokat a közös Drive UI komponenseket használja, mint a projekt Drive, capability-alapú eltérésekkel.

Közös komponensek és nézetek:

- `DriveToolbar`;
- `FolderTreePanel`;
- `FileGridPanel`;
- 1 / 2 / 3 paneles nézet;
- fekvő osztott nézet;
- Commander nézet;
- teljes ablakos táblázat;
- táblázat zoom;
- resizable oszlopok;
- közös mappafa és inline új mappa sor;
- közös kiválasztási és fájltábla logika;
- közös részletező/előnézeti panelhely.

A Saját Drive capability eltérései:

- `Egyszerű` és `Mérnöki` nézet aktív;
- `Tervellenőrzés` nem jelenik meg;
- projekt ACL / résztvevőkezelés / formális projektkiadás nem kerül át;
- személyes feltöltés, CsomagBOX, összehasonlítás és egyes projekt-backendhez kötött műveletek helye megmaradhat, de amíg nincs PERSONAL backend, fail-safe disabled állapotúak;
- projekt Drive-ban ugyanezek a közös komponensek a meglévő handlerek miatt változatlanul aktívak maradnak.

Új személyes preview API:

`GET /api/drive/personal/content/[refId]/preview`

A preview exact személyes entitlement + owner scope alapján működik, és csak `security_status=clean` + `virus_scan_status=clean` fájlt ad ki rövid életű signed inline URL-lel.

A személyes mappa átnevezés a projekt Drive műveleti mintáját követi: kiválasztott mappa → `Mappa átnevezése` → közös dialógus-stílus, személyes owner-scoped PATCH endpointtal.

V0.6.1 contract: `auth-v061-personal-shared-surface-contract.mjs` → `18/18 PASS`. A V0.6.0, V0.5.2, V0.5.1, V0.5.0, SSO, workspace, Drive compatibility és Desktop regressziók PASS; targeted ESLint és TypeScript PASS.

Source commit: `3e8bf7672fb209cf4f9f81e644321eb93f35b159`.
Build ID: `1vvwHF49TX5Cg_drne7O3`.
Artifact SHA-256: `3dd41a8784fb55c1ebdf7bede00844402eb87957e8efe421d8b923d3f2813c0f`.

DEV aktiválás: Drive `127.0.0.1:3379`; publikus header: `3e8bf767 DRIVE V0.9.13 AUTH V0.6.1 SHARED PERSONAL SURFACE + PERSONAL FOLDERS + SSO TERMINAL + DESKTOP SCAN AUTH DEV`.
Rollback: V0.6.0 `59e13dea / 3378` online maradt. AUTH V0.4.4 változatlan. PROD DENY.

## Külsős projektmeghívás hardening V0.6.6 – 2026-10-06

A projekt-only külsős hozzáférés authoritative szabályai:
- a meghívás Project Core oldalon kizárólag `INVITED` tagságot készít;
- az AUTH meghívás elfogadása exact projekt scope-ú `drive.project.access` grantet ad, személyes `drive.personal.access` grantet nem;
- az SSO callback csak a központilag ténylegesen engedélyezett külső projektazonosítókat aktiválja `INVITED → ACTIVE` állapotra és a központi user ID-hoz köti;
- a projekt-only meghívott munkatérlistájában nincs Saját Drive; a Drive Shell az első elérhető projektmunkateret választja;
- projekt-only felhasználó új projektet nem hozhat létre. Átmeneti fail-closed szabály szerint projektlétrehozás csak külön Saját Drive entitlement mellett engedélyezett; később ez külön csomag-/`project.create` entitlementre cserélhető;
- meghíváskészítés közbeni AUTH-hiba esetén az új Project Core `INVITED` tagság kompenzációsan visszavonódik, így nem marad szellemtag;
- e-mail kézbesítési hiba esetén az AUTH meghívás és az új Project Core meghívott tagság is visszavonódik;
- aktív tag eltávolítása exact AUTH projektgrant visszavonással és Project Core tagság-visszavonással történik;
- `PROJECT_MANAGER ↔ normál projekttag` AUTH szerepkörváltás a 008 migráció `auth_set_project_access_role(...)` SECURITY DEFINER függvényével egyetlen PostgreSQL tranzakcióban történik;
- `CONTRIBUTOR`, `REVIEWER`, `VIEWER` központi AUTH szinten `DRIVE_PROJECT_MEMBER`, a részletes dokumentum-/projektműveleti jogokat a Project Core szerepkör adja;
- mappa ACL és jelszóvédelem a Project Core `document.read` alapjog után további, fail-closed réteg marad.

AUTH DB:
- migration `008_auth_v045_project_access_role_atomic.sql`;
- SHA-256 `1f140ec9460842d95a0acac81a4ad8a7e6689b47c2386567a2599645ef76105c`;
- DEV migrationCount `8`;
- `dimpro_auth_app_dev` EXECUTE: igen;
- PUBLIC EXECUTE: nem;
- migráció előtti teljes DEV backup: `/var/backups/dimpro-auth/dimpro_auth_dev_before_008_20261006T202654Z.dump`, SHA-256 `57b426bb12ebdd359026cdc19516d889fe7086fa4e0d842ceb6f41b522038a4b`.

DEV runtime:
- source `91af6c0ce6d67ffb1a0936169de8b32d2dabe1b8`;
- build `a2g_UI-EVVWDIEJyw8kY1`;
- artifact SHA-256 `9c31a103e8e5c14430fb2eb7c2899cce9169a7654b63e25271c11d892adcf0dc`;
- Drive port `3389`;
- rollback `3388` online;
- PROD DENY.

Contractok: external guest 9/9 PASS, atomic role 8/8 PASS, invitation 25/25 PASS, Drive project integration 16/16 PASS, invite UI 8/8 PASS, project access admin 19/19 PASS, AUTH compatibility 10/10 PASS, security 56/56 PASS, TypeScript/ESLint/build PASS.

## Legacy projektvezető SSO szinkron V0.6.7 – 2026-10-06

Régi DEV pilot projektek esetén előfordult, hogy a Project Core aktív OWNER még `dev-web-user` identityhez tartozott, miközben a valódi központi AUTH felhasználó már exact `DRIVE_PROJECT_MANAGER` projektgranttel rendelkezett. Emiatt a projekt nem jelent meg a valódi user Drive munkaterei között.

V0.6.7-től az SSO callback fail-closed legacy reconciliationt végez:
- csak központilag engedélyezett external project ID-kből indul;
- előbb normál `INVITED → ACTIVE` tagságaktiválást próbál;
- legacy repair csak exact aktív AUTH project scope + `DRIVE_PROJECT_MANAGER` + `project.members.invite` esetén lehetséges;
- csak olyan projektnél fut, ahol aktív OWNER `user_id = dev-web-user`;
- ha a központi usernek már van nem visszavont Project Core tagsága, nem készít duplikációt;
- új OWNER-t nem készít: aktív `PROJECT_MANAGER` tagságot materializál a központi UUID/e-mail identityre;
- a régi OWNER sor változatlanul megmarad.

Szekszárd DEV projekt authoritative AUTH scope:
- external project ID: `project-2e0556c5-1cc`;
- auth project ID: `8b62068b-1b4b-43cc-914a-ba0b4a95c1a5`;
- központi user: `keseruben@gmail.com` / `2f99c2eb-c777-4ae3-8fff-6d37bea9a94b`;
- exact `DRIVE_PROJECT_MANAGER` grant létrejött a hivatalos `auth_register_project_scope(...)` bridge-dzsel.

Release:
- source `2f5ba3cd4907b0ba5fb608dfd162498a076d2060`;
- build `1VsTANAwbEjuFDwPkhL2R`;
- artifact SHA-256 `0092b85f92f67e286baad4aa037f7ec2e87e58aeaf43e8172c4aa0d6dea6e38a`;
- DEV runtime `dimpro-drive-v0913-auth067-legacysync-2f5ba3cd4-p3390`, port 3390;
- rollback 3389 online;
- PROD DENY.

Contractok: V0.6.7 legacy manager sync 8/8 PASS, V0.3.2 Drive project integration 16/16 PASS, V0.6.6 external guest 9/9 PASS, atomic role 8/8 PASS, project access admin 19/19 PASS, AUTH compatibility 10/10 PASS, TypeScript/ESLint/build PASS.

## Projekt-hozzáférés profil UX V0.6.8 – 2026-10-07

A projekt-hozzáférések panel a meghívási és sajátprofil-kezelési folyamatot az alábbiakkal egészíti ki:
- a saját aktív projekttagság teljes kártyája `data-self=true` jelölést és jól érzékelhető, de visszafogott türkizzöld hátteret kap; a `Te` badge továbbra is megmarad, ezért a szín nem az egyetlen azonosító;
- a saját kártya kiemelése light és dark témában, hover állapotban és mobil nézetben is megmarad;
- az új projektmeghívás UI-ban a `Név *` mező kötelező, 2–160 karakteres értékkel; a frontend a meglévő `displayName` backend mezőt küldi, az API backward compatibility miatt továbbra is képes régebbi kliensek név nélküli kérését kezelni;
- a felhasználó a saját projektkártyájáról módosíthatja a saját nevét;
- a self-service profilmutáció csak same-origin Drive app-sessionből használható, target user azonosítót nem fogad, tehát normál felhasználó ezen az endpointon nem módosíthat másik felhasználót;
- authoritative profilnév a központi `auth_users.display_name`;
- sikeres self-service névmódosításkor a felhasználó elérhető aktív Project Core tagságainak `display_name` mezője is szinkronizálódik, hogy a központi és projektmegjelenítési név ne váljon indokolatlanul ketté;
- részleges Project Core hiba vagy AUTH-frissítési hiba esetén kompenzációs visszaállítás fut a már módosított tagságokra;
- AUTH oldalon `PROFILE_DISPLAY_NAME_CHANGED`, Project Core oldalon `PROJECT_MEMBER_DISPLAY_NAME_CHANGED` audit esemény készül.

Új endpoint: `PATCH /api/dimpro-auth/profile`.

Új contract: `scripts/drive-v0914-project-access-profile-contract.mjs` → `12/12 PASS`.
TypeScript, célzott ESLint és `git diff --check`: PASS.

A `benkesinfo@gmail.com` CONTRIBUTOR meghívás fizikai böngészős E2E-je ettől külön acceptance-feladat; PASS csak az elfogadás + OTP/SSO + projekt-only munkatér + olvasás + feltöltés + tagkezelési tiltás együttes bizonyítása után adható.

DEV ONLY · PROD DENY.

### V0.6.8 DEV aktiválás – 2026-10-07

- runtime source: `5fd99bab2987f3872b2562aae94621ecf5471c7e`;
- build runner: BUILD-02, manual safe fallback a Build Transport Gateway HTTP 403 miatt;
- build run: `drive-auth-profile-v068-5fd99bab2-20261007-manual-b2`;
- build ID: `xV6Alijf43B2UEEztHsqD`;
- artifact SHA-256: `40a0e053353aee15e6c42d786820aa9715a894779931677127245f07bf0ff82a`;
- release: `/srv/dimpro-dev/candidates/drive-pilot/releases/5fd99bab2987`;
- DEV runtime: `dimpro-drive-v0914-auth068-profile-5fd99bab2-p3391`;
- publikus upstream: `127.0.0.1:3391`;
- rollback runtime: `dimpro-drive-v0913-auth067-legacysync-2f5ba3cd4-p3390`, online, restart 0;
- Nginx backup: `/srv/dimpro-dev/artifacts/backups/nginx-drive-profile/dimpro-dev.conf.before-5fd99bab-20261007T093159`;
- backup SHA-256: `aed4e57ae20c95a5b3e2ad0ab1e62ff1949c4e9e52fafd2b4b664e913714a8da`;
- cutover: 2026-10-07 09:32:10 Europe/Budapest;
- public smoke: `/drive` 307 central SSO, `PATCH /api/dimpro-auth/profile` auth nélkül 401 `AUTH_REQUIRED`, AUTH readiness PASS, új runtime restart 0, error log 0 byte;
- publikus header: `5fd99bab DRIVE V0.9.14 AUTH V0.6.8 PROJECT ACCESS PROFILE ... DEV`;
- `X-DIMPRO-Production-Access: DENY`.

A build első manual fallback próbája (`...manual-b1`) `SOURCE_BUNDLE_VERIFY_FAILED` eredménnyel zárult, mert a BUILD-02 régi `build-runner-executor-v1` példánya repository-kontextus nélkül futtatta a bundle verify-t. A sikeres `manual-b2` a telepített újabb `dimpro-build-runner-executor-v1` executort használta, amely explicit BUILD repositoryval végzi ugyanazt az ellenőrzést. A sikertelen run eredménye auditcélból megmaradt.

### Projekt-hozzáférések olvashatóság és szerepkör-rendezés – 2026-10-07

A Projekt-hozzáférések panel olvashatósági finomhangolást kapott: a fejléc, fülek, tagnevek, másodlagos adatok, szerepkörök, jogosultság-leírások, függő meghívások és vezérlők betűmérete mérsékelten nőtt, a panel meglévő kompakt elrendezésének megtartásával.

Az aktív taglista authoritative megjelenítési sorrendje most jogosultsági hierarchia szerint csökkenő:
1. `OWNER` – Beruházási projektvezető;
2. `PROJECT_MANAGER` – Projektvezető;
3. `CONTRIBUTOR` – Közreműködő;
4. `REVIEWER` – Ellenőrző;
5. `VIEWER` – Megtekintő.

Azonos szerepkörön belül a rendezés a megjelenített név szerint, magyar locale használatával történik. A saját felhasználó türkizzöld kiemelése ettől független; nem írja felül a jogosultsági sorrendet.
