# 238 — BENJADMIN Terminal Hub P10.2 · networkless PROD probe-plan compiler candidate

Dátum: 2026-08-15
Baseline: `9d4e51b`
Branch: `feat/benjadmin-terminalhub-p102-probe-planner`
Állapot: CANDIDATE KÉSZ · hálózati transport NINCS · PROD kapcsolat NEM történt.

## Cél
A P10.2 a P10.1 reference-only connector fölé egy hálózatmentes plan/compiler réteget ad. A browser kizárólag allowlistelt probe ID-t küldhet. A szerver ebből fix, immutable read-only tervet készít. A terv nem fut le.

## Allowlistelt probe ID-k
- PUBLIC_HEALTH;
- RELEASE_METADATA;
- SERVICE_STATUS_SUMMARY;
- STORAGE_SUMMARY.

## Fix adapter action ID-k
- READ_PUBLIC_HEALTH;
- READ_RELEASE_METADATA;
- READ_SERVICE_STATUS_SUMMARY;
- READ_STORAGE_SUMMARY.

A browser nem küldhet command stringet, hostot vagy credentialt.

## Plan security contract
Minden plan explicit:
- `executionAvailable=false`;
- `networkAccessAttempted=false`;
- `referencesResolved=false`;
- `commandStringPresent=false`;
- output data class: `AUDIT_ONLY`;
- sanitize required: true;
- audit required: true;
- RAW output → AI: false;
- RAW output persistence: false.

A terv fix limitet tartalmaz probe-onként:
- 5–7.5 s timeout;
- 8–16 KiB max output.

A terv lépései is `execution=false` állapotúak:
1. VERIFY_REFERENCE_STATE;
2. VERIFY_HOST_KEY_POLICY;
3. INVOKE_FIXED_ADAPTER;
4. SANITIZE_AND_AUDIT.

Az `INVOKE_FIXED_ADAPTER` ebben a fázisban csak tervlépés neve; transport/adapter végrehajtó nincs implementálva.

## API
Admin-only POST:
`/api/dev/terminal-hub/prod-connector/plan`

Input:
- kizárólag `probeId`.

Nem engedélyezett probe: 400 `PROD_PROBE_NOT_ALLOWLISTED`.
Connector BLOCKED / not-ready: 409.

Az API nem ír DB-be, nem old fel reference-et és nem használ hálózati/processz transportot.

## UI
A P10 panelben új `P10.2 · PROBE PLAN COMPILER` blokk:
- probe választó;
- `TERV ELŐÁLLÍTÁSA` gomb;
- `PLAN ONLY · NO NETWORK` jelzés;
- adapter action előnézet;
- execution: NINCS;
- network: NEM TÖRTÉNT;
- output/audit policy előnézet.

Nincs Connect / SSH / Run / Deploy / Restart / Migration / Futtatás / Végrehajtás action.

## Acceptance
- P10.1 contract: **42/42 PASS**;
- P10.2 saját contract: **50/50 PASS**;
- P9 + P10 + P10.1 + P10.2 + Drive gate: **405/405 PASS**;
- TypeScript: PASS;
- célzott lint: PASS;
- full lint: **0 error / 104 meglévő warning**;
- candidate build: `tNT1GEKLDL3g4kh7AjE6R` PASS.

### API E2E
Szintetikus reference-ekkel, 3199 izolált runtime:
- console: 200;
- plan API auth nélkül: 401;
- PUBLIC_HEALTH → READ_PUBLIC_HEALTH;
- execution=false;
- network=false;
- referencesResolved=false;
- commandStringPresent=false;
- rawOutputToAiAllowed=false;
- plan steps=4;
- NOT_ALLOWED probe → 400 `PROD_PROBE_NOT_ALLOWLISTED`.

### Headless browser E2E
- SERVICE_STATUS_SUMMARY kiválasztás: PASS;
- READ_SERVICE_STATUS_SUMMARY terv: PASS;
- execution NINCS: PASS;
- network NEM TÖRTÉNT: PASS;
- reference értékek nem szivárogtak: PASS;
- tiltott action gomb: 0;
- browser console/page/network/external error: **0/0/0/0**.

A candidate teszt során valódi PROD host, PROD credential, host-key vagy hálózati transport nem került használatra.

## Következő lehetséges lépés
P10.3 csak külön döntéssel: fix adapter-action registry és teljesen mockolt transport simulator. Valódi PROD network transport vagy credential-resolution külön explicit engedély nélkül nem készülhet/indulhat.
