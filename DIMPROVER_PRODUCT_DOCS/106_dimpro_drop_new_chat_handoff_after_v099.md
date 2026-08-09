# DIMPRO Drop – új csevegés átadás a DROP 0.9.9 után

**Átadási pont:** DROP 0.9.9 éles release  
**Aktív URL:** `https://drop.dimpro.hu`  
**Aktív release:** `.next-v099-release-final`  
**Build:** `C1O7K6FBn329lzLVSvrjA`  
**Közvetlen rollback:** `.next-v098-release-final`  
**Rollback:** `cd /root/dimprover && ./scripts/rollback-drop-v099-release.sh`

## 1. Új csevegés javasolt címe

```text
DROP 1.0.0 – private-pilot validáció és végleges kiadási keményítés
```

## 2. Első kötelező lépések

1. `get_server_status` / VPS állapotellenőrzés;
2. ennek a dokumentumnak a beolvasása;
3. `.dimprover/active-next-release` és BUILD_ID ellenőrzése;
4. PM2, Nginx, ClamAV, teljes worker és azonnali scanner ellenőrzése;
5. tárhelyellenőrzés;
6. teljes backup;
7. Fejlesztési Központban új DROP 1.0.0 verzió és időmérés indítása.

## 3. Jelenlegi termékfunkciók

### CsomagDrop

- meghívásos feltöltés/letöltés;
- kép-, fájl-, ZIP- és vegyes csomag;
- maximum 500 MB fájlonként;
- csomagkód, token és PIN;
- Drop Tér és archiválás.

### DIMPRO Send

- hatjegyű küldési jogosultsági kód;
- tetszőleges címzettek;
- maximum 250 MB csomagonként;
- címzettenként egy összesített e-mail;
- üzenet, csomag- és fájlmegjegyzés;
- link vagy link + PIN;
- automatikus háttérkézbesítés.

### Beküldőkapu

- személyes, projekt- és szervezeti kapu;
- előre rögzített címzettek;
- projekt- és célmappa-kapcsolat;
- szervezeti címzett allow-list;
- link vagy link + PIN.

### Mobil/PWA

- safe-area lebegő dokk;
- Galéria/Kamera/Fájl gyorsművelet;
- Screen Wake Lock;
- HEIC → JPG, optimalizálás, EXIF/GPS törlés;
- 1/2/3 oszlopos bélyegképes queue;
- több egymást követő kamerafotó;
- tokenmentes IndexedDB queue;
- oldalfrissítés és offline/online helyreállítás;
- multipart folytatás;
- PWA-frissítés és helyi értesítés;
- webes faviconnal egységes PWA ikoncsomag.

### Letöltés és e-mail

- egyedi fájlletöltés;
- összes fájl egyetlen, streamelt ZIP-ben;
- ZIP-manifest SHA-256 értékekkel és megjegyzésekkel;
- címzetti e-mailben legfeljebb 6 inline kép;
- e-mail kliensvalidációs adminpanel 8 kliensprofillal.

### Biztonság és üzemeltetés

- PostgreSQL központi workflow-tár;
- többpéldányos működés és fail-closed;
- privát S3 és ClamAV;
- azonnali scan-trigger és két párhuzamos scan;
- Human Timing Gate, honeypot és rate limit;
- üzemeltetési monitor és mély S3-audit;
- rollback és dokumentált release-ek.

## 4. Aktív technikai állapot

- Next.js 16.2.6, webpack;
- PostgreSQL workflow-séma: DROP 0.9.5;
- alkalmazásverzió: DROP 0.9.9;
- PM2 folyamat: `dimprover`;
- production port: 3000;
- candidate port: nincs;
- ClamAV: kötelező;
- Drop worker és azonnali scanner: aktív;
- PWA cache: `dimpro-drop-static-v099-icons`;
- Fejlesztési Központ: `version_8dd0f4dd-198`, `released`, 153 perc, nyitott időmérő 0;
- IndexedDB neve szándékosan `dimpro-drop-offline-v098`, hogy a tárolt queue ne vesszen el.

## 5. DROP 0.9.9 ellenőrzési alap

- 648/648 deklarált szerződéses/runtime ellenőrzés PASS;
- TypeScript PASS;
- teljes lint 0 hiba;
- 88 oldal és 73 statikus chunk;
- valós 13 fájlos candidate és éles ZIP E2E PASS;
- e-mail panel compiled és éles böngészőteszt PASS;
- új favicon/PWA ikonok candidate és éles HTTPS ellenőrzése PASS;
- tesztmaradvány 0;
- külső teszt-e-mail 0.

## 6. DROP 1.0.0 javasolt fejezetei

### A. Fizikai mobil validáció

- iPhone Safari és telepített PWA;
- Android Chrome és telepített PWA;
- 5–10 egymást követő kamerafotó;
- HEIC/JPEG vegyes queue;
- képernyőzár és alkalmazásváltás;
- energiatakarékos és alacsony akkumulátoros mód;
- Wi‑Fi ↔ mobilinternet váltás;
- PWA ikon frissítése eltávolítás/újratelepítés után.

### B. Valódi e-mail kliensvalidáció

Az adminpanelből kontrollált tesztküldés:

- Gmail web;
- Gmail mobil;
- Thunderbird;
- Outlook vagy Apple Mail;
- világos és sötét mód;
- képelőnézet, alt szöveg, fájlkártya és ZIP-tájékoztató;
- eredmény rögzítése a validációs naplóban.

### C. Valós PIN-védett ZIP

- többfájlos link + PIN csomag létrehozása;
- PIN-proof cookie ellenőrzése;
- ZIP-letöltés;
- fájlonkénti audit;
- lejárat és hibás PIN limit;
- tesztcsomag teljes törlése.

### D. Felhasználói UX és hozzáférhetőség

- ZIP-generálási állapot és nagy csomag figyelmeztetés;
- letöltési segítség mobilon;
- billentyűzetes navigáció;
- képernyőolvasó címkék;
- kontraszt és 200%-os zoom;
- hibaszövegek véglegesítése.

### E. Üzemeltetési véglegesítés

- valós private-pilot riasztási küszöbök;
- tárhely- és backup-retenció;
- SMTP kézbesítési mutatók;
- ZIP-generálási idő és hibaarány;
- scanner-várakozás és nagy fájl teljesítmény;
- adatvédelmi és felhasználási tájékoztató végleges ellenőrzése.

### F. DROP 1.0.0 release gate

- teljes regresszió;
- fizikai eszközmátrix;
- valós levelezőkliens-mátrix;
- PIN-es ZIP E2E;
- backup/rollback próba;
- dokumentáció;
- Fejlesztési Központ lezárása;
- private-pilot visszajelzések besorolása.

## 7. Ismert manuális lépés az ikonhoz

A kód és manifest már az új Drop favicon-alapú ikont használja. A telefonon korábban telepített PWA régi ikonja az operációs rendszer cache-e miatt megmaradhat. Ellenőrzési sorrend:

1. régi DIMPRO Drop főképernyős/PWA ikon eltávolítása;
2. böngésző teljes bezárása;
3. `https://drop.dimpro.hu` újranyitása;
4. PWA/főképernyős telepítés újra;
5. ikon és maskable vágás ellenőrzése.

## 8. Kötelező dokumentációs szabály

Minden következő funkció vagy nagyobb javítás után frissítendő:

- `74_dimpro_drop_fejlesztesi_allapot.md`;
- új verzió részletes dokumentuma;
- `README.md` dokumentumindex;
- release manifest;
- Fejlesztési Központ verzió, időmérés és tesztösszesítés.

## 9. Összesített fejlesztési állapot százalékban

A százalékok a jelenlegi működő, dokumentált és tesztelt funkciók alapján becsült készültségi értékek.

| Rendszer | Jelenlegi szint | Használhatóság |
|---|---:|---|
| DIMPRO Drop | 94% | Éles private-pilot, fő munkafolyamatok használhatók. |
| DIMPRO Drive backend | 72% | Alap fájl-, projekt-, storage- és archiválási motor használható. |
| DIMPRO Drive webes felület | 58% | Alap műveletek használhatók, további workflow-fejlesztés szükséges. |
| Drive Desktop | 38% | Fejlesztés alatt, teljes szinkron még nem kész. |
| Drop → Drive archiválás | 78% | Backend és biztonsági alap működik, további felületi tesztelés szükséges. |
| Teljes Drop + Drive termékcsomag | 68% | Drop érett, Drive és Desktop további fejlesztést igényel. |

A DIMPRO Drop hátralévő része elsősorban fizikai eszköz-, levelezőkliens-, PIN-védett ZIP-, hozzáférhetőségi és végleges release-gate validáció. A teljes termékcsomag készültségét továbbra is főként a Drive webes felület és a Drive Desktop hátralévő fejlesztése korlátozza.
