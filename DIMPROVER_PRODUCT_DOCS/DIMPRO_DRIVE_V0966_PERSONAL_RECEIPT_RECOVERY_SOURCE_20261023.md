# DIMPRO Drive V0.9.66 – személyes feltöltési visszaellenőrzés böngésző-újraindítás után

**Dátum:** 2026-10-23. **Scope:** közös DIMPRO Drive, Saját Drive + Transfer Center.
**Állapot:** SOURCE + teszt; **nem fut a publikus DEV-ben**. PROD DENY.

## Mi készült el?

1. Új, read-only, központi auth-ra és személyes Drive ACL-re épülő
   `GET /api/drive/personal/uploads/recovery-scope` útvonal. Sikeres DEV-only
   ellenőrzés után a hitelesített központi `userId`-ból SHA-256-tal
   származtatott, stabil, 64 karakteres átlátszatlan recovery namespace-t
   ad vissza. Ez **nem jogosultsági token**; az egyes feltöltések állapotát
   továbbra is a V0.9.65 owner-scoped, hitelesített status API vizsgálja.
   A hash nem használható titkosításra vagy önálló hitelesítésre.
2. Új `app/lib/transfer-core/personalReceiptStorage.ts`: böngészőnkénti
   `localStorage` jegyzék, kizárólag `requestId`, `sizeBytes`, `startedAt`
   mezőkkel. Sem fájltartalom, sem fájlnév, sem felhasználói email,
   sem token, presigned URL vagy mappaútvonal nem kerül a sorokba.
   Verziózott schema, UUID és méretvalidáció, maximum 500 bejegyzés/fiók,
   7 napos lejárat, duplikációszűrés, hibás JSON és quota/exceptions
   fail-closed kezelése. A Drive betöltésekor a lejárt helyi hint-ek
   fizikailag törlődnek a böngészőből; **semmi szerveroldali fájl nem törlődik**.
3. Az `PersonalDriveWorkspace.tsx` a személyes upload engedélyezése
   mellett a recovery scope beérkezését és a helyi tárhely működését is
   megköveteli. A request ID megőrzése **minden egyes XHR küldése ELŐTT**
   szinkron módon történik. Ha a helyi tárolás nem lehetséges, az adott
   feltöltési POST **nem indul el**.
4. Biztosan sikeres HTTP 2xx ACK vagy bizonyosan visszautasított/fel sem
   adott kérés után csak a saját lokális sor kerül elhagyásra. HTTP 5xx,
   megszakítás vagy hálózati válaszvesztés után a receipt-hint megmarad.
5. Böngésző újranyitása, azonos belépett felhasználó:
   a mentett azonosítókból kizárólag generic
   `Korábbi feltöltés · <UUID prefix>` sorok keletkeznek
   `CONFIRMATION_UNKNOWN` státusszal. Fájltartalom és eredeti fájlnév
   nincs betöltve, a feltöltés **NEM indul automatikusan újra**.
   A V0.9.65 `Ellenőrzés` gomb csak hitelesített GET-et hív; VERIFIED_CLEAN
   + egyező byte-méret és teljes S3 SHA-256 bizonyítása után lesz AVAILABLE,
   és ekkor a helyi hint is kikerül.
6. Fiókváltáskor töröljük az előző fiók látható transfer-listáját,
   megszakítjuk az aktuális böngészős kéréseket, és a korábbi scope
   függő sorának további feldolgozását és UI-értesítését tiltjuk.
   Az előző fiók ellenőrzési hintjei a **saját** helyi névterükben
   továbbra is megmaradnak, a másik fiókban nem jelennek meg.
7. A korábbi 500-fotós kijelölés és 100 MiB/fájl maximális pilotméret
   továbbra is érvényes. A helyi jegyzék nem azonos az 5 GiB multipart
   feltöltés folytatási állapotával.

## QA / bizonyíték

- Új `scripts/tests/dimpro-drive-v0966-personal-receipt-storage-contract.mjs`:
  500 sor, tele tárhelylimit (nincs csendes felülírás), két eltérő
  személyes scope, azonos fiók újraindítása, lejárat + helyi takarítás,
  sérült/verziótéves adatok, érzékeny kulcsok kizárása, tiltott tárhely,
  dupla request ID, hibás méret/idő, tárolás **XHR előtt** forrásellenőrzése.
- TypeScript `npx tsc --noEmit`: **PASS**.
- Célzott ESLint + `git diff --check`: **PASS**.
- V0.9.50–66 kompatibilitási és szerződéses/regressziós tesztek:
  **22/22 PASS**, 0 FAIL (a valós ClamAV-próbák külön, korábbi körben PASS).
- Öt kapcsolódó migráció izolált PostgreSQL/PGlite végrehajtása,
  tulajdonos/kvóta/RLS/rollback: **PASS**.
- A 500 rekordszám helyi Storage-szimulációból igazolt;
  nem 500 darab hálózati POST vagy valós böngészős E2E.
- Hivatalos BUILD01: **PENDING/NOT RUN** a korábbi runner-tiltás miatt.
- Adatbázis-migrációt **nem** alkalmaztunk, S3 próbaobjektumot **nem**
  hoztunk létre a valódi rendszerben.
- Sem felhasználóváltás, sem újratöltés után nem kötelező azonnal
  igazolhatónak lennie egy még futó szerverkérésnek; hiányzó ref
  `PENDING_OR_NOT_FOUND`, nem feltöltési hiba.

## Korlátok / release blocker

- A böngésző helyi tárhelye felhasználó vagy böngésző által törölhető, nem
  garantált 7 napos szerveroldali megőrzés.
- A `localStorage` adatokat az azonos originen futó más JavaScript is
  láthatja; ezért nem tartalmaznak belépési titkot vagy fájltartalmat.
  A SHA-256 namespace nem valódi adatszintű titkosítás.
- A felhasználói fiókhoz rendelt scope a központi auth USER UUID-re épül,
  nem egy szerveroldali tartós upload session összesített lekérésére.
  Más böngészőben a helyi jegyzék nem jelenik meg.
- Párhuzamos több böngészőfül last-write-wins versenyhelyzete és a
  teljes 500 fájlos böngészős valós E2E külön jövőbeli release-feladat.
- Az 5 GiB-os multipart továbbra is `PERSONAL_MULTIPART_SERVER_RELEASED=false`.
- A V0.9.63 BUILD01 indításának korábbi biztonsági tiltását nem kerültük meg;
  a V0.9.64–66 hivatalos BUILD01 eredménye a tényleges engedélyezett
  futtatásig **PENDING**, nem PASS.
- A DEV/PROD S3/DB független elkülönítési bizonyítéka és a
  hitelesített browser → Next.js → valódi DEV S3/DB/ClamAV E2E
  továbbra is hiányzik; ezért új publikus DEV aktiválás **NO-GO**.

## Következő V0.9.67 fókusz

Auditált, engedélyezett BUILD01; külön DEV/PROD S3 és DB provenance,
független tesztfelhasználó, valódi 1/17/100 MiB E2E, 50/100/500 elemű
Transfer Center böngészős batch, megszakítás és jóváhagyott rollout/rollback.
Előbb ezek, csak utána nagyobb (5 GiB) multipart release.
