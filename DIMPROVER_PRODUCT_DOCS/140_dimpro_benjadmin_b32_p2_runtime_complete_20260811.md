# DIMPRO BENJADMIN B3.2 – P2 runtime izoláció lezárás

Dátum: 2026-08-11

## Állapot

A B3.2 P2 Partner Development Plane runtime izoláció DEV környezetben lezárva.

Runtime állapot: **READY**

A lezárás kizárólag DEV környezetre vonatkozik. PROD módosítás nem történt.

## Fizikai izoláció

Létrejött a külön partner service identity:

- Linux user: `outmin`
- elsődleges csoport: `dimpro-partner`
- home: `/srv/partner-dev/home/outmin`
- SSH kulcstár: `/srv/partner-dev/home/outmin/.ssh/authorized_keys`

A partner runtime gyökér:

`/srv/partner-dev`

Fő elkülönített területek:

- `/srv/partner-dev/repositories`
- `/srv/partner-dev/worktrees/outmin`
- `/srv/partner-dev/integration`
- `/srv/partner-dev/artifacts`
- `/srv/partner-dev/logs`
- `/srv/partner-dev/cache/outmin`
- `/srv/partner-dev/tmp/outmin`

A belső DEV gyökér:

`/srv/dimpro-dev`

módja `0750 root:root`, ezért az `outmin` service identity számára sem read, sem traverse jogosultság nincs.

## Acceptance eredmények

Közvetlen Linux identity acceptance:

- partner worktree write: PASS
- internal `/srv/dimpro-dev` traverse: DENIED
- internal `/srv/dimpro-dev` read: DENIED
- root-only secret store read: DENIED

Külső SSH acceptance külön OutminAI ED25519 kulccsal:

- SSH identity login: PASS
- partner worktree write: PASS
- internal DEV root traverse: DENIED
- internal DEV root read: DENIED

Worker authentication acceptance korábban és a P2 zárás előtt is igazolta, hogy a külön OutminAI worker credential hitelesít, de nem szélesíti a projekt/scope jogosultságot.

## Runtime marker

A DEV VPS runtime marker:

`/srv/partner-dev/.outmin-runtime-ready.json`

Állapota:

- `ready: true`
- `internalRootProtected: true`
- `workerTokenReady: true`
- `sshIdentityReady: true`

A BENJADMIN Partner Development Plane API ezt most `stage=READY` állapotként adja vissza, aktív blocker nélkül.

## Automatizált acceptance

`scripts/benjadmin-b32-p2-policy-acceptance.mjs`

Utolsó runtime futás:

- **12/12 PASS**
- runtime stage: `READY`
- OutminAI -> INTERNAL task: DENIED
- OutminAI automatic next-task claim: DENIED
- hibás worker token: DENIED
- unauthenticated mutation: DENIED

A külön pozitív worker-token acceptance az előző checkpointban PASS volt; a worker-auth kód azóta nem változott.

## P2 minősítés

**P2 COMPLETE / DEV READY**

A következő fejlesztési szint: **P3 Partner Provisioning**.

P3 feladatai:

1. partnerprojekt provision state machine;
2. dedikált repository létrehozás és kötés;
3. partner DEV/STAG környezet registry;
4. adatbázis- és storage-erőforrások projekt-szintű elkülönítése;
5. secret reference-ek raw secret nélküli kezelése;
6. OutminAI explicit access policy és engine entitlement létrehozás;
7. baseline test;
8. `DRAFT -> VALIDATING -> PROVISIONING -> BASELINE_TEST -> READY` állapotátmenet.

PROD továbbra is read-only / approval-gated.
