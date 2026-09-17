# BENJADMIN Developer Grid v0.1.44 – Stage-1 BOOT ACK Recovery Hotfix

Dátum: 2026-09-17  
Környezet: **DEV ONLY · PROD DENY**

## Cél
A v0.1.43 Execution Bridge fizikai E2E során a worker a Launch Packet kötelező `BOOT ACKNOWLEDGEMENT` blokkja helyett előbb szabályos `BENJADMIN_STAGE_REPORT_V1` Stage-1 PASS riportot adott. A riport tartalmazta az exact worker/task/session/HEAD identitást, a CENTRAL_CORE source proof SHA-256 értéket, READY handshake-et, aktív scope lockot és worktree lease-t, `PROD DENY` és `codingAllowed=true` bizonyítékot, valamint az exact branch/worktree source-conflict nélküli egyezését. A Desktop korábban ezt csak stage evidence-ként kezelte, ezért a Grid `BOOT ACK VÁR` állapotban maradt és az Execution Bridge nem aktiválódott.

## Javítás
A Desktop v0.1.44 szigorú, gépi Stage-1 → BOOT ACK recoveryt kapott. Free-form szöveg továbbra sem BOOT ACK.

A fallback csak akkor validálható, ha egyszerre teljesül:
- `schemaVersion=1`;
- exact worker identity (`BENAI` / `BENJAMINAI` alias normalizálással);
- exact task ID és Grid session ID;
- exact authoritative 40 karakteres HEAD;
- `stage=1`, `result=PASS`;
- nincs `ERROR`, `FAIL` vagy `BLOCKED` evidence;
- `CENTRAL_CORE_SOURCE_PREFLIGHT_VERIFIED` TEST/PASS evidence;
- `authority=CENTRAL_CORE`;
- exact `proofSha256`;
- `handshake=READY`;
- legalább 1 scope lock;
- legalább 1 worktree lease;
- `productionAccess=DENY`;
- `codingAllowed=true`;
- külön TEST/PASS source-context evidence: `sourceConflict=false`, exact branch és exact worktree.

Bármely eltérésnél nincs BOOT ACK recovery. A Stage Report ettől még normál evidence-ként feldolgozható, de coding state nem léphet tovább.

## Audit
A fallbackkel elfogadott ACK launch recordja külön jelölést kap:
`ackRecoverySource = <source>:STAGE1_PASS_FALLBACK`.

Ez megkülönbözteti a valódi `BOOT ACKNOWLEDGEMENT` választ a Stage-1 kompatibilitási recoverytől.

## Execution Bridge kapcsolat
Sikeres fallback után ugyanaz a normál `BOOT_ACK_ACCEPTED_V1` continuation fut, amely tartalmazza a `CENTRAL_CORE_EXECUTION_BRIDGE_V1` protokollt. Így a meglévő Projektkapu task új Launch Packet és új task létrehozása nélkül folytatható.

## Verzióirány
A v0.1.44 kizárólag recovery hotfix. A ChatGPT Work OpenAI first-party adapter aktiválása **v0.1.45-re** tolódik.

## Kötelező ellenőrzések
- Stage-1 BOOT ACK fallback contract: **18/18 PASS**;
- Desktop teljes `npm run check`;
- Execution Bridge, Source Proof, Source Authority, Worker Surface, Central Core, heartbeat, launch recovery, work-start, materializer, state, memory, routing és Task Bridge regressziók;
- TypeScript és lint;
- BUILD01 exact commit build;
- Windows artifact provenance + immutable DEV release;
- fizikai E2E: a jelenlegi Projektkapu task `BOOT ACK VÁR` állapotából Stage-1 PASS alapján `BOOT ACK VALIDATED`, majd Execution Bridge aktiválás.
