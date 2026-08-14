# 217 — BENJADMIN Live Workspace P7 · 1/2/4 panel + detached candidate

Dátum: 2026-08-14
Branch: `feat/benjadmin-live-workspace-p7`
Baseline: `ba9d856`
Állapot: CANDIDATE KÉSZ · live P7 flag még OFF.

## Funkció
- 1 / 2 / 4 független read-only Monaco panel;
- panelenként saját worktree, fájl és LIVE / DIFF / HISTORY mód;
- a közös P4 navigator mindig az aktív panelbe nyit;
- ugyanaz a fájl másik panelre is kiosztható;
- P6 Monaco panelenként külön model-authorityt használ;
- 4 paneles nézet 2×2 desktop elrendezés;
- leválasztható Live Workspace ablak második monitorhoz;
- `Visszadokkolás` bezárja a detached ablakot, a panelállapot megmarad.

## Állapot és többablakos szinkron
- localStorage kulcs: `benjadmin-live-workspace-p7-state`;
- BroadcastChannel: `benjadmin-live-workspace-p7-sync`;
- storage-event fallback;
- csak azonosítók/UI metaadatok perzisztáltak;
- forráskód/fájltartalom NEM kerül localStorage-ba;
- detached ablak a fájlt újra a P4 read-only file API-ról tölti be;
- a téma ugyanazt a `benjadmin-developer-console-theme` állapotot követi.

## Security
- P7 csak Live Workspace + Monaco + `BENJADMIN_MULTI_PANEL_ENABLED=1` mellett effektív;
- P4 path/deny/symlink policy változatlanul kötelező;
- P6 Git/Monaco read-only policy változatlan;
- nincs új mutation API;
- nincs fájlírás;
- nincs raw shell/PTY;
- nincs Windows Bridge;
- nincs PROD terminal;
- a detached route ugyanazon `AdminThemeShell` auth alatt fut.

## Regressziós contract
- P2 foundation 12/12;
- P2 session 15/15;
- P2 XTerm 16/16;
- P2 output security 11/11;
- P2 managed command 10/10;
- P3 schema 19/19;
- P3 API/UI 19/19;
- source DB preflight 6/6;
- P4 24/24;
- P5 29/29;
- P6 44/44;
- P7 43/43;
- összesen **248/248 PASS**.

TypeScript: PASS.
Célzott lint: PASS.
Teljes lint: **0 error / 104 meglévő warning**.
Candidate build: **VGXCFMEThZdYA56CGxY70** · PASS.

## Headless browser acceptance
- 1 panel + package.json Monaco: PASS;
- 2 panel + package.json / README.md külön panelek: PASS;
- panel 1 DIFF, panel 2 LIVE állapot: PASS;
- 4 panel 2×2 és első két panel megmarad: PASS;
- localStorage metadata-only: PASS;
- detached popup megnyílik: PASS;
- detached 4 → 2 BroadcastChannel sync: PASS;
- detached Sunlight theme sync: PASS;
- Visszadokkolás popup close + state retention: PASS;
- browser console error: 0;
- page error: 0;
- failed request: 0;
- external/CDN request: 0.

## Következő gate
Feature commit → operator/integration baseline ellenőrzés → runtime backup → fast-forward → DEV-en kizárólag P7 multi-panel flag ON → 248/248 + tsc + lint + operator build → csak BENJADMIN DEV restart → live smoke → aktiválási checkpoint.

PROD nem módosult.
