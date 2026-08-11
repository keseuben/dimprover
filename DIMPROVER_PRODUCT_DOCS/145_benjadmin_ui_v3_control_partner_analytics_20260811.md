# BENJADMIN UI V3 – B3.1 Control + B3.2 Partner analitika

Dátum: 2026-08-11

## Normatív alap

A fejlesztés a `143_benjadmin_b3_b31_b32_normative_crosswalk_20260811.md` szerint készült, tehát együtt kezeli:

- B3 Development Center / Operator alapmotor;
- B3.1 Control Plane / realtime napló / monitoring szerződés;
- B3.2 Partner Development Plane / OutminAI izolációs szerződés.

PROD nem módosult.

## Control UI V3

A Control nézet megtartotta:

- START / DEV START / PROD START kártyákat;
- PROD READ_ONLY szerződést;
- Control/telemetry readiness panelt;
- élő munkanapló táblázatot;
- 5 mp silent refresh működést.

Új, source-of-truth alapú grafikonok:

1. `Command queue`
   - queued/approved;
   - running;
   - passed;
   - failed/rejected/cancelled.

2. `Approval lifecycle`
   - pending;
   - approved;
   - consumed;
   - rejected/expired.

3. `Monitoring health`
   - ok;
   - warning;
   - error;
   - unknown.

A chartok az `/api/dev/engine/control-plane` read model valós `commandQueue`, `approvals` és `monitoring` rekordjaiból számolnak. Hiányzó staged telemetry esetén nulla érték jelenik meg; demo-adat nincs.

## Partner UI V3

A Partner fejlesztések nézet megtartotta:

- B3.2 külön Partner Development Plane jelölést;
- P2 runtime státuszt;
- OutminAI DEFAULT DENY jelzést;
- partner registry táblázatot;
- provisioning indítást;
- draft létrehozást;
- P3 state machine read modelt.

Új grafikonok:

1. `Provision lifecycle`
   - DRAFT;
   - VALIDATING;
   - PROVISIONING;
   - BASELINE_TEST;
   - READY.

2. `Delivery model`
   - HANDOFF;
   - DIMPRO_HOSTED;
   - PARTNER_HOSTED.

3. `Partner environment health`
   - ready/online;
   - pending/unknown/not_bound;
   - degraded/offline.

A partner grafikonok kizárólag a Partner Registry source-of-truth read modelből számolnak.

## Tipográfia

A Control és Partner munkafelületre explicit UI V3 tipográfiai floor került:

- body/table/chart/workspace szöveg: minimum 12 px;
- a globális compact navigáció korábbi külön szabálya nem változott.

## Acceptance

Új acceptance:

`scripts/benjadmin-ui-v3-control-partner-acceptance.mjs`

Eredmény:

**21/21 PASS**

Fő ellenőrzések:

- Control API elérhető;
- Partner API elérhető;
- Partner schema 0.2.0 + P2 runtime READY;
- Control 3 chart;
- live worklog tábla megmaradt;
- PROD READ_ONLY contract megmaradt;
- Control >=12 px;
- Control desktop one viewport;
- Partner 3 chart;
- partner registry tábla megmaradt;
- P2 RUNTIME READY látható;
- Partner >=12 px;
- Partner desktop one viewport;
- tablet és 390 px mobil horizontal overflow nincs;
- chartok responsive nézeten is megmaradnak.

## Regresszió

- P2 runtime/policy: 12/12 PASS, runtime READY;
- P1 Partner Registry: 14/14 PASS;
- B3.1 Control: 13/13 PASS;
- Operator UI: 30/30 PASS;
- TypeScript: PASS;
- lint: 0 error / 108 meglévő warning;
- `git diff --check`: PASS.

## DEV build

Aktív build:

`L3koeinEdaf-if-0JQTWk`

PM2 `dimpro-benjadmin-operator-ui-v2-dev`: online.

## Következő UI V3 lépés

- Release trendek és pipeline;
- Audit / munkaidő trendek;
- Licenc / AI entitlement analitika;
- utána B3.2 P4 release/handoff workflow.
