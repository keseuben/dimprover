# 213 — BENJADMIN Live Workspace P5 · Worker Activity + file/Git események candidate

Dátum: 2026-08-14
Környezet: DEV feature worktree
Branch: `feat/benjadmin-live-workspace-p5`
Baseline: `4f9b227`
Állapot: P5 CANDIDATE KÉSZ · LIVE P5 FLAG MÉG OFF

## Normatív helye

A Terminal Hub / Live Workspace elfogadott sorrend szerint:
- P4: read-only allowlistelt fájlfa — aktív;
- **P5: worker activity és file/Git események — jelen candidate**;
- P6: Monaco Live / Diff / History — még nem indult;
- P7: 1/2/4 panel — OFF.

## P5 cél

A Live Workspace tegye láthatóvá, hogy:
- mely BENJADMIN worker milyen állapotban van;
- mely session/task/branch/worktree kapcsolódik hozzá;
- mikor volt az utolsó heartbeat;
- mely worktree-n dolgozik;
- milyen biztonságosan megjeleníthető fájl/Git változások és audit események történtek.

P5 továbbra is **read-only monitoring**.

Nincs:
- fájlírás;
- watcher/chokidar;
- shell command input;
- Monaco;
- Diff editor;
- 1/2/4 panel;
- PROD workspace.

## Külön feature gate

Új implementation kill switch:
`BENJADMIN_WORKSPACE_ACTIVITY_ENABLED`

A flag csak akkor lehet effektív, ha:
- `BENJADMIN_TERMINAL_HUB_ENABLED=1`;
- `BENJADMIN_LIVE_WORKSPACE_ENABLED=1`.

A P4 fájlfa ettől függetlenül működhet, ha P5 OFF.

## Source of truth

P5 nem hoz létre párhuzamos worker/activity adatmotort.

A meglévő BENJADMIN Control Plane read modelből olvas:
- `dev_center_workers`;
- `dev_center_tasks`;
- `dev_center_worker_sessions`;
- `dev_center_audit_events`.

Új read projection:
`getDeveloperConsoleWorkspaceActivitySource()`

Csak szűk mezők kerülnek lekérésre. `metadata`, raw token, secret vagy credential mező nincs a P5 worker projectionban.

## Worker Activity

Worker freshness:
- `LIVE`: heartbeat legfeljebb 60 másodperces;
- `STALE`: heartbeat legfeljebb 5 perces;
- `IDLE`: régebbi vagy hiányzó heartbeat;
- `OFFLINE`: worker státusz offline.

Megjelenített kontextus:
- worker neve/kódja;
- worker státusz;
- session státusz;
- handshake stage;
- task cím és státusz;
- branch;
- worktree rövid neve;
- utolsó heartbeat időpontja;
- jelzés, ha az adott worker a kijelölt worktree-n dolgozik.

## File/Git activity

Szerveroldali, fix read-only Git hívások:
- `git status --porcelain=v1 -z --untracked-files=normal`;
- `git log -n 12 ...`.

Biztonság:
- `execFile("git", ...)`;
- nincs `shell: true`;
- `GIT_OPTIONAL_LOCKS=0`;
- 4 másodperces timeout;
- limitált buffer;
- nincs add/commit/checkout/switch/reset/clean/push/pull/merge/rebase.

Git fájlútvonal minden esetben átmegy a P4 közös deny policy-n.

Tiltott többek között:
- `.env*`;
- `.git`;
- `.dimprover`;
- `node_modules`;
- `.next`;
- secret/credential/private-key;
- build/dist/cache/coverage.

## Audit sanitization

Audit összefoglaló és Git commit subject a meglévő Terminal Hub `sanitizeTerminalText()` adatpolicy-n megy át.

A P5 nem küld raw audit metadata objektumot a kliensnek.

## API

Új admin-only, GET-only endpoint:
`GET /api/dev/terminal-hub/live-workspace/activity?workspaceId=<id>`

Input:
- csak `workspaceId`.

Nincs:
- path input;
- command/script/shell input;
- POST/PUT/PATCH/DELETE.

## UI

A P4 Live Workspace kiegészült:

### Worker Activity sáv
- `WORKER ACTIVITY · P5`;
- LIVE workers;
- kijelölt worktree-n dolgozó workers;
- fájlállapot count;
- worker kártyák freshness/session/task/worktree/heartbeat adatokkal.

### Fejlesztési események
Egy read-only feed egyesíti:
- `AUDIT`;
- `COMMIT`;
- `FILE_STATE` eseményeket.

A legutóbbi 24 esemény látható.

### Frissítés
- frontend polling: 4 másodperc;
- watcher: OFF;
- write: OFF.

## Contract acceptance

P5 source/security contract:
**29/29 PASS**.

P4 regresszió:
**24/24 PASS**.

Teljes P2–P5 contract:
**161/161 PASS**.

További gate:
- TypeScript: PASS;
- célzott ESLint: PASS;
- teljes lint: `0 error / 104 meglévő warning`;
- `git diff --check`: PASS;
- central-lockos candidate build: PASS;
- candidate build ID: `aXVBkByKPPzWmRA0DAjF5`.

Az `npm ci` a meglévő lockfile alapján 15 audit findingot jelzett (1 low, 14 high). P5 nem módosított dependency-t vagy package lockot; ez külön dependency/security audit tárgya, nem P5 regresszió.

## Synthetic admin-key candidate runtime acceptance

Candidate port: 3199.
A valódi BENJADMIN admin secretet nem olvastuk; külön synthetic `DIMPRO_LICENSE_ADMIN_KEY` került a candidate process environmentbe.

Eredmény:
- console: HTTP 200;
- activity API auth nélkül: HTTP 401;
- workspace lista synthetic adminnal: HTTP 200;
- allowlistelt worktree: 25;
- P5 saját worktree: DIRTY, 11 eltérés;
- activity API synthetic adminnal: HTTP 200;
- `watcherEnabled=false`;
- `writeEnabled=false`;
- `refreshIntervalMs=4000`;
- workers: 5;
- a teszt pillanatában LIVE worker: 0;
- kijelölt P5 worktree-hez kötött worker: 0;
- események: 23;
- FILE_STATE: 11;
- recent COMMIT: 12;
- event path deny policy: PASS;
- második 4 másodperces lekérés: HTTP 200, időbélyeg előrehaladt.

A 0 LIVE worker nem hiba: a candidate pillanatában a Control Plane worker heartbeat-ek IDLE állapotúak voltak, és egyik aktív session/task sem a P5 fejlesztési worktree-re mutatott.

Candidate runtime utána leállítva.

## Következő gate

1. feature commit;
2. operator/integration baseline ellenőrzés;
3. runtime backup;
4. fast-forward;
5. DEV-en `BENJADMIN_WORKSPACE_ACTIVITY_ENABLED=1`;
6. teljes P2–P5 regresszió + TypeScript + lint + build;
7. kizárólag BENJADMIN DEV restart;
8. HTTPS/API/PM2/flag smoke;
9. aktiválási checkpoint.

PROD nem módosult.
