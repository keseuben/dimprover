# DIMPRO Drive V0.9.37 – külön projektlicenc

Dátum: 2026-10-11
Állapot: SOURCE CANDIDATE / NINCS TELEPÍTVE / NINCS DB MIGRÁCIÓ / NINCS SMTP / PROD DENY.

## Licenctípusok

- Saját Drive: személyes munkatér és személyhez tartozó tárhely/előfizetés.
- Projekt Drive: projektenként önálló licenc, külön projekttárhely, projektcsomag és előfizetés. A fizető fél lehet magánszemély vagy vállalkozás.
- Külső projektmeghívott (műszaki ellenőr, tervező, kivitelező, megtekintő) működhet a projektlicenc alatt saját fizetős projektlicenc nélkül, megfelelő aktív Project Core és mappa-/dokumentum ACL-lel.
- Egy felhasználó több projekt tagja lehet, saját Drive licence nélkül. A meghívotti szerep nem jelent automatikusan előfizetést.

## Elkészült fejlesztési forrás

- AUTH DB migration 014_auth_v051_drive_project_licenses.sql: projektazonosítóhoz egy aktuális központi licencrekord; license code, plan, payer USER/ORGANIZATION, időtartam, tárhelykeret, résztvevői keret, approval, revision, optional legacy license UUID; auditálás, hard delete tiltás.
- A migráció nem hoz létre aktív licenceket és nem aktivál belépési vagy tárhely-korlátot. Admin felületből nem lehetséges automatikus felülírás, a runtime DB-nek kizárólag SELECT van.
- GET /api/projects/{projectId}/drive/license: szerveroldali project.read kapu. Licencazonosító és payer type csak project.manage_members ÉS project.update jog birtokában jelenik meg.
- Hiányzó AUTH táblánál NOT_CONFIGURED, hiányzó projektrekordnál NOT_ASSIGNED (nem ACTIVE). Az aktuális projectId stabil Project Core → AUTH external_project_id kapcsolaton keresztül illeszkedik, e-mail alapú automatikus párosítás nélkül.
- A projektfejlécen Projektlicenc ikongomb, laptop méretben csak ikon; a /drive/licenc?project=... felület adott projektre váltva jelenik meg.
- A Licenc és előfizetés felület új projektlicenc kártyája megmutatja a státuszt, csomagot, szerződéses tárhely- és résztvevői keretet, érvényességet; a fizető típusa és license code csak projektkezelőnek látszik. A két eltérő quota-forrás külön szerepel.
- A projekt kezelője admin@dimpro.hu címre kézi e-mailben kérhet projektlicencet vagy bővítést. Nincs backend SMTP vagy automatikus licencaktiválás.
- Drive Súgó új önálló projektlicenc fejezettel frissítve.
- A következő fejlesztési candidate UI verzió V0.9.37, de a működő DEV továbbra is korábbi runtime; a verzió nem telepített.

## Korlátozások és release gate

- A projekttagság, projekt ACL, dokumentumtár, Drive storage quota motor és korábbi admin Licencközpont nem lett módosítva.
- A fizetett licenc lejárata soha nem törölhet dokumentumot. Grace period, read-only mód, export, archiválás, megújítás a későbbi jóváhagyott üzleti szabály része.
- A központi admin Licencközpont és a saját PostgreSQL AUTH license rekord tényleges szinkronja, számlázás, díj, felhasználói limit enforcement még NINCS készen.
- Aktiválás előtt AUTH DBA review, szerepkör- és tenant izoláció E2E, projekt tulajdonos/szerepkör, adatmigráció, kézi jóváhagyási és visszavonási admin workflow, BUILD01 és laptopos vizuális QA szükséges.
- Egyedi fizetős csomagokat, árakat, dátumokat vagy jogosultságot nem találtunk ki, meglévő licencet automatikusan nem rendeltünk projekthez.
- Minden művelet DEV forráson történt, nincs migráció futtatás, SMTP küldés, DEV/PROD deploy vagy más destruktív művelet.

## QA

- 17/17 Projektlicenc contract teszt PASS.
- 12/12 izolált PGlite PostgreSQL migráció teszt PASS: no-seed, payer-constraint, approval, egy-projekt-egy-licenc, audit, monoton revízió, immutable hard-delete, SELECT-only app role.
- TypeScript noEmit és célzott ESLint PASS.
