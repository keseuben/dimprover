# 229 — BENJADMIN Terminal Hub P9 security · DEV aktiválási checkpoint

Dátum: 2026-08-15
Állapot: P9 security foundation DEV-en aktív. Secret Vault storage, Terminal Execution, Windows Bridge Execution és PROD Terminal továbbra is OFF.

## Git / build
- funkcionális commit: `ec5f46f`;
- aktív DEV build: `OUKeDkvfIFbA152AN2VWQ`;
- PM2: `dimpro-benjadmin-operator-ui-v2-dev` ONLINE;
- helyes runtime cwd: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`;
- PROD nem módosult.

## P9 tartalom
- session AI visibility: FILTERED / BLOCKED;
- BLOCKED sanitized/AI út: HTTP 403;
- Private Input külön password mezővel és meta-only audittal;
- normál xterm stdin privát módban tiltva;
- redaction finding audit session+sequence deduplikációval;
- audit summary/metadata újraszűrés;
- közös secret-scanner hardening: connection string, GitHub, OpenAI-style, AWS, JWT;
- Secret Vault skeleton: reference-only AI policy, storage=false, raw AI=false, browser storage=false, GET/PUT API nincs.

## Acceptance
- P9 security contract: **55/55 PASS**;
- teljes P2–P9 regresszió: **475/475 PASS**;
- TypeScript: PASS;
- teljes lint: **0 error / 104 meglévő warning**;
- candidate build: `tpgNyQNieJrLZCq3PEv0X` PASS;
- operator build: `OUKeDkvfIFbA152AN2VWQ` PASS;
- candidate browser: P9 Vault/AI visibility/Private Input controls PASS;
- candidate browser console/page/network/external errors: **0/0/0/0**.

## Live runtime incidens és javítás
A P9 első restartja után az új API-k 404-et adtak, miközben a friss build manifest tartalmazta őket.

Gyökérok:
`dimpro-benjadmin-operator-ui-v2-dev` PM2 processz neve tévesen a Drive integrációs worktree cwd-jére mutatott:
`/srv/dimpro-dev/worktrees/integration-drive-compare-rc1`.

Ez cross-worktree runtime ownership hiba volt, nem P9 route/build hiba.

Javítás:
1. a friss BENJADMIN standalone artifact `ensure-next-standalone-assets.cjs --force` szinkronnal ellenőrizve;
2. külön 3198-as standalone candidate-en a konzol 200, P9 API-k 401 PASS;
3. hibás PM2 állapot mentve: `/srv/dimpro-dev/backups/benjadmin-pm2-cwd-repair-20260815T075958`;
4. hibás PM2 bejegyzés koordináltan törölve;
5. ugyanazzal a BENJADMIN processznévvel explicit `--cwd /srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2` értékkel újra létrehozva;
6. Drive saját `drive-real-e2e-active-candidate` processze nem lett módosítva.

## Live smoke a javítás után
- PM2 status: online;
- PM2 cwd: helyes operator worktree;
- `/admin/dev-console`: HTTP 200;
- Secret Vault readiness auth nélkül: HTTP 401;
- AI visibility auth nélkül: HTTP 401;
- aktív build: `OUKeDkvfIFbA152AN2VWQ`;
- 12 s error-log stabilitás: változatlan;
- PM2 restart count a javított új processzen: 0.

## Live security flagek
OFF marad:
- `BENJADMIN_SECRET_VAULT_ENABLED`;
- `BENJADMIN_TERMINAL_EXECUTION_ENABLED`;
- `BENJADMIN_WINDOWS_BRIDGE_ENABLED`;
- `BENJADMIN_WINDOWS_BRIDGE_PAIRING_ENABLED`;
- `BENJADMIN_WINDOWS_BRIDGE_EXECUTION_ENABLED`;
- `BENJADMIN_PROD_TERMINAL_ENABLED`.

A P8.1 pairing HMAC secret provisionálva van, de Bridge/Pairing OFF miatt live pairing nem indulhat.

## Következő kötelező hardening
A cross-worktree PM2 incidens miatt külön runtime identity guard szükséges:
- processznév → elvárt cwd ellenőrzés;
- port/host ellenőrzés;
- build ID / standalone release ellenőrzés;
- explicit fail, ha a BENJADMIN processz másik worktree-re mutat;
- a standalone `.dimprover` build-copy önjavító kezelése.
