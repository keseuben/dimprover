# BENJADMIN Developer Grid v0.1.100 – Chat-to-Grid Auto Work-Start

Dátum: 2026-10-02  
Környezet: **DEV ONLY · PROD DENY**

## Cél

A kódoló ChatGPT cella legyen a normál fejlesztési munka belépési pontja. A felhasználónak ne kelljen ugyanazt a feladatot külön a Central Core `Mit fejlesszünk?` űrlapján is felvennie, majd külön Launch Packet küldő vagy `INDÍTÁS FOLYTATÁSA` gombot használnia.

## V0.1.100 működés

A Desktop 8 másodperces Conversation Memory ciklusa most először a kódoló cella transcriptjét vizsgálja fejlesztési szándékra. Explicit vagy fejlesztési kontextusban rövid folytatási utasítás esetén a rendszer:

1. az aktuális worker cellát authoritative worker-preferenciaként használja;
2. a jelenlegi ChatGPT conversation azonosítójával deduplikál;
3. azonos CURRENT task esetén csak folytatja a meglévő 1→6 workflow-t;
4. másik, nem stale aktív task esetén fail-closed marad;
5. szigorúan őrzött stale pre-BOOT task esetén felszabadítja a stale sessiont;
6. új Central Core taskot, sessiont, branch/worktree/source-proof láncot készít;
7. a jelenlegi conversationt automatikusan bindolja;
8. a Launch Packetet automatikusan küldi és a meglévő BOOT ACK monitorra bízza;
9. ezután a már meglévő stage/review/build/closure autopilot viszi tovább a munkát.

## Stale task biztonsági kapu

Automatikus retirement csak akkor engedélyezett, ha ugyanannak a workernek az előző Grid sessionje aktívnak látszik, a hozzá tartozó Grid task `READY`, a munka még 1/6 ELEMZÉS szakaszban van, a BOOT ACK nem `VALIDATED`, `bootAckCodingAllowed !== true`, és a forrásállapot tényleges `verifyCurrentSourceExecutionState()` ellenőrzésen stale eredményt ad. A Dev Center session lezárása felszabadítja a scope lockot és a worker státuszt; a Grid session `endedAt` értéket kap. CURRENT vagy már kódolásra engedélyezett task nem retired.

## UI

A Central Core munkaindító űrlap megmarad kézi fallbackként. Az új alapértelmezett mód `AUTOMATIKUS KÜLDÉS`, míg a korábbi központi küldés `KÉZI KÖZPONTI KÜLDÉS · FALLBACK` megnevezést kap.

## Acceptance

Kötelező célzott contract: `scripts/developer-grid/chat-auto-work-start-v01100-contract.mjs`. Emellett a work-start, autonomous workflow, worker scope ownership, pre-BOOT rebind és v0.1.99 auth reload-loop regresszióknak változatlanul PASS állapotban kell maradniuk.
