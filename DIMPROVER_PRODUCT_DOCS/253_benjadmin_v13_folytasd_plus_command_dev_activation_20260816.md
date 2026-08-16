# BENJADMIN V1.3 – `Folytasd.` Plus-only parancs DEV aktiválás

Dátum: 2026-08-16
Állapot: DEV ACTIVE / PASS
PROD: változatlanul `READ_ONLY`.

## Cél

A ChatGPT Plus-only fejlesztési workflow-ban a kódoló ChatGPT számára ne legyen szükséges a hosszabb „Vedd fel a következő BENJADMIN feladatot…” szöveg. A rövid:

`Folytasd.`

parancs ugyanazt a Worker Inbox task-pull folyamatot indíthassa.

## Működés

A `scripts/benjadmin-plus-bridge-cli.mjs` task-pull aliasai:

- `pull`
- `next`
- `claim`
- `continue`
- `folytasd`
- `folytatas`
- `kovetkezo`

Minden alias ugyanazt a meglévő, hitelesített Plus Bridge végpontot használja:

`POST /api/dev/console/plus-bridge/[workerCode]/next`

Nem került be új AI API, provider vagy natív executor.

A ChatGPT Parancstár Plus-only sablonja most már csak:

`Folytasd.`

## Release

Aktív pointer: `.next-benjadmin-v13-continue-final`

Build: `MSJiGAOnJKK0FH7Gr7CXj`

Release source:
- branch: `feature/armin-benjadmin-v13-continue-20260816`
- commit: `1fc8186ad4dc503df9e6eff6ad307053786b9443`

Trusted baseline:
- `refs/heads/integration/benjadmin-dev`
- `1fc8186ad4dc503df9e6eff6ad307053786b9443`

Rollback release: `.next-benjadmin-v13-datetime-final`

Cutover artifact: `/srv/dimpro-dev/artifacts/benjadmin-v13-continue-cutover-20260816_065513`

## Acceptance

- V1.3 `Folytasd` contract: `10/10 PASS`
- V1.2 Plus-only contract: `47/47 PASS`
- V1.2 runtime E2E: `29/29 PASS`
- V1.2 browser: `11/11 PASS`
- teljes BENJADMIN browser/responsive/PWA: `40/40 PASS`
- TypeScript: PASS
- lint: `0 error / 103 meglévő warning`
- build: PASS
- statikus chunk: `245 PASS`
- trusted baseline readiness: `7/7 PASS`
- PM2: online
- unstable restart: 0

## Következő V1.3 irány

- task pull/claim élő vizuális visszajelzés a Konzolban;
- automatikus következő-task láncolás;
- Ben-AI várólista újraosztás hardening;
- élő ETA pontosítás;
- mobil/PWA push UX.
