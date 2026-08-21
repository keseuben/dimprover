# DIMPRO Terepi Gyorsrögzítő – F7 mobil/PWA E2E + F8 DEV release closeout

**Dátum:** 2026-08-21
**Környezet:** DEV
**Állapot:** LEZÁRVA – VALIDÁLT
**PROD:** DENY / változatlan

## 1. Fejlesztési sorrend lezárása

A `287_terepi_mentes_megosztas_f1_f2_dev_20260819.md` dokumentumban rögzített F3–F8 sorrend teljesült:

- F3 – Saját DIMPRO Drive UI: lezárva;
- F4 – Terepi összesítő / PDF riport: lezárva;
- F5 – kézi e-mail küldési UI: lezárva;
- F6 – közös Drop e-mail/report engine + idempotens delivery/retry: lezárva;
- F7 – teljes mobil/PWA E2E: lezárva;
- F8 – shared DEV release: lezárva.

A Projektkapu Drive továbbra is külön P9 fejlesztési blokk és kikapcsolva marad.

## 2. F7 – teljes mobil/PWA E2E

Az exact shared candidate source:
`a7f7c8a584d700ba1daea338e18bf10b3a635093`

Izolált candidate acceptance a 3158-as porton:

- F6 e-mail/idempotencia browser: `22/22 PASS`;
- F5 kompatibilitási browser: `17/17 PASS`;
- F4 riport browser: `16/16 PASS`;
- P8 Saját Drive UI browser: `13/13 PASS`;
- Terep teljes mobil browser acceptance: `28/28 PASS`;
- client-sync browser E2E: PASS;
- pageerror: `0`;
- console error: `0`;
- client-sync cleanup: `capture=0`, `package=0`.

Live DEV acceptance a `https://drop.dev.dimpro.hu` felületen:

- F6 e-mail/idempotencia browser: `22/22 PASS`;
- F4 riport browser: `16/16 PASS`;
- P8 Saját Drive UI browser: `13/13 PASS`;
- Terep teljes mobil browser acceptance: `28/28 PASS`;
- client-sync browser E2E: PASS;
- pageerror: `0`;
- console error: `0`;
- client-sync cleanup: `capture=0`, `package=0`.

A Terep UI mobil szélességen nem lóg ki, IndexedDB reload megőrzi a releváns terepi állapotokat, a Saját DIMPRO Drive opt-in működik, a Projectkapu Drive P9 tiltva marad.

## 3. F8 – shared DEV release

Aktív runtime source:
`a7f7c8a584d700ba1daea338e18bf10b3a635093`

Terep F6 source:
`6ee4c8f48dd08a82be443630b81268297ac9eb0b`

Commerce P4 source:
`e86e609762f9a01fdc5d62825eef88bd1458cdb7`

Build ID:
`mmO9zrxVG5Hw4xA6jjf-V`

Aktív artifact:
`.next-terep-f6-commerce-p4-shared-a7f7c8a`

Shared cutover backup:
`/srv/dimpro-dev/backups/terep-f6-commerce-p4-shared/20260821T185622+0200`

F6 adatbázis backup:
`/srv/dimpro-dev/backups/field-capture-report-email-f6-v010/20260821T155246Z`

A shared cutover koordinált release lock alatt 2026-08-21 18:56-kor sikeresen megtörtént. A Commerce P4 live lifecycle acceptance külön PASS lett. Az operator és integration refek az aktív runtime release után összehangolásra kerültek.

## 4. Aktív health

A live DEV Terep health:

- verzió: `0.4.4-dev`;
- phase: `P0-P8`;
- server capture schema: ready;
- Saját DIMPRO Drive: ready;
- Projectkapu Drive: `false` / P9 OFF;
- staging: ready;
- raw capability persistence: false.

## 5. Következő határ

Az F3–F8 fejlesztési sor lezárult. A következő Terep fejlesztési kör már új scope legyen; a Projectkapu Drive P9 aktiválása ne történjen automatikusan az F8 lezárásából következően.

**F7 + F8 LEZÁRVA DEV-EN. PROD DENY.**
