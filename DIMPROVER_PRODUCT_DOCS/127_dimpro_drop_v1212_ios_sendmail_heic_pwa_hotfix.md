# DROP 1.2.12 / IDENTITY 0.2.2 – Send-kód e-mail, iPhone HEIC és PWA telepítési hotfix

**Dátum:** 2026-08-10  
**Fejlesztési Központ:** `version_1ac59d3a-d29`  
**Állapot:** DEV fejlesztés és release-validáció folyamatban; private pilot, GA=false.  
**DEV branch:** `fix/drop-v1212-ios-sendmail`  
**DEV worktree:** `/srv/dimpro-dev/worktrees/drop-v1212-ios-sendmail`  
**Baseline:** `57fd38f` – az éles Identity 0.2.1 meghívási/onboarding hotfix DEV-paritása.

## Cél

Három fizikai felhasználói problémát javítunk egy közös DEV-first hotfix körben:

1. a Send entitlement létrejött, de a felhasználó nem kapott automatikusan `Saját DIMPRO Send-kód` e-mailt;
2. iPhone HEIC/HEIF fotó kliensoldali JPG-konverziós hibája blokkolta a teljes feltöltést;
3. iPhone-on a PWA telepítési gomb megjelent, de a Chromium-specifikus `beforeinstallprompt` hiánya miatt kattintásra nem történt semmi.

## Send-kód e-mail és kódrotáció

Az Identity admin API `0.2.2` verziót kap. Új Send entitlement létrehozásakor a rendszer a nyers, egyszer megjelenő Send-kódot azonnal elküldi a központi felhasználó e-mail-címére a `noreply` DIMPRO mailprofillal. A levél tartalmazza a szervezetet, a Send-kódot, az engedélyezett Send funkciókat, a lejáratot és a `https://drop.dimpro.hu/send` belépési hivatkozást.

A biztonsági modell változatlan: a nyers Send-kód nem kerül adatbázisba; kizárólag HMAC-lenyomat és kódtipp tárolódik. Már meglévő entitlementnél ezért a régi kód nem olvasható vissza. Ehelyett új `Új kód + e-mail` művelet készült, amely új kódot generál, a korábbit azonnal érvényteleníti, az újat egyszer visszaadja az adminnak és e-mailben elküldi a felhasználónak.

Az e-mail-kézbesítés külön auditot kap:

- `send_code_email_sent`;
- `send_code_email_failed`;
- kódcsere: `send_entitlement_code_rotated`.

Az audit metadata tartalmazhat SMTP message ID-t és rövid hibaleírást. E-mail-hiba esetén az entitlement/kód létrejötte nem kerül visszagörgetésre; az adminfelület jelzi a hibát, és az egyszer megjelenő kód kézzel átadható.

## iPhone HEIC/HEIF feltöltés

A kliens továbbra is megpróbálja a HEIC/HEIF fotót helyben JPG-re konvertálni és optimalizálni. Ha az iOS/Safari környezetben a konverzió nem támogatott vagy hibázik, a feltöltés többé nem áll le. Az eredeti `.heic/.heif` fájl kerül továbbításra, előnézet nélkül.

A szerver biztonsági rétege már korábban engedte a `heic` és `heif` kiterjesztést, valamint az `image/*` MIME-családot. A fallback ezért nem kerül meg szerveroldali biztonsági ellenőrzést. A felület figyelmeztet, hogy eredeti HEIC feltöltés esetén az EXIF/GPS-metaadatok megmaradhatnak.

DEV viselkedési teszt: hibás/konvertálhatatlan `IMG_9999.HEIC` → 1 előkészített fájl, `optimized=false`, `previewUrl=null`, eredeti HEIC méret és MIME megmarad; PASS.

## iPhone PWA telepítés

Az iPhone nem támogatja a Chromium `beforeinstallprompt` eseményt, ezért a korábbi telepítési gomb kattintása nem tudott telepítési dialógust nyitni. A hotfix iOS esetén külön telepítési útmutatót nyit.

Az útmutató:

1. Safari megnyitása;
2. `drop.dimpro.hu` megnyitása;
3. Megosztás gomb;
4. `Főképernyőhöz adás`;
5. ha elérhető, `Megnyitás webalkalmazásként` bekapcsolva;
6. `Hozzáadás`.

Ha a felhasználó Chrome/Firefox/Edge iOS böngészőből nyitja meg a felületet, külön figyelmeztetés kéri a Safari használatát. A DIMPRO Drop továbbra is telepített webalkalmazás (PWA), nem App Store alkalmazás.

## Verzió és PWA cache

- Drop alkalmazásverzió: `1.2.12`;
- Identity admin API: `0.2.2`;
- release dátum: `2026-08-10`;
- service worker: `DROP 1.2.12`;
- static cache: `dimpro-drop-static-v1212`;
- az aktív Drop forrásutakon nem maradhat `DROP 1.2.11` vagy `dimpro-drop-static-v1211` referencia.

## DEV validáció eddig

- Identity 0.2.1 DEV paritás: contract 16/16 PASS, TypeScript PASS, célzott lint PASS;
- Send-kód integráció: 16/16 PASS;
- Send tesztfixture maradvány: 0 user / 0 licenc;
- HEIC fallback viselkedési teszt: PASS;
- DROP 1.2.12 contract: 27/27 PASS;
- TypeScript: PASS;
- célzott ESLint: PASS.

A végleges dokumentumot a DEV candidate build/browser E2E, majd production candidate/release eredményeivel kell lezárni.

## DEV candidate eredmény

- commit: `6432ffb`
- candidate dist: `.next-drop-v1212-dev-candidate`
- BUILD_ID: `AK30OQyQBMklA3SZKvKWX`
- Next compile: 117 mp
- build TypeScript: 105 mp
- standalone static asset: 141/141 PASS
- Send-kód integráció: 16/16 PASS
- tesztfixture-maradvány: 0 user / 0 licenc
- HEIC fallback viselkedés: PASS
- 1.2.12 contract: 27/27 PASS
- compiled candidate browser: 15/15 PASS
- iPhone Safari telepítési modal: PASS
- iOS Chrome → Safari figyelmeztetés: PASS
- 390 px mobil overflow: PASS
- public-workflows 1.2.12 / Identity 0.2.2: PASS
- Identity admin API: `IDENTITY CORE 0.2.2`, PASS
- teljes lint: 0 error / 108 baseline warning
- aktív `DROP 1.2.11` / `dimpro-drop-static-v1211` referencia a kijelölt Drop forrásutakon: 0
- candidate runtime leállítva; 3230-as port felszabadítva.

A DEV `/api/drop/health` `coreReady=false` állapota környezeti baseline: `coreEnabled=false`, Drop worker disabled és scanner nem fut ezen az izolált DEV candidate-en. Az Identity rész közben `enabled=true`, `schemaReady=true`, `secretsReady=true`, `consumerReady=true`. A production release-gate ezért külön production candidate-en köteles teljes `coreReady=true`, e-mail és ClamAV READY ellenőrzést teljesíteni.

## Production release eredmény

- production forrásbackup: `backups/drop_v1212_preprod_20260810T130325Z`
- Csató Ferenc voice-jogosultság backup: `backups/drop_v1212_csato_voice_20260810T133344Z`
- production candidate BUILD_ID: `DAcj-ZwTkKDHf3repNMgZ`
- éles release: `.next-drop-v1212-release-final`
- rollback: `.next-identity-v021-release-final`
- aktiváló script: `scripts/activate-drop-v1212-release.sh`
- rollback script: `scripts/rollback-drop-v1212-release.sh`
- standalone asset: 141/141 PASS
- production candidate health: DROP 1.2.12, coreReady=true, S3 active, ClamAV PONG, Identity consumer READY
- production candidate browser: 12/12 PASS
- production live browser: 8/8 PASS
- production full lint: 0 error / 108 baseline warning
- production static contract: 27/27 PASS
- production TypeScript: PASS
- aktív release PM2: online
- live service worker: DROP 1.2.12 / `dimpro-drop-static-v1212`

### Valós Send-kód kézbesítési javítás

Az éles 1.2.12 aktiválás után Csató Ferenc és Nagy Róbert meglévő Send entitlementje új, egyszer használhatóan megjelenő kódot kapott. A korábbi kódok érvénytelenné váltak, az új kódokat a `noreply@dimpro.hu` profil automatikusan e-mailben továbbította. Mindkét művelet `send_entitlement_code_rotated` és `send_code_email_sent` auditot kapott, SMTP message ID-val. A teljes Send-kód továbbra sem kerül visszafejthető formában adatbázisba vagy dokumentációba.

### Mikrofonos diktálás

Csató Ferenc HAGE-tagságából hiányzott a `DROP_QUICK_VOICE_NOTE` felhasználói modul, miközben a HAGE-INVEST szervezeti licenc tartalmazta. A modul élesben engedélyezve lett `maxSecondsPerNote=60` limittel és külön auditbejegyzéssel. Nagy Róbert és Keserű Benjámin jogosultsága már korábban tartalmazta a modult. A kliens új Gyors KépSend indításakor újra feloldja a jogosultságot, ezért új Send-kód kizárólag emiatt nem szükséges.

### Fizikai készülék-validáció

A kód és a compiled browser gate alapján az iPhone HEIC fallback és Safari PWA telepítési útmutató éles. A következő private-pilot lépés továbbra is fizikai iPhone-on: valós HEIC fotó kiválasztása/feltöltése, Safari Megosztás → Főképernyőhöz adás, majd telepített PWA megnyitás. Ez a fizikai készülékteszt nem helyettesíthető szerveroldali automatizált teszttel.
