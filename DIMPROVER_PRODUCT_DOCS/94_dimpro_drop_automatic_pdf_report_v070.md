# DIMPRO DROP 0.7.0 – Automatikus végleges PDF-riport

**Kiadás dátuma:** 2026. augusztus 4.  
**Állapot:** éles private-pilot kiadás  
**Nyilvános felület:** `https://drop.dimpro.hu`  
**Éles build:** `lik1aQUxewddN4Exr6lwl`  
**Aktív release:** `.next-v070-release-final`  
**Előző rollback release:** `.next-v060-release-final`

## Fejlesztési cél

A DROP 0.6.0 biztonságos feltöltési, vírusvizsgálati és megjegyzési munkaterére automatikus végleges dokumentációs réteg készült. A feltöltési időszak lezárása után a worker A4-es PDF-riportot állít elő, privát Hetzner S3 tárhelyre menti, kézbesíti a jogosult címzetteknek, és csak friss, sikeresen elkészített riport után engedi tovább a retention törlési folyamatot.

## Aktivált funkció

- `DROP_PDF_REPORT_ENABLED=true`.

A Drive-archiválás, Drive Desktop, AI-képelemzés, hibajegyzék-kapcsolat és automatikus tartalmi csoportosítás továbbra is külön, kikapcsolt fejlesztési réteg.

## Riport tartalma

- DIMPRO Drop arculatú fedlap;
- csomagnév, projekt, csomagkód és életciklusadatok;
- feltöltői és címzetti összesítő;
- fájljegyzék mérettel, feltöltővel és időponttal;
- vírusellenőrzési és biztonsági állapot;
- fájlonkénti SHA-256 rövidített azonosító;
- csomagszintű megjegyzések;
- tisztának minősített képek A4-es képmellékletként;
- fájlszintű megjegyzések a kapcsolódó kép alatt;
- oldalszámozás és nyomtatható A4-es tördelés;
- fertőzött fájlok dokumentált jelölése: „Fertőzött – tiltva és törölve”.

A képek csak rövid életű, privát S3 signed URL-ről kerülnek a renderelésbe. A riportba kizárólag `clean` vírusállapotú és teljesen feldolgozott képfájl kerülhet.

## Automatikus folyamat

1. A csomag feltöltési időszaka lezárul, vagy a csomag lejárati életciklusba lép.
2. A worker `generate_final_report` feladatot állít sorba.
3. A worker ellenőrzi, hogy nincs függőben lévő vagy bizonytalan biztonsági állapotú fájl.
4. A rendszer összegyűjti a csomag, fájl, csoport, címzett és megjegyzés adatokat.
5. Puppeteer/Chromium A4-es PDF-et készít.
6. A PDF teljes SHA-256 ellenőrzőösszeget kap, majd privát S3 objektumként mentésre kerül.
7. A rendszer címzettenként, idempotensen kézbesíti a riportot.
8. Legfeljebb 12 MB méretig a PDF e-mail-csatolmányként kerül kiküldésre; nagyobb riportnál hét napig érvényes signed letöltési link készül.
9. Csak a `sent` vagy címzett nélküli `completed` állapotú, a csomag minden fájl- és megjegyzésmódosításánál frissebb riport oldja fel a retention törlési kaput.

## Frissesség és adatbiztonság

- új fájlfeltöltés automatikusan érvényteleníti a korábbi riportot;
- új megjegyzés automatikusan érvényteleníti a korábbi riportot;
- a törlési worker minden törlés előtt újra ellenőrzi a riport frissességét;
- a riportgenerálás közbeni tartalomváltozás hibával leállítja a folyamatot és új riportot kér;
- a worker egyszerre legfeljebb egy riportot generál, hogy ne okozzon memóriacsúcsot;
- a vírusvizsgálati feladatok elsőbbséget élveznek;
- a nyilvános worker API továbbra is 404 válasszal rejtett;
- a riportállapot API Drop tér munkamenet és csomagláthatóság alapján védett;
- a riport-tokenes külső oldal kizárólag friss, az adott csomaghoz tartozó PDF-hez ad rövid életű letöltési linket.

## Felhasználói felület

A kiválasztott Drop csomag alatt új **Végleges PDF-riport** kártya jelenik meg. A kártya mutatja:

- sorban állás, generálás és kézbesítés állapotát;
- oldalszámot és fájlméretet;
- generálási és kézbesítési időpontot;
- újragenerálási szükségletet;
- az aktív, időkorlátos PDF-letöltési gombot.

A megjelenítés desktop, tablet és mobil nézetben túlcsordulás nélkül működik.

## Ellenőrzések

- DROP 0.7.0 szerződés: **37/37 PASS**;
- teljes TypeScript: **PASS**;
- teljes projekt ESLint: **0 hiba**, 113 korábbi figyelmeztetés;
- production build: **PASS**;
- candidate buildazonosító: `lik1aQUxewddN4Exr6lwl`;
- A4 PDF-renderelő: **5 oldal PASS**;
- magyar karakterek és kötelező szövegtartalom: **PASS**;
- minden PDF-szövegelem laphatáron belül: **PASS**;
- valós Hetzner S3 képfeltöltés: **PASS**;
- ClamAV vizsgálat: **PASS**;
- képes PDF és megjegyzés: **PASS**;
- valós SMTP-csatolmány: **PASS**;
- címzett nélküli éles compiled worker folyamat: **PASS**;
- ismételt worker futás idempotenciája: **PASS**;
- desktop/tablet/mobil candidate és éles böngészőteszt: **PASS**;
- konzol-, oldal- és hálózati hiba: **0**;
- tesztcsomag-, fájl- és riportmaradvány: **0**.

## Release és rollback

- aktiválási mentés: `/root/dimprover/backups/drop_v070_release_20260804_095232`;
- release manifest: `/root/dimprover/.dimprover/releases/drop-v070-release.json`;
- rollback script: `/root/dimprover/scripts/rollback-drop-v070-release.sh`.

A rollback visszaállítja a korábbi környezeti konfigurációt és a `.next-v060-release-final` pointert, majd friss környezettel újraindítja és elmenti a PM2 állapotot.
