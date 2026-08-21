# DIMPRO Terepi Gyorsrögzítő – F5 Terepi riport e-mail küldés

**Dátum:** 2026-08-21
**Környezet:** kizárólag DEV
**Baseline:** `983d186` – lezárt F4 DEV release dokumentációs állapot
**Állapot:** AKTÍV DEV RELEASE – VALIDÁLT

## 1. Cél

Az F5 a meglévő **3. Mentés és megosztás** lépés F4 Terepi összesítő paneljét egészíti ki kézi e-mail küldéssel. Nem hoz létre párhuzamos PDF-motort és nem indít automatikus levelet a munkamenet lezárásakor.

A Terep kliensverziója: `0.4.3-dev`.

A felhasználó továbbra is külön letöltheti a PDF-et. Az e-mail csak az **„PDF elkészítése és e-mail küldése”** gomb explicit megnyomásakor indul el.

## 2. E-mail infrastruktúra

Az F5 nem tartalmaz saját SMTP implementációt. A közös DIMPRO mail engine-t használja:

- motor: `sendDimproMail()`;
- profil: `drop`;
- DEV feladó: `ertesites.drop@dimpro.hu`;
- a felhasználó saját e-mail-címe `Reply-To` mezőként kerül a levélbe;
- SMTP host, felhasználónév és jelszó kizárólag szerveroldalon marad.

A kanonikus DEV operator mail-táron végzett safe readiness ellenőrzés szerint a `drop` profil aktív, jelszóval rendelkezik és `smtpConfigured=true`. Az általános `notifications` profil jelenleg nincs aktiválva, ezért az F5 nem kapcsolja be azt és nem változtat más modul e-mail viselkedésén.

## 3. Jogosultság és címzettpolitika

A route a meglévő DIMPRO Send bearer tokent használja, majd szerveroldalon ellenőrzi, hogy a megadott Field Capture session ténylegesen a hitelesített felhasználóhoz és entitlementhez tartozik.

A címzettpolitika az aktív Send entitlementet követi:

- `locked_default`: kizárólag a rögzített alapértelmezett címzett;
- `approved_list`: csak az aktív, jóváhagyott Send-címzettek;
- `free_entry`: érvényes külső e-mail-címek is megadhatók;
- minden módban érvényes a `maxRecipients` szerveroldali korlát.

A böngésző nem tudja felülírni ezt a szabályt.

## 4. PDF csatolmány

Az F5 ugyanazt a `createFieldCaptureSummaryPdf()` motort használja, mint az F4 letöltés. Emiatt az e-mailben küldött és a kézzel letöltött riport ugyanazt a tartalmi logikát követi.

Szerveroldali korlátok:

- kizárólag PDF csatolmány;
- `%PDF-` fejléc ellenőrzés;
- maximum 15 MB PDF;
- multipart kérés teljes méretére külön felső korlát;
- a fájlnév normalizált és `.pdf` kiterjesztésű.

A levélszövegben is szerepel, hogy a riport csak a rögzített/megtekintett munkaterületekre vonatkozik, és önmagában nem igazolja a teljes projekt készültségi fokát.

## 5. UI működés

A Terepi összesítő panelen külön **„PDF elküldése e-mailben”** nyitható rész jelenik meg. A panel mutatja:

- szerveroldali feladóprofilt;
- címzettpolitika típusát;
- maximális címzettszámot;
- címzett(ek) mezőt;
- tárgyat;
- kísérőszöveget;
- külön küldés gombot;
- küldési siker- vagy hibaállapotot.

`locked_default` módban a címzettmező nem szerkeszthető.

Ha a helyi munkamenetnek még nincs szerver-session azonosítója, az e-mail gomb nem küld: előbb legalább egy sikeres DIMPRO szerveres szinkron szükséges. A sikeres szinkron után a szerver-session azonosító helyben megmarad akkor is, ha a felhasználó még nem zárta le a munkamenetet.

## 6. Audit és adatminimalizálás

Sikeres küldéskor `REPORT_EMAIL_SENT`, hibánál `REPORT_EMAIL_FAILED` Field Capture audit esemény készül.

A sikeres audit csak technikai metaadatot tárol:

- mail profile id;
- SMTP message id;
- címzettek darabszáma;
- csatolmány neve;
- csatolmány mérete.

A kísérőszöveg, SMTP-jelszó, nyers Send-token és e-mail-jelszó nem kerül a Field Capture audit payloadba.

## 7. Source acceptance

A source candidate-en jelenleg:

- F5 email contract: `16/16 PASS`;
- F5 recipient/PDF service E2E: `9/9 PASS`;
- F4 report contract: `11/11 PASS`;
- F4 PDF E2E: `12/12 PASS`;
- P8 User Drive backend: `14/14 PASS`;
- P8 UI activation: `12/12 PASS`;
- client sync: `15/15 PASS`;
- finalize: `11/11 PASS`;
- upload rules: `6/6 PASS`;
- P7.1 upload binding: `12/12 PASS`;
- P7 server: `14/14 PASS`;
- staging: `14/14 PASS`;
- Terep statikus acceptance: `66/66 PASS`;
- GPS fotótérkép: `14/14 PASS`;
- GPS UI: `11/11 PASS`;
- GPS kalibráció: `17/17 PASS`;
- GPS kalibráció UI: `12/12 PASS`;
- GPS PDF contract: `12/12 PASS`;
- TypeScript: PASS;
- célzott ESLint: PASS;
- `git diff --check`: PASS.

## 8. 2026-08-21 – F5 DEV release lezárás

### Release identity

- F5 feature commit: `ceb9398ac98181aa23460aae1518fede55399df7`;
- Commerce P3 commit: `5256b8b239b40a2d7ae7cc7a7465860f94be7317`;
- közös runtime merge commit: `bcb27efc523f33925a6ca45450c8983b06db5358`;
- F5 browser-harness closeout: `eee7128d228efafdc5b0df992c8fc711eb4d705e`;
- aktív DEV artifact: `.next-terep-f5-commerce-p3-shared-bcb27ef`;
- BUILD_ID: `vYHnUoxWkIUD829quPjix`;
- sikeres cutover: `2026-08-21T17:11:31+02:00`;
- rollback backup: `/srv/dimpro-dev/backups/terep-f5-commerce-p3-shared/20260821T171122+0200`;
- előző aktív artifact: `.next-commerce-p3-storefront-admin-5256b8b`.

Az F5 és Commerce P3 külön ágban, ugyanazon lezárt F4/P2 utáni DEV alapra épült. A közös release konfliktus nélkül tartalmazza mindkét fejlesztést; a Terep kiadás nem írta felül a Commerce P3 munkát.

### Exact candidate acceptance

- F5 e-mail contract: `16/16 PASS`;
- F5 recipient/PDF service E2E: `9/9 PASS`;
- F5 mobil/browser acceptance: `17/17 PASS`;
- F4 mobil/browser regresszió: `16/16 PASS`;
- F3 Saját DIMPRO Drive browser regresszió: `13/13 PASS`;
- Terep mobil browser regresszió: `28/28 PASS`;
- Field Capture kliensszinkron E2E: PASS;
- Commerce P3 contract: `23/23 PASS`;
- Commerce P3 runtime E2E: `9/9 PASS`;
- TypeScript: PASS;
- célzott ESLint: PASS;
- `git diff --check`: PASS;
- shared Next build: PASS, 257 statikus chunk ellenőrizve.

A candidate-en valós Send bearerrel és saját teszt-sessionnel a `report-email` GET readiness is PASS lett: `configured=true`, `profileId=drop`, feladó `ertesites.drop@dimpro.hu`. A teszt-session cleanup eredménye `remaining=0`.

### Live DEV acceptance

Az aktív `https://drop.dev.dimpro.hu` DEV domainen:

- health: `0.4.3-dev`, `P0-P8`;
- Saját DIMPRO Drive: READY;
- Projektkapu Drive: továbbra is P9 / kikapcsolva;
- F5 mobil/browser acceptance: `17/17 PASS`;
- F4 mobil/browser regresszió: `16/16 PASS`;
- F3 Saját Drive browser regresszió: `13/13 PASS`;
- Terep mobil browser regresszió: `28/28 PASS`;
- teljes kliensszinkron browser E2E: PASS;
- browser page error: 0;
- browser console error: 0;
- kliensszinkron cleanup: capture 0 / package 0;
- valós, hitelesített `report-email` readiness GET: PASS;
- mail profile: `drop` / `ertesites.drop@dimpro.hu` / `configured=true`;
- live readiness teszt-session cleanup: `remaining=0`;
- Commerce P3 runtime E2E: `9/9 PASS`.

Browser acceptance során valódi SMTP-küldés nem történt: a POST tesztintercepten futott. Ez szándékos biztonsági feltétel. A live F5 felület tényleges e-mailt kizárólag a felhasználó explicit **„PDF elkészítése és e-mail küldése”** műveletére indít.

## 9. Záró állapot

**F5 – Terepi riport e-mail küldés: AKTÍV DEV RELEASE / VALIDÁLT.**

A Terepi Gyorsrögzítő DEV verziója `0.4.3-dev`. Az F5 a szerveroldali DIMPRO Drop e-mail profillal küldésre kész, a címzettpolitika és audit szerveroldalon érvényesül, automatikus riportküldés nincs.

**PROD DENY – éles környezet változatlan.**
