# BENJADMIN Developer Grid v0.1.68 – Engine Session Recovery Hotfix

Dátum: 2026-09-24
Környezet: DEV ONLY · PROD DENY

## Fizikai hiba

A v0.1.67 fizikai rollover E2E során a Conversation Rollover authoritative állapota READY volt, az utód ChatGPT conversation exact módon kötődött a meglévő JázminAI Grid task/session identitáshoz, és új TASK_LAUNCH nem készült.

Az első Central Core Execution Bridge GIT_STATUS kérés mégis blokkolódott, mert a sourceExecutionProof által hivatkozott belső Dev Center engine session lease-expiry miatt már closed állapotban volt.

A Grid task és Grid session továbbra is aktív és VERIFIED maradt, ezért a hiba nem rollover- vagy source-provenance hiba volt, hanem a tartós Grid session és a rövidebb életű Dev Center execution authority közötti lease-élettartam eltérés.

## v0.1.68 megoldás

1. Új RECOVER_EXECUTION_AUTHORITY work-start action készült.
2. A recovery input exact taskId + Grid sessionId + workerCode + előző sourceProofSha256 kötésű.
3. A szerver kizárólag az exact aktív Grid sessiont fogadja el.
4. A BOOT ACK állapotnak VALIDATED és codingAllowed=true értékűnek kell maradnia.
5. Rollover esetén a conversationRolloverState csak READY lehet.
6. A korábbi Central Core source proof SHA újraszámolva és exact módon ellenőrződik.
7. A source provenance fizikai repository/worktree/branch/HEAD állapota újra VERIFIED ellenőrzést kap.
8. A Dev Center task explicit taskId alapján kerül feloldásra, nem singleton current-task pointerből.
9. Ha a régi belső engine session closed, ugyanahhoz a Grid task/session/source identitáshoz friss Dev Center engine session készül.
10. Új Grid task, Grid session, worktree vagy TASK_LAUNCH nem készül.
11. Az új engine sessionből friss CENTRAL_CORE sourceExecutionProof készül és ugyanabba a Grid sessionbe íródik vissza.
12. A BOOT ACK validáció megmarad.
13. A recovery külön Central Core eventet ír az old és fresh proof SHA-val.
14. A Desktop a READY continuation előtt execution-authority recoveryt kér.
15. Már korábban SENT v0.1.67 continuation esetén külön EXECUTION_AUTHORITY_RECOVERED_V1 kontrollüzenet készül.
16. Ez a kontrollüzenet pontosan egy GIT_STATUS Execution Bridge requestet kér az új proof SHA-val.
17. A local recovery proof átmeneti kliensoldali elfogadása kizárólag V0168 + exact taskId + sessionId + sourceHead kötésnél engedett.
18. Generikus local proof override továbbra is tiltott.

## Multi-worker biztonság

A recovery nem használ implicit current Grid taskot.

Kötelező exact identity:
- taskId
- Grid sessionId
- workerCode
- previous sourceProofSha256

Ez megakadályozza, hogy OutminAI, JázminAI és BenjáminAI párhuzamos aktív sessionjei egymás execution authority-ját recovereljék.

## Fizikai JázminAI folytatás

Meglévő Grid task:
dev-task-grid-6d00963673f51c5ccde5

Meglévő Grid session:
grid-work-dev-task-grid-6d00963673f51c5ccde5-jazminai

Meglévő successor conversation:
6ab4385f-21b4-83eb-a1ac-ab42866bb947

A v0.1.68 ugyanebben a successor conversationben folytatja a taskot. Új rollover, új Grid task, új Grid session és új TASK_LAUNCH nem szükséges.

## Acceptance

- TypeScript: PASS
- Lint: PASS · 0 error / 103 inherited warning
- Execution Authority Recovery v0.1.68 contract: 24/24 PASS
- Rollover Execution Bridge v0.1.68 contract: 21/21 PASS
- Teljes Desktop regresszió: PASS
- PROD: DENY

## Verzióterv

A korábban v0.1.68-ra tervezett Work first-party aktiválás a fizikai rollover hotfix miatt v0.1.69-re tolódik.

A v0.1.67 rollbackként megmarad a v0.1.68 fizikai Windows E2E lezárásáig.
