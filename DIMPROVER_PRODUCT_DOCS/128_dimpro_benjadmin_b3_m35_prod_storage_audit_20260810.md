# DIMPRO BENJADMIN B3 M3.5 – PROD storage audit – 2026-08-10

## Mód

- PROD: read-only audit
- törlés: nem történt
- restart/deploy: nem történt
- cél: a 93%-os PROD root lemezfoglaltság okainak feltárása és biztonságos cleanup terv előkészítése

## Szerverállapot

- PROD root disk: 78 GB / 69 GB használt / 5.4 GB szabad / 93%
- DEV root disk: 118 GB / 13 GB használt / 99 GB szabad / 12%
- DB root disk: 78 GB / 2.5 GB használt / 72 GB szabad / 4%
- DB PostgreSQL: active

## PROD fő foglalási okok

`/root/dimprover`: kb. 37 GB

Ezen belül:
- `.next-*` build artifactok: 16.71 GB
- ebből read-only planner szerint cleanup candidate: 14.61 GB
- `backups`: 12.02 GB
- `.dimprover/backups`: 1.19 GB
- `node_modules`: kb. 1.3 GB
- aktív `.next`: kb. 185 MB

## Aktív PROD build

PM2 `dimprover`:
- cwd: `/root/dimprover`
- `NEXT_DIST_DIR=.next-drop-v1212-release-final`

Az aktív build ezért kötelezően protected:
- `.next-drop-v1212-release-final`

A planner alapból a `.next` könyvtárat is protectedként kezeli.

## Friss build hold

A 24 órás hold miatt jelenleg nem cleanup candidate:
- `.next-identity-v021-release-final`
- `.next-identity-v020-release-final`

## Régi build cleanup candidate

A planner legalább 24 órás, nem protected `.next-*` könyvtárakat cleanup candidate kategóriába tesz.

Becsült összes reclaimable terület: **14.61 GB**.

Fontos: ez csak jelölt lista. A planner nem tartalmaz törlési funkciót.

## Rollback pointer probléma

A planner **58 stale rollback pointert** talált: a pointerfájl még létezik, de a hivatkozott `.next...` rollback könyvtár már nincs meg.

Ez nem azonnali runtime hiba, de a release/rollback metadata rendezését szükségessé teszi.

## Backup réteg

Helyi backup összesen kb. 13.2 GB:
- `/root/dimprover/backups`: 12.02 GB
- `/root/dimprover/.dimprover/backups`: 1.19 GB

Nagyobb elemek között:
- `backups/full-snapshots`: kb. 3.1 GB
- `backups/drop_v100_private_pilot_20260806_170102`: kb. 2.4 GB
- több száz MB-os régi production/projectgate backup
- sok 50–55 MB-os Fájlműhely backup

A backup könyvtárak automatikusan nem törölhetők. Előbb retention szabály, offsite Restic ellenőrzés és rollback igény szükséges.

## Elkészült read-only planner

Fájl:
`scripts/benjadmin-storage-audit.mjs`

Tulajdonságok:
- csak olvas
- `du -sk` alapú méretmérés
- `.next*` build inventory
- protected build lista
- min-age-hours szabály
- cleanup-candidate / recent-hold / protected kategória
- rollback pointer beolvasás
- stale rollback pointer felismerés
- backup méret riport
- JSON és emberi olvasható kimenet
- nincs delete / move / restart / deploy funkció

## Javasolt következő biztonságos cleanup sorrend

1. friss PROD backup és offsite snapshot ellenőrzés
2. aktív build + legalább egy valid rollback build kijelölése
3. stale rollback pointerek rendezési terve
4. 24 óránál régebbi, nem protected `.next-*` build artifactok eltávolítása
5. disk usage újramérés
6. csak ezután helyi backup retention audit
7. release/rollback pointer rendszer egységesítése
8. DEV/PROD branch reconciliation
9. BENJADMIN Operator UI 2.0

## Párhuzamos HAGE fejlesztés

HAGE-INVEST / OneDrive munkatér közben fejleszthető külön BENJADMIN task + branch + worktree + scope alatt.

A PROD 93%-os lemezhasználat miatt addig kerülendő:
- új nagy PROD build artifactok felhalmozása
- párhuzamos PROD deployok
- koordinálatlan migration/restart

A kódolás és DEV candidate munka folytatható, mert a DEV lemezhasználata jelenleg 12%.

## PROD build cleanup végrehajtva

Jóváhagyás után a guarded cleanup executor koordinált `maintenance` lock alatt lefutott.

Előfeltételek:
- friss PROD Restic backup: `bc20c84b`
- backup repository check/prune: PASS
- aktív build: `.next-drop-v1212-release-final`
- azonnali rollback build: `.next-v1211-release-final`
- friss Identity hold: `.next-identity-v020-release-final`, `.next-identity-v021-release-final`
- normál `.next` protected

Dry-run:
- cleanup candidate: 23 buildkönyvtár
- becsült reclaim: 13.98 GB

Apply eredmény:
- eltávolított régi build: 23/23
- felszabadított terület: 13.98 GB
- PROD lemezhasználat: **93% → 74%**
- szabad terület: kb. **5.4 GB → 20 GB**
- aktív PM2 `dimprover`: online
- aktív `NEXT_DIST_DIR`: változatlan `.next-drop-v1212-release-final`
- Drop HTTPS health: 200 / `DROP 1.2.12`
- License admin HTTPS: 200

A teljes smoke-check TypeScript része a PROD kis memóriája miatt először ~2 GB Node heap OOM-mal, majd 4 GB heap mellett túl hosszú futással állt meg. A hosszú typecheck folyamatot leállítottuk; az alkalmazás runtime végig online maradt. A további TypeScript/build kapuk DEV-en futnak.

További helyi backup törlés **nem történt**. A 74%-os lemezhasználat már megfelelő biztonsági tartalékot ad, ezért a backup-retention külön későbbi, dokumentált döntés marad.
