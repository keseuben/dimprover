# DIMPRO DROP 0.9.4 – CsomagDrop, Beküldőkapu és DIMPRO Send

**Kiadás dátuma:** 2026. augusztus 5.  
**Állapot:** éles private-pilot release  
**Nyilvános felület:** `https://drop.dimpro.hu`  
**Fejlesztési Központ:** `DROP 0.9.4`, aktív időmérővel

## 1. Termékstruktúra

A DIMPRO Drop ernyőrendszer négy eltérő fájlátadási munkafolyamatot kezel:

| Munkafolyamat | Cél | Keret |
|---|---|---:|
| DIMPRO CsomagDrop | Meghívásos, PIN-es vagy titkos linkes projekt- és partneri csomagátadás | 500 MB/fájl, csomagkeret szerint |
| DIMPRO Beküldőkapu | Előre meghatározott személynek, projekthez vagy szervezethez beküldés | 250 MB/csomag |
| DIMPRO Send | Külső fájlküldés szabadon megadott címzetteknek | 250 MB/csomag |
| DIMPRO Drop Tér | Tartós, tagságalapú együttműködés és csomagkezelés | licenc- és térkeret szerint |

A KépDrop, FájlDrop, ZIP és vegyes csomag a DIMPRO CsomagDrop választható csomagtípusa.

## 2. Nyilvános útvonalak

- `/open` – meglévő CsomagDrop megnyitása csomagkóddal és PIN-nel;
- `/u/[token]` – közvetlen feltöltési capability-link;
- `/d/[token]` – vírusellenőrzött letöltési oldal;
- `/bekuldes` – Beküldőkapu ismertető;
- `/bekuldes/[slug]` – személyes, projekt- vagy szervezeti Beküldőkapu;
- `/send` – DIMPRO Send hatjegyű küldési kóddal.

A nyilvános host nem enged szabad, csomaghoz vagy jogosultsághoz nem kötött feltöltést.

## 3. Közös DIMPRO HexaUpload motor

A meglévő CsomagDrop és az új publikus workflow-k ugyanazt a hexagon alakú feltöltőkomponenst használják:

- szabályos CSS `clip-path` hexagon;
- drag & drop;
- kattintásos tallózás;
- mobil Galéria;
- mobil Kamera;
- billentyűzetes működés;
- teljes csomagszintű folyamatjelző;
- responsive desktop, tablet és mobil felület;
- meglévő multipart, robotvédelmi és karanténmotor.

A DIMPRO Send és Beküldőkapu ezen felül kliensoldali képméretcsökkentést használ:

- maximum 2560 px hosszabb oldal;
- 82% célminőség;
- EXIF/GPS metaadat eltávolítás;
- eredeti és optimalizált méret megjelenítése;
- százalékos megtakarítás;
- a 250 MB-os keret az optimalizálás után ténylegesen küldendő adatmennyiségre vonatkozik.

## 4. DIMPRO CsomagDrop

A korábbi 500 MB-os Drop rendszer új, egyértelmű neve.

- legfeljebb 500 MB/fájl;
- 64 MB-os multipart részek;
- megszakítás után folytatható feltöltés;
- képcsoportok;
- PIN és capability-linkek;
- csomag- és fájlmegjegyzések;
- PDF-riport;
- Drop Tér és Drive-archiválás;
- ClamAV és naplózott letöltés.

A 0.9.4 nem csökkenti vagy írja felül a CsomagDrop korábbi fájlméret-korlátját.

## 5. DIMPRO Beküldőkapu

### Típusok

1. **Személyes kapu** – egy előre meghatározott személyhez.
2. **Projektkapu** – egy személyhez, projekthez és opcionális célmappához.
3. **Szervezeti kapu** – előre engedélyezett címzettlistából választással.

### Szabályok

- a beküldő látja, kinek küld;
- szabad címzett-e-mailt nem írhat be;
- személyes és projektkapunál pontosan egy címzett rögzíthető;
- szervezeti kapunál egy vagy több engedélyezett címzett választható;
- feladó neve és e-mail-címe kötelező;
- tárgy, rövid üzenet, csomag- és fájlmegjegyzés;
- 50 fájl;
- legfeljebb 250 MB/fájl;
- legfeljebb 250 MB/csomag;
- 1, 3, 5 vagy 7 napos megőrzés;
- link vagy link + letöltési PIN;
- a kapu lejárathoz köthető, visszavonható és újraaktiválható.

## 6. DIMPRO Send

### Küldési folyamat

1. Hatjegyű küldési jogosultsági kód megadása, például `123-123`.
2. Feladó neve és e-mail-címe.
3. Címzettek neve, e-mail-címe és opcionális cége.
4. Tárgy.
5. Rövid üzenet.
6. Csomagmegjegyzés.
7. HexaUpload és opcionális képméretcsökkentés.
8. Fájlonkénti megjegyzés.
9. Letöltési mód: csak link vagy link + hatjegyű PIN.
10. Vírusellenőrzés utáni címzettenkénti e-mailes kézbesítés.

### Korlátok

- 50 fájl;
- 250 MB/fájl;
- 250 MB/csomag;
- alapból 10 címzett, adminisztrátori kódkorláttal;
- 1, 3, 5 vagy 7 napos megőrzés;
- küldési kódonként napi csomag- és adatkeret;
- küldési kód lejárathoz köthető és visszavonható.

## 7. Küldési kód biztonsága

- a kód pontosan hat számjegyű;
- egyedi kód kézzel is megadható vagy automatikusan generálható;
- a nyers kód csak létrehozáskor jelenik meg;
- a szerver a nyers kódot nem tárolja;
- szervertitokkal képzett HMAC-anyagot és egyedi sóval készült scrypt-hash-t tárol;
- összehasonlítás időzítésbiztos;
- a kezelőlistában csak `***-123` jellegű kódhint látható;
- hibás, lejárt vagy visszavont kód elutasítva;
- Nginx külön `5 kérés/perc/IP` korlátot alkalmaz.

## 8. Publikus munkamenetek

- 30 perces HttpOnly munkamenet-cookie;
- `SameSite=Lax` és production környezetben `Secure`;
- a nyers munkamenettoken nem kerül tárolásra;
- csak SHA-256 tokenhash marad;
- workflow- és IP-kötés;
- egy munkamenetből csak egy csomag hozható létre;
- lejárt munkamenetek automatikusan törlődnek.

## 9. Adattárolási architektúra

### PostgreSQL

Továbbra is központi és hivatalos adatforrás:

- csomagok;
- címzettek;
- hozzáférési tokenek hash-ei;
- fájlok;
- feltöltési sessionök;
- megjegyzések;
- események és audit;
- e-mail napló;
- letöltési napló.

### Private-pilot jogosultsági konfigurációtár

A közvetlen PostgreSQL DDL-hozzáférés hiánya miatt a 0.9.4 egy szerveres private-pilot konfigurációtárat használ:

- küldési kód konfigurációk és hashek;
- Beküldőkapu-konfigurációk;
- rövid publikus sessionhashek;
- csomag-workflow metaadatok;
- napi felhasználási foglalások.

Biztonság:

- könyvtárjogosultság `0700`;
- állományjogosultság `0600`;
- atomi temp-write + rename;
- sorosított módosítások;
- sérült JSON esetén fail-closed 503, nincs automatikus felülírás;
- candidate tesztekhez külön `DROP_PUBLIC_STATE_DATA_DIR` állítható.

Többszerveres kiadás előtt ezt PostgreSQL- vagy Redis-alapú központi tárolóba kell migrálni.

## 10. Megjegyzések

Három szint támogatott:

1. címzettnek szóló rövid üzenet;
2. csomagmegjegyzés;
3. fájlonkénti megjegyzés.

Ezek megjelennek:

- a címzett e-mailjében;
- a PIN-ellenőrzés utáni letöltési oldalon;
- az adott fájl kártyáján;
- a PostgreSQL `drop_comments` táblában;
- az auditnaplóban.

## 11. Letöltési védelem

### Csak link

- hosszú, véletlen capability-token;
- rövid életű S3 letöltési URL;
- ClamAV `clean` állapot kötelező;
- minden letöltés auditált.

### Link + hatjegyű PIN

- a címzett a linket és a PIN-t az e-mailben kapja;
- a PIN sózott hashként kerül a csomaghoz;
- helyes PIN után 30 perces, csomaghoz kötött, aláírt HttpOnly proof-cookie készül;
- proof nélkül a fájllista nem jelenik meg;
- proof nélkül a közvetlen fájlkiadó API is HTTP 401 választ ad;
- hibás és helyes PIN-próbálkozás auditálva.

## 12. Kézbesítés

A véglegesítés csak akkor indulhat, ha minden fájl:

- `upload_status = ready`;
- `processing_status = ready`;
- `virus_scan_status = clean`;
- `security_status = clean`.

A címzett külön e-mailt kap, amely tartalmazza:

- feladó neve és e-mail-címe;
- tárgy;
- rövid üzenet;
- csomagmegjegyzés;
- fájllista és fájlméretek;
- fájlonkénti megjegyzések;
- lejárat;
- letöltési link;
- opcionális letöltési PIN;
- ClamAV-vizsgálati tájékoztatás.

Ha egyetlen e-mail sem küldhető el, a csomag nem záródik le, és a kézbesítés újrapróbálható. Részleges kézbesítés külön `partial` státusszal naplózódik.

## 13. Nginx-védelem

| Végpont | Korlát |
|---|---:|
| Send-kód ellenőrzése | 5 kérés/perc/IP, 3 burst |
| Beküldőkapu megnyitása | 20 kérés/perc/IP, 5 burst |
| Publikus csomaglétrehozás | 10 kérés/perc/IP, 5 burst |
| Megjegyzés és véglegesítés | 30 kérés/perc/IP, 8 burst |
| Letöltési PIN | 10 kérés/perc/IP, 4 burst |

A tényleges S3 multipart fájladatot ezek a limitek nem lassítják.

## 14. Adminisztráció

Belső kezelőútvonal:

`/drive/drop/public-workflows`

Funkciók:

- küldési kód létrehozása;
- opcionális saját hatjegyű kód;
- napi csomag- és adatkeret;
- címzettlimit;
- megőrzési alapérték;
- visszavonás és újraaktiválás;
- személyes/projekt/szervezeti kapu létrehozása;
- előre engedélyezett címzettek;
- projekt és célmappa;
- link/PIN védelem;
- megjegyzések engedélyezése;
- kapulink másolása és megnyitása.

A meglévő kezelőfelület neve: **DIMPRO CsomagDrop kezelőközpont**.

## 15. Automatikus forrásteszt

- publikus jogosultsági motor: **39/39 PASS**;
- teljes termékcsalád forrásszerződés: **133/133 PASS**;
- TypeScript: PASS;
- célzott ESLint: 0 hiba;
- Nginx konfiguráció: PASS;
- Fejlesztési Központ: DROP 0.9.4 `in_progress`, egy nyitott időmérővel.

## 16. Mentés

Forrás-, környezeti-, Fejlesztési Központ- és Nginx-mentés:

`/root/dimprover/backups/drop_v094_product_family_20260805_113121`

## 17. Éles release lezárása

- Aktív release: `.next-v094-release-final`;
- Build ID: `0SJxGLTishQHSil9kxYtI`;
- Előző rollback release: `.next-v093-release-final`;
- Második rollback release: `.next-v092-release-final`;
- Aktiválási mentés: `backups/drop_v094_release_20260805_133712`;
- Rollback: `scripts/rollback-drop-v094-release.sh`;
- Build: 88 oldal, 69 standalone chunk;
- Fejlesztési Központ: `released`, 146 perc, nyitott időmérő 0.

Végleges teszteredmények:

- publikus jogosultsági core: 39/39 PASS;
- teljes termékcsalád-szerződés: 133/133 PASS;
- candidate API E2E: PASS;
- candidate desktop/tablet/mobil böngésző E2E: PASS;
- éles HTTPS DIMPRO Send és szervezeti Beküldőkapu: PASS;
- éles képméretcsökkentés és HexaUpload: PASS;
- éles multipart Object Storage és ClamAV: PASS;
- SMTP kézbesítés: PASS;
- PIN nélküli fájl-API tiltás: PASS;
- hibás PIN tiltás: PASS;
- Secure proof-cookie: PASS;
- aláírt letöltés SHA-256 ellenőrzése: PASS;
- tesztadat-, workflow- és tárhelymaradvány: 0.

Az éles böngészőtesztben a finalizáló a ClamAV-vizsgálat idején tervezetten HTTP 425 választ adott. Ez a polling folyamat része, nem kiadási hiba.
