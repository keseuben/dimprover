# DIMPRO BENJADMIN B3 M3.5 – source/release reconciliation – 2026-08-10

## Kiinduló probléma

A PROD `/root/dimprover` Git working tree történelmileg nem volt kanonikus release-forrás:

- branch: `main`
- Git HEAD: `12cea45f7e942809015f4c6613898d75eb6c3e2d`
- commit dátuma: 2026-05-14
- módosított tracked fájl: 41
- untracked fájl: kb. 2695

Az élő runtime ugyanakkor nem ebből a Git HEAD-ből, hanem verziózott `.next-*` release buildből fut.

## Aktív PROD release

- PM2 process: `dimprover`
- aktív `NEXT_DIST_DIR`: `.next-drop-v1212-release-final`
- BUILD_ID: `DAcj-ZwTkKDHf3repNMgZ`
- runtime Drop verzió: `DROP 1.2.12`

Ezért a PROD rendezetlen working tree nem tekinthető további fejlesztési alapnak.

## Git branch lineage

A DEV bare repository alapján:

`M2 → HAGE/Identity v0.2.1 → DROP v1.2.12`

A `feat/hage-org-license-v020` commit a `fix/drop-v1212-ios-sendmail` ág őse.

A BENJADMIN M3/M3.5 szintén M2-ből ágazott le, ezért az integráció helyes képlete:

`DROP v1.2.12 + HAGE/Identity → merge BENJADMIN M3/M3.5`

## Új kanonikus integrációs ág

Branch:
`integration/prod-v1212-benjadmin-m35`

Worktree:
`/srv/dimpro-dev/worktrees/integration-prod-v1212-benjadmin-m35`

Kiinduló commit:
`29837db970b2a0b93a5f1a5f63541431b29f60f7` – DROP v1.2.12 production release

BENJADMIN M3.5 merge source:
`infra/benjadmin-b3-m35-storage-stabilization`

Merge commit:
`456e6965d752369d49234d6822464e4750ed4a0d`

A merge konfliktus nélkül sikerült.

## Integrációs kapuk

- `npm ci`: PASS
- TypeScript: PASS
- teljes lint: 0 error / 108 örökölt warning
- production build: PASS
- build ID: `fj_YbnZkxiHiBDNt5FyIB`
- standalone asset check: 141/141

Candidate port: `3401`

Candidate ellenőrzés:
- Admin: HTTP 200
- BENJADMIN engine: schema `0.3.0`, READY, 20/20 tábla
- DROP: `DROP 1.2.12`, OK
- Identity: enabled=true, ready=true, errors=[]
- `/account/meghivas`: HTTP 200
- M3 orchestration acceptance: **49/49 PASS**

## Source-of-truth döntés

A további fejlesztési szabály:

1. PROD working tree nem fejlesztési forrás.
2. Fejlesztés kizárólag DEV Git worktree-ben történik.
3. Az új közös alap az integrációs branch vagy annak későbbi utódja.
4. Build kizárólag koordinált DEV buildből készül.
5. PROD csak ellenőrzött build artifactot kap.
6. PROD közvetlen source-edit tiltandó.
7. Minden modul külön task + branch + worktree + scope alatt dolgozik.
8. PROD deploy előtt backup + candidate + gate + rollback build kötelező.

## PROD main későbbi rendezése

A `main` branch most még nem frissítendő közvetlenül, mert előbb az integrációs ág DEV runtime validációja szükséges.

Javasolt további sorrend:

1. integrációs branch DEV aktiválás
2. DEV smoke + stabil használat
3. branch protection / release policy rögzítés
4. új canonical main/release branch kialakítás
5. csak ezután későbbi PROD deploy az új pipeline-ból

## Következő fejlesztési lépés

A szerver- és forrásalap stabilizálása után következhet a **BENJADMIN Operator UI 2.0**, már ezen a kanonikus integrációs ágon.

## DEV kanonikus runtime aktiválva

Az integrációs branch sikeres candidate validációja után a DEV 3100-as runtime átállt az új kanonikus forrásra.

Aktív DEV process:
- `dimpro-integrated-dev`
- port: `3100`
- source worktree: `/srv/dimpro-dev/worktrees/integration-prod-v1212-benjadmin-m35`
- branch: `integration/prod-v1212-benjadmin-m35`

Rollback:
- `dimpro-benjadmin-m1-dev` leállított PM2 processként megmaradt
- korábbi candidate processzek leállítva
- PM2 processlista `pm2 save` művelettel mentve

Aktiválás utáni health:
- Admin: 200
- DROP: 200 / `DROP 1.2.12`
- Identity: 200 / ready=true / enabled=true
- meghívó oldal: 200
- BENJADMIN engine: 200 / schema 0.3.0 / READY / 20 tábla

Ettől a ponttól a DEV további fejlesztési alapja az integrációs ág, nem a régi M1 worktree.
