# DIMPRO Drop – e-mail kliensvalidáció, ZIP-tömeges letöltés és egységes PWA ikon

**Verzió:** DROP 0.9.9  
**Kiadás:** 2026. augusztus 6.  
**Állapot:** éles private-pilot release  
**Publikus cím:** `https://drop.dimpro.hu`  
**Aktív release:** `.next-v099-release-final`  
**Build ID:** `C1O7K6FBn329lzLVSvrjA`

## 1. Fejlesztési cél

A DROP 0.9.9 három, felhasználói használatot közvetlenül érintő területet zár le:

1. az éles címzetti Drop-e-mail valódi levelezőprogramokban történő ellenőrizhetősége;
2. több fájl egyetlen, jogosultságvédett ZIP-csomagban történő letöltése;
3. a webes Drop favicon és a telepített mobil/PWA alkalmazásikon egységesítése.

A kiadás nem változtatja meg a PostgreSQL workflow-séma technikai verzióját. A központi publikus workflow-tár továbbra is a DROP 0.9.5 PostgreSQL-sémát használja.

## 2. E-mail kliensvalidációs admineszköz

Belső adminfelület:

```text
https://license.dimpro.hu/drive/drop/public-workflows
```

Admin API:

```text
GET|POST|PATCH /api/drop/admin/email-validation
```

A validációs eszköz ugyanazt a közös sablonépítőt használja, mint a tényleges Send/Beküldőkapu kézbesítés. Emiatt a teszt nem egy külön demonstrációs HTML-t, hanem az éles levélsablon felépítését vizsgálja.

### Támogatott ellenőrzési profilok

- Gmail webes felület;
- Gmail mobilalkalmazás;
- Mozilla Thunderbird;
- Microsoft Outlook asztali;
- Microsoft Outlook mobil;
- Apple Mail iPhone/iPad;
- Android rendszer-levelező;
- más levelezőprogram.

### Biztonsági szabályok

- nincs előre kitöltött címzett;
- pontos e-mail-cím kötelező;
- külön `TESZT` megerősítés szükséges;
- ugyanarra a címre 60 másodperces várakozás;
- naponta legfeljebb 20 tesztlevél;
- a tárgy és a levéltartalom jól láthatóan tesztként jelölt;
- nincs valódi csomaghozzáférés;
- nincs működő Drop-token vagy PIN;
- az eredeti fájlok nem kerülnek mellékletként kiküldésre;
- a tesztküldés és az értékelés `0600` jogosultságú auditnaplóba kerül.

### Előnézeti tartalom

- 3 darab inline CID-kép;
- JPEG, PNG és HEIC forráshelyzetet bemutató minták;
- PDF- és ZIP-fájlkártya;
- böngészős, küldés nélküli előnézet;
- megfelelt / hibás / ellenőrzésre vár értékelés.

A release során külső teszt-e-mail nem került kiküldésre. A compiled panel 8 klienssel, 3 képpel és 5 fájlkártyával, üres címzettel és letiltott küldőgombbal lett ellenőrizve.

## 3. Tömeges ZIP-letöltés

A címzetti letöltőoldalon több fájl esetén új kiemelt művelet jelenik meg:

```text
Összes letöltése ZIP-ben
```

Az egyedi fájlletöltési gombok továbbra is megmaradnak.

### Működési szabályok

- kizárólag vírusellenőrzött, tiszta, kész és letölthető fájl kerülhet a ZIP-be;
- ugyanaz a download capability, lejárat és PIN-proof védelem érvényes;
- a token POST űrlapban érkezik, nem kerül URL-paraméterbe;
- maximum 500 fájl;
- maximum 2 GB összes forrásméret;
- a fájlok lusta S3 streamként kerülnek a ZIP-adatfolyamba;
- tartós ZIP-másolat nem készül az Object Storage-ban;
- az eredeti fájlok nem kerülnek újratömörítésre vagy átalakításra;
- azonos fájlnevek automatikusan sorszámozódnak;
- útvonalbejárási karakterek és mappanevek megtisztításra kerülnek;
- minden fájlhoz külön letöltési audit készül;
- külön `started`, `completed` vagy `failed` ZIP-esemény készül.

### ZIP-manifest

A csomag tartalmazza:

```text
DIMPRO_DROP_fajllista.txt
```

A manifest tartalma:

- csomag neve és publikus kódja;
- fájlnevek;
- fájlméretek;
- SHA-256 értékek;
- fájlmegjegyzések;
- generálási idő;
- figyelmeztetés arról, hogy a ZIP kérésre készült és nem tartós szerveroldali másolat.

### Éles E2E eredmény

A `Kepek` mintacsomaggal:

- fájlok: 13;
- forrásméret: 12 313 425 byte;
- ZIP-méret: körülbelül 12,3 MB;
- SHA-256: 13/13 PASS;
- fájlonkénti audit: 13/13 PASS;
- `started` és `completed` esemény: PASS;
- `failed` esemény: 0;
- tartós ZIP-másolat: 0;
- teszttoken és tesztmaradvány: 0.

Aktív, többfájlos PIN-védett valós mintacsomag nem állt rendelkezésre. A PIN-proof kötelezettsége forrás- és szerződéses teszttel PASS; a fizikai private-pilot során külön valós PIN-es ZIP-próba szükséges.

## 4. Egységes webes favicon és mobil/PWA ikon

A korábbi PWA ikon kék, átlátszó hátterű grafika volt, ezért nem egyezett a Drop webes faviconjával. A 0.9.9-ben minden Drop ikon ugyanabból a forrásból készül:

```text
public/drop-favicon-master.png
```

### Új verziózott fájlok

- `drop-favicon-v099-32.png`;
- `drop-favicon-v099.ico`;
- `drop-apple-touch-v099-180.png`;
- `drop-app-icon-v099-192.png`;
- `drop-app-icon-v099-512.png`;
- `drop-app-icon-maskable-v099-512.png`.

### PWA-szabályok

- 192 és 512 pixeles normál `purpose: any` ikon;
- külön 512 pixeles `purpose: maskable` ikon biztonságos belső margóval;
- Apple Touch ikon 180 × 180 px;
- webes favicon 32 px PNG és többméretű ICO;
- Send/Megnyitás/Beküldőkapu gyorsparancsok az új ikont használják;
- helyi értesítések ikonja és badge-e az új ikont használja;
- service worker cache: `dimpro-drop-static-v099-icons`;
- új, verziózott fájlnevek az Android/iOS ikoncache kikerüléséhez.

A már telepített PWA ikonfrissítését az operációs rendszer késleltetheti. Ha a régi ikon marad, a felhasználónak el kell távolítania a korábbi főképernyős/PWA telepítést, majd újra telepíteni a `drop.dimpro.hu` oldalról.

## 5. Biztonsági és adatvédelmi változatlanság

A 0.9.9 nem gyengíti a korábbi védelmeket:

- PostgreSQL fail-closed publikus store;
- HttpOnly sessioncookie;
- nyers tokenek és PIN-ek nem kerülnek naplóba;
- Human Timing Gate és honeypot;
- Nginx rate limit;
- privát Object Storage;
- ClamAV kötelező ellenőrzés;
- PIN-proof cookie;
- tokenes és admin útvonalak host szerinti szétválasztása;
- IndexedDB-ben nincs nyers hozzáférési adat;
- PWA cache-ben nincs API-válasz, tokenes oldal vagy feltöltött fájl.

## 6. Ellenőrzési összesítés

| Ellenőrzés | Eredmény |
|---|---:|
| Deklarált szerződéses/runtime ellenőrzések | 648/648 PASS |
| TypeScript | PASS |
| Teljes ESLint | 0 hiba, 113 korábbi figyelmeztetés |
| Production build | PASS |
| Next.js oldalak | 88 |
| Statikus chunkok | 73 |
| E-mail panel compiled browser | PASS |
| ZIP runtime tartalmi teszt | PASS |
| Candidate valós 13 fájlos ZIP E2E | PASS |
| Éles valós 13 fájlos ZIP E2E | PASS |
| PWA ikon szerződés | 51/51 PASS |
| Candidate ikon/manifest HTTP | PASS |
| Éles HTTPS ikon/manifest | PASS |
| React/page/console hiba | 0 |
| ClamAV | PONG |
| Tesztadat- és ZIP-maradvány | 0 |
| Külső teszt-e-mail | 0 |

## 7. Release és rollback

**Aktív release:** `.next-v099-release-final`  
**Build ID:** `C1O7K6FBn329lzLVSvrjA`  
**Közvetlen rollback:** `.next-v098-release-final`  
**Rollback script:** `scripts/rollback-drop-v099-release.sh`

Mentések:

- `backups/drop_v099_email_client_validation_20260806_141458`;
- `backups/drop_v099_pwa_icon_alignment_20260806_161719`;
- `backups/drop_v099_release_20260806_164103`.

## 8. Fennmaradó kézi validáció

- fizikai iPhone Safari/PWA ikon és ismételt kamerafotó;
- fizikai Android Chrome/PWA ikon és maskable megjelenés;
- a régi telepített PWA eltávolítása és újratelepítése utáni ikonellenőrzés;
- valós Gmail web/mobile tesztlevél;
- valós Thunderbird tesztlevél;
- legalább egy Outlook vagy mobil levelező tesztlevél;
- világos és sötét e-mail téma;
- valós, többfájlos link + PIN ZIP-letöltés.

## 9. Fejlesztési Központ

- verzióazonosító: `version_8dd0f4dd-198`;
- státusz: `released`;
- fejlesztési idő: 153 perc;
- nyitott időmérés: 0;
- release push: 1 sikeres, 0 hibás;
- build, rollback, mentések, tesztek és dokumentáció rögzítve.

## 10. Kiadási készültség

- DIMPRO Drop becsült összesített készültség: **94%**;
- private-pilot használhatóság: **éles és tesztelhető**;
- hiányzó rész: fizikai mobil- és PWA-validáció, valódi levelezőkliens-mátrix, valós PIN-védett ZIP-próba, hozzáférhetőségi és végleges release-gate ellenőrzés.
