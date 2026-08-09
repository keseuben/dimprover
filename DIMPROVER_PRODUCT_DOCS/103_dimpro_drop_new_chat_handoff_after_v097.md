# DIMPRO Drop – új csevegés átadási dokumentum a DROP 0.9.7 után

**Átadási dátum:** 2026. augusztus 6.  
**Projekt:** DIMPRO / DIMPROVER  
**Modul:** DIMPRO Drop termékcsalád  
**Állapot:** éles private-pilot, felhasználói tesztelésre kész

---

## 1. Aktív éles rendszer

- Projektmappa: `/root/dimprover`
- Publikus domain: `https://drop.dimpro.hu`
- Belső admin: `https://license.dimpro.hu/drive/drop/public-workflows`
- Üzemeltetési központ: `https://license.dimpro.hu/drive/drop/operations`
- Aktív alkalmazásverzió: `DROP 0.9.7`
- Aktív release: `.next-v097-release-final`
- Aktív build: `MeShA63db3FLJwzqqCul_`
- Közvetlen rollback: `.next-v096-release-final`
- Rollback build: `EOIQ3qRnfiH1efAwdZT58`
- Rollback script: `scripts/rollback-drop-v097-release.sh`
- PM2 folyamat: `dimprover`
- Aktív alkalmazásport: `3000`
- Candidate port: leállítva
- PostgreSQL publikus workflow-tár: aktív
- Többpéldányos workflow-mód: kész
- PostgreSQL hiba esetén fájltári visszaesés: fail-closed
- Fejlesztési Központ verzió: `version_71730c3c-f25`
- Fejlesztési Központ státusz: `released`, 77 perc, nyitott időmérő 0

## 2. DIMPRO Drop termékstruktúra

### DIMPRO CsomagDrop

- meghívásos, PIN-es vagy titkos capability-linkes csomag;
- KépDrop, FájlDrop, ZIP és vegyes csomag;
- 500 MB/fájl;
- projekt-, Drop Tér- és Drive-kapcsolat;
- megjegyzések, PDF-riport, archiválás.

### DIMPRO Beküldőkapu

- személyes, projekt- vagy szervezeti kapu;
- előre rögzített címzett vagy engedélyezett címzettlista;
- projekt- és célmappa-hozzárendelés;
- 250 MB/csomag, legfeljebb 50 fájl;
- linkes vagy link + PIN letöltés.

### DIMPRO Send

- hatjegyű küldési jogosultsági kód;
- szabadon megadható feladó és címzettek;
- rövid üzenet, csomag- és fájlmegjegyzések;
- 1, 3, 5 vagy 7 napos megőrzés;
- 250 MB/csomag;
- címzettenként egy összesített levél;
- csak link vagy link + PIN védelem.

### DIMPRO Drop Tér

- tagság- és licencgazda-alapú együttműködés;
- tartós csomag-, projekt- és megjegyzéskezelés;
- Drive-archiválási kapcsolat.

## 3. Nyilvános útvonalak

- `/` – Drop termék- és munkafolyamat-választó;
- `/send` – DIMPRO Send;
- `/bekuldes` – Beküldőkapu ismertető;
- `/bekuldes/[slug]` – konkrét Beküldőkapu;
- `/open` – csomag/PIN/Drop Tér hozzáférés;
- `/d/[token]` – közvetlen letöltés;
- `/u/[token]` – közvetlen feltöltés;
- `/p/[token]` – capability-nézet;
- `/report/[token]` – riport;
- `/space/[spaceCode]` – Drop Tér.

## 4. Elkészült fő fejlesztési fejezetek

### DROP 0.9.2 – közös hozzáférési kezdőlap

- csomagkód/PIN nyitófelület;
- közvetlen tokenes útvonalak;
- publikus host és adminhost szétválasztása.

### DROP 0.9.3 – robotvédelem

- Human Timing Gate;
- egyszer használható upload intent;
- honeypot;
- rate limit és aktív session korlát;
- normál felhasználónál CAPTCHA nélkül.

### DROP 0.9.4 – termékcsalád

- CsomagDrop;
- Beküldőkapu;
- DIMPRO Send;
- közös HexaUpload;
- 250 MB-os publikus workflow;
- címzetti link + opcionális PIN.

### DROP 0.9.5 – PostgreSQL workflow-tár

- központi Send-kódok;
- Beküldőkapuk;
- publikus sessionök;
- package workflow és kvóta;
- atomi RPC-k;
- többpéldányos működés;
- fail-closed adatbázishiba-kezelés;
- párhuzamos csomaglétrehozási és finalizálási zárolás.

### DROP 0.9.6 – HEIC, e-mail, scanner és üzemeltetés

- bélyegképes 1/2/3 oszlopos képrács;
- kattintható nagyított előnézet;
- HEIC/HEIF → JPG `heic-to/csp` konverzió;
- EXIF/GPS eltávolítás;
- fájlonkénti aktivitási e-mail tiltása publikus workflow-nál;
- címzettenként egy összesített kézbesítési levél;
- háttérfinalizálás;
- azonnali systemd scanner-trigger;
- két párhuzamos ClamAV-vizsgálat;
- képfájl-prioritás;
- Drop üzemeltetési dashboard és mély S3-audit.

### DROP 0.9.7 – mobil dokk és Wake Lock

- 5 elemes lebegő mobil dokk;
- safe-area támogatás;
- középső hexagon Feltöltés gyorsmenü;
- Galéria/Kamera/Fájl globális indítása;
- billentyűzet- és modalérzékelés;
- tokenes útvonalon rejtett dokk;
- Screen Wake Lock manuális és automatikus kezelése;
- automatikus újrakérés háttérből visszatéréskor;
- telepített PWA első indítási alapértelmezés;
- nem támogató böngésző fallback;
- PWA gyorsparancsok és `dimpro-drop-static-v097` cache.

## 5. Közös technikai architektúra

- Next.js 16 standalone production release-ek;
- PM2 release pointer: `.dimprover/active-next-release`;
- PostgreSQL/Supabase üzleti és workflow-adatok;
- privát S3-kompatibilis Object Storage;
- multipart feltöltés 64 MB-os részekkel;
- ClamAV `clamd` INSTREAM;
- systemd path alapú azonnali scanner;
- kétperces teljes worker biztonsági tartalékként;
- Nginx host- és rate-limit védelem;
- SMTP kézbesítési napló;
- DIMPRO Értesítési Központ;
- PWA manifest és statikus service worker cache;
- privát API-k és fájlok nem cache-elhetők.

## 6. Fontos biztonsági szabályok

- nyers Send-kód nem tárolható;
- munkamenettokenből csak hash tárolható;
- fájl csak ClamAV `clean` állapot után tölthető le;
- link + PIN esetén a fájlkiadó API is proof-cookie-t kér;
- publikus admin API a Drop hoston 404;
- nyers S3-kulcs és nyers IP nem jelenhet meg a monitorban;
- Send/Beküldőkapu feltöltés közben nem küldhet fájlonként külön e-mailt;
- részleges e-mail-kézbesítés nem próbálható vakon újra;
- aktivált PostgreSQL-store hiba esetén nem írhat a régi fájltárba;
- robotvédelmi helyi fájltár csak egyalkalmazásos VPS-en elfogadható.

## 7. Jelenlegi tesztállapot

- üzemeltetési/HEIC/e-mail regresszió: 175/175 PASS;
- scanner regresszió: 27/27 PASS;
- mobil/PWA/Wake Lock szerződés: 63/63 PASS;
- összes szerződés: 265/265 PASS;
- TypeScript: PASS;
- teljes ESLint: 0 hiba, 113 régi figyelmeztetés;
- production build: 88 oldal, 72 statikus chunk;
- candidate és éles mobil shell: PASS;
- manuális Wake Lock: PASS;
- automatikus Wake Lock: PASS;
- PWA első indítási alapértelmezés: PASS;
- nem támogató böngésző fallback: PASS;
- billentyűzetes dokkelrejtés: PASS;
- tokenes útvonal dokk nélkül: PASS;
- globális Galéria gyorsművelet: PASS;
- valós HEIC előnézet: PASS;
- tesztmaradvány: 0.

## 8. Üzemeltetési állapot

- PM2, Nginx, ClamAV aktív;
- teljes worker timer aktív;
- azonnali scanner path aktív és engedélyezett;
- kizárólag a 3000-es alkalmazásport fut;
- aktív és közvetlen rollback release maradt meg;
- a két verzióval korábbi 0.9.5 release törölve;
- tárhelyhasználat a 0.9.7 élesítés után körülbelül 90%;
- a következő nagy build előtt tárhelyellenőrzés kötelező.

## 9. Ismert korlátok és kézi valós eszköztesztek

A headless Chromium Wake Lock mockkal a klienslogika igazolt, de az alábbi fizikai eszköztesztek még hiányoznak:

- iPhone Safari böngésző;
- iPhone főképernyőre telepített PWA;
- Android Chrome böngésző;
- Android telepített PWA;
- energiatakarékos mód;
- alacsony akkumulátorszint;
- képernyőzár és alkalmazásváltás;
- hosszú, 100–500 MB-os feltöltés mobilhálózaton;
- kamera- és galériaengedélyek különböző operációs rendszereken.

A böngésző vagy az operációs rendszer energiatakarékos állapotban visszavonhatja a Wake Lockot. A rendszer újrakéri, de az operációs rendszer döntését nem tudja felülírni.

## 10. Hiányzó fejlesztési fejezetek

### A. Nyilvános béta előtt szükséges

1. **Valós iOS/Android tesztmátrix**
   - Safari/Chrome/PWA;
   - kamera/galéria;
   - Wake Lock;
   - safe-area és billentyűzet;
   - nagy fájl mobilhálózaton.

2. **Offline és hálózatvesztési UX**
   - online/offline állapotjelző;
   - megszakadt kapcsolat üzenete;
   - automatikus újrapróbálás;
   - elakadt feltöltés helyreállítása.

3. **Tartós mobil feltöltési sor**
   - oldalfrissítés után visszaállítható queue;
   - folytatás megszakítás után;
   - Background Sync lehetőségének vizsgálata;
   - operációs rendszer által bezárt PWA helyreállítása.

4. **Feltöltés elkészült értesítés**
   - PWA/local notification, ahol támogatott;
   - e-mail csak a végleges összesített kézbesítéskor;
   - feladói állapotoldal.

5. **Mobil akadálymentességi audit**
   - TalkBack/VoiceOver;
   - fókuszsorrend;
   - minimum érintési célméret;
   - kontraszt;
   - reduced motion.

### B. Nyilvános béta közben

6. **Feladói e-mail-hitelesítés és visszaélésvédelem**
   - e-mail megerősítés;
   - küldési reputáció;
   - címzett- és napi kvóta;
   - visszaélési adminriasztások.

7. **Kézbesítési előzmények**
   - elküldve/megnyitva/letöltve;
   - címzettenkénti állapot;
   - lejárat és visszavonás;
   - biztonságos újraküldés.

8. **ZIP-ben letöltés és nagy csomag streaming**
   - teljes csomag letöltése;
   - memória- és tárhelykorlátos streaming;
   - lejárt csomagok hibakezelése.

9. **Admin üzemeltetési küszöbök**
   - riasztási határértékek felületi szerkesztése;
   - e-mail/értesítési címzettek;
   - napi/heti riport;
   - SLA és rendelkezésre állás.

### C. Többszerveres skálázás előtt

10. **Robotvédelmi intent store migráció**
    - a jelenlegi atomi helyi fájltár helyett PostgreSQL vagy Redis;
    - közös rate limit több példányhoz;
    - elosztott lock.

11. **Központi worker queue**
    - PostgreSQL/Redis queue;
    - külön scanner és e-mail worker;
    - retry/dead-letter;
    - horizontális skálázás.

12. **Object Storage életciklus-szabályok**
    - szolgáltatói lifecycle;
    - árva multipart takarítás;
    - automatikus retention kontroll;
    - költségfigyelés.

### D. Drop + Drive termékcsomag teljességéhez

13. **Drive webes felület befejezése**
    - végleges projektfa;
    - Dropból archivált csomagok keresése;
    - verzió- és jogosultságkezelés.

14. **Drive Desktop befejezése**
    - stabil szinkron;
    - konfliktuskezelés;
    - értesítési almodul;
    - offline cache.

15. **Előfizetés és csomagkvóta**
    - Send-kód jogosultság;
    - csomag- és tárhelykeret;
    - DIMPRO/DIMPROVER csomagok;
    - számlázási kapcsolat.

## 11. Javasolt következő új csevegés

### DROP 0.9.8 – mobil terepi UX és offline robusztusság

Elsődleges cél:

- online/offline állapotjelző;
- feltöltési queue helyreállítása oldalfrissítés után;
- megszakadt multipart feltöltés folytatása;
- alkalmazás háttérbe kerülésének kezelése;
- kompakt mobil feltöltési lista;
- feladói elkészült/hibás állapot;
- PWA-frissítés értesítése;
- valós iPhone és Android tesztmátrix dokumentálása.

## 12. Új csevegés indító szövege

```text
DIMPRO Drop fejlesztés folytatása – DROP 0.9.8 mobil terepi UX és offline robusztusság.

Olvasd be:
/root/dimprover/DIMPROVER_PRODUCT_DOCS/103_dimpro_drop_new_chat_handoff_after_v097.md
/root/dimprover/DIMPROVER_PRODUCT_DOCS/102_dimpro_drop_mobile_dock_wake_lock_v097.md
/root/dimprover/DIMPROVER_PRODUCT_DOCS/100_dimpro_drop_operations_heic_delivery_v096.md
/root/dimprover/DIMPROVER_PRODUCT_DOCS/74_dimpro_drop_fejlesztesi_allapot.md

Kiinduló éles release:
.next-v097-release-final
Build: MeShA63db3FLJwzqqCul_
Rollback: .next-v096-release-final

Cél:
- online/offline állapotjelző;
- megszakadt feltöltések mobil helyreállítása;
- multipart folytatás oldalfrissítés és háttérbe kerülés után;
- tartós, kompakt feltöltési queue;
- PWA frissítési értesítés;
- iOS/Android valós eszközteszt-fejezet;
- a meglévő CsomagDrop, Send és Beküldőkapu regressziómentes megőrzése.

Kötelező munkafolyamat:
status → érintett fájlok beolvasása → backup → Fejlesztési Központ → teljes kód → dokumentáció → tsc → teljes lint → production candidate → mobil/desktop/E2E → aktiválási backup → rollback → élesítés → végső audit.
```

## 13. Kötelező fejlesztési munkafolyamat

1. `get_server_status`;
2. aktív release/build és szabad tárhely ellenőrzése;
3. érintett fájlok beolvasása;
4. teljes forrásmentés;
5. Fejlesztési Központ verzió és időmérés;
6. kódmódosítás;
7. kapcsolódó termékdokumentáció;
8. `npx tsc --noEmit`;
9. teljes `npm run lint`;
10. külön production candidate build;
11. API-, böngésző-, mobil- és regressziós E2E;
12. aktiválási mentés és rollback;
13. PM2 élesítés;
14. HTTPS és maradványaudit;
15. Fejlesztési Központ `released` lezárás.
