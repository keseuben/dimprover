# DIMPRO DEV Storage Retention V1.0 – automatikus build- és worktree-tárhely szabály

Dátum: 2026-08-16
Állapot: fejlesztve / dry-run validálva
Környezet: kizárólag `/srv/dimpro-dev`
PROD: nem érintett

## 1. Miért készült

A DEV szerver lemezhasználata 1–2 nap intenzív párhuzamos AI-fejlesztés után 98–99%-ra nőtt. A vizsgálat alapján nem a backup volt a fő ok.

Mért fő források:

- 67+ fejlesztői worktree;
- 69 körüli `.next*` buildkönyvtár;
- az operator worktree-ben 23 külön Next build, összesen kb. 14 GB;
- 51 worktree-ben `node_modules`, több külön fizikai dependency-csoporttal;
- egy tipikus `node_modules` kb. 1,3–1,5 GB;
- `/srv/dimpro-dev/backups` kb. 2,2 GB;
- `/srv/dimpro-dev/artifacts` kb. 270 MB;
- PM2 logok csak néhány MB.

A gyors növekedést tehát a worktree-khez kapcsolódó dependency-fa és a megőrzött Next candidate/release build outputok halmozódása okozta.

## 2. Új központi retention motor

Új fájlok:

- `config/dimpro-dev-storage-retention.json`
- `scripts/dimpro-dev-storage-retention.mjs`
- `scripts/dimpro-dev-storage-retention.sh`
- `scripts/dimpro-create-dev-worktree.sh`
- `scripts/dimpro-dev-storage-retention-contract.mjs`

A retention motor alapértelmezetten dry-run. Önálló apply esetén a meglévő központi `maintenance` lockot használja.

## 3. Lemezszint-fokozatok

Konfiguráció:

- warning: 85% használt lemez;
- critical: 92%;
- emergency: 97%;
- cél: legalább 20 GiB szabad hely.

Build korhatár:

- normál retention: 24 óránál régebbi build;
- critical állapotban: 6 óránál régebbi build;
- emergency állapotban: 2 óránál régebbi build.

Minden worktree-ben legalább a 3 legfrissebb `.next*` build védett marad.

## 4. Kötelező védelmek

Automatikusan nem törölhető:

- `active-next-release` által mutatott build;
- PM2 `NEXT_DIST_DIR` által használt build;
- opcionális `rollback-next-release` által mutatott build;
- aktív központi build lock `target` könyvtára;
- worktree-nként a három legfrissebb build;
- konfigurációban név szerint védett build, jelenleg `.next`;
- backup;
- artifact;
- teljes Git worktree.

A script apply módban csak `/srv/dimpro-dev` alatt hajlandó dolgozni. Nem-DEV cél fail-closed.

## 5. `node_modules` szabály

A dependency-fa automatikusan nem törölhető.

Deep prune csak explicit `--prune-dependencies` módban lehetséges, és csak ha egyszerre teljesül:

- nem operator worktree;
- valódi könyvtár, nem symlink;
- worktree clean;
- HEAD valamely canonical refbe beolvadt;
- legalább 72 órája inaktív;
- nincs futó processz a worktree alatt;
- nincs aktív koordinált művelet;
- a dependency marker nem megosztott hardlink-csoport.

A hardlinkelt dependency-k V1-ben védettek.

## 6. Új worktree szabály

Új helper:

`scripts/dimpro-create-dev-worktree.sh <branch> <worktree-name> [base-ref]`

Azonos `package-lock.json` esetén nem készít új 1,3–1,5 GB-os dependency másolatot, hanem az operator `node_modules` könyvtárára symlinket hoz létre.

Eltérő lockfile esetén dependency nincs automatikusan létrehozva; ekkor külön dependency telepítés szükséges.

A szabály bekerült az `AGENTS.md` fejlesztői utasításai közé, így az AI fejlesztők számára is normatív.

## 7. Automatikus post-build retention

A `scripts/dimpro-coordinated-build.sh` sikeres Next build és standalone asset-előkészítés után meghívja:

`node scripts/dimpro-dev-storage-retention.mjs --post-build --apply-builds --quiet`

A post-build automata csak akkor töröl, ha a lemezhasználat eléri a warning küszöböt.

A post-build cleanup kizárólag eligible `.next*` build outputokat érint. Dependency deep prune, backup, artifact és worktree törlés nem történik.

A funkció szükség esetén ideiglenesen kikapcsolható:

`DIMPRO_AUTO_STORAGE_RETENTION=0`

## 8. Package parancsok

- `npm run storage:retention:dry-run`
- `npm run storage:retention:apply-builds`
- `npm run storage:retention:deep-report`

A tényleges dependency prune külön explicit CLI flaget igényel; package script alapból nem indítja el.

## 9. Contract

`scripts/dimpro-dev-storage-retention-contract.mjs`

Eredmény: `24/24 PASS`.

Igazolt többek között:

- dry-run nem töröl;
- active release védett;
- legfrissebb buildjeink védettek;
- `.next` védett;
- másik AI aktív cross-worktree build targetje védett;
- apply csak eligible buildet töröl fixture-ben;
- apply DEV-en kívül fail-closed;
- backup inventory-only;
- dependency explicit gate;
- hardlink dependency védett;
- standalone apply maintenance lockot használ;
- post-build automata be van kötve;
- worktree helper lockfile hash alapján symlinkel;
- AGENTS normatív szabály frissült.

## 10. Valódi DEV dry-run 2026-08-16

A legutóbbi valódi dry-run 98–99%-os lemezhasználat mellett:

- eligible régi build: 20 db;
- becsült build reclaim: kb. 11,38 GB;
- explicit deep-prune dependency jelölt: 4 db;
- dependency reclaim becslés: kb. 5,05 GB;
- backup automatikus törlés: 0;
- artifact automatikus törlés: 0;
- worktree automatikus törlés: 0.

A dry-run során fájltörlés nem történt.

## 11. Operációs szabály

A normál jövőbeli működés:

`új worktree helperrel -> shared node_modules, ha kompatibilis -> koordinált build -> post-build retention -> aktív/rollback/newest build védelem`

Ha a post-build build-retention nem elég és a lemez továbbra is kritikus, a deep dependency prune csak külön karbantartási műveletként indítható.

A teljes worktree-k és backupok életciklusára később külön V1.1 retention policy készíthető, de V1.0-ban szándékosan report-only maradnak.

## 12. Operator integráció és első valós maintenance

Operator integrációs commit:

`77fb514ce357a2beb4472ba31df25a4253b167cb`

Az integráció után az operatoron ismét lefutott:

- ESLint az új retention scriptekre: 0 error / 0 warning;
- shell syntax ellenőrzés: PASS;
- Storage Retention contract: `24/24 PASS`;
- valódi DEV dry-run: 20 régi build / kb. 11,38 GB eligible.

Az első tényleges build-only maintenance a központi `maintenance` lock alatt futott.

Eredmény:

- lemezhasználat: `98% -> 89%`;
- szabad hely: `2,33 GB -> 12,67 GB`;
- törölt régi `.next*` build: `20 db`;
- törölt `node_modules`: `0 db`;
- törölt backup: `0 db`;
- törölt artifact: `0 db`;
- törölt worktree: `0 db`.

A maintenance után az aktív runtime változatlanul elérhető maradt:

- pointer: `.next-benjadmin-v13-pwa-subscription-final`;
- build: `BDgezeB9qEAmoq06oP0Ku`;
- PM2: online;
- unstable restart: `0`.

A post-maintenance dry-run régi buildből `0` további eligible jelöltet mutatott. A deep dependency rétegben 4 explicit jelölt / kb. 5,05 GB maradt, de ezeket V1 automatikusan nem törli.

## 13. Közös baseline szabály

A retention commitot az operator integráció után a közös `integration/benjadmin-dev` refbe is fast-forward módon kell előrehozni. Ezzel minden későbbi, erről a baseline-ról induló AI-worktree örökli:

- az `AGENTS.md` storage szabályt;
- a worktree helper symlink logikát;
- a post-build build-retentiont;
- a fail-closed cleanup gate-eket.
