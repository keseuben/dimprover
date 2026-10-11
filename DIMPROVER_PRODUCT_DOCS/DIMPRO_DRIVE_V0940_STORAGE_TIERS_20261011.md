# DIMPRO Drive V0.9.40 – módosított tárhelylépcsők

Dátum: 2026-10-11.
Állapot: SOURCE CANDIDATE, nem telepített, nem publikus csomagkínálat, nincs ár, nincs tényleges quota-változás, PROD DENY.

## Felhasználó által megadott pontos méretek

| Licenctípus | Méretek (GiB) | Cél |
| --- | --- | --- |
| Saját Drive | 5, 10, 25, 50, 100, 250, 500 | Személyes dokumentumtár |
| Projekt Drive | 5, 10, 25, 50, 100, 250, 500 | Közös projektfájlok, verziók, külsős résztvevők |
| Projektkapu | Alap, Pro, Enterprise | Projektirányítás, modulok, felhasználók, munkafolyamatok |

A hét méret a DRIVE külön tárhelykapacitás-opciója, nem automatikus funkciócsomag vagy résztvevői jogosultság. Projekt Drive esetén a tagkeret még nincs meghatározva (NULL). Saját Drive esetén a tervezeti keret 1 személy. A Projektkapu Alap/Pro/Enterprise külön modulcsomag marad, nem jár hozzá automatikusan önálló Drive-tárhelykvóta.

## Kódmódosítások

- app/lib/license/planCatalogDrafts.ts: hét személyes és hét projekt tárhelylépcső, továbbá három változatlan Projektkapu tervezet. A régi tervezeti csomagkódok (5/25/100 személyes és 25/100/500 projekt) megőrzve; a felületen egyértelmű GiB méret jelenik meg.
- db/auth/migrations/017_auth_v054_license_plan_catalog_drafts.sql: a még nem alkalmazott 017-es migráció seedje 9-ről 17 DRAFT rekordra módosítva. Mind nem publikus, díj nélküli, nem jóváhagyott. A valódi licencrekordokhoz vagy a tényleges kvótákhoz nem nyúl.
- components/license/PlanDraftCatalogue.tsx és .module.css: laptopbarát 7 méretből választható gombsor, alatta egyetlen részletező kártya. 750 px alatt 4, 425 px alatt 3 oszlopos méretválasztás; a Projektkapu három csomagkártyája megmarad. A gombok aria-pressed attribútummal jelzik a kijelölést.
- components/drive/driveBuildInfo.ts: következő DEV source candidate V0.9.40, nem telepített runtime verzió.
- scripts/tests/drive-license-plan-catalog-contract.mjs és drive-plan-draft-catalog-pglite.mjs frissítve a teljes 17 rekord és a független funkció/seat elv ellenőrzésére.

## Fontos régi működési alapértékek

A Saját Drive Content Core aktuális forrásbeli alapértéke 50 GiB. A Projekt Drive Storage Core aktuális forrásbeli alapértéke 10 GiB, környezeti felülírás lehetséges. Ezek változatlanok. Nem csökkentünk csendben egyetlen meglévő keretet sem; dokumentum nem kerül törlésre. Az 500 GiB javaslat nem jelent fizikai szerverkapacitás-garanciát.

## Következő üzleti lépések

A szerver, mentés, verziótár, letöltési forgalom és ügyféltámogatás várható költsége alapján kialakítandó külön havi/éves díjak. A funkció-/moduljogosultságok, csapatlétszám és tárhelyméret külön kapcsolása, régi ügyfelek kvótáinak védelme. A Projektkapu és a Drive közös fájlja ne kerüljön kétszer fizikai tárolásra vagy üzleti elszámolásra.

Nem történt DEV/PROD deploy, AUTH migráció, SMTP, fizetős licenckiadás vagy korlátaktiválás. PROD DENY.

## BUILD01 – teljes fordítás ellenőrizve

- Run ID: license-capacity-v0940-af4eef006-20261011-build01-b1
- Forráscommit: af4eef0067f70527c80fd09f2db59e934e7e9192
- Teljes BUILD01 állapot: PASS, TypeScript PASS, 104/104 oldal, 274 standalone chunk.
- Build ID: f8xi0nGgbm1e9z_TpXK-E
- Artifact SHA-256: 676caa118f7833dfa4f697167ec0b85c2749391e38fba5d5fe60acffc8265399
- A tényleges artifact SHA, a BUILD gateway státusz és a metaadat SHA megegyezik.
- Artifact méret kb. 92 MiB, BUILD01 tárolva, nem telepítve.
- Forráscontract 30/30, izolált PostgreSQL 18/18, TypeScript és célzott ESLint PASS.
- A működő DEV-t nem módosítottuk. Ellenőrzött DEV header: c74326afd, Drive V0.9.33; szabad lemez kb. 1.7 GiB, 99% foglaltság.
- DEV/PROD deploy, DB migráció, kvótaátrendezés, licenckiadás nem történt. PROD DENY.
