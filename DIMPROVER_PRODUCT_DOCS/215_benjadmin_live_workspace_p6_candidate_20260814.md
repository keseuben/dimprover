# 215 — BENJADMIN Live Workspace P6 · Monaco Live / Diff / History candidate

Dátum: 2026-08-14
Branch: `feat/benjadmin-live-workspace-p6`
Baseline: `bccc43c`
Állapot: CANDIDATE KÉSZ, live P6 flag még OFF.

## Funkció
- LIVE: aktuális worktree fájl.
- DIFF: HEAD ↔ worktree.
- HISTORY: fájlszintű Git history és kiválasztott commit.
- Minden read-only; nincs fájlírás, watcher, raw shell, terminal execution, P7 multi-panel vagy PROD workspace.

## Biztonsági és technikai kialakítás
- új flag: `BENJADMIN_WORKSPACE_MONACO_ENABLED`;
- admin-only GET Git-context API;
- P4-validált worktree/path;
- fix read-only Git műveletek: rev-parse, status, log, cat-file, show;
- max. 25 history, 512 KiB limit, bináris tiltás, secret scan;
- commit csak teljes SHA és csak a fájl history allowlistjéből;
- `monaco-editor 0.56.0`, `@monaco-editor/react 4.7.0`;
- teljes Monaco root/LSP import tiltva;
- helyi `editor.api` core + célzott syntax nyelvek;
- külön helyi editor worker és JSON worker;
- CDN nincs;
- DOMPurify override: `3.4.13`, Monaco/DOMPurify audit CLEAN.

## Javított regressziók
- P4/P5 workspace selection race javítva stabil `workspaceIdRef` használatával;
- háttérfrissítés nem nullázza a megnyitott fájlt;
- DIFF → HISTORY TextModel disposal race javítva `keepCurrentOriginalModel` / `keepCurrentModifiedModel` használatával;
- P6 `inmemory://dimpro/...` modellek komponens-záráskor cleanupot kapnak.

## Acceptance
- P6 contract: **44/44 PASS**;
- teljes P2–P6 contract: **205/205 PASS**;
- TypeScript: PASS;
- célzott lint: PASS;
- teljes lint: **0 error / 104 meglévő warning**;
- final candidate build: PASS;
- build ID: `wcExpvO1sLsRjkzxahXeX`.

## Headless browser
- `/admin/dev-console`: PASS;
- Terminal Hub → Live Workspace: PASS;
- `package.json` stabil 4,5 s után: PASS;
- LIVE Monaco: PASS;
- DIFF Monaco: PASS;
- HISTORY Monaco: PASS;
- Light / Sunlight / Dark: PASS;
- browser console errors: **0**;
- page errors: **0**;
- failed requests: **0**;
- external/CDN requests: **0**;
- 2 helyi Turbopack Monaco worker.

## Következő gate
Feature commit → operator/integration baseline ellenőrzés → backup → fast-forward → DEV P6 flag ON → operator 205/205 + tsc + lint + build → csak BENJADMIN DEV restart → live smoke + browser acceptance.

PROD nem módosult.
