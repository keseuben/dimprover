# DIMPRO Drive V0.9.34 – BUILD01 candidate előkészítés

Dátum: 2026-10-10. PROD DENY. A működő DEV V0.9.33 nem módosítható a build ellenőrzésével.

## Elvégzett preflight
- A V0.9.34 értesítési tervező/preview/ACL/queue/cursor forrása Gitben van.
- Kijavítva: a központi Drive core által előállított DOCUMENT_CREATED eseményt az értesítési osztályozó most NEW_DOCUMENT típusnak fogadja el.
- A dokumentum verzió/revízió és jóváhagyás külön marad.
- A BUILD01-en nagy tárhely áll rendelkezésre; az ellenőrző build a központi BUILD Transport Gateway infrastruktúrán történhet.
- Egyik BUILD szerveren sem érhető el jelenleg telepített PostgreSQL tesztszerver; SQL integrációs PASS nem állítható.
- Kötelező migrációk külön jóváhagyásig nincsenek futtatva.
- DRIVE_DIGEST_SENDING_RELEASED=false; PRODUCER_RELEASED=false.

## Teljes build utáni ellenőrzés szükséges
- Build artifact SHA256 + BUILD_ID + git commit+runner egyezés.
- Bejelentkezett Drive UI QA: dokumentumnév, fájltípus, szakág/témakör, lapozás, követés, avatar, értesítési előnézet, audit.
- SQL sandbox migráció és ACL E2E eredmény szükséges aktiválás előtt.
- A gateway build PASS nem jogosít automatikus DEV/PROD telepítésre.
