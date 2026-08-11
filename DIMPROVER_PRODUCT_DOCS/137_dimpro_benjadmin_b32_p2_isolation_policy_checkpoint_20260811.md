# DIMPRO BENJADMIN B3.2 – P2 izolációs policy checkpoint – 2026-08-11

## Állapot

A B3.2 P2 alkalmazásoldali OutminAI izolációs policy elkészült, DEV buildben aktiválva és valós negatív acceptance tesztekkel ellenőrizve lett.

A teljes P2 még nem zárható le: a külön OutminAI operációs rendszer identity, a partner runtime könyvtárak és a dedikált MCP credential fizikai provisionálása külön infrastruktúra-gate. A jelenlegi VPS MCP biztonsági policy ezt a rendszer-szintű aktiválást nem engedte végrehajtani, ezért nem történt megkerülési kísérlet.

PROD módosítás nem történt.

## Alkalmazásoldali policy core

Új modulok:

- `app/lib/dev-center/partner-isolation.ts`
- `app/lib/dev-center/worker-auth.ts`

Módosított fő engine-elemek:

- `app/lib/dev-center/worktree-validation.ts`
- `app/lib/dev-center/engine-repository.ts`
- `app/lib/dev-center/orchestration-repository.ts`
- `app/lib/dev-center/auth.ts`
- érintett DEV Engine API route-ok.

Fő szabályok:

- development plane: `INTERNAL | PARTNER`;
- belső és partner worktree root különválasztva;
- partner repository saját projecthez kötött;
- partner repository path csak partner runtime root alatt lehet;
- OutminAI belső DIMPRO projektre alapértelmezetten tiltott;
- partnerprojekt csak saját OutminAI workerrel futtatható;
- repository, path, environment és engine hozzáférés explicit policy/entitlement alapján működik;
- explicit `DENY` elsőbbséget élvez;
- OutminAI automatikus `claim_next_task` tiltott;
- OutminAI csak explicit taskot claimelhet;
- worker identity külön hitelesítési szerződést kapott, nem csak request body `workerId` alapján működik.

## Plane-aware worktree

Új közös validator:

`validateGitWorktreeForPlane(worktreePath, branchName, plane)`

A plane-t a project/repository policy határozza meg, nem a kliens pathja.

Partner session belső worktree root használatakor:

`PARTNER_WORKTREE_PATH_DENIED`

## API hardening

A read-only reporter jogosultság az érintett mutációs endpointokon nem használható írásra.

Admin-only marad:

- task create;
- session create;
- session handshake;
- partner project create;
- Control Plane command queue.

Az orchestration és operation authorization admin subjectet vagy dedikált worker subjectet fogad. Worker subject esetén session ownership ellenőrzés kötelező.

## DEV acceptance

Valós API negatív tesztek:

- belső projekt + OutminAI task create -> `403 PARTNER_OUTMIN_INTERNAL_DENIED`;
- OutminAI automatikus next-task claim -> `403 PARTNER_OUTMIN_EXPLICIT_TASK_REQUIRED`;
- hibás worker token -> `401`;
- auth nélküli task mutáció -> `401`.

Ideiglenes partner fixture acceptance:

- partnerprojekt -> belső repository -> `403 PARTNER_REPOSITORY_PROJECT_MISMATCH`;
- saját partner repository mellett task létrehozás -> PASS;
- session handshake `BRANCH_BOUND` állapotig -> PASS;
- partner session -> belső worktree -> `400 PARTNER_WORKTREE_PATH_DENIED`;
- partner session -> explicit tiltott belső scope -> `403 PARTNER_RESOURCE_EXPLICIT_DENY`;
- fixture cleanup -> PASS, valós partner rekord nem maradt.

## Legacy OutminAI task cleanup

A P0 auditban azonosított régi M2 acceptance task `in_progress` állapotban maradt lezárt session mellett.

A P2 cutover során kontrolláltan `cancelled` állapotba került, történeti rekord megtartásával és `PARTNER_ISOLATION_CUTOVER` audit eseménnyel.

## Build

P2 policy build ID:

`cR4EMHvg-GNwhkHSbN39T`

Ellenőrzések:

- Next.js build: PASS;
- TypeScript: PASS;
- célzott ESLint: PASS;
- `git diff --check`: PASS;
- DEV coordinated restart: PASS;
- DEV PM2 process online.

## Operator UI

A Partner Development Plane jelzés frissült:

`OUTMINAI · DEFAULT DENY · P2 POLICY ACTIVE`

A felület külön jelzi, hogy az alkalmazásoldali policy core aktív, miközben az OS/MCP runtime identity még külön gate és a repo/DB/storage provisioning P3 feladat.

## P2 lezárásához hátralévő runtime gate

Még szükséges:

1. külön OutminAI Linux identity;
2. külön partner repository/worktree runtime root;
3. belső DIMPRO runtime traversal tiltása az Outmin identity számára;
4. külön Outmin Git/SSH credential scope;
5. dedikált MCP worker credential fizikai aktiválása;
6. pozitív worker-token end-to-end acceptance;
7. OS-level negatív acceptance, amely igazolja, hogy OutminAI nem éri el a belső DIMPRO plane-t.

## Végső regresszió és acceptance

A végső DEV build és restart után:

- B3.2 P1 state-aware acceptance: **14/14 PASS**;
- B3.1 Control acceptance: **13/13 PASS**;
- Operator UI regression: **30/30 PASS**;
- P2 biztonsági negative acceptance: **5/5 PASS**;
- TypeScript: PASS;
- teljes repository lint: **0 error / 108 meglévő warning**;
- `git diff --check`: PASS.

Új ismételhető negatív teszt:

`scripts/benjadmin-b32-p2-policy-acceptance.mjs`

A reporter-kulcs jelenleg nincs konfigurálva a DEV runtime-ban, ezért a reporter-mutation runtime ág ebben a futásban SKIP volt. Az érintett mutációs route-ok kódoldalon admin mutation subjectre lettek szigorítva; reporter subjectet nem fogadnak.

## Minősítés

**P2 APPLICATION POLICY CORE: KÉSZ ÉS DEV-EN AKTÍV.**

**P2 OS/MCP RUNTIME ISOLATION: PENDING.**

PROD érintetlen.
