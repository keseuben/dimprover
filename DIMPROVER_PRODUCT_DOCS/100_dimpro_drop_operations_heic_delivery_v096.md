# DIMPRO Drop 0.9.6 – üzemeltetés, HEIC-előnézet és összesített kézbesítés

**Dátum:** 2026. augusztus 5.  
**Modul:** DIMPRO Drop / DIMPRO Send / DIMPRO Beküldőkapu  
**Alkalmazásverzió:** DROP 0.9.6  
**PostgreSQL workflow-séma:** DROP 0.9.5 – változatlan  
**Állapot:** éles private-pilot release.  
**Build ID:** `EOIQ3qRnfiH1efAwdZT58`  
**Release könyvtár:** `.next-v096-release-final`

## Üzemeltetési központ

- új adminoldal: `/drive/drop/operations`;
- gyors állapotellenőrzés és kézi mély S3-audit;
- csomag-, fájl-, feltöltési, vírusvizsgálati, letöltési, e-mail-, worker-, retention- és takarítási metrikák;
- maszkolt Object Storage minták, nyers objektumkulcs és nyers IP megjelenítése nélkül;
- legfeljebb 240 futásos helyi előzménytár 0600 fájljogosultsággal;
- 15 perces automatikus worker-ellenőrzés fájlzárral;
- admin értesítési központ és opcionális e-mail-riasztás;
- 6 órás azonos riasztás-duplikációgátlás;
- a monitor hibája nem állíthatja le a vírusvizsgálati, lejárati vagy takarítási workert.

## DIMPRO Send és Beküldőkapu képfelület

- a feltöltött képek bélyegképként jelennek meg;
- a bélyegkép kattintással teljes képernyős előnézetben megnyitható;
- mobilon 1, tableten/laptopon 2, széles laptopon/asztali gépen 3 oszlopos kártyarács;
- a fájl- vagy képmegjegyzés közvetlenül ugyanazon kártyán szerkeszthető;
- külön látszik az eredeti és feltöltendő méret, az optimalizálási állapot és a megtakarítás;
- a kártyán megjelenik a konverziós és EXIF/GPS-eltávolítási tájékoztatás.

## HEIC és HEIF képek

- a képfelismerés nem csak MIME-típus, hanem fájlkiterjesztés alapján is működik;
- a `.heic` és `.heif` fájl akkor is képként kezelendő, ha a böngésző `application/octet-stream` típust ad;
- bekapcsolt képméretcsökkentésnél a HEIC/HEIF először kliensoldalon JPG-vé alakul;
- a konvertált kép ezután legfeljebb 2560 px hosszú oldalra méreteződik;
- JPG-kimenet, EXIF/GPS-eltávolítás és bélyegkép készül;
- a konverzióhoz a Next.js-kompatibilis `heic-to/csp` kliensoldali modul használatos;
- sikertelen HEIC-konverziónál a rendszer nem tölti fel csendben az eredeti nagy fájlt, hanem egyértelmű hibát jelez.

### Valós HEIC teszt

- forrás: private-pilot során feltöltött valódi iPhone HEIC kép;
- eredeti méret: 1 892 907 byte;
- JPG kimenet: 553 569 byte;
- megtakarítás: 71%;
- eredeti felbontás: 3213×5712;
- kimeneti felbontás: 1440×2560;
- bélyegkép: sikeresen létrejött;
- EXIF/GPS: a vászon-alapú újrakódolás során eltávolítva.


## Azonnali vírusellenőrzés

- a feltöltés lezárása azonnal létrehozza a `scan_file` worker-jobot;
- a privát, 0600 jogosultságú triggerfájlt egy systemd path unit figyeli;
- a scanner nem várja meg a kétpercenként futó teljes worker következő ciklusát;
- a kétperces teljes worker biztonsági tartalékként változatlanul megmaradt;
- a scan-only worker egyszerre legfeljebb két fájlt vizsgál, összhangban a ClamAV két aktív szálával;
- a képek elsőbbséget, a 25 MB alatti fájlok második prioritást kapnak;
- a triggerkönyvtár jogosultsága 0700, a triggerfájloké 0600;
- a feltöltő bezárhatja az oldalt, a címzett csak a sikeres vírusellenőrzés után kapja meg az összesített levelet.

### Mért eredmény

- candidate S3 + ClamAV teljes folyamat: 3,13 másodperc;
- éles HTTPS/S3 + automatikus systemd trigger: 2,82 másodperc;
- tesztfájl: 627 952 byte-os JPEG;
- scan eredmény: `clean`;
- trigger maradvány: 0;
- feltöltői fájlonkénti e-mail: 0.

## E-mail-kézbesítési szabály

A publikus DIMPRO Send és Beküldőkapu workflow eltér a belső CsomagDrop aktivitásértesítéseitől.

- fájlfeltöltés közben nem küldhető fájlonként külön e-mail;
- `notify_on_upload_complete` és `notify_on_first_open` automatikusan kikapcsol a publikus workflow csomagjainál;
- az utolsó vírusellenőrzés után címzettenként pontosan egy összesített csomagkézbesítési levél készül;
- az összes fájl és minden fájlmegjegyzés ugyanabban a levélben szerepel;
- csak linkes védelemnél a címzett közvetlenül a vírusellenőrzött letöltőfelületre jut, csomagkód és PIN nélkül;
- link + kód módban csak a letöltési kódot kéri a közvetlen linkes oldal;
- kliensoldali véglegesítési zárolás akadályozza a párhuzamos kézbesítési kéréseket;
- a worker a vírusvizsgálatra váró, még el nem indított `not_requested` vagy `pending` workflow-t kézbesítheti automatikusan;
- `failed` vagy részleges kézbesítés nem próbálható automatikusan vakon újra;
- részleges kézbesítésnél adminellenőrzés szükséges, hogy a már kiküldött link ne váljon érvénytelenné és ne menjen duplikált levél.

## Private-pilot hiba és korrekció

A „Fotók Hajdúszovát D-E ólcsoport” teszt során a feltöltő minden egyes fájl után külön aktivitási e-mailt kapott. Ezek a belső CsomagDrop PIN-es megnyitóoldalára mutattak. A címzettnek küldött közvetlen letöltési link viszont helyesen a vírusellenőrzött, 10 fájlt tartalmazó letöltőfelületre vezetett.

Korrekció:

- a tesztcsomag további fájlonkénti értesítései adatbázisban letiltva;
- a működő címzetti letöltőútvonal változatlan maradt;
- a forráskód minden jövőbeni Send/Beküldőkapu csomagnál automatikusan tiltja a fájlonkénti aktivitási levelet;
- a korábbi, bizonytalanul naplózott kézbesítést a worker nem küldi újra automatikusan.

## Ellenőrzések

- TypeScript: PASS;
- célzott ESLint: PASS;
- DROP 0.9.6 szerződéses teszt: 175/175 PASS;
- valós HEIC böngészős konverzió: PASS;
- gyors és mély üzemeltetési audit: PASS;
- S3-adatbázis egyezőség a forrásellenőrzéskor: 10/10, 0 árva, 0 hiányzó, 0 méreteltérés;
- scan-gyorsítási szerződés: 27/27 PASS;
- összes szerződéses ellenőrzés: 202/202 PASS;
- production build: PASS, 88 oldal, 72 statikus chunk;
- candidate HEIC/képrács/e-mail UI: PASS;
- candidate azonnali scanner: 3,13 másodperc;
- éles systemd által indított scanner: 2,82 másodperc;
- feltöltői fájlonkénti e-mail: 0;
- HTTPS útvonalak: 5/5 HTTP 200;
- éles tesztmaradvány: 0.

## Éles release

- aktiválás: 2026. augusztus 5.;
- aktív release: `.next-v096-release-final`;
- build: `EOIQ3qRnfiH1efAwdZT58`;
- közvetlen rollback: `.next-v095-release-final`;
- rollback script: `scripts/rollback-drop-v096-release.sh`;
- aktiválási mentés: `backups/drop_v096_release_20260805_213731`;
- forrásmentés: `backups/drop_v096_operations_monitor_20260805_175140`;
- scanner-gyorsítási mentés: `backups/drop_v096_scan_acceleration_20260805_200307`;
- HEIC CSP-mentés: `backups/drop_v096_heic_csp_entrypoint_20260805_205348`;
- Fejlesztési Központ: `released`, 229 perc, nyitott időmérő 0.
