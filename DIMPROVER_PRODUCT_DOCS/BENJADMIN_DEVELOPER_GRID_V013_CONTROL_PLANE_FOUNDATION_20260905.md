# BENJADMIN Developer Grid v0.1.13 – Control Plane Foundation

**Dátum:** 2026-09-05
**Worker:** OutminAI
**Környezet:** DEV ONLY · PROD DENY
**Kiinduló canonical HEAD:** `4a9c802d995f2206cb000962617a88f14b8116bf`
**Fejlesztési branch:** `feature/benjadmin-developer-grid-v013-outminai-20260905`

## Cél

A Developer Grid négy ChatGPT-cellás munkaterét és a középső BENJADMIN Fejlesztői Vezérlőpultot egyetlen valódi fejlesztésindítási control plane alapjává tenni a `Developer_G_Autom_Hand_Diagnostics_V1_260903` átadó szabályai szerint.

## Ebben a blokkban megvalósított alapok

1. A dockolt Fejlesztői Vezérlőpult induláskor zárt, ezért a négy ChatGPT `WebContentsView` teljes cellaszélességet kap. A korábbi `visible: true` default megszűnt.
2. A Developer Grid fejlécében külön ChatGPT felület-státusz jelenik meg: online állapot, utolsó frissítés, Grid UI verzió és kézi biztonságos Frissítés gomb.
3. A központi Vezérlőpult BUILD RUNNER POOL blokkban a meglévő sanitizált System Health / MCP gateway adatláncból megjeleníti BUILD01 és BUILD02 valós health állapotát, build-lock és Storage Governor jelekkel.
4. A work-start többé nem enged `AUTO` worker-választást. Explicit ÁrminAI / OutminAI / BenjáminAI / JázminAI választás kötelező. Hiányzó worker: `DEVELOPER_GRID_WORKER_REQUIRED`. Eltérő routed worker: `DEVELOPER_GRID_WORKER_ROUTE_MISMATCH`. Automatikus/rejtett fallback tiltott.
5. A continuity/handoff továbbra is kontextust adhat, de a BenjAdmin által választott workert nem írhatja felül.
6. Az új task kap legalább modul-szintű explicit scope-ot.
7. A worker Task Launch V3 Launch Packet tartalmazza a branch, worktree, base HEAD, sessionId, scope és acceptance adatokat.
8. A Task Launch V3 kötelező `BOOT ACKNOWLEDGEMENT` blokkot kér kódolás előtt. Source-baseline vagy scope eltérés esetén `Coding allowed: NO` és `SOURCE_BASELINE_MISMATCH / CLARIFICATION_REQUIRED`; fájlírás tiltva.

## BOOT ACK / valódi fejlesztésindítás – elkészült alap

- A központi `MUNKA INDÍTÁSA` meglévő, authoritative módon rögzített worker-csevegés esetén automatikusan elküldi a Task Launch V3 Launch Packetet.
- A desktop a worker legutóbbi assistant-válaszából csak a BOOT ACK struktúrát olvassa ki; a teljes választ nem írja authoritative adatként a szerverre.
- Az ACK branch/worktree/base HEAD/task/session/worker/PROD DENY/Coding allowed mezői fail-closed validációt kapnak.
- A válasz SHA-256 lenyomata és a strukturált ACK állapot paired DEV API-n kerül authoritative rögzítésre.
- VALIDATED ACK után a desktop automatikusan elküldi a `BOOT_ACK_ACCEPTED_V1` vezérlőeseményt, és csak ezután engedi a fejlesztési folytatást.
- Hibás, hiányos, eltérő vagy időtúllépett ACK `BLOCKED`; automatikus folytatás nincs.
- Új projektcsevegésnél a csevegés explicit rögzítése után ugyanaz a Launch Packet → BOOT ACK lánc indul.

## Következő fejlesztési blokk

- A már létező BUILD Runner Pool / remote executor fejlesztési ág integrálása a v0.1.13 control plane-be;
- BUILD01/BUILD02 tényleges build-dispatch, queue, runId, commitSha és test/build evidence visszacsatolás a központi felületre;
- Diagnostic Evidence Engine esemény- és evidence-séma teljes bekötése;
- Windows natív v0.1.13 candidate E2E.

## Biztonsági invariantok

- DEV ONLY · PROD DENY.
- Worker explicit, fallback DENY.
- Source/worktree/HEAD fail-closed.
- Handoff/context nem írhatja felül az authoritative task-routolást.
- Build végrehajtás csak központi gate és READY runner mellett.
- A BUILD01/BUILD02 UI health-adat read-only; a tényleges executor bekötése külön következő blokk.
