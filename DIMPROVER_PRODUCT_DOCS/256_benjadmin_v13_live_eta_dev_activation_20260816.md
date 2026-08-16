# BENJADMIN V1.3 – élő ETA DEV aktiválás

Dátum: 2026-08-16
Állapot: DEV ACTIVE / PASS
PROD: `READ_ONLY`, nem érintett.

## Cél

A középső BENJADMIN munkafelületen a taskok ETA-ja ne csak várható befejezési időpontot mutasson, hanem élő állapotot is:

- teljes dátum + idő;
- hátralévő idő;
- Ben-AI becslési tartomány;
- 15 percen belüli figyelmeztetés;
- lejárt ETA / késés jelzés.

## UI

Példák:

- `ETA 2026. 08. 16. 10:00 · még 1 ó 30 p · becslés 35 p–1 ó 5 p`
- `ETA 2026. 08. 16. 08:40 · még 10 p · becslés 35 p–1 ó 5 p`
- `ETA 2026. 08. 16. 08:25 · késés 5 p · becslés 35 p–1 ó 5 p`

Állapotok:

- `on-track`
- `due-soon`
- `overdue`
- `unknown`

A Konzol `now` értéke másodpercenként frissül, ezért a hátralévő idő kliensoldalon élőben számolódik külön polling nélkül.

## Responsive

Az ETA sor a meglévő wrapping facts sorban jelenik meg, az egyes ETA badge-ek `nowrap` megjelenítésűek. Desktop és mobil nézetben nincs vízszintes overflow.

## Release

Aktív pointer: `.next-benjadmin-v13-live-eta-final`

Build: `iupEjxIIqIwyiaNuqSddW`

Release source:
- branch: `feature/armin-benjadmin-v13-live-eta-20260816`
- commit: `754be926dd36d4a5bde5f763e68c98926f0b8835`

Trusted baseline:
- `refs/heads/integration/benjadmin-dev`
- `754be926dd36d4a5bde5f763e68c98926f0b8835`

Rollback release: `.next-ben-v13-drive-v110-final`

Cutover artifact: `/srv/dimpro-dev/artifacts/benjadmin-v13-live-eta-cutover-r2-20260816_082937`

Az első cutover-kísérletet a release identity guard megállította, mert a PM2 processzben a korábbi Drive V1.1 `NEXT_DIST_DIR` környezeti változó maradt aktív. A rendszer automatikusan rollbackelt. A második cutover explicit `NEXT_DIST_DIR` frissítéssel sikeresen lezárult.

## Acceptance

- live ETA contract: `15/15 PASS`
- live ETA browser: `9/9 PASS`
- next-chain runtime: `12/12 PASS`
- next-chain browser: `9/9 PASS`
- pull-feedback runtime: `16/16 PASS`
- V1.2 runtime: `29/29 PASS`
- teljes BENJADMIN browser/responsive/PWA: `40/40 PASS`
- TypeScript: PASS
- lint: `0 error / 103 meglévő warning`
- build: PASS
- statikus chunk: `245 PASS`
- trusted baseline readiness: `7/7 PASS`
- PM2: online
- unstable restart: 0
- PROD: `READ_ONLY`
