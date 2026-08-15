# 231 — BENJADMIN DEV runtime identity guard · aktiválási checkpoint

Dátum: 2026-08-15
Állapot: runtime identity guard és standalone `.dimprover` self-heal integrálva és élő DEV-en igazolva.

## Git / runtime
- funkcionális commit: `8101798`;
- aktív Next build: `OUKeDkvfIFbA152AN2VWQ`;
- PM2 processz: `dimpro-benjadmin-operator-ui-v2-dev`;
- cwd: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`;
- port: 3100;
- host: 127.0.0.1;
- PROD nem módosult.

## Runtime repair előzmény
A P9 első aktiválási próbájánál a BENJADMIN PM2 név hibásan a Drive worktree-re mutatott. A hibás PM2 bejegyzés külön audit-backup után törölve, majd explicit operator cwd-val újra létrehozva.

Backup:
`/srv/dimpro-dev/backups/benjadmin-pm2-cwd-repair-20260815T075958`

A Drive saját candidate processze a helyreállításkor nem lett módosítva.

## Guard
`scripts/benjadmin-dev-runtime-identity-check.mjs`

Ellenőrzi:
- pontosan egy BENJADMIN DEV PM2 processz;
- online állapot;
- fix operator cwd;
- 3100 / 127.0.0.1;
- npm start argumentum;
- BUILD_ID;
- standalone asset marker;
- helyi konzol HTTP 200;
- P9 Secret Vault auth-gate HTTP 401.

Read-only, automatikus processzjavítást nem végez.

## Standalone self-heal
`ensure-next-standalone-assets.cjs` most felismeri a Next trace által létrehozott fizikai `.next/standalone/.dimprover` build-másolatot és kizárólag biztonságos könyvtár-esetben eltávolítja. A `start-next-standalone.cjs` az asset-szinkron után hozza létre a központi `.dimprover` symlinket.

Hibás symlink vagy nem-könyvtár objektum esetén fail-closed.

## Acceptance
- identity guard contract: **20/20 PASS**;
- live identity guard: PASS;
- mesterséges rossz cwd: exit 2 / `BENJADMIN_PM2_CWD_MISMATCH`;
- standalone fake traced `.dimprover` self-heal fixture: PASS;
- Node syntax: PASS;
- full lint: **0 error / 104 meglévő warning**;
- integráció utáni 3198 standalone candidate: console 200 / Vault auth 401;
- koordinált main DEV restart: PASS;
- post-restart identity guard: PASS;
- publikus console: 200;
- publikus Vault auth-gate: 401;
- 10 s error-log stabilitás: változatlan.

## Új release szabály
Minden BENJADMIN DEV build/restart/deploy után kötelező:
`node scripts/benjadmin-dev-runtime-identity-check.mjs`

HTTP 200 önmagában többé nem elegendő release acceptance; a runtime identity guardnak is PASS állapotot kell adnia.
