# DIMPRO BENJADMIN B3 M3.5 – source/release reconciliation – 2026-08-10

## Kiinduló probléma

A PROD  Git working tree történelmileg nem volt kanonikus release-forrás:

- branch: 
- Git HEAD: 
- commit dátuma: 2026-05-14
- módosított tracked fájl: 41
- untracked fájl: kb. 2695

Az élő runtime ugyanakkor nem ebből a Git HEAD-ből, hanem verziózott  release buildből fut.

## Aktív PROD release

- PM2 process: 
- aktív : 
- BUILD_ID: 
- runtime Drop verzió: 

Ezért a PROD rendezetlen working tree nem tekinthető további fejlesztési alapnak.

## Git branch lineage

A DEV bare repository alapján:



A  commit a  ág őse.

A BENJADMIN M3/M3.5 szintén M2-ből ágazott le, ezért az integráció helyes képlete:



## Új kanonikus integrációs ág

Branch:


Worktree:


Kiinduló commit:
 – DROP v1.2.12 production release

BENJADMIN M3.5 merge source:


Merge commit:


A merge konfliktus nélkül sikerült.

## Integrációs kapuk

- 
added 644 packages, and audited 645 packages in 48s

182 packages are looking for funding
  run `npm fund` for details

11 vulnerabilities (1 low, 10 high)

To address issues that do not require attention, run:
  npm audit fix

To address all issues possible, run:
  npm audit fix --force

Some issues need review, and may require choosing
a different dependency.

Run `npm audit` for details.: PASS
- TypeScript: PASS
- teljes lint: 0 error / 108 örökölt warning
- production build: PASS
- build ID: 
- standalone asset check: 141/141

Candidate port: 

Candidate ellenőrzés:
- Admin: HTTP 200
- BENJADMIN engine: schema , READY, 20/20 tábla
- DROP: , OK
- Identity: enabled=true, ready=true, errors=[]
- : HTTP 200
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

A  branch most még nem frissítendő közvetlenül, mert előbb az integrációs ág DEV runtime validációja szükséges.

Javasolt további sorrend:

1. integrációs branch DEV aktiválás
2. DEV smoke + néhány órás stabil használat
3. branch protection / release policy rögzítés
4. új canonical main/release branch kialakítás
5. csak ezután későbbi PROD deploy az új pipeline-ból

## Következő fejlesztési lépés

A szerver- és forrásalap stabilizálása után következhet a **BENJADMIN Operator UI 2.0**, már ezen a kanonikus integrációs ágon.
