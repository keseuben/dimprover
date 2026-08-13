# 193 — BENJADMIN Külső AI Worker V1.3 — V.Guard review execution

Dátum: 2026-08-13. Környezet: DEV. Kapcsolódó: 181–192 és B3/B3.1/B3.2.

## Cél
A M.Forge eredménycommit után V.Guard-AI külön review-only kapun keresztül végezzen független minőségellenőrzést. Eredmény: PASS, PASS_WITH_NOTES vagy FAIL. Automatikus integráció nincs; PROD-művelet nincs.

## Review lánc
`M.Forge WORKER_DONE -> V.Guard review prompt -> readiness -> review-only session -> provider run -> strict parse -> review eredmény -> BENJADMIN következő gate`.

A review schema `benjadmin.vguard.review.v1`. PASS nem tartalmazhat HIGH/BLOCKER findingot. FAIL-hez HIGH vagy BLOCKER kötelező. Finding csak a tényleges M.Forge changedPaths fájlokra mutathat.

## Technikai izoláció
A V.Guard policy reviewOnly és productionAccess=DENY. A Development Center külön `bind_review_task` utat kapott. Normál `bind_task` tiltott (`DEV_CENTER_REVIEW_BINDING_REQUIRED`), normál orchestration task claim tiltott (`EXTERNAL_AI_VGUARD_DIRECT_CLAIM_DENIED`). Review-only session nem kaphat branchet, worktree-t vagy scope lockot.

## Readiness és futás
Kötelező a WORKER_DONE M.Forge eredmény, valid commit/baseline, SHA-256 + 0600 review prompt, READY review-only V.Guard, budget/time/retry gate és READY külső provider/model futási kapu. Hiányzó előfeltételnél a rendszer fail-closed.

Új service: `app/lib/dev-center/ai-worker/vguard-review-run.ts`. Új API: `POST /api/dev/ai-worker/tasks/[id]/review-run`. A provider usage parse-hiba esetén is naplózódik. Sikeres review után provider/model/run/token/költség/idő és finding metadata auditáltan megmarad, a session bezáródik.

A M.Forge run coordinator a valós `executeMForgeRun()` szolgáltatást hívja, de kizárólag sikeres run-readiness után. Jelen DEV konfigurációban külső provider futás nem READY, így valós külső modellfutás nem indul.

## Acceptance
- V.Guard strict review contract: 5/5 PASS.
- V.Guard review execution és izoláció: 9/9 PASS.
- M.Forge run coordinator regression: 18/18 PASS.
- External AI Worker V1.0 UI: 21/21 PASS.
- Developer Console: 40/40 PASS.
- TypeScript PASS.
- full lint: 0 error / 104 meglévő warning.
- build: `ruJeGpieOvhhLeZaNwYdl`.
- DEV PM2 online, PROD nem módosult.

## Következő blokk
V.Guard FAIL után maximum 2 kontrollált M.Forge javítási kör. A root trusted baseline változatlan marad; a következő javítási kör technikai baseline-ja az előző M.Forge eredménycommit. Két sikertelen javítási kör után automatikus rework megszűnik és BENJADMIN döntés szükséges.
