# BENJADMIN V1.3 – dátum + idő megjelenítés DEV aktiválás

Dátum: 2026-08-16
Állapot: DEV ACTIVE / PASS
Környezet: `dimpro-dev`
PROD: változatlanul `READ_ONLY`, PROD módosítás nem történt.

## 1. Cél

A BENJADMIN Fejlesztői Konzol középső munkafelületén a dolgozók feladataihoz, kiosztásaihoz és eseményeihez tartozó időbélyeg ne csak órát mutasson, hanem teljes dátumot és időt is.

## 2. Megjelenítési szabály

Középső esemény-/kiosztási kártyák:

`YYYY. MM. DD. HH:mm:ss`

Példa:

`2026. 08. 16. 06:26:58`

Feladat ETA:

`YYYY. MM. DD. HH:mm`

A fejléc élő órája továbbra is külön másodperc-pontos óra marad; azt ez a módosítás nem érinti.

## 3. Érintett komponensek

- `components/admin/developer-console/DeveloperMessage.tsx`
  - feladatkiosztás, feladatállapot, build, teszt, üzenet és más központi worklog események teljes dátum + idő megjelenítése;
- `components/admin/developer-console/LiveWorkPanel.tsx`
  - ETA dátum + idő megjelenítése;
- `components/admin/developer-console/DeveloperConsole.module.css`
  - időbélyeg `nowrap`, hogy a hosszabb dátum ne törjön szét.

Új acceptance:

- `scripts/benjadmin-v13-datetime-contract.mjs`
- `scripts/benjadmin-v13-datetime-browser-acceptance.mjs`

## 4. Release

Aktív pointer:

`.next-benjadmin-v13-datetime-final`

Aktív build:

`UpQpSOr7iVQFXY02dHCyY`

Release source:

- branch: `feature/armin-benjadmin-v13-datetime-20260816`
- commit: `babe576005545ecac58253dddd6b4ef7696104b9`

Trusted baseline:

- ref: `refs/heads/integration/benjadmin-dev`
- commit: `babe576005545ecac58253dddd6b4ef7696104b9`

Rollback release:

`.next-benjadmin-v12-field-v250-unified`

Cutover artifact:

`/srv/dimpro-dev/artifacts/benjadmin-v13-datetime-cutover-20260816_062639`

## 5. Acceptance eredmények

Forrásoldali:

- dátum/idő contract: `8/8 PASS`
- TypeScript: PASS
- lint: `0 error / 103 meglévő warning`
- build: PASS
- statikus chunk: `245 PASS`

Exact operator artifact / izolált runtime:

- dátum/idő browser: `6/6 PASS`
- Plus-only V1.2 runtime: `29/29 PASS`
- teljes BENJADMIN browser/responsive/PWA: `40/40 PASS`

Aktív 3100-as post-cutover:

- dátum/idő browser: `6/6 PASS`
- Plus-only V1.2 runtime: `29/29 PASS`
- teljes BENJADMIN browser/responsive/PWA: `40/40 PASS`
- trusted baseline readiness: `7/7 PASS`
- PM2: online
- unstable restart: 0

## 6. Párhuzamos Drive V1.1 fejlesztés

A dátum/idő release artifact nem tartalmazza automatikusan a még külön fejlesztési/acceptance ciklusban lévő Drive V1.1 runtime-kódot.

Az operator forráságon a dátum/idő változás azonos tartalommal szerepel `b1b463c` commitként, és Jázmin erre építette rá a Drive V1.1 fejlesztési commitokat. A jelenlegi aktív runtime viszont a tiszta BENJADMIN V1.3 dátum/idő release artifact.

## 7. Következő BENJADMIN irány

A V1.3 következő blokkja továbbra is a Plus-only napi használat súrlódásának csökkentése:

- rövid `folytasd` / következő feladat parancs;
- task pull/claim élő visszajelzés;
- Ben-AI várólista automatikus újraosztás hardening;
- élő ETA pontosítás;
- mobil/PWA push UX;
- későbbi M.Forge-AI és V.Guard-AI provider adapter kompatibilitás megtartása.
