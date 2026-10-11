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
