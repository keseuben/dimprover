# 293 — BENJADMIN Weekly Development Flow V2.0 · vezetői heti riport export

**Dátum:** 2026-08-19
**Környezet:** kizárólag DEV
**Állapot:** DEV AKTÍV · 2026-08-19 18:06:25 CEST · PROD DENY

## Cél

A V1.4 vezetői heti összefoglaló exportálható és megosztható riporttá alakítása úgy, hogy ugyanaz a `DeveloperWeeklySummary` adatmodell és jogosultsági réteg maradjon az egyetlen adatforrás.

## Exportformátumok

- PDF — A4, nyomtatható vezetői riport;
- HTML — szerkesztéshez, archiváláshoz vagy böngészős megnyitáshoz;
- JSON — gépi feldolgozáshoz / későbbi integrációhoz.

## Megosztás

A Weekly Development Summary toolbar új `Megosztás` műveletet kap.

- támogatott böngészőben Web Share API fájlmegosztás;
- PDF fájl kerül megosztásra;
- ha a natív fájlmegosztás nem támogatott, PDF letöltés a fallback;
- felhasználói megszakítás (`AbortError`) nem jelenik meg hibaként.

## Riport tartalma

A PDF/HTML vezetői riport tartalmazza:

- DIMPROVER / BENJADMIN fejléc;
- hét és projekt azonosítás;
- V1.4 management headline;
- 0–100 flow-score;
- STABIL / FIGYELENDŐ / BEAVATKOZÁS állapot;
- rövid vezetői narratíva;
- lezárt / hiba / várakozás / worker / max átadás indikátor;
- Pozitívumok;
- Figyelmet igényel;
- Következő vezetői teendő;
- heti alapmutatók;
- előző heti trend;
- worker-terhelés;
- handoff / lead-time;
- fő elakadási okok;
- `DEV ONLY · PROD DENY` footer.

## Technikai architektúra

Új közös renderer:

- `app/lib/dev-center/weekly-report.ts`

Új védett endpoint:

- `GET /api/dev/console/weekly-report-export`

Query paraméterek:

- `projectId` opcionális;
- `week` opcionális;
- `format=pdf|html|json`.

A route:

- `isDevCenterAuthorized(..., true)` jogosultságot használ;
- ugyanazt a `getDeveloperConsoleWeeklySummary()` függvényt hívja;
- nem vezet be új táblát vagy migrációt;
- `private, no-store` cache szabályt használ;
- `nosniff` fejlécet ad;
- `x-dimpro-production-access: DENY` metaadatot ad;
- attachment `Content-Disposition` fejlécet ad UTF-8 fájlnévvel.

## PDF motor

A projektben már használt Puppeteer-alapú PDF mintát használja:

- headless Chromium;
- `--no-sandbox` / `--disable-setuid-sandbox` / `--disable-dev-shm-usage`;
- A4;
- print background;
- CSS `@page` alapú tördelés.

Nem készül új PDF infrastruktúra.

## UI

A heti összesítő toolbar új vezérlői:

- PDF;
- HTML;
- JSON;
- Megosztás.

Desktopon egy sorban, kisebb kijelzőn tördelve, mobilon 2×2 rácsban jelennek meg.

## Tesztek

Új statikus contract:

- `scripts/benjadmin-weekly-development-flow-v20-report-contract.mjs`
- jelenlegi eredmény: **23/23 PASS**.

Új runtime/browser acceptance:

- `scripts/benjadmin-weekly-development-flow-v20-report-runtime-browser-acceptance.mjs`

Ellenőrizendő release gate:

- auth nélküli 401;
- JSON export / reportVersion / PROD DENY;
- HTML export és A4 CSS;
- PDF MIME + `%PDF-` signature + minimális méret;
- attachment fejléc;
- hibás formátum 400;
- PDF/HTML/JSON/Megosztás UI;
- desktop overflow;
- mobil overflow.

## Release és validáció

### Source és canonical állapot

- termékfunkció source commit: **`cecb1032c3be42de6ef8c6b6a3c5dfe87a5899bc`** (`cecb103`);
- acceptance wait stabilizálás: `f3711be`;
- Weekly Summary toolbar selector stabilizálás: `4b809bb`;
- canonical operator / `integration/benjadmin-dev` a cutoverkor: **`4b809bb42cc91cb77abe85164c7577411696d6d7`**;
- a `f3711be` és `4b809bb` commitok kizárólag tesztkódot módosítanak, ezért a runtime artifact exact termék-source commitja `cecb103` marad.

### Build és release artifact

- exact candidate build: **2026-08-19 17:32:16–17:38:19 CEST**, exit 0;
- BUILD_ID: **`QocUwLUa2xAKw1PtnR7fd`**;
- standalone asset ellenőrzés: **PASS**;
- 248 statikus chunk ellenőrizve;
- aktív DEV release: **`.next-benjadmin-weekly-flow-v20-report-release-cecb103`**;
- artifact promotion hardlink-alapú, újrafordítás nélkül;
- előző rollback release: `.next-benjadmin-weekly-flow-v14-release-fe8b67d`.

### DEV cutover

- időablak: **2026-08-19 18:06:18–18:06:25 CEST**;
- központi koordinátor: `restart · ARMINAI`;
- exit code: **0**;
- PM2 process: `dimpro-benjadmin-operator-ui-v2-dev`;
- PM2 státusz: **online**;
- cutover utáni PID: `240126`;
- `NEXT_DIST_DIR`: `.next-benjadmin-weekly-flow-v20-report-release-cecb103`;
- cutover backup: `/srv/dimpro-dev/backups/benjadmin-weekly-flow-v20-report-cutover-20260819T180617+0200`;
- integration backup: `/srv/dimpro-dev/backups/benjadmin-weekly-flow-v20-report-integration-20260819T174708+0200`;
- artifact promotion backup: `/srv/dimpro-dev/backups/benjadmin-weekly-flow-v20-report-artifact-promotion-20260819T175428+0200`;
- dokumentációs closeout backup: `/srv/dimpro-dev/backups/benjadmin-weekly-flow-v20-report-doc-closeout-20260819T180939+0200`.

### Statikus kapuk

- `npx tsc --noEmit`: **PASS**;
- célzott ESLint: **PASS**;
- teljes `npm run lint`: **0 error / 103 meglévő warning**;
- `git diff --check`: **PASS**;
- V2.0 report contract: **23/23 PASS**;
- V1.4 contract regresszió: **34/34 PASS**;
- új DB migráció: **nincs**.

### Candidate runtime acceptance

Az exact `cecb103` candidate runtime-on:

- V2.0 report export: **21/21 PASS**;
- V1.4 Flow: **58/58 PASS**;
- Weekly Summary V1.1: **35/35 PASS**;
- Common Chat V2: **30/30 PASS**;
- Overnight Scheduler runtime: **30/30 PASS**;
- Overnight Scheduler browser: **14/14 PASS**.

A V2.0 report acceptance első futásakor a browser teszt túl korán vizsgálta a toolbar gombokat, ezért azok még az async weekly summary betöltése miatt disabled állapotban voltak. A termék exportjai ekkor is működtek. A teszt `waitForFunction` kaput kapott; változatlan candidate runtime-on az újrafutás **21/21 PASS** lett.

A Weekly Summary V1.1 régi acceptance tesztje a toolbar `last-child` elemét tekintette „Következő hét” gombnak. A V2.0 action group miatt ez a feltételezés megszűnt. A teszt explicit `title="Előző hét"` és `title="Következő hét"` selectorokra váltott; a termék navigáció változtatása nélkül az újrafutás **35/35 PASS** lett.

### Élő post-cutover acceptance

Az aktív 3100-as DEV runtime-on:

- V2.0 report export: **21/21 PASS**;
- JSON export: 200, `BENJADMIN_WEEKLY_REPORT_V2_0`, PROD DENY;
- HTML export: 200, A4 print CSS;
- PDF export: 200, valódi `%PDF-` signature, kb. **89 KB**;
- hibás `docx` formátum: 400;
- PDF / HTML / JSON / Megosztás UI: PASS;
- desktop overflow: PASS;
- mobil 2×2 action layout / overflow: PASS;
- V1.4 Flow regresszió: **58/58 PASS**;
- Weekly Summary V1.1: **35/35 PASS**;
- Common Chat V2: **30/30 PASS**;
- Overnight Scheduler runtime: **30/30 PASS**;
- Overnight Scheduler browser: **14/14 PASS**;
- `productionAccess`: **DENY**.

### Post-cutover smoke és operáció

- `/admin/dev-console`: **PASS**;
- `/terep`: **PASS**;
- `/api/field-capture/health`: **PASS**;
- `/api/dev/console/weekly-report-export?format=json`: **PASS**;
- PM2 error log utolsó módosítása: **2026-08-19 17:42:45 CEST**, tehát a 18:06-os V2.0 cutover után nem keletkezett új PM2 error-log bejegyzés.

A release során több OutminAI Commerce build is használta a központi műveleti lockot. A V2.0 fejlesztés és cutover minden esetben kivárta a lock szabályos felszabadulását; más worker buildje nem lett megszakítva.

## Biztonság

- DEV-only;
- PROD write/build/restart tiltott;
- export csak meglévő DEV-center jogosultsággal;
- nincs publikus share-link vagy anonim riport URL;
- a Web Share kliensoldali fájlmegosztás, nem szerveres publikálás;
- `productionAccess: DENY` változatlan.
