# DIMPRO Terepi Gyorsrögzítő – F4 Terepi összesítő / PDF riport

**Dátum:** 2026-08-21  
**Környezet:** kizárólag DEV  
**Forrás baseline:** `cbb57a1`  
**Állapot:** F4 SOURCE CANDIDATE – build/browser acceptance előtt

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

## 7. Következő release gate

1. F4 source commit;
2. koordinált Next candidate build;
3. izolált `3158` mobil/browser acceptance;
4. exact candidate regresszió;
5. aktuális operator/integration összevetés;
6. rollback-védett koordinált DEV cutover;
7. live `https://drop.dev.dimpro.hu` F4 browser acceptance és health smoke;
8. release closeout.

**PROD DENY – éles környezet változatlan.**
