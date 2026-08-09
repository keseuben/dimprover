# DIMPRO Drop – offline mobil UX és megszakított feltöltés helyreállítása

**Verzió:** DROP 0.9.8  
**Dátum:** 2026. augusztus 6.  
**Állapot:** forrásfejlesztés elkészült, production candidate és éles release előtt.  
**Kiinduló release:** `.next-v097-release-final`, build `MeShA63db3FLJwzqqCul_`

## 1. Fejlesztési cél

A DROP 0.9.8 célja, hogy mobiltelefonon, PWA-ban és bizonytalan hálózaton is megmaradjon a feltöltési munka:

- hálózatvesztéskor a fájlok és megjegyzések ne vesszenek el;
- oldalfrissítés vagy PWA újranyitás után a helyi sor álljon vissza;
- multipart fájlnál a már elkészült fájlrészek ne kerüljenek újra feltöltésre;
- Wi‑Fi és mobilinternet közötti váltás ne tegye használhatatlanná a már csomaghoz kötött munkamenetet;
- PWA-frissítés csak kontrollált felhasználói művelettel történjen;
- a felhasználó kérhessen helyi értesítést a küldemény elkészüléséről.

## 2. Biztonsági alapelv

Az IndexedDB helyi feltöltési sor **nem tárolhat**:

- nyers Send-kódot;
- letöltési PIN-t;
- publikus sessioncookie-t vagy sessiontokent;
- csomag capability-t;
- upload-session tokent;
- bearer hitelesítési adatot.

A helyi tár kizárólag ezeket tartalmazza:

- a feltöltendő fájl Blob-ja;
- eredeti és feltöltési fájlnév;
- MIME-típus és méret;
- képoptimalizálási metaadatok;
- stabil `clientUploadId`;
- fájlmegjegyzés;
- queue-státusz és progressz;
- csomagazonosító;
- lejárat és technikai időbélyegek.

Az oldalfrissítés utáni upload capability-t a szerver adja újra a HttpOnly sessioncookie alapján.

## 3. IndexedDB queue

- adatbázis: `dimpro-drop-offline-v098`;
- store: `uploadQueue`;
- kulcs: `packageId:itemId`;
- indexek: `packageId`, `updatedAt`;
- lejárati takarítás: csomaglejárat vagy legfeljebb 8 nap;
- a félbeszakadt `uploading` állapot újranyitáskor `paused` lesz;
- a képekhez új objektum-URL és bélyegkép állítható vissza;
- sikeres kézbesítéskor a csomag helyi sora törlődik;
- a böngésző tartós storage-jogosultsága kérhető.

## 4. Sessioncookie-alapú csomaghelyreállítás

Új végpont:

```text
GET /api/drop/public/packages/resume
```

Működés:

1. kizárólag a HttpOnly publikus sessioncookie-t olvassa;
2. ellenőrzi a workflow- és csomagkötést;
3. ellenőrzi a csomag állapotát és lejáratát;
4. aktív csomagnál atomikusan új upload capability-t ad;
5. kézbesített csomagnál csak lezárt állapotot ad vissza;
6. a nyers capability nem kerül adatbázisba vagy IndexedDB-be.

Mobil hálózatváltásnál kontrollált IP-lenyomat-frissítés engedélyezett, de kizárólag:

- már csomaghoz kötött sessionnél;
- ugyanazzal a HttpOnly sessioncookie-val;
- azonos böngésző/user-agent összefoglalóval;
- kizárólag a resume útvonalon.

Minden más publikus művelet továbbra is szigorúan IP-kötött.

## 5. Valós kapcsolatellenőrzés

Új végpont:

```text
GET /api/drop/public/ping
```

A kliens nem csak a `navigator.onLine` értéket figyeli, hanem a Drop szerver tényleges elérhetőségét is.

Állapotok:

- online;
- böngésző szerint offline;
- szerver nem érhető el;
- ellenőrzés folyamatban.

Ellenőrzési események:

- böngésző online/offline esemény;
- alkalmazás láthatóságváltozás;
- 30 másodperces periodikus ellenőrzés;
- manuális és automatikus feltöltési retry.

## 6. Multipart folytatás

A meglévő szerveroldali idempotencia a stabil `clientUploadId` alapján működik.

A 0.9.8 kliens:

- ugyanazzal a `clientUploadId` értékkel újrainicializál;
- lekéri a már befejezett partok számát;
- kihagyja a kész partokat;
- csak a megszakadt vagy hiányzó részeket küldi újra;
- minden kész part után checkpointot ír a helyi queue-ba;
- hálózatvesztéskor vár;
- kapcsolat-visszatéréskor exponenciális retryjal folytat;
- a multipart szerver-sessiont szüneteltetéskor nem törli.

Retry státuszok:

- HTTP 408;
- HTTP 425;
- HTTP 429;
- HTTP 5xx;
- hálózati `TypeError` vagy megszakadt XHR.

## 7. Mobil feltöltési lista

Mobilon kompakt queue jelenik meg:

- 56×56 px bélyegkép vagy fájlikon;
- fájlnév;
- állapot;
- progressz;
- lenyitható részletek;
- fájlmegjegyzés;
- eltávolítás;
- szüneteltetés és folytatás.

Tableten és desktopon a 2–3 oszlopos képkártyás nézet megmarad.

## 8. PWA-frissítés

Service worker cache:

```text
dimpro-drop-static-v098
```

Az új worker frissítéskor várakozó állapotba kerül. A felület megjeleníti:

> Új DIMPRO Drop verzió érhető el.

A felhasználó „Frissítés” gombja `SKIP_WAITING` üzenetet küld. A vezérlés átvétele után az oldal újratöltődik, az IndexedDB queue változatlanul megmarad.

A service worker továbbra sem cache-el:

- API-választ;
- tokenes letöltőoldalt;
- tokenes feltöltőoldalt;
- capability-oldalt;
- riportoldalt;
- feltöltött fájlt.

## 9. Background Sync korlát

A service worker Background Sync eseménye csak ébresztőüzenetet küld a megnyitott kliensnek:

```text
dimpro-drop-upload-resume-v098
```

A service worker nem kap és nem tárol feltöltési tokent, ezért önálló, titkot igénylő háttérfeltöltést nem végez. Ha az operációs rendszer teljesen bezárta a PWA-t, a fájlok IndexedDB-ben megmaradnak, és a feltöltés a következő megnyitáskor folytatódik.

## 10. Helyi elkészült értesítés

A mobilmenüben külön kapcsoló található:

> Feltöltés elkészült értesítés

A kapcsoló:

- csak támogatott böngészőben aktív;
- felhasználói engedélyt kér;
- a preferenciát localStorage-ban tárolja;
- sikeres végleges kézbesítéskor service worker notificationt készít;
- az értesítés megnyitja a Drop felületet.

E-mail továbbra is csak a végleges, címzettenkénti összesített kézbesítéskor megy ki.

## 11. Automatizált szerződéses ellenőrzések

- DROP 0.9.6 üzemeltetési/HEIC/e-mail regresszió: 177/177 PASS;
- scanner regresszió: 27/27 PASS;
- DROP 0.9.7 mobil/Wake Lock regresszió: 63/63 PASS;
- DROP 0.9.8 offline/multipart/PWA szerződés: 110/110 PASS;
- összesen: 377/377 PASS;
- TypeScript: PASS;
- célzott ESLint: 0 hiba.

## 12. Fizikai iPhone tesztmátrix

| Teszt | Safari böngésző | Főképernyős PWA | Elvárt eredmény |
|---|---|---|---|
| Galéria – több kép | kötelező | kötelező | fájlok megjelennek a helyi queue-ban |
| Kamera | kötelező | kötelező | kameraengedély és egyképes felvétel |
| HEIC-konverzió | kötelező | kötelező | JPG, bélyegkép, méretcsökkentés |
| Oldalfrissítés | kötelező | kötelező | queue és megjegyzések visszaállnak |
| Alkalmazásváltás | kötelező | kötelező | visszatéréskor folytatás |
| Wi‑Fi → mobilnet | kötelező | kötelező | kontrollált session-rebind és folytatás |
| Mobilnet → Wi‑Fi | kötelező | kötelező | kontrollált session-rebind és folytatás |
| Képernyőzár | megfigyelendő | megfigyelendő | queue megmarad, feloldás után folytatható |
| Wake Lock | támogatásfüggő | támogatásfüggő | előtérben ne sötétedjen el |
| Értesítés | Safari-verziófüggő | kötelezően vizsgálandó | elkészült értesítés |
| PWA-frissítés | nem elsődleges | kötelező | frissítés után queue megmarad |

## 13. Fizikai Android tesztmátrix

| Teszt | Chrome böngésző | Telepített PWA | Elvárt eredmény |
|---|---|---|---|
| Galéria – több kép | kötelező | kötelező | helyi queue |
| Kamera | kötelező | kötelező | kameraengedély |
| Oldalfrissítés | kötelező | kötelező | queue-visszaállítás |
| Háttérbe helyezés | kötelező | kötelező | következő előtérbe kerüléskor folytatás |
| Background Sync | támogatásfüggő | kötelezően vizsgálandó | kliensébresztés, titok nélküli működés |
| Wi‑Fi/mobilnet váltás | kötelező | kötelező | session-rebind |
| Wake Lock | kötelező | kötelező | látható alkalmazásnál aktív |
| Helyi értesítés | kötelező | kötelező | service worker notification |
| PWA-frissítés | kötelező | kötelező | kontrollált frissítés |

## 14. Energiatakarékos és akkumulátorteszt

Vizsgálandó állapotok:

1. normál töltöttség, energiatakarékos mód nélkül;
2. energiatakarékos mód bekapcsolva;
3. 20% alatti akkumulátor;
4. 10% alatti akkumulátor;
5. töltőre csatlakoztatva;
6. képernyőzár után visszatérés;
7. operációs rendszer által visszavont Wake Lock.

Elvárt:

- Wake Lock visszavonása nem okozhat feltöltési adatvesztést;
- a queue IndexedDB-ben megmarad;
- visszatéréskor a rendszer újrakéri a Wake Lockot;
- ha az operációs rendszer megtagadja, a felület ezt jelzi;
- a feltöltés folytatható marad.

## 15. Nagy fájl mobilhálózatos teszt

Tesztfájlok:

- 20 MB kép- vagy PDF-csomag;
- 65 MB fájl – multipart határ felett;
- 150 MB ZIP;
- 250 MB maximális publikus csomag;
- CsomagDrop esetén 300–500 MB fájl külön tesztben.

Mérendő:

- első part indulási idő;
- elkészült partok száma;
- hálózatvesztés időpontja;
- folytatásig eltelt idő;
- újraküldött bájtok mennyisége;
- teljes feltöltési idő;
- ClamAV ellenőrzési idő;
- készülék tárhelyhasználata;
- akkumulátorfogyasztás;
- hőterhelés.

A fizikai eszköz- és mobilhálózati tesztet a VPS nem tudja önállóan végrehajtani. Az automatizált browser/API tesztek után külön valós eszközteszt-jegyzőkönyv szükséges.

## 16. Rollback-elv

A DROP 0.9.8 élesítésekor a közvetlen rollback cél a stabil DROP 0.9.7 release. Az IndexedDB queue külön verziózott adatbázisban marad; rollback esetén a 0.9.7 nem olvassa, de nem is törli. Újraaktivált 0.9.8 esetén a queue helyreállítható.

## 17. Ismételt mobil kamerafotózás

A DROP 0.9.8 kamerabemenete minden elkészített fotó után új natív kamera-munkamenetet hoz létre.

Működés:

1. a kamera által visszaadott `FileList` azonnal stabil `File[]` pillanatképpé alakul;
2. a fájl bekerül a helyi IndexedDB queue-ba;
3. a kamera-input értéke törlődik;
4. az input új React-kulccsal újralétrejön;
5. a gomb felirata „Újabb fotó” lesz;
6. a felhasználó egymás után további képeket készíthet ugyanabba a küldeménybe.

Ez a közös `DropHexUploadZone` komponensben készült el, ezért a publikus Send/Beküldőkapu, a CsomagDrop és a capability-alapú feltöltés is ugyanazt a javított működést használja.

A böngészős mobiltesztnek ellenőriznie kell:

- az első kamerakép után a queue 1 elemű;
- a kamera-input sessionazonosítója megváltozik;
- az „Újabb fotó” gomb aktív marad;
- a második kép után a queue 2 elemű;
- mindkét kép külön IndexedDB-rekordként marad meg;
- azonos fájlnév esetén is létrejön a második `change` esemény.

## 18. Képelőnézetek a címzett e-mailjében

A végleges DIMPRO Drop kézbesítési e-mail a feltöltött képek közül alapértelmezetten legfeljebb az első 6 képhez készít kis előnézetet.

Technikai szabályok:

- az előnézet 180 × 120 px méretű JPEG;
- a forráskép kizárólag szerveroldalon, a privát Object Storage-ból olvasható;
- az előnézet `cid:` inline mellékletként kerül az e-mailbe;
- az eredeti kép vagy dokumentum nem kerül e-mail-mellékletként kiküldésre;
- a teljes fájl továbbra is csak a naplózott, időkorlátos Drop-linken érhető el;
- alapértelmezett összes beágyazott előnézeti keret: 700 KB/e-mail;
- alapértelmezett maximális forrásképméret: 18 MB/kép;
- nem képfájlok rendezett fájlkártyaként jelennek meg;
- minden fájl megmarad a levél fájllistájában, akkor is, ha nem készült hozzá kép;
- előnézetkészítési hiba nem akadályozhatja meg a kézbesítési e-mail kiküldését.

Környezeti beállítások:

```text
DIMPRO_DROP_EMAIL_MAX_PREVIEWS=6
DIMPRO_DROP_EMAIL_PREVIEW_MAX_SOURCE_BYTES=18874368
DIMPRO_DROP_EMAIL_PREVIEW_MAX_TOTAL_BYTES=716800
```

Biztonsági elv:

- nincs publikus vagy hosszú életű Object Storage-kép-URL az e-mailben;
- nincs eredeti fájlcsatolmány;
- a kis előnézet csak annak a címzettnek küldött MIME-üzenetben található, aki a csomag címzettje;
- az e-mailben lévő kép nem helyettesíti a ClamAV-ellenőrzött teljes fájl letöltését.

## 19. Végleges production candidate eredmény

**Candidate könyvtár:** `.next-v098-candidate`  
**Build ID:** `khbESIjmxOVR6sLeA8lEE`  
**Next.js:** 16.2.6, webpack  
**Generált oldalak:** 88  
**Statikus chunkok:** 73  
**Candidate méret:** körülbelül 2,2 GB

### 19.1. Forrás- és regressziós ellenőrzések

| Ellenőrzés | Eredmény |
|---|---:|
| TypeScript | PASS |
| Teljes ESLint | 0 hiba, 113 korábbi figyelmeztetés |
| Üzemeltetési / HEIC / e-mail regresszió | 177/177 PASS |
| Scanner regresszió | 27/27 PASS |
| Mobil / Wake Lock / ismételt kamera | 70/70 PASS |
| Offline / multipart / PWA | 115/115 PASS |
| Kamera és e-mail-előnézet szerződés | 58/58 PASS |
| Összes szerződéses ellenőrzés | **447/447 PASS** |

### 19.2. Compiled candidate ellenőrzések

- `/`, `/send`, `/bekuldes`, `/open`: HTTP 200;
- `/api/drop/health`, `/api/drop/features`, `/api/drop/public/ping`: HTTP 200;
- `/drop-sw.js`, `/drop.webmanifest`: HTTP 200;
- ClamAV socket: `PONG`;
- CsomagDrop, Send és Beküldőkapu readiness: PASS;
- IndexedDB queue és tokenmentes helyreállítás readiness: PASS;
- ismételt kameramenet readiness: PASS;
- `cid:` e-mailes képelőnézet readiness: PASS;
- eredeti fájlok e-mailhez csatolása: tiltva;
- React hydration mismatch: megszüntetve, négy publikus oldalon 0 pageerror és 0 console error;
- service worker API-, tokenes oldal- és privát fájlcache: tiltva.

### 19.3. Ismételt kamerafotó candidate E2E

Mobil Chromium-emulációban két egymást követő, azonos nevű kamerakép került kiválasztásra:

- kamera session: `0 → 1 → 2`;
- queue: `0 → 1 → 2`;
- a gomb az első kép után `Újabb fotó` állapotú;
- IndexedDB-rekordok: 2;
- külön queue-azonosítók: 2;
- oldalfrissítés után visszaállított rekordok: 2;
- offline állapotban megmaradt rekordok: 2;
- online visszatérés után rekordok: 2;
- nyers capability, sessiontoken, Send-kód vagy PIN tárolása: 0;
- pageerror és console error: 0;
- tesztadat-maradvány: 0.

### 19.4. Valódi S3 multipart megszakítás és folytatás

Valódi privát Object Storage-on 65 MB-os, kétpartos fájl tesztje:

- partméret: 64 MB;
- megszakítás: az első part után;
- új publikus upload capability: PASS;
- ugyanaz a feltöltési session állt vissza;
- resume állapotban kész partok: `[1]`;
- első part újraküldése: kimaradt;
- újonnan feltöltött adatmennyiség folytatáskor: 1 MB;
- végső S3 objektum: 65 MB;
- adatbázis-, multipart- és Object Storage-maradvány: 0.

### 19.5. E-mailes képelőnézet integráció

- valós privát S3 objektum olvasása: PASS;
- 180 × 120 JPEG előnézet: PASS;
- minta előnézeti méret: körülbelül 4 KB;
- 7 képből 6 előnézet és 1 szabályozott kihagyás: PASS;
- hiányzó S3 objektum esetén előnézet nélküli fallback: PASS;
- Nodemailer helyi MIME-teszt: `multipart/related` + inline `Content-ID`: PASS;
- külső teszt-e-mail küldése: nem történt;
- eredeti fájl e-mail-mellékletként: nincs;
- teszt Object Storage-maradvány: 0.

## 20. Fennmaradó fizikai eszközvalidáció

Az automatizált Chromium-emuláció nem helyettesíti a tényleges mobilkészüléket. Éles private-pilot után kézzel ellenőrizendő:

- fizikai iPhone Safari és főképernyős PWA;
- fizikai Android Chrome és telepített PWA;
- egymás után legalább 5–10 valódi kamerafotó;
- iOS HEIC és Android JPEG kamerafájlok;
- energiatakarékos mód és alacsony akkumulátor;
- képernyőzár, alkalmazásváltás és visszatérés;
- Wi‑Fi ↔ mobilinternet váltás;
- Gmail, Thunderbird és legalább egy mobil levelező `cid:` előnézet-megjelenítése.

## 21. Éles private-pilot release

**Élesítés időpontja:** 2026-08-06T14:00:05.853Z  
**Aktív release:** `.next-v098-release-final`  
**Build ID:** `khbESIjmxOVR6sLeA8lEE`  
**Közvetlen rollback:** `.next-v097-release-final`  
**Rollback script:** `scripts/rollback-drop-v098-release.sh`

Az éles aktiválás után:

- a publikus HTTPS útvonalak HTTP 200 választ adtak;
- a health válasz DROP 0.9.8 verziót jelez;
- PM2 online;
- Nginx aktív;
- ClamAV `PONG`;
- Drop worker timer aktív;
- csak a 3000-es éles Next.js port figyel;
- a négy publikus oldalon hydration-, page- és console hiba: 0;
- éles mobil Chromium-emulációban két egymást követő kamerakép, reload és offline/online helyreállítás: PASS;
- tesztadat-maradvány: 0.

A release éles private-pilotként használható. A fizikai iPhone/Android és valódi Gmail/Thunderbird/mobil levelezőkliens megjelenítési ellenőrzése kézi validációként marad fenn. Külső teszt-e-mail a release-ellenőrzés során nem került kiküldésre.
