# 230 — BENJADMIN DEV runtime identity guard + standalone self-heal

Dátum: 2026-08-15
Baseline: `f441287`
Állapot: runtime hardening candidate KÉSZ.

## Kiinduló incidens
A P9 aktiválás során a `dimpro-benjadmin-operator-ui-v2-dev` PM2 processz neve átmenetileg a Drive integrációs worktree-re mutatott. Ez 404-et okozott a friss BENJADMIN route-okon annak ellenére, hogy a build manifest helyes volt.

A hibás runtime állapot már külön javítva lett és a BENJADMIN processz helyes cwd-ről fut.

## Runtime identity guard
Új read-only ellenőrző:
`scripts/benjadmin-dev-runtime-identity-check.mjs`

Kötelező invariánsok:
- pontosan 1 `dimpro-benjadmin-operator-ui-v2-dev` processz;
- status: online;
- cwd: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`;
- port: 3100;
- host: 127.0.0.1;
- PM2 start args tartalmazza a `start` műveletet;
- `.next/BUILD_ID` létezik;
- standalone `.dimpro-assets-build-id` egyezik a builddel;
- helyi `/admin/dev-console`: HTTP 200;
- helyi P9 Secret Vault auth-gate: HTTP 401.

Az ellenőrző kizárólag olvas. Nem startol, nem restartol, nem töröl és nem javít automatikusan PM2 processzt.

Eltérés esetén exit code 2 és géppel feldolgozható hibakód, például:
`BENJADMIN_PM2_CWD_MISMATCH`.

## Standalone `.dimprover` self-heal
A Next standalone trace időnként fizikai `.next/standalone/.dimprover` másolatot hozhat létre. Ez nem lehet a runtime adatforrása.

Javítás:
1. `start-next-standalone.cjs` először lefuttatja az asset-szinkront;
2. `ensure-next-standalone-assets.cjs` felismeri a build-local fizikai `.dimprover` könyvtárat;
3. kizárólag akkor távolítja el, ha az valódi könyvtár és nem symlink;
4. más fájltípus / hibás symlink esetén fail-closed;
5. a start ezután készíti el a központi `.dimprover` symlinket.

Így a központi adatkönyvtár nem törölhető a self-heal során.

## Acceptance
- runtime identity guard contract: **20/20 PASS**;
- élő helyes runtime identity check: PASS;
- mesterséges `/tmp/not-the-benjadmin-worktree` cwd: exit 2 / `BENJADMIN_PM2_CWD_MISMATCH` PASS;
- izolált fake standalone fizikai `.dimprover` self-heal: PASS;
- Node syntax check: PASS;
- teljes lint: **0 error / 104 meglévő warning**.

## Üzemeltetési szabály
Minden BENJADMIN DEV build/restart/deploy után kötelező futtatni:
`node scripts/benjadmin-dev-runtime-identity-check.mjs`

A guard hibája esetén a release nem tekinthető aktívnak, még akkor sem, ha a publikus főoldal HTTP 200 választ ad.

PROD nem módosult.
