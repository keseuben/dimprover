# BENJADMIN / DIMPRO DEV Storage Retention V1 hardening – final pause checkpoint

Dátum: 2026-08-16
Állapot: DEV ACTIVE / PASS
PROD: `READ_ONLY`, változatlan.

## Cél

A BENJADMIN PWA push-feliratkozási blokk lezárása után a DEV VPS kritikus tárhelytelítettségét biztonságosan kezelő Storage Retention V1 rendszer véglegesítése, valamint az új worktree-k dependency-kezelésének tárhelytakarékos, Next/Turbopack-kompatibilis megoldása.

## Storage Retention V1 állapot

A retention rendszer a DEV környezetben:

- leltározza a worktree-k `.next*` build outputjait;
- védi az aktív PM2 `NEXT_DIST_DIR` release-t;
- védi az `active-next-release` pointert;
- védi a `rollback-next-release` pointert;
- worktree-nként legalább a legfrissebb build-eket megtartja;
- backupot, artifactot és teljes worktree-t V1-ben nem töröl automatikusan;
- `node_modules` automatikus törlését nem engedi;
- dependency deep-prune csak explicit módon, clean + merged + inactive gate után lehetséges;
- minden apply központi build/maintenance koordináció alatt fut;
- PROD-on nem alkalmazható.

Az első biztonságos retention futás 20 régi build outputot távolított el, és a DEV lemezhasználat kb. 98%-ról 89–90%-ra csökkent. A retention után kb. 12–13 GB szabad hely állt rendelkezésre.

## Worktree dependency hardening

Az első Storage Retention V1 worktree helper azonos `package-lock.json` esetén külső `node_modules` symlinket használt volna.

Valós Next build acceptance közben a Turbopack ezt fail-closed módon elutasította:

`Symlink [project]/node_modules is invalid, it points out of the filesystem root`

Ez alapján a külső `node_modules` symlink stratégia végleg tiltott.

A végleges megoldás:

- az operator és az új worktree `package-lock.json` SHA-256 hashének összevetése;
- egyező lockfile esetén `cp -al` hardlinkelt `node_modules` dependency-fa;
- a worktree számára ez normál, projekten belüli könyvtár;
- a fájlok ugyanazokat az inode-okat használják, ezért nem készül teljes fizikai 1,3–1,5 GB-os másolat;
- Turbopack-kompatibilis;
- a retention motor a többszörös hardlink count alapján felismeri és védi a megosztott dependency-fákat.

A helper további védelmei:

- worktree név allowlist;
- `../` / path traversal blokkolás;
- canonical root + direct-parent ellenőrzés;
- meglévő `node_modules` nem írható felül;
- eltérő lockfile esetén nincs automatikus dependency létrehozás.

## Acceptance

Storage Retention V1 contract:

- `24/24 PASS`

Storage hardening contract:

- `13/13 PASS`

Valós worktree runtime acceptance:

- `8/8 PASS`
- traversal cél elutasítva;
- ideiglenes worktree szabályosan létrejött;
- `node_modules` valós könyvtár;
- `next/package.json` inode egyezés és többszörös hardlink count igazolva;
- ideiglenes worktree a teszt után törölve.

BENJADMIN regresszió az exact final artifacton és post-cutover 3100-on:

- PWA subscription runtime: `13/13 PASS`
- task push deep-link browser: `12/12 PASS`
- teljes BENJADMIN Konzol: `40/40 PASS`
- Identity: `0.2.1 READY`
- trusted baseline readiness: `7/7 PASS`
- TypeScript: PASS
- lint: `0 error / 103 meglévő warning`
- Next/Turbopack build: PASS
- static chunks: `245 PASS`
- post-build retention: PASS
- PM2 operator: online
- unstable restart: `0`

## Final DEV release

Aktív pointer:

`.next-benjadmin-v13-storage-retention-hardening-final`

Build:

`uAeE_RE6Wld75DZ9JUXHN`

Release source:

- branch: `feat/benjadmin-operator-ui-v2`
- commit: `31dd50927ebb08ab1352f5e9005fac81846fa23d`

Trusted baseline:

- `refs/heads/integration/benjadmin-dev`
- `31dd50927ebb08ab1352f5e9005fac81846fa23d`

Védett final source ref:

`refs/heads/backup/benjadmin-storage-retention-hardening-final-active-20260816`

Cutover artifact:

`/srv/dimpro-dev/artifacts/benjadmin-storage-retention-hardening-cutover-20260816_211602`

## Rollback

Explicit rollback pointer:

`.next-benjadmin-v13-pwa-subscription-final`

Rollback build:

`BDgezeB9qEAmoq06oP0Ku`

A rollback release Identity V0.2.1-kompatibilis és tartalmazza a PWA push subscription + deep-link funkciókat, de a Storage Retention V1 hardening nincs benne.

## PWA push állapot

A PWA push rendszer továbbra is működőképes, de a valós eszköz-feliratkozások száma a checkpoint idején `0`.

A következő valós mobil E2E első felhasználói lépése továbbra is:

`Push engedélyezése` → böngésző/OS értesítési engedély → `Task push teszt` → értesítés kattintás → konkrét BENJADMIN task fókusz.

## Szünet előtti állapot

A fejlesztési blokk ezen a ponton biztonságosan lezárható.

A DEV aktív release stabil, rollback rögzített, trusted baseline szinkronban van, retention működik, a tárhely már nincs kritikus 98–99%-os állapotban.

A következő fejlesztési munkamenet előtt kötelező:

1. központi lock ellenőrzés;
2. aktuális tárhelyállapot ellenőrzés;
3. aktív release + rollback pointer ellenőrzés;
4. trusted baseline readiness;
5. csak ezután új feature worktree indítása a Turbopack-safe helperrel.

## 2026-08-16 21:20 utáni kézi tárhelykarbantartás

A felhasználó kérésére, az AI-fejlesztések szünetében külön biztonságos DEV tárhelykarbantartás történt.

Kiinduló állapot a hardening release után:

- lemezhasználat: kb. `90%`;
- szabad hely: kb. `12,1 GB`;
- aktív release: `.next-benjadmin-v13-storage-retention-hardening-final`;
- build: `uAeE_RE6Wld75DZ9JUXHN`;
- PM2 operator: online, unstable restart `0`.

### 1. Explicit dependency deep-prune

A retention motor 4 olyan `node_modules` könyvtárat talált, amely clean + integrált + 145–164 órája inaktív + nem hardlinkelt volt.

Eltávolítva kizárólag a dependency-fa:

- `benjadmin-m0-infra/node_modules`;
- `benjadmin-m1-shell/node_modules`;
- `benjadmin-m3-orchestration/node_modules`;
- `integration-prod-v1212-benjadmin-m35/node_modules`.

Eredmény:

- felszabadult kb. `5,05 GB`;
- lemezhasználat `90% -> 85%`;
- worktree, branch és commit nem törlődött.

### 2. Három régi, integrált worktree regenerálható tartalmának törlése

A teljes worktree-ket szándékosan megtartottuk. Csak a `node_modules` és régi `.next*` build output került törlésre:

- `drop-v1212-ios-sendmail`: node_modules + `.next-drop-v1212-dev-candidate`;
- `hage-org-license-v020`: node_modules + `.next-identity-org-license-v020-candidate`;
- `integration/baseline`: node_modules + `.next`.

A törlés előtt minden célra kötelező gate futott:

- clean Git worktree;
- HEAD a `integration/benjadmin-dev` őse;
- nincs futó processz a worktree-ben;
- nincs PM2 cwd hivatkozás;
- csak `node_modules` vagy `.next*` basename törölhető.

Manifest:

`/srv/dimpro-dev/artifacts/storage-maintenance-regenerable-20260816-2120`

Felszabadult kb. `5,35 GB`, a lemezhasználat `85% -> 83%` lett.

### 3. Regenerálható cache-ek

Törölve:

- `/tmp/node-compile-cache`;
- npm `_cacache`;
- npm `_npx` cache;
- 30 percnél régebbi Puppeteer ideiglenes profilok;
- retention contract ideiglenes fixture könyvtárak;
- APT package cache.

Szándékosan megtartva:

- `/root/.cache/puppeteer` kb. `636 MB`, a browser acceptance miatt;
- `/root/.cache/ffmpeg-static-nodejs` kb. `1,1 GB`, a fejlesztői médiatesztek gyors újraindítása miatt;
- teljes backup-tár kb. `2,2 GB`;
- Git branchek és commitok;
- minden worktree forráskód;
- aktív release és rollback release.

Cache cleanup manifest:

`/srv/dimpro-dev/artifacts/storage-maintenance-cache-20260816-2120`

### 4. Végső állapot

- lemezhasználat: `81%`;
- szabad hely: kb. `21,84 GB`;
- aktív build: `uAeE_RE6Wld75DZ9JUXHN`;
- PM2 operator: online;
- unstable restart: `0`;
- Drop health: HTTP `200`, `ok:true`;
- Drop release gate továbbra is `false`;
- retention final dry-run: régi build jelölt `0`.

A dry-run még 1 db, kb. `1,26 GB` dependency-jelöltet mutat a `benjadmin-m2-dev-center` worktree-ben. Ezt szándékosan **nem töröltük**, mert PM2-ben még létezik hozzá leállított processz-bejegyzés. A jelenlegi 81%-os lemezhasználat mellett további agresszív törlés nem indokolt.
