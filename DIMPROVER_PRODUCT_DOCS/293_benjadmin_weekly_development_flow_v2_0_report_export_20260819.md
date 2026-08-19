# 293 — BENJADMIN Weekly Development Flow V2.0 · vezetői heti riport export

**Dátum:** 2026-08-19
**Környezet:** kizárólag DEV
**Állapot:** source gate zöld · runtime release gate előtt · PROD DENY

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

## Függő kapuk

- `npx tsc --noEmit`: **PASS**;
- célzott ESLint: **PASS**;
- V2.0 report contract: **23/23 PASS**;
- V1.4 contract regresszió: **34/34 PASS**;
- feature commit;
- exact candidate build;
- V2.0 runtime/browser acceptance;
- V1.4 és kapcsolódó regresszió;
- canonical integráció;
- teljes lint;
- release artifact;
- DEV cutover + post-cutover smoke;
- dokumentációs closeout.

## Biztonság

- DEV-only;
- PROD write/build/restart tiltott;
- export csak meglévő DEV-center jogosultsággal;
- nincs publikus share-link vagy anonim riport URL;
- a Web Share kliensoldali fájlmegosztás, nem szerveres publikálás;
- `productionAccess: DENY` változatlan.
