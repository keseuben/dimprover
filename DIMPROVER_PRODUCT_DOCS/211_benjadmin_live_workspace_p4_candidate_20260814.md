# 211 — BENJADMIN Live Workspace P4 · read-only candidate checkpoint

Dátum: 2026-08-14
Környezet: DEV feature worktree
Branch: `feat/benjadmin-live-workspace-p4`
Baseline: `8d29129`
Állapot: P4 READ-ONLY CANDIDATE KÉSZ · LIVE FEATURE FLAG MÉG OFF

## Cél

A BENJADMIN Fejlesztői Konzol `Live Workspace` első működő, kizárólag read-only rétege.

P4-ban nincs:
- fájlírás;
- watcher;
- Monaco;
- 1/2/4 panel;
- raw shell;
- PROD workspace.

## Biztonsági modell

Allowlist rootok:
- `/srv/dimpro-dev/worktrees`;
- `/srv/partner-dev/worktrees`.

A kliens workspace ID-val dolgozik, nem tetszőleges abszolút szerverútvonallal.

Minden relatív fájl/mappa útvonalnál kötelező:
1. relatív path ellenőrzés;
2. `..` tiltás;
3. abszolút path tiltás;
4. `realpath()`;
5. globális Terminal Hub allowlist policy;
6. kiválasztott worktree-n belüli külön boundary check.

Ez megakadályozza azt is, hogy egy kliens a kiválasztott worktree-ből egy másik, egyébként szintén allowlistelt worktree-be navigáljon.

## Deny policy

Automatikusan kizárt:
- `.env*` és meglévő sensitive path scanner által tiltott fájlok;
- `.git`;
- `.dimprover`;
- `.ssh`;
- `.cache`;
- `.turbo`;
- `node_modules`;
- `.next`;
- `dist`;
- `build`;
- `coverage`;
- backup/credential/secret könyvtárak.

Symlink worktree/root/tree entry fail-closed.

## Read-only Git

A P4 csak fix `git` binaryt használ `execFile`-lal, shell nélkül.

Beállítás:
- `GIT_OPTIONAL_LOCKS=0`;
- rövid timeout;
- korlátozott output buffer.

Megjelenített adatok:
- branch;
- commit;
- CLEAN/DIRTY/UNKNOWN;
- dirty count;
- kiválasztott fájl `git status --short` állapota.

## Fájlfa

- max. 500 elem / könyvtár;
- symlink rejtve;
- denied elemek nem jelennek meg;
- hidden count látható;
- csak normál fájl és könyvtár.

## Fájl-előnézet

P4 limit:
- max. 512 KiB;
- text/code extension allowlist;
- bináris NUL tiltás.

Támogatott fő formátumok:
- TS/TSX/JS/JSX/MJS/CJS;
- JSON;
- MD/TXT;
- CSS/SCSS;
- HTML/XML;
- YAML;
- SQL;
- SH/PS1;
- Python;
- TOML/INI.

Előnézeti meta:
- fájlnév;
- relatív útvonal;
- language;
- byte méret;
- sorszám;
- mtime;
- SHA-256;
- Git status;
- AI visibility.

A tartalom a meglévő secret scannerrel vizsgálódik:
- érzékeny találat esetén `AI: TILTVA`;
- egyébként `AI: SZŰRT`.

P4-ben a jogosult emberi előnézet read-only RAW fájltartalmat mutathat; AI adatút külön sanitization gate-en megy majd.

## API

Kizárólag admin-only GET:
- `GET /api/dev/terminal-hub/live-workspace`;
- `GET /api/dev/terminal-hub/live-workspace/tree`;
- `GET /api/dev/terminal-hub/live-workspace/file`.

Nincs POST/PUT/PATCH/DELETE.

## UI

Új komponens:
`LiveWorkspaceReadOnly.tsx`

Háromoszlopos nézet:
1. allowlistelt worktree-k;
2. biztonságos fájlfa;
3. read-only text preview.

Fejléc:
- `LIVE WORKSPACE · READ ONLY`;
- `WATCHER OFF`;
- `WRITE OFF`.

Monaco és Diff/History későbbi P6 réteg.

## Contract / build

- P4 source/security contract: **24/24 PASS**;
- TypeScript: PASS;
- célzott ESLint: PASS;
- teljes lint: 0 error / 104 meglévő warning;
- central-lockos Next build: PASS;
- candidate build ID: `08z7oKSMOtET_W92tsPfp`;
- `git diff --check`: PASS.

## Synthetic-key candidate acceptance

A candidate runtime 3199-es localhost porton, külön szintetikus `DIMPRO_LICENSE_ADMIN_KEY` értékkel futott. A valós BENJADMIN admin secretet nem olvastuk.

Eredmények:
- `/admin/dev-console`: 200;
- Live Workspace API auth nélkül: 401;
- Live Workspace API synthetic adminnal: 200;
- allowlistelt worktree-k: 24;
- P4 worktree felismerve;
- root tree: 200;
- root tree elemek: 25;
- hidden count: 3;
- `.git/.dimprover/node_modules/.next` nem jelent meg;
- `../benjadmin-operator-ui-v2`: 403 `LIVE_WORKSPACE_PATH_ESCAPE`;
- `.git/config`: 403;
- `.env.local`: 403;
- `package.json`: 200, JSON preview + SHA/Git/meta PASS.

A mesterséges symlink-fixture létrehozását az MCP security policy blokkolta, ezért ezt nem kerültük meg. A symlink fail-closed viselkedést a 24 pontos source contract ellenőrzi, dinamikus fixture-teszt későbbi security harnessben ismételhető.

Candidate runtime utána leállítva.

## Következő lépés

1. feature commit;
2. operator/integration fast-forward ellenőrzés;
3. DEV `BENJADMIN_LIVE_WORKSPACE_ENABLED=1`;
4. P2 + P3 + P4 regresszió;
5. operator build/restart;
6. HTTPS/API smoke;
7. manuális vizuális acceptance.

PROD nem módosult.
