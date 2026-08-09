# DROP 1.2.10 – mobil hálózatváltás, azonnali vírusellenőrzés, címzettszámláló, mobil e-mail/PDF és diktálási szabályok

**Fejlesztés:** 2026-08-09  
**Állapot:** éles private-pilot hotfix release, GA=false  
**Fejlesztési Központ:** `version_e649e509-6ca`  
**Kiinduló éles release:** `.next-v129-release-final`  
**Kiinduló BUILD_ID:** `OdrfWvJQdkRbCvUrznF_9`  
**Éles release:** `.next-v1210-release-final`  
**BUILD_ID:** `YtYjsCjg5WLQFundZIY8j`  
**Közvetlen rollback:** `.next-v129-release-final`  
**Rollback script:** `scripts/rollback-drop-v1210-release.sh`

## Fizikai mobiltesztből azonosított hibák

1. Wi-Fi → mobilnet váltás, illetve átmeneti hálózatmegszakadás közben a véglegesítés túl sűrűn próbálkozhatott újra.
2. A `425 DROP_PUBLIC_FILES_NOT_READY` technikai állapot a kliens általános retry-rétegében „Átmeneti szerverhiba (425)” szöveggel jelent meg, miközben valójában a ClamAV-vizsgálat várt.
3. A periodikus worker `DIMPRO_DROP_WORKER_CLAIM_LIMIT=2` miatt négy képnél két 2 perces worker-körre is szükség lehetett.
4. A már korábban kiépített azonnali scan-trigger systemd path `unit-start-limit-hit` miatt leállt. A gyökérok: képenként külön triggerfájl és egymást követő systemd oneshot indítások.
5. Ha a háttér-worker a mobil kliens újrapróbálkozása előtt már sikeresen finalizált, az idempotens `200 OK` válasz nem tartalmazott `delivery.sent` értéket, ezért a mobil UI tévesen `0 címzett` szöveget jeleníthetett meg.
6. Mobil e-mailben a fájlmegjegyzés az előnézeti kép melletti keskeny oszlopba került.
7. A 4 kép/oldalas PDF-ben túl magas volt a képrész, ezért a fájlszintű megjegyzés kevés helyet kapott vagy vizuálisan eltűnhetett.
8. A diktálásból hiányzott az alap írásjel- és mondatkezelés.

## Hálózatváltás és kontrollált resume

A Drop továbbra is engedélyezi ugyanazon publikus munkamenet biztonságos IP-újrakötését, ha ugyanaz a csomag és böngésző/user-agent kontextus marad. A robotvédelmi upload intent nem IP-címhez kötött.

Új kliensoldali működés:

- a Network Information API `connection.change` eseménye támogatott böngészőben figyelve van;
- Wi-Fi/mobilnet átmenetnél rövid, 1,2 másodperces stabilizálási idő után történik szerver reachability check;
- az automatikus feltöltésfolytatás összevont timerrel fut, így több egymásra érkező `online`, `pageshow` és network state esemény nem indít párhuzamos resume-vihart;
- a már feltöltött multipart részek és az IndexedDB queue továbbra is megmaradnak.

## 425 – vírusellenőrzési állapot, nem szerverhiba

A finalize API a `DROP_PUBLIC_FILES_NOT_READY` 425 válaszban biztonságos progress adatot ad:

- `totalCount`;
- `readyCount`;
- `pendingCount`;
- `stage=virus_scan`.

A Gyors KépSend ezen a finalize útvonalon kihagyja a generikus HTTP-425 retry üzenetet, és például ezt jeleníti meg:

`Vírusellenőrzés folyamatban · 2/4 kép ellenőrizve. A küldés automatikusan folytatódik.`

A finalize polling ritkább, kontrollált 8 másodperces várakozással folytatódik.

## Azonnali ClamAV scan helyreállítása

A scan feladat hivatalos sora továbbra is PostgreSQL worker job. A fájlrendszeri trigger csak ébresztés.

A korábbi képenkénti egyedi `.trigger` fájl helyett egyetlen összevont:

`scan-wakeup.trigger`

sentinel kerül frissítésre. Így nagy mobilfotó-sorozatnál sem keletkezik képenként külön systemd service-indítás.

A systemd scan-trigger service explicit védelme:

- `StartLimitIntervalSec=60`;
- `StartLimitBurst=30`.

A korábban failed path unit helyreállítva és `active (waiting)` állapotban működik. A periodikus fallback worker claim limitje 2-ről 4-re emelve.

## Címzettszámláló javítás

Az idempotens finalize válasz most a workflow korábban eltárolt `notificationDetail` és `recipientEmails` állapotából visszaépíti a delivery összegzést. Ha a worker már sikeresen kiküldte a leveleket, a mobil kliens ugyanazt a tényleges elküldött címzettszámot látja, nem nullát.

## Mobil e-mail megjegyzés

A fájlkártya megjegyzése kikerült a kép melletti metaoszlopból. Külön, `colspan=2` teljes kártyaszélességű sorban jelenik meg, ezért akkor is olvasható marad, ha a levelezőkliens a mobil CSS egy részét figyelmen kívül hagyja.

Mobil CSS esetén:

- kisebb, kb. 120×90 px-es előnézet;
- teljes szélességű megjegyzéssor;
- nagyobb, 13 px-es megjegyzésszöveg.

390 px böngészős fixture-ben a 340 px széles fájlkártyán a megjegyzéscellára 338 px jutott.

## PDF 4 kép/oldal megjegyzés

A 4 képes 2×2 elrendezés megmarad, de a képrész 43 mm-ről 32 mm-re csökkent. A felszabaduló függőleges hely a fájladatok és a megjegyzésblokk számára használható. A sűrű mód tipográfiája és margói tömörebbek.

A fizikai tesztcsomag `DMP-2608-AV9Y4Z` adatain újragenerált 4-up PDF-ben:

- 4/4 fájlszintű megjegyzés visszaolvasható a PDF szövegrétegéből;
- képmelléklet oldalak megjegyzésblokkjai: 1 + 2 + 1;
- 4 kép szerepel a riportban;
- a csoporthatárok megmaradnak.

## Diktálási szabályok – AI nélkül

A közös `DropSpeechTranscriptAccumulator` a deduplikáció után determinisztikus formázást alkalmaz:

- diktálás eleje nagybetűvel indul;
- `pont` → `.`;
- `vessző` → `,`;
- `felkiáltójel` vagy `felkiáltó jel` → `!`;
- `kérdőjel` vagy `kérdő jel` → `?`;
- `.`, `!`, `?` után a következő mondat nagybetűvel indul;
- írásjel előtt nincs fölösleges szóköz;
- ha az írásjel nevét tényleges szóként kell leírni, a felhasználó ezt mondja: `szó szerint pont`, `szó szerint vessző`, `szó szerint kérdőjel`, `szó szerint felkiáltójel`;
- ekkor a szó változatlanul kerül az átiratba;
- AI automatikus nyelvi javítás továbbra sincs.

## Forrás- és regressziós validáció

- Speech/e-mail/TXT runtime regresszió: **20/20 PASS**;
- hálózat/finalize hotfix contract: **16/16 PASS**;
- azonnali scan acceleration contract: **28/28 PASS**;
- TypeScript: **PASS**;
- célzott ESLint: **0 error**;
- mobil e-mail DOM fixture: megjegyzés **338 px** széles 390 px viewporton;
- konkrét `DMP-2608-AV9Y4Z` 4-up PDF: **4/4 fájlmegjegyzés visszaolvasható**.

## PWA-frissítés és telepített mobilalkalmazás

A fizikai Samsung/PWA teszt alapján az update UI korábban már létezett, de a `drop-sw.js` még 0.9.9-es, release-ről release-re változatlan service-worker verzió- és cache-azonosítót használt. Emiatt új Drop release esetén nem volt garantált `updatefound` esemény, ezért a telepített PWA régi verzióban maradhatott.

A DROP 1.2.10-ben:

- service worker verzió: `DROP 1.2.10`;
- cache: `dimpro-drop-static-v1210`;
- regisztráció: `updateViaCache: "none"`;
- appindításkor explicit `registration.update()` fut;
- előtérbe visszatéréskor, `pageshow` és `online` eseménynél ismételt, throttled update-check fut;
- hálózat helyreállása után külön késleltetett ellenőrzés történik;
- új worker esetén látható `Új DIMPRO Drop verzió érhető el.` banner és `Frissítés` gomb jelenik meg;
- a gomb `SKIP_WAITING` üzenettel aktiválja az új workert, majd `controllerchange` után újratölti az alkalmazást;
- a régi DIMPRO Drop cache-ek aktiváláskor automatikusan törlődnek.

A cél, hogy a kezdőképernyőre telepített PWA következő release-einél ne legyen szükség törlésre és újratelepítésre.

## Végleges release-validáció

- TypeScript: **PASS**;
- teljes ESLint: **0 error / 108 meglévő warning**;
- Speech/e-mail/TXT runtime regresszió: **20/20 PASS**;
- hálózat/finalize hotfix contract: **16/16 PASS**;
- scan acceleration contract: **28/28 PASS**;
- mobil/PWA regresszió: **70/70 + 115/115 PASS**;
- PWA ikon/cache: **51/51 PASS**;
- PWA update contract: **15/15 PASS**;
- mobil e-mail DOM: **338 px** megjegyzésszélesség 390 px viewporton;
- `DMP-2608-AV9Y4Z` 4-up PDF: **4/4 fájlmegjegyzés visszaolvasható**;
- végleges koordinált candidate build: **PASS**;
- BUILD_ID: `YtYjsCjg5WLQFundZIY8j`;
- standalone asset ellenőrzés: **141 chunk PASS**;
- candidate health: core/e-mail/Send/Identity/ClamAV/PWA update **READY**, worker claim limit **4**;
- candidate browser E2E: **37/37 PASS**;
- candidate teljes S3 → ClamAV → finalize → SMTP → album → PDF/TXT/ZIP E2E: **75/75 PASS**;
- immutable release preflight: **PASS**;
- production browser E2E: **37/37 PASS**;
- production teljes S3 → ClamAV → finalize → SMTP → album → PDF/TXT/ZIP E2E: **75/75 PASS**;
- production `notificationStatus=sent`;
- Identity Core: **12/12 READY**;
- live `Permissions-Policy`: `microphone=(self)` **PASS**;
- live service worker: `DROP 1.2.10` / `dimpro-drop-static-v1210` **PASS**;
- worker timer: **active**;
- azonnali scan path: **active + enabled**;
- production tesztmaradvány: **0**;
- teljes E2E Object Storage takarítás: **11 objektum PASS**.

## Release

- release: `.next-v1210-release-final`;
- BUILD_ID: `YtYjsCjg5WLQFundZIY8j`;
- közvetlen rollback: `.next-v129-release-final`;
- aktiválási backup: `backups/drop_v1210_release_activation_20260809_115856`;
- forrásbackup: `backups/drop_v1210_predev_20260809_092438`;
- rollback script: `scripts/rollback-drop-v1210-release.sh`;
- central release pointer és PM2 `NEXT_DIST_DIR`: `.next-v1210-release-final`;
- private-pilot marad, **GA=false**.

### Következő fizikai ellenőrzés

Samsung/Chrome telepített PWA-n ellenőrizendő a következő kiadáskor az új verzió banner tényleges megjelenése, valamint valós Wi-Fi → mobilnet → Wi-Fi terepi váltás többképes feltöltés közben. A szerveroldali és böngészős automatizált release-gate jelenleg teljesen zöld.

