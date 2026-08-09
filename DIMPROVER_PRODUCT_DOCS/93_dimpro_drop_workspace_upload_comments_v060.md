# DIMPRO DROP 0.6.0 – Munkatér, aktív feltöltés és megjegyzések

**Kiadás dátuma:** 2026. augusztus 3.  
**Állapot:** éles private-pilot kiadás  
**Nyilvános felület:** `https://drop.dimpro.hu`  
**Éles build:** `7f0bXP2n3gDBocotBKRcp`  
**Aktív release:** `.next-v060-release-final`  
**Előző rollback release:** `.next-v050-release-final`

## A fejlesztési kör célja

A DROP 0.5.0 biztonságos S3-, ClamAV-, worker- és letöltési alapjára teljes, használható Drop munkatér készült. A felhasználó Drop térből saját csomagot hozhat létre, fájlt tölthet fel, megjegyzést írhat, a rendszer pedig a fájlt közvetlenül a privát Hetzner S3 tárhelyre továbbítja, vírusvizsgálja és csak tiszta állapotban engedi letölteni.

## Aktivált funkciók

- `DROP_IMAGE_DROP_ENABLED=true`;
- `DROP_FILE_DROP_ENABLED=true`;
- `DROP_ZIP_UPLOAD_ENABLED=true`;
- `DROP_MIXED_PACKAGE_ENABLED=true`;
- `DROP_COMMENTS_ENABLED=true`.

A futási szint továbbra is `private-pilot`, így a működő funkciók ellenőrzött felhasználói körben használhatók.

## Elkészült munkatér

- kompakt, vízszintesen kezelhető mini csomagkártyák;
- teljes szélességű drag & drop feltöltési terület;
- gépről történő tallózás;
- eredeti fájlnév és mentési név külön kezelése;
- eredeti és feltöltési fájlméret, valamint megtakarítás megjelenítése;
- kliensoldali kép-előkészítés és képoptimalizálás;
- EXIF- és GPS-metaadatok eltávolítása az optimalizált képekből;
- automatikus csomagsorszám és fájlnév-előkészítés;
- kötelező feltöltési szabályzat minden új és folytatott munkamenetnél;
- csomagszintű és fájlszintű megjegyzések;
- csomag-PIN helyreállítás, a korábbi PIN azonnali érvénytelenítésével;
- Drop tér hozzáférés-helyreállítás időkorlátos tokennel;
- projektkapcsolat a központi projekt-adatmodellhez;
- HAGE-INVEST projektkapcsolat readiness ellenőrzése;
- tér- és csomagesemények auditnaplózása.

## Feltöltési és biztonsági folyamat

1. A böngésző előkészíti a fájlt és rögzíti a szabályzat elfogadását.
2. A rendszer rövid életű, adott munkamenethez kötött feltöltési tokent ad.
3. A fájl 64 MB-os részekben, közvetlen signed URL-lel a privát Hetzner S3 bucketbe kerül.
4. A szerver ellenőrzi a részek méretét, ETag értékét és SHA-256 ellenőrzőösszegét.
5. A lezárt objektum karanténállapotba kerül.
6. A DROP worker ClamAV `INSTREAM` vizsgálatot futtat és teljes fájl SHA-256 értéket rögzít.
7. Csak `clean` vírusállapot, `clean` biztonsági állapot és `ready` feldolgozási állapot mellett adható signed letöltési URL.
8. Minden letöltési URL-kiadás külön auditrekordot kap.

## E-mail és PIN

- meghívó- és feltöltési e-mail szolgáltatás: aktív;
- valós SMTP-integráció: PASS;
- jóváhagyott PIN-megjelenítés: `123-456`;
- a nyers PIN és capability token továbbra sem kerül adatbázisba;
- helyreállításkor a korábbi PIN érvényét veszti;
- e-mailhiba nem vonja vissza a már biztonságosan létrehozott csomagot.

## Kiadási ellenőrzések

- DROP 0.6.0 szerződés: **47/47 PASS**;
- adatbázis- és tárhely-readiness: **PASS**;
- célzott és alkalmazásforrásokra korlátozott ESLint: **0 hiba**, 113 meglévő figyelmeztetés;
- teljes TypeScript: **PASS**;
- candidate build: **PASS**;
- e-mail egységteszt: **PASS**;
- valós SMTP-integráció: **PASS**;
- éles térmunkamenet és megjegyzés: **PASS**;
- közvetlen Hetzner S3 multipart feltöltés: **PASS**;
- teljes fájl SHA-256: **PASS**;
- ClamAV tiszta fájl vizsgálata: **PASS**;
- signed letöltés és bájtszintű egyezés: **PASS**;
- automatikus adatbázis- és S3-takarítás: **PASS**;
- desktop, tablet és mobil böngészőteszt: **PASS**;
- vízszintes túlcsordulás: **nincs**;
- böngésző-, konzol- és hálózati hiba: **0**;
- DROP és Projektkapu nyilvános oldalak: **HTTP 200**;
- nyilvános worker API: **404, rejtett**;
- hibás letöltési token: **fail-closed**;
- Nginx konfiguráció: **PASS**;
- ClamAV daemon: **aktív / PONG**;
- worker timer: **engedélyezett és aktív**.

## Release és rollback

- aktív release pointer: `/root/dimprover/.dimprover/active-next-release`;
- aktív érték: `.next-v060-release-final`;
- előző release: `.next-v050-release-final`;
- aktiválási mentés: `/root/dimprover/backups/drop_v060_release_20260803_2338`;
- release manifest: `/root/dimprover/.dimprover/releases/drop-v060-release.json`;
- rollback script: `/root/dimprover/scripts/rollback-drop-v060-release.sh`.

A rollback visszaállítja a korábbi `.env.local` fájlt és a `.next-v050-release-final` release pointert, majd friss környezettel újraindítja és elmenti a PM2 állapotot.

## Tudatosan későbbre hagyott funkciók

- automatikus végleges PDF-riport létrehozása és kiküldése;
- Drive-archiválás;
- Drive Desktop kapcsolat;
- AI képelemzés;
- hibajegyzék-kapcsolat;
- automatikus tartalmi csoportosítás.

A retention törlési kapu változatlanul blokkolja a fizikai lejárati törlést addig, amíg a kötelező végleges riport nincs sikeresen elkészítve és elküldve. Ezért az automatikus PDF-riport külön következő fejlesztési kör, adatvesztési kockázat nélkül.
