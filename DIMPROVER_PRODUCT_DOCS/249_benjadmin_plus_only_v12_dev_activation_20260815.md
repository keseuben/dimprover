# BENJADMIN Plus-only AI Bridge V1.2 – DEV aktiválás

Dátum: 2026-08-15
Állapot: DEV ACTIVE / PASS
Környezet: `dimpro-dev`
PROD: változatlanul `READ_ONLY`, PROD módosítás nem történt.

## 1. Cél

A V1.2 célja, hogy OpenAI/Claude API nélkül a BENJADMIN legyen a napi fejlesztési vezérlőfelület, miközben a tényleges kódolás továbbra is a felhasználó Plus/előfizetéses ChatGPT munkameneteiben történik.

A kívánt napi folyamat:

`BENJADMIN vezetői utasítás -> Ben-AI koordináció -> worker kiosztás -> Worker Inbox -> ChatGPT: "Vedd fel a következő BENJADMIN feladatot" -> MCP/Plus Bridge task pull -> DEV fejlesztés -> strukturált eredmény vissza BENJADMIN-ba -> TESTING -> COMPLETE/FAIL`

Ehhez nem szükséges OpenAI API kulcs és nincs natív AI executor bekapcsolva.

## 2. Ben-AI worker kiosztás

Alapértelmezett mód: `Ben-AI · AUTO`.

Ben-AI a task létrehozásakor:
- ellenőrzi ÁrminAI, JázminAI és OutminAI aktuális aktív session terhelését;
- az aktív sessiont tekinti a foglaltság hiteles forrásának, ezért session nélküli régi/stale `in_progress` task nem blokkolja hamisan a workert;
- ellenőrzi a projekt- és repository izolációs szabályokat;
- csak szabad és jogosult workerhez route-ol;
- a várólistát task lezárásakor újraértékeli.

A felhasználó opcionálisan kézzel preferálhatja ÁrminAI/JázminAI/OutminAI valamelyikét. Ez nem közvetlen kényszerített routing: Ben-AI előbb ellenőrzi a kiválasztott worker állapotát.

Ha a preferált worker foglalt vagy az adott projektben nem választható:
- a task nem kerül hozzá csendben vagy kényszerítve;
- Ben-AI visszajelzi az okot;
- felajánlja a következő szabad és jogosult workert;
- a javaslat a Konzolban `Javaslat elfogadása` művelettel újraellenőrzés után elfogadható.

## 3. Plus-only Task Pull

Új szerveroldali Plus Bridge végpont:

`POST /api/dev/console/plus-bridge/[workerCode]/next`

A pull művelet:
- újraértékeli a Ben-AI várólistát;
- csak az adott workernek kiosztott taskot veszi fel;
- szükség esetén valódi M3 sessiont nyit;
- az execution gate továbbra is `TASK_BOUND`;
- a bridge állapotot `WAITING_HANDOFF -> HANDED_OFF -> RUNNING` sorrendben lépteti;
- visszaadja a taskhoz kötött, sanitizált handoff promptot és SHA-256 azonosítót;
- minden auditban `productionAccess: DENY` marad.

CLI/MCP segéd:

`scripts/benjadmin-plus-bridge-cli.mjs`

A ChatGPT-oldali normál felhasználói parancs a Parancstárban:

`Vedd fel a következő BENJADMIN feladatot, és folytasd a teljes DEV fejlesztési ciklust a taskban rögzített szabályok szerint. A végén írd vissza a strukturált eredményt BENJADMIN-ba.`

## 4. Strukturált eredmény-visszaadás

Új task action: `RESULT_REPORT`.

Tárolható eredménymezők:
- rövid összefoglaló;
- commit azonosító;
- build ID;
- teszteredmény;
- dokumentáció;
- következő lépés.

A szöveges mezők a központi `scanSensitiveText` secret scanneren mennek át. Találat esetén a nyers érzékeny érték nem kerül a bridge eredménybe. A rekord SHA-256 lenyomatot, verziót, sanitization státuszt és bounded eredménytörténetet kap.

Az eredmény rögzítése után a bridge `RESULT_PENDING`, és a rendszer TESTING fázist javasol.

## 5. UI változások

A BENJADMIN composerben:
- alapértelmezett `Ben-AI · AUTO`;
- opcionálisan Ármin / Jázmin / Outmin preferencia;
- a manuális preferencia Ben-AI ellenőrzésen megy át.

A taskkártyán:
- foglalt vagy nem választható preferált worker esetén Ben-AI javaslatkártya;
- alternatív worker neve;
- `Javaslat elfogadása` művelet;
- strukturált ChatGPT eredménykártya commit/build/test/docs/következő lépés adatokkal.

A ChatGPT Parancstár új Plus-only indítási sablont tartalmaz.

## 6. Aktív release

Aktív DEV pointer:

`.next-benjadmin-plus-v12-stable-final`

Build ID:

`1dWSJOqc7KqMuzEoJsSZ5`

Release source:

- branch: `release/benjadmin-plus-v12-stable-20260815`
- commit: `995c51bc001c8ef36e3f27b480d251c182daee8d`

Trusted BENJADMIN baseline:

- ref: `refs/heads/integration/benjadmin-dev`
- commit: `995c51bc001c8ef36e3f27b480d251c182daee8d`

Rollback release:

`.next-benjadmin-v11-field-v240-unified`

Rollback build:

`AYDYKkH-j2894_4NduMJF`

Cutover artifact:

`/srv/dimpro-dev/artifacts/benjadmin-plus-v12-cutover-20260815_231122`

PM2:
- process: `dimpro-benjadmin-operator-ui-v2-dev`
- status: online
- unstable restart: 0

## 7. Acceptance eredmények

Stabil release statikus kapuk:
- Plus-only V1.2 contract: `47/47 PASS`
- AI Developer Space V1 contract: `40/40 PASS`
- ChatGPT Bridge V1.1 contract: `39/39 PASS`
- TypeScript: PASS
- lint: `0 error / 103 baseline warning`
- production build: PASS
- standalone statikus chunk: `245 PASS`

Aktív 3100-as runtime post-cutover:
- V1.2 runtime E2E: `29/29 PASS`
- V1.2 browser acceptance: `11/11 PASS`
- V1.1 runtime: `25/25 PASS`
- V1.1 security: `8/8 PASS`
- V1 lifecycle: `17/17 PASS`
- dispatch: `9/9 PASS`
- standard BENJADMIN browser/responsive/PWA: `40/40 PASS`
- trusted baseline readiness: `7/7 PASS`

## 8. Párhuzamos Jázmin V2.5 fejlesztés

A Plus-only V1.2 aktiválása tudatosan nem tartalmazza a még külön candidate állapotú Central Issue Attachments V2.5 runtime-változásait.

Jázmin unified V1.2 + V2.5 candidate buildje külön elkészült, de a jelenlegi aktív pointer a stabil V1.2 release-re mutat. A V2.5 csak saját acceptance/release gate után aktiválható.

## 9. M.Forge-AI / V.Guard-AI irány

A V1.2 Plus-only réteg providerfüggetlen task/result szerződést készít elő. A későbbi M.Forge-AI és V.Guard-AI integráció ugyanahhoz a task-, session-, audit-, secret-sanitization- és eredménystruktúrához kapcsolható.

A jelenlegi V1.2 azonban nem aktivál külső AI providert vagy natív executort. Ezek továbbra is külön, fail-closed fejlesztési rétegek.

## 10. Következő fejlesztési lépés

Következő prioritás: Plus-only V1.3 / minimális ChatGPT indítási súrlódás.

Fő célok:
- a ChatGPT/MCP oldal worker-identitásának még egyszerűbb, fix parancs nélküli kezelése;
- task pull/claim állapotának Konzolban élő megjelenítése;
- `folytasd` / következő task láncolás;
- Ben-AI automatikus várólista-újraosztás periodikus/triggerelt hardeningje;
- fejlesztési időbecslés élő pontosítása;
- mobil/PWA push bekapcsolási UX javítása;
- későbbi M.Forge-AI és V.Guard-AI provider adapter szerződés megtartása.
