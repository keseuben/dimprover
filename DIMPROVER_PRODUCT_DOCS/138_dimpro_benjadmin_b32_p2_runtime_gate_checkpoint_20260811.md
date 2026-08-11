# DIMPRO BENJADMIN B3.2 – P2 runtime gate checkpoint – 2026-08-11

## Állapot

A B3.2 P2 alkalmazásoldali policy után a fizikai Partner Development Plane runtime előkészítése is megkezdődött DEV-en. PROD továbbra is érintetlen.

Aktív checkpoint előtt backup készült:

- `/srv/dimpro-dev/.backups/benjadmin-b32-p2-runtime-pre-20260811T115315Z.tgz`
- SHA-256: `15fd629a52d5892e52cf52a23424dbdcb52313e23c209d9637f64ccce33312b7`

## Elkészült runtime előkészítés

A DEV VPS-en létrejött a root-owned, még fail-closed partner skeleton:

- `/srv/partner-dev`
- `/srv/partner-dev/repositories`
- `/srv/partner-dev/worktrees/outmin`
- `/srv/partner-dev/integration`
- `/srv/partner-dev/artifacts`
- `/srv/partner-dev/logs`
- `/srv/partner-dev/cache/outmin`
- `/srv/partner-dev/tmp/outmin`

A skeleton jelenleg `root:root` tulajdonú és 0750 jogosultságú. Ez szándékos átmeneti állapot: külön Outmin Linux identity nélkül a partner runtime nem válhat READY állapotúvá.

## Worker credential

Külön OutminAI worker token készült a menedzsment oldalon. A nyers token nem került a DEV alkalmazásfájlokba vagy dokumentációba.

A DEV csak SHA-256 ellenőrző értéket tárol root-only secretként:

`/root/.dimpro-secrets/benjadmin/outminai-mcp-token.sha256`

Pozitív worker-auth acceptance:

- helyes worker token -> hitelesítés megtörténik;
- nem létező explicit task esetén a kérés `DEV_CENTER_TASK_NOT_FOUND` hibáig jut;
- ez igazolja, hogy a worker credential működik, de nem szélesíti a scope-ot.

Hibás token továbbra is 401.

## Külön SSH identity előkészítés

A menedzsment oldalon külön ED25519 kulcspár készült OutminAI DEV service identity célra.

Csak a fingerprint dokumentált:

`SHA256:MGyOSIKRlIm2pq5P7OX8c4W8wE+ks8z0Ar2qCXF11So`

A privát kulcs nem került repositoryba és nem jelenik meg audit outputban.

## Runtime readiness read model

Új modul:

`app/lib/dev-center/partner-runtime.ts`

A Partner Development Plane API és Operator UI most külön runtime állapotot ad:

- partner root megléte;
- kötelező runtime könyvtárak;
- worker token hash readiness;
- runtime ready marker;
- internal root protection marker;
- SSH identity marker;
- explicit blocker lista.

A runtime csak akkor `READY`, ha minden fizikai izolációs feltétel teljesül. A puszta könyvtárlét vagy token nem elég.

## Operator UI

A korábbi általános P2 jelzés helyett a felület valós runtime státuszt mutat:

- `OUTMINAI · DEFAULT DENY · P2 RUNTIME PENDING`,
- `OUTMINAI · DEFAULT DENY · P2 PREFLIGHT READY`, vagy
- `OUTMINAI · DEFAULT DENY · P2 RUNTIME READY`.

A P2 runtime státusz külön metrikában is megjelenik.

## Ismételhető acceptance

A `scripts/benjadmin-b32-p2-policy-acceptance.mjs` bővült:

- runtime read model ellenőrzés;
- partner skeleton ellenőrzés;
- worker token hash ellenőrzés;
- PENDING esetben fail-closed marker ellenőrzés;
- opcionális pozitív worker-token acceptance;
- meglévő negatív INTERNAL/Outmin task és claim tesztek.

## Még hiányzó fizikai gate

A teljes P2 lezárásához továbbra is szükséges:

1. külön `outmin` Linux service identity és külön partner csoport;
2. partner skeleton tulajdonjogának átadása a service identity számára;
3. a már 0750-re szigorított `/srv/dimpro-dev` tényleges negatív hozzáférési acceptance-e az új Outmin identityvel;
4. a már DEV-re stagingelt OutminAI SSH public identity tényleges bekötése az új service userhez;
5. pozitív partner write és negatív internal read/traverse OS acceptance;
6. csak ezek után runtime READY marker létrehozása.

A jelenlegi MCP policy a Linux account/group és rendszer-szintű hozzáférés-módosító parancsokat blokkolja. A rendszer ezt nem kerüli meg: a readiness addig PENDING és fail-closed marad.

## Következő lépés

A következő kézi/infrastruktúra gate a külön Outmin Linux identity szabályos provisionálása. Ennek teljesülése után azonnal futtatható a runtime acceptance, majd a P2 lezárható és megkezdhető a P3 partner repo/DB/storage provisioning.


## Végső DEV build és acceptance

Aktív DEV build:

`Qh5rJM0_a8fBUBHw1DM5J`

Eredmények:

- P2 runtime/policy acceptance: **12/12 PASS**;
- pozitív OutminAI worker-token acceptance: korábban külön PASS, a worker-auth kód azóta nem változott;
- P2 runtime state: **PENDING**, fail-closed;
- P2 runtime preflight: **READY**;
- runtime skeleton: READY;
- worker token hash: READY;
- `/srv/dimpro-dev` mód: **0750 root:root**;
- OutminAI SSH public key staging: READY;
- még aktív blocker: Linux service identity + tényleges OS/SSH acceptance + runtime marker;
- B3.2 P1 state-aware regression: **14/14 PASS**;
- B3.1 Control regression: **13/13 PASS**;
- Operator UI regression: **30/30 PASS**;
- TypeScript: PASS;
- teljes lint: **0 error / 108 meglévő warning**;
- `git diff --check`: PASS.

A runtime readiness API jelenleg a következő blokkolókat jelenti:

- `OUTMIN_INTERNAL_ACCOUNT_ACCEPTANCE_PENDING`;
- `OUTMIN_SSH_IDENTITY_NOT_READY`;
- `OUTMIN_WORKER_IDENTITY_NOT_ACTIVATED`;
- `OUTMIN_RUNTIME_READY_MARKER_MISSING`.

Ez a kívánt fail-closed állapot a Linux service identity manuális/infrastruktúra provisionálásáig.
