# V0.9.43 – DIMPRO terméktopológia és licenclekérdezési alap, source-only

Állapot: forrásjelölt, PROD DENY, nincs DEV/PROD deploy vagy DB migráció.

Hivatalos architektúra és scope-ok: DIMPRO_PRODUCT_ARCHITECTURE.md.
Az öt fő szint DIMPROONE, DIMPRO WORK, DIMPRO Projektkapu, DIMPRO BUILD, DIMPROVER. A Drive közös szolgáltatás, nem hatodik szint.

Forrásban elkészült:
- a 6 elemű terméktopológiai kódregiszter és a read-only PostgreSQL katalogizáló 018 migráció;
- a jelenlegi Drive/Projektkapu licenc-rekordok kizárólag olvasási és szigorú dátum/állapot kiértékelése;
- project.read szerveroldali kapu az új GET /api/projects/[projectId]/licenses/readiness endpointon;
- a központi Licencközpont áttekintő panelje.

A BUILD és DIMPROVER fizetős projektlicenc-forrása még FUTURE_PRODUCT; a ONE és WORK személy/szervezet scope-jának separate kereskedelmi motorja nincs meg. Hiányzó licenctáblánál SOURCE_NOT_CONFIGURED, ACTIVE_RECORD_ONLY esetén sem változik semmilyen ACL, quota vagy fizetési jogosultság.

A 018 migráció csak izolált PGlite teszttel ellenőrzött. Nem futott valódi AUTH-adatbázison; az új termékek nem lesznek automatikusan aktívak vagy megvásárolhatóak.

Ellenőrzendő: TypeScript, ESLint, PGlite product catalog seed/permission, termék/scope contract, mock API tenant isolation, 014–017 regresszió és BUILD01 teljes Next.js build. A build sikerességét később dokumentáljuk.

## BUILD01 ellenőrzött kiadásjelölt – 2026-10-11

- Build run: dimpro-product-v0943-536b614e8-20261011-build01-b1.
- Forráscommit: 536b614e8039f5d22ed57c267b0c51b6fd730d39.
- BUILD01 Next.js teljes build: PASS, TypeScript PASS, 104/104 statikus oldal, 274 standalone chunk.
- Build ID: j2RnGs-FNCCPMz5d99zeS.
- Artifact SHA-256: e713f22d2df35ced1f71e49819f930fe353194ac655580dceae0c4f260ff72a1.
- A BUILD gateway metadata és a fizikailag olvasott artifact ellenőrzőösszege egyezik.
- QA: terméktopológia contract 25/25, isolated PostgreSQL termékkatalógus 12/12, read-only licencértékelés 35/35, tenant-szeparált PostgreSQL 10/10, route ACL/API mock 11/11, korábbi 14/14 Drive értesítési tesztcsoport, 30/30 csomagkatalógus, 28/28 ármodell, 33/33 életciklus, 15/15 admin hard release gate, 21/21 Drive/Projektkapu ACL PASS; TypeScript és ESLint PASS.
- Futó DEV rendszeren nem történt telepítés, PM2 módosítás vagy DB migráció. DEV ellenőrzéskor 1,5 GiB szabad hely, 99% foglaltság.
- PROD DENY változatlan, nem történt valódi jogosultságkiosztás, fájltörlés vagy számlázás.

## Következő implementációs fázis

A USER-scope (DIMPROONE és Saját Drive) kereskedelmi jogalany összerendelése hiteles AUTH user UUID alapján, azt követően a WORK/DIMPROVER ORGANIZATION-scope licenc és a BUILD PROJECT-scope kiterjesztése. Ezek NEM részei a V0.9.43 forrásjelöltnek; külön PGlite/ACL/DBA/számlázási review és release engedély szükséges.
