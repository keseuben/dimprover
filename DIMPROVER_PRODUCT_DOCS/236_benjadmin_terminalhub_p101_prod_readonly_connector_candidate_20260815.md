# 236 — BENJADMIN Terminal Hub P10.1 · PROD read-only connector foundation candidate

Dátum: 2026-08-15
Baseline: `8d26d1f`
Branch: `feat/benjadmin-terminalhub-p101-prod-connector`
Állapot: CANDIDATE KÉSZ · valódi PROD hálózati transport NINCS.

## Cél
A P10.1 külön, szigorúan read-only PROD connector szerződést készít elő úgy, hogy a foundation önmagában semmilyen PROD kapcsolatot ne tudjon létrehozni.

## Reference-only konfiguráció
A connector kizárólag referencia-neveket ismer:
- `BENJADMIN_PROD_READONLY_ENDPOINT_REF`;
- `BENJADMIN_PROD_READONLY_CREDENTIAL_REF`;
- `BENJADMIN_PROD_READONLY_HOSTKEY_REF`.

A foundation:
- nem oldja fel a credentialt;
- nem adja vissza a reference értékeket API-ban;
- UI-ban csak boolean `konfigurálva / hiányzik` állapot látható;
- a referencia szöveg hossza és karakterkészlete allowlistelt.

## Transport policy
Jelenlegi állapot:
- protocol: `SSH_READONLY_PLANNED`;
- networkTransportImplemented: false;
- networkAccessAttempted: false;
- credentialResolved: false.

A későbbi transport kötelező policy-ja:
- strict host-key checking;
- batch mode;
- TTY tiltott;
- port forwarding tiltott;
- agent forwarding tiltott;
- browserből küldött remote command string tiltott;
- credential browserből nem olvasható;
- credential AI számára nem olvasható;
- RAW PROD output AI számára tiltott.

## Allowlistelt probe katalógus
- `PUBLIC_HEALTH`;
- `RELEASE_METADATA`;
- `SERVICE_STATUS_SUMMARY`;
- `STORAGE_SUMMARY`.

Mindegyik:
- `AUDIT_ONLY`;
- `mutating=false`;
- `shell=false`.

A foundation nem tartalmaz konkrét shell command stringet.

## Explicit tiltott képességek
- SHELL;
- WRITE;
- RESTART;
- DEPLOY;
- MIGRATION;
- FILE_UPLOAD;
- PORT_FORWARD;
- AGENT_FORWARD;
- RAW_PROD_TO_AI.

## API
Admin-only GET:
`/api/dev/terminal-hub/prod-connector/readiness`

Nincs POST/PUT/PATCH/DELETE.
Az API és a connector foundation nem használ hálózati vagy processz API-t és nem ír adatbázisba.

## UI
A P10 panel új P10.1 blokkjában csak:
- connector state;
- endpoint/credential/host-key ref boolean állapot;
- network transport állapot;
- allowlistelt probe-nevek;
- security figyelmeztetés jelenik meg.

Nincs Connect / SSH / Probe / Run / Deploy / Restart / Migration / Futtatás action gomb.

## Contract és build
- P10.1 saját security contract: **42/42 PASS**;
- P9 + P10 + P10.1 + Drive Vector/Drive web összesített gate: **338/338 PASS**;
- TypeScript: PASS;
- célzott lint: PASS;
- full lint: **0 error / 104 meglévő warning**;
- candidate build: `eHQ0qQM6DQBlv9eG7gLF3` PASS.

## Candidate runtime acceptance
Izolált 3199 runtime-ban szintetikus reference-nevekkel:
- connector state: `FOUNDATION_READY`;
- network transport: false;
- network access attempted: false;
- credential resolved: false;
- endpoint configured: true;
- credential configured: true;
- host-key configured: true;
- values exposed: false;
- probe count: 4;
- forbidden capability count: 9;
- API auth nélkül: 401;
- payloadban a szintetikus reference konkrét értéke nem jelent meg.

Headless UI acceptance:
- `FOUNDATION_READY`: PASS;
- reference-ek boolean-only: PASS;
- network transport `NINCS IMPLEMENTÁLVA`: PASS;
- tiltott action gomb: 0;
- console/page/network/external errors: **0/0/0/0**.

A teszt során valódi PROD host, credential, host-key vagy hálózati kapcsolat nem került használatra.

## Következő lépés
P10.2 csak külön döntéssel készülhet: valódi read-only transport adapter, amely kizárólag allowlistelt, előre definiált probe ID-kat képezhet fix szerveroldali read-only műveletekre. Böngészőből vagy AI-tól nyers command string nem kerülhet a transporthoz.

PROD nem módosult.
