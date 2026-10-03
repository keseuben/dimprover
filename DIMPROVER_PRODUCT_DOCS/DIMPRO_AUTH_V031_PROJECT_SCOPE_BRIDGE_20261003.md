# DIMPRO AUTH V0.3.1 – Project Core → központi AUTH project-scope bridge

Állapot: DEV ONLY · PROD DENY

## Cél

A DIMPRO Drive projektmeghívás felhasználói oldalon a meglévő Project Core projektazonosítót használja. A központi AUTH viszont saját UUID project-scope rekordokkal dolgozik. A V0.3.1 bridge a két azonosítót egyértelműen összeköti az `auth_projects.external_project_id` mezőn keresztül.

## Biztonsági modell

A bridge kétlépcsős ellenőrzésre épül:

1. A HTTP/service rétegnek előbb igazolnia kell a Project Core `project.manage_members` jogosultságot az adott külső projektre.
2. A DB `auth_register_project_scope` függvénye külön megköveteli az aktív központi DIMPRO identityt és az aktív `drive.access` jogosultságot.

A DB függvény soha nem fogad külön célfelhasználót: kizárólag a hitelesített actor kaphat `DRIVE_PROJECT_MANAGER` grantot a bridge létrehozásakor. Ezzel a scope bootstrap nem használható más személy projektjogának önkényes kiosztására.

## Viselkedés

- Új Project Core projekt esetén létrejön egy központi `auth_projects` rekord az external project ID-val.
- Már ismert projektnél ugyanaz a központi scope kerül visszaadásra.
- `DISABLED` AUTH projektscope nem aktiválható újra automatikusan.
- Az actor a scope létrehozásakor projektmenedzseri central AUTH grantot kap, hogy a meghívásokat kezelhesse.
- A bridge esemény `PROJECT_SCOPE_REGISTER` auditként bekerül a központi AUTH auditnaplóba.
- Az engedélyezett külső projektek listája csak aktív, nem visszavont `drive.project.access` grantokból épülhet.

## DEV állapot

- Migration 005 (`V0.3 invitation-only scopes`): DEV DB-re alkalmazva, ledger checksum egyezik a forrásfájllal.
- Migration 006 (`V0.3.1 project-scope bridge`): SQL transaction/ROLLBACK validation PASS; APPLY még külön végrehajtandó.
- AUTH V0.2.1 security contract: 56/56 PASS.
- AUTH V0.3 invitation contract: 25/25 PASS.
- AUTH V0.3.1 project-scope contract: 8/8 PASS.
- Isolated AUTH TypeScript gate: PASS.
- Targeted ESLint: PASS.

Következő lépés: migration 006 DEV APPLY, majd a Drive-integrációs rétegben a központi app session bekötése a Project Core auth resolverbe és a meghívás létrehozásakor kötelező `project.manage_members` ellenőrzés.
