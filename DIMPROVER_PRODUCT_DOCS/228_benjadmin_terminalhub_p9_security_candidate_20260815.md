# 228 — BENJADMIN Terminal Hub P9 · security hardening candidate

Dátum: 2026-08-15
Branch: `feat/benjadmin-terminalhub-p9-security`
Baseline: `6e60e30`
Állapot: P9 security foundation candidate KÉSZ. Terminal execution és Secret Vault storage továbbra is OFF.

## Tartalom
### Session AI visibility
- új session alapértelmezés: `FILTERED`;
- kézi módok: `FILTERED` / `BLOCKED`;
- admin-only visibility endpoint;
- visibility váltás auditált;
- `BLOCKED` session sanitized/AI endpointja HTTP 403 `TERMINAL_AI_VISIBILITY_BLOCKED`;
- RAW emberi stream és hash/meta audit nézet külön marad.

### Private Input
- külön privát input mód a Terminal Core felületen;
- normál xterm stdin privát módban tiltott;
- külön `type=password`, `autocomplete=off` mező;
- érték csak React state-ben él, browser storage-ba nem kerül;
- elküldés után azonnal törlődik;
- input API `private:true` jelölést kezel;
- security audit csak metaadatot (`byteLength`) kap;
- secret tartalom és secret hash nem kerül auditba;
- UI csak `[PRIVÁT INPUT ELKÜLDVE · TARTALOM NEM NAPLÓZVA]` visszajelzést ír ki.

### Secret finding audit
- a meglévő RAW/SANITIZED/AUDIT data-policy újrahasznosított;
- érzékeny finding esetén `TERMINAL_SECRET_REDACTED` audit esemény;
- session+sequence deduplikáció;
- audit summary újra sanitizált;
- audit metadata külön secret-scannen megy át, finding esetén csak `{redacted:true,findingCount}` marad.

### Közös secret-scanner hardening
Új minták:
- credentialed PostgreSQL/MySQL/MariaDB/MongoDB/Redis connection string;
- GitHub token;
- OpenAI-style `sk-...` kulcs;
- AWS `AKIA...` access key;
- JWT.

A korábbi private-key, generic assignment és bearer minták megmaradtak.

### Secret Vault skeleton
- admin-only readiness GET;
- state: `DISABLED` vagy `SKELETON_ONLY`;
- `storageConfigured=false`;
- `rawSecretReadableByAi=false`;
- `browserSecretStorageAllowed=false`;
- `referenceOnlyAiPolicy=true`;
- GET/PUT secret API nincs;
- UI egyértelműen jelzi: Raw secret AI: SOHA; Browser secret storage: TILTVA; GET/PUT API: NINCS.

## Acceptance
- P9 security contract: **55/55 PASS**;
- teljes P2–P9 regresszió: **475/475 PASS**;
- TypeScript: PASS;
- célzott lint: PASS;
- teljes lint: **0 error / 104 meglévő warning**;
- dependency baseline: változatlan 15 finding;
- candidate build: **`tpgNyQNieJrLZCq3PEv0X` PASS**.

### Candidate API
Secret Vault flag csak candidate-ben ON:
- `/admin/dev-console`: HTTP 200;
- vault readiness: `SKELETON_ONLY`;
- storage=false;
- raw AI=false;
- put=false;
- get=false;
- vault readiness auth nélkül: 401;
- `/secret-vault/get`: 404;
- `/secret-vault/put`: 404.

### Headless browser
- Secret Vault skeleton UI: PASS;
- AI visibility control: PASS;
- Private Input control: PASS;
- password mező session/mód nélkül nincs a DOM-ban: PASS;
- console/page/network/external errors: **0/0/0/0**.

## Acceptance-korlát
Valódi aktív Terminal Core session E2E P9-ben még nem futott, mert a P2 process-adapter továbbra is szándékosan `null` és `BENJADMIN_TERMINAL_EXECUTION_ENABLED=0`. Emiatt a Private Input és AI visibility aktív-session viselkedése contract/type/API szinten igazolt, de valódi PTY sessionnel még nem.

Ezt nem kerülhetjük meg a security gate feloldása előtt.

## Live integrációs szabály
- `BENJADMIN_SECRET_VAULT_ENABLED=0` maradjon;
- `BENJADMIN_TERMINAL_EXECUTION_ENABLED=0` maradjon;
- Windows Bridge Execution OFF;
- PROD Terminal OFF;
- P9 kód DEV-re integrálható fail-closed állapotban.

PROD nem módosult.
