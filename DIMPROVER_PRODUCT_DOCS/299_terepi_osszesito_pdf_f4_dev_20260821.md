# DIMPRO Terepi Gyorsrögzítő – F4 Terepi összesítő / PDF riport

**Dátum:** 2026-08-21  
**Környezet:** kizárólag DEV  
**Forrás baseline:** `cbb57a1`  
**Állapot:** AKTÍV DEV RELEASE – VALIDÁLT

## 1. Cél

Az F4 a Terepi Gyorsrögzítő meglévő háromlépéses workflow-jának **3. Mentés és megosztás** lépésébe épül. Nem hoz létre külön riport-workflow-t és nem módosítja a P8 Saját DIMPRO Drive vagy a P9 Projektkapu Drive jogosultsági logikát.

A modul kliensverziója: `0.4.2-dev`.

## 2. Riportbeállítások

A riport sessionönként helyben megjegyzi:

- riport címe;
- rögzítés jellege;
- becsült felmérési lefedettség 0–100%.

Választható rögzítési jellegek:

1. Teljes körű;
2. Részleges;
3. Mintavételes / szemrevételezéses;
4. Kooperáció előkészítő fotódokumentáció;
5. Célzott munkaterületi ellenőrzés.

A riportbeállítás nem tartalmaz Send-kódot, PIN-t vagy nyers feltöltési capability tokent.

## 3. A4 Terepi összesítő PDF

A kliensoldali `pdf-lib` motor az aktuális Field Capture adatokból A4 álló riportot készít. A PDF tartalma:

- projekt és munkamenet adatai;
- rögzítő és szervezet;
- rögzítés jellege;
- felmérési lefedettség;
- rögzített képek, megjegyzések, GPS-pontok, kamerairányok és szerkesztett képek száma;
- DIMPRO szerver és Saját DIMPRO Drive tárolási állapotok;
- sorszámozott tétellista;
- GPS-pontosság és kamerairány;
- képjelölési revízió;
- megjegyzés / hangból rögzített szöveg;
- alapértelmezetten a dokumentum végén sorszámozott fotómelléklet, két fotó/A4 oldal elrendezésben.

PNG és JPEG közvetlenül beágyazható. Más, böngésző által dekódolható raster formátum a kliensoldali canvas útvonalon JPEG-re alakítható a PDF-melléklethez.

## 4. Felmérési érvényesség

A UI-ban és a PDF-ben kötelezően megjelenik:

> A jelen állapotrögzítés csak a bejárás során megtekintett és rögzített munkaterületekre vonatkozik. A rögzített állapot- vagy készültségi adatok nem minősülnek a teljes projekt készültségi fokának.

A felmérési lefedettség külön mező, ezért a rögzített tételek száma vagy átlaga nem jelenhet meg automatikusan teljes projektkészültségként.

## 5. Scope-korlát

F4 nem tartalmaz:

- e-mail riportküldést;
- Projektkapu Drive P9 aktiválást;
- új szerveres riport-adatbázist;
- PDF/DXF tervillesztést;
- új jogosultsági vagy licencmodellt.

A meglévő GPS fotótérkép külön panelként és külön exportként megmarad.

## 6. Source acceptance

A source candidate-en:

- F4 report contract: `11/11 PASS`;
- F4 PDF E2E: `12/12 PASS`;
- P8 User Drive backend: `14/14 PASS`;
- P8 UI activation: `12/12 PASS`;
- client sync: `15/15 PASS`;
- finalize: `11/11 PASS`;
- upload rules: `6/6 PASS`;
- P7 server: `14/14 PASS`;
- staging: `14/14 PASS`;
- Terep statikus acceptance: `66/66 PASS`;
- GPS PDF: `12/12 PASS`;
- GPS UI: `11/11 PASS`;
- TypeScript: PASS;
- célzott ESLint: PASS;
- `git diff --check`: PASS.

## 7. 2026-08-21 – F4 DEV release lezárás

### Release identity

- F4 runtime feature commit: `7b8998fa4897ebc207ba54c045e26273661035f9`;
- F4 browser-harness closeout: `59e3aa3f9b481ee1ecf69b3429144ab9ade190cb`;
- Commerce P2 commit: `9249bfa1447af71ffefb056354dacf430e6e3be4`;
- közös release commit: `049d9049fe9328014a9b81c849c0014aacf13f3d`;
- aktív DEV release: `.next-terep-f4-commerce-p2-shared-049d904`;
- BUILD_ID: `Z3aVPiiobKw5b1Bq_HZHW`;
- sikeres cutover: `2026-08-21T16:03:42+02:00`;
- rollback backup: `/srv/dimpro-dev/backups/terep-f4-commerce-p2-shared/20260821T160332+0200`;
- előző aktív release: `.next-terep-f3-shared-ef77d48`.

A közös candidate azért készült, mert az F4 és a Commerce P2 ugyanarról a `cbb57a1` baseline-ról külön ágban fejlődött, fájlütközés nélkül. A release egyik munkát sem írja felül: a merge commit mindkét ág történetét tartalmazza.

### Exact shared candidate gate

- F4 report contract: `11/11 PASS`;
- F4 PDF E2E: `12/12 PASS`;
- F4 mobil/browser acceptance: `16/16 PASS`;
- F3 Saját DIMPRO Drive browser regresszió: `13/13 PASS`;
- Terep mobil browser regresszió: `28/28 PASS`;
- teljes Field Capture kliensszinkron E2E: PASS;
- server status: `SERVER_STORED`;
- asset storage: `STORED`;
- staging private: true;
- raw capability persistence: false;
- browser page error: 0;
- browser console error: 0;
- E2E cleanup: capture 0 / package 0;
- Commerce P2 contract: `18/18 PASS`;
- Commerce P2 DEV schema verify: `0.1.15 / 16` PASS;
- Commerce P2 candidate lifecycle E2E: `25/25 PASS`;
- TypeScript: PASS;
- célzott ESLint: PASS;
- `git diff --check`: PASS;
- shared Next build: PASS, 255 statikus chunk ellenőrizve.

### Live DEV gate

Az aktív `https://drop.dev.dimpro.hu` DEV domainen:

- health: `0.4.2-dev`, `P0-P8`;
- Saját DIMPRO Drive: READY;
- Projektkapu Drive: továbbra is P9 / kikapcsolva;
- F4 mobil/browser acceptance: `16/16 PASS`;
- F3 Saját Drive browser regresszió: `13/13 PASS`;
- Terep mobil browser regresszió: `28/28 PASS`;
- teljes kliensszinkron browser E2E: PASS;
- Commerce P2 live lifecycle E2E: `25/25 PASS`;
- browser page error: 0;
- browser console error: 0;
- kliensszinkron cleanup: capture 0 / package 0.

Az első külső Commerce live E2E próbán a `aruter.dev.dimpro.hu` nginx 307 redirectet adott az `app.dev.dimpro.hu` API hostra. Ez nem termékhiba volt. A live runtime közvetlen, kanonikus `127.0.0.1:3100` + `aruter.dev.dimpro.hu` Host ellenőrzése `25/25 PASS` eredménnyel zárult.

## 8. Záró állapot

**F4 – Terepi összesítő / PDF riport: AKTÍV DEV RELEASE / VALIDÁLT.**

A következő külön fejlesztési blokk az **F5 – Terepi riport e-mail küldés**, amely a központi DIMPRO Értesítések mail-profilt és szerveroldali `sendDimproMail()` motort használja. Az F5 nem automatikus küldést jelent: a felhasználó explicit művelettel választ címzettet, tárgyat és kísérőszöveget, majd a Terepi összesítő PDF csatolmányként kerül kiküldésre.

**PROD DENY – éles környezet változatlan.**
