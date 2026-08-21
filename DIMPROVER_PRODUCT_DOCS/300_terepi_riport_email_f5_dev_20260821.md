# DIMPRO Terepi Gyorsrögzítő – F5 Terepi riport e-mail küldés

**Dátum:** 2026-08-21
**Környezet:** kizárólag DEV
**Baseline:** `983d186` – lezárt F4 DEV release dokumentációs állapot
**Állapot:** F5 SOURCE CANDIDATE – build/browser acceptance előtt

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

## 8. Release gate

F5 csak akkor kerülhet DEV cutoverre, ha:

1. a source candidate commit tiszta;
2. az aktuális operator/integration és más worker ágak összevetése megtörtént;
3. az exact shared candidate build koordinált lock alatt PASS;
4. izolált mobil F5 browser acceptance PASS valós PDF-generálással, de valódi SMTP-küldés nélkül;
5. az exact candidate-en a F4/F3/Terep/client-sync regresszió PASS;
6. a valós report-email GET readiness a kanonikus DEV mail-profilt `configured=true` állapotban látja;
7. rollback backup elkészül;
8. live DEV cutover és utóteszt PASS.

Valódi e-mail címre automatikus acceptance-küldés nem történhet. Tényleges címzettes levelet csak felhasználói explicit művelet indíthat.

**PROD DENY – éles környezet változatlan.**
