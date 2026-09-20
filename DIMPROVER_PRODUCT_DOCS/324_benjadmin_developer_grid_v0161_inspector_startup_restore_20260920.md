# BENJADMIN Developer Grid v0.1.61 – Task Inspector readability + startup conversation restore

Dátum: 2026-09-20
Környezet: DEV ONLY · PROD DENY

## Fizikai v0.1.60 visszajelzés

A v0.1.60 Windows fizikai próbán két további probléma maradt:

1. Az Aktuális Task / Kontextus / Checkpoint modál törzsszövege 80%-os Grid zoom mellett már javult, de külön modal-zoom hiányában még egy fokkal nagyobb betűméret indokolt.
2. A light theme Task Inspector tabgombjai túl világos feliratot használtak fehér háttéren.
3. Újraindítás után a worker cella nem feltétlenül a legutóbb kézzel megnyitott ChatGPT conversationt állította vissza. Ennek oka az volt, hogy aktív task pin mellett a navigation-memory nem mentette el az eltérő, de felhasználó által ténylegesen megnyitott conversation URL-jét.

## v0.1.61 UI szabályok

- Task Inspector tabgomb: 11 px, light theme-ben külön sötét navy felirat.
- Aktív/hover tab light theme: világos cyan háttér + sötét #073f57 felirat.
- Task label: 12 px.
- Task value: 12.5 px.
- Monospaced technikai értékek: 11.5 px.
- Hosszú Context/Checkpoint szöveg: 12 px, 1.65 line-height.
- Szekciócím: 13 px.
- A változás közös az Aktuális Task, Kontextus és Checkpoint nézetekben.

## Startup conversation restore szabály

A worker cella utolsó ténylegesen megnyitott ChatGPT conversation URL-je observational UI state-ként menthető és következő induláskor visszaállítható akkor is, ha eltér az aktív task authoritative conversation pinjétől.

Ez NEM módosítja a task conversation bindingot.

Kötelező invariánsok:

- conversationPinForCell() marad a task-kötés authoritative forrása.
- A legutóbb látott cell.url csak startup/navigation memory.
- Same-project eltérés továbbra is REBIND_PENDING.
- Más eltérés továbbra is MISMATCH_BLOCKED.
- Automatikus visszanavigálás nincs.
- Automatikus rebind nincs.
- Új TASK_LAUNCH nincs.
- Explicit CSEVEGŐ ÁTKÖTÉSE workflow változatlan.

## Acceptance

- Desktop teljes acceptance: PASS.
- Task Inspector readability contract: PASS.
- Startup conversation restore v0.1.61: 14/14 PASS.
- Manual rebind / sticky rebind / chat navigation / auth isolation regressziók: PASS.
- Work first-party surface továbbra is fail-closed; következő tervezett külön aktiválási verzió: v0.1.62.
